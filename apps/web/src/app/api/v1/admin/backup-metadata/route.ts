import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { auditEvent } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { apiRoute } from "@/lib/server/problem";
import { parseJsonBody } from "@/lib/server/request";
import { requireRole, requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

const verificationSchema = z
  .object({
    completed_at: z.iso.datetime(),
    database_sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
    secrets_sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
    storage_label: z.string().trim().min(1).max(100),
    restore_tested: z.boolean().default(false),
  })
  .strict();

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (request) => {
  const actor = await requireSession(request);
  requireRole(actor, ["owner", "admin"]);
  const { db, environment } = getServerContext();
  const [database, latestVerification] = await Promise.all([
    db.execute<{
      database_name: string;
      database_size_bytes: string;
      postgres_version: string;
    }>(sql`
      select
        current_database() as database_name,
        pg_database_size(current_database())::text as database_size_bytes,
        current_setting('server_version') as postgres_version
    `),
    db.query.auditEvent.findFirst({
      where: eq(auditEvent.action, "backup.verification.record"),
      orderBy: [desc(auditEvent.occurredAt)],
    }),
  ]);
  const record = database.rows[0];
  return Response.json(
    {
      application_version: "1.0.0",
      database: {
        name: record?.database_name ?? null,
        size_bytes: record ? Number(record.database_size_bytes) : null,
        postgres_version: record?.postgres_version ?? null,
      },
      encryption_key_version: environment.APP_ENCRYPTION_KEY_VERSION,
      required_components: [
        "postgresql_logical_dump",
        "instance_secret_volume_or_equivalent",
        "deployment_configuration_without_plaintext_credentials",
      ],
      provider_secrets_in_learning_exports: false,
      latest_operator_verification: latestVerification
        ? {
            recorded_at: latestVerification.occurredAt,
            metadata: latestVerification.metadata,
          }
        : null,
      runbook: "/docs/operations/backup-restore.md",
      note: "This endpoint reports metadata and operator attestations. It does not claim that a hosting-provider backup exists.",
    },
    { headers: { "cache-control": "no-store" } },
  );
});

export const POST = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  requireRole(actor, ["owner"]);
  const payload = await parseJsonBody(request, verificationSchema, {
    maximumBytes: 4 * 1_024,
  });
  const { db } = getServerContext();
  const reservation = await reserveIdempotencyKey(
    db,
    actor.id,
    request,
    payload,
  );
  if (reservation.replay) return reservation.replay;
  try {
    await db.insert(auditEvent).values({
      actorId: actor.id,
      action: "backup.verification.record",
      targetType: "instance",
      result: "success",
      metadata: {
        completedAt: payload.completed_at,
        storageLabel: payload.storage_label,
        restoreTested: payload.restore_tested,
        ...(payload.database_sha256
          ? { databaseSha256: payload.database_sha256.toLowerCase() }
          : {}),
        ...(payload.secrets_sha256
          ? { secretsSha256: payload.secrets_sha256.toLowerCase() }
          : {}),
      },
    });
    const responseBody = { recorded: true };
    await completeIdempotentResponse(
      db,
      actor.id,
      reservation.key,
      201,
      responseBody,
    );
    return Response.json(responseBody, { status: 201 });
  } catch (error) {
    return settleIdempotentError(db, actor.id, reservation.key, error);
  }
});
