import { Readable } from "node:stream";
import { z } from "zod";

import { auditEvent, DATABASE_SCHEMA_VERSION } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { createInstanceBackup } from "@/lib/server/instance-backup";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { parseJsonBody } from "@/lib/server/request";
import { requireRole, requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  enforceRateLimit,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

const backupSchema = z
  .object({
    passphrase: z.string().min(12).max(256),
    confirmation: z.literal("CREATE ENCRYPTED INSTANCE BACKUP"),
  })
  .strict();

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanBackupError(error: unknown): Error {
  if (error instanceof Error) {
    const message = error.message.replace(
      /postgres(?:ql)?:\/\/[^\s@]+@/giu,
      "postgresql://[redacted]@",
    );
    return new Error(message.slice(0, 512));
  }
  return new Error("The instance backup could not be created.");
}

export const POST = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  requireRole(actor, ["owner"]);
  const input = await parseJsonBody(request, backupSchema, {
    maximumBytes: 2 * 1_024,
  });
  const { db, pool, environment } = getServerContext();
  await enforceRateLimit(request, {
    bucket: "instance-backup",
    identity: actor.id,
    limit: 3,
    windowSeconds: 60 * 60,
  });
  const reservation = await reserveIdempotencyKey(db, actor.id, request, input);
  if (reservation.replay) return reservation.replay;
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const lockClient = await pool.connect();
    const backup = await (async () => {
      try {
        const lock = await lockClient.query<{ acquired: boolean }>(
          "select pg_try_advisory_lock($1) as acquired",
          [1_930_527_493],
        );
        if (lock.rows[0]?.acquired !== true) {
          throw new ApiProblem({
            title: "Backup already running",
            status: 409,
            code: "BACKUP_ALREADY_RUNNING",
            detail: "Wait for the current instance backup to finish.",
          });
        }
        return await createInstanceBackup({
          pool,
          environment,
          passphrase: input.passphrase,
        });
      } finally {
        await lockClient
          .query("select pg_advisory_unlock($1)", [1_930_527_493])
          .catch(() => undefined);
        lockClient.release();
      }
    })().catch((error: unknown) => {
      if (error instanceof ApiProblem) throw error;
      throw cleanBackupError(error);
    });
    cleanup = backup.cleanup;
    await db.insert(auditEvent).values({
      actorId: actor.id,
      action: "backup.archive.create",
      targetType: "instance",
      result: "success",
      metadata: {
        archiveBytes: backup.archiveBytes,
        archiveSha256: backup.archiveSha256,
        databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
      },
    });
    await completeIdempotentResponse(db, actor.id, reservation.key, 409, {
      code: "BACKUP_DOWNLOAD_ALREADY_ISSUED",
      detail:
        "This one-time backup download was already issued. Use a new Idempotency-Key to create another archive.",
    });
    const stream = backup.stream();
    stream.once("close", () => void backup.cleanup());
    stream.once("error", () => void backup.cleanup());
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="${backup.archiveName}"`,
        "content-length": String(backup.archiveBytes),
        "content-type": "application/octet-stream",
        "x-content-type-options": "nosniff",
        "x-iwc-backup-sha256": backup.archiveSha256,
      },
    });
  } catch (error) {
    await cleanup?.();
    return settleIdempotentError(db, actor.id, reservation.key, error);
  }
});
