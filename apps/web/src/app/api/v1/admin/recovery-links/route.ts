import { and, eq, like } from "drizzle-orm";
import { z } from "zod";

import { createOpaqueToken } from "@iwc/auth";
import { auditEvent, newDomainId, user, verification } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
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

const requestSchema = z
  .object({
    email: z.email().max(320),
  })
  .strict();

/**
 * Owner-assisted recovery for instances without SMTP. The raw token is only
 * returned once and Better Auth consumes the matching verification row after
 * a successful password reset.
 */
export const POST = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  requireRole(actor, ["owner"]);
  await enforceRateLimit(request, {
    bucket: "owner-recovery-link",
    identity: actor.id,
    limit: 10,
    windowSeconds: 60 * 60,
  });
  const payload = await parseJsonBody(request, requestSchema, {
    maximumBytes: 4 * 1_024,
  });
  const email = payload.email.toLowerCase();
  const { db, environment } = getServerContext();
  const reservation = await reserveIdempotencyKey(db, actor.id, request, {
    email,
  });
  if (reservation.replay) return reservation.replay;

  try {
    const target = await db.query.user.findFirst({
      where: eq(user.email, email),
    });
    if (!target) {
      throw new ApiProblem({
        title: "Account not found",
        status: 404,
        code: "RECOVERY_ACCOUNT_NOT_FOUND",
        detail: "No account uses that email address.",
      });
    }

    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.transaction(async (transaction) => {
      await transaction
        .delete(verification)
        .where(
          and(
            eq(verification.value, target.id),
            like(verification.identifier, "reset-password:%"),
          ),
        );
      await transaction.insert(verification).values({
        id: newDomainId(),
        identifier: `reset-password:${token}`,
        value: target.id,
        expiresAt,
      });
      await transaction.insert(auditEvent).values({
        actorId: actor.id,
        action: "account.recovery_link.create",
        targetType: "user",
        targetId: target.id,
        result: "success",
        metadata: { expiresInSeconds: 3600 },
      });
    });

    const responseBody = {
      one_time_link: new URL(
        `/recover?token=${encodeURIComponent(token)}`,
        environment.APP_URL,
      ).toString(),
      expires_at: expiresAt.toISOString(),
    };
    await completeIdempotentResponse(
      db,
      actor.id,
      reservation.key,
      201,
      responseBody,
    );
    return Response.json(responseBody, {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return settleIdempotentError(db, actor.id, reservation.key, error);
  }
});
