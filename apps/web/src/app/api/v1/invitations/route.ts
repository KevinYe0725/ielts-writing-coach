import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";

import { createOpaqueToken, digestOpaqueToken } from "@iwc/auth";
import { auditEvent, invitation } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { apiRoute } from "@/lib/server/problem";
import { parseJsonBody } from "@/lib/server/request";
import { requireRole, requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  enforceRateLimit,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

const createInvitationSchema = z
  .object({
    email: z.email().max(320),
    role: z.enum(["admin", "learner"]).default("learner"),
    expires_in_hours: z.number().int().min(1).max(168).default(48),
  })
  .strict();

export const GET = apiRoute(async (request) => {
  const actor = await requireSession(request);
  requireRole(actor, ["owner", "admin"]);
  const { db } = getServerContext();
  const records = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      consumedAt: invitation.consumedAt,
      createdAt: invitation.createdAt,
    })
    .from(invitation)
    .orderBy(desc(invitation.createdAt))
    .limit(100);
  return Response.json({ invitations: records });
});

export const POST = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  requireRole(actor, ["owner", "admin"]);
  await enforceRateLimit(request, {
    bucket: "invitation-create",
    limit: 20,
    windowSeconds: 60 * 60,
    identity: actor.id,
  });
  const payload = await parseJsonBody(request, createInvitationSchema, {
    maximumBytes: 4 * 1_024,
  });
  const { db, environment, mail } = getServerContext();
  const reservation = await reserveIdempotencyKey(
    db,
    actor.id,
    request,
    payload,
  );
  if (reservation.replay) return reservation.replay;
  try {
    const email = payload.email.toLowerCase();
    const active = await db.query.invitation.findFirst({
      where: and(
        eq(invitation.email, email),
        isNull(invitation.consumedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    });
    const token = createOpaqueToken();
    const values = {
      email,
      role: payload.role,
      tokenDigest: digestOpaqueToken(token),
      createdBy: actor.id,
      expiresAt: new Date(
        Date.now() + payload.expires_in_hours * 60 * 60 * 1000,
      ),
    } as const;
    const [record] = active
      ? await db
          .update(invitation)
          .set(values)
          .where(eq(invitation.id, active.id))
          .returning()
      : await db.insert(invitation).values(values).returning();
    await db.insert(auditEvent).values({
      actorId: actor.id,
      action: "invitation.create",
      targetType: "invitation",
      targetId: record?.id,
      result: "success",
      metadata: { role: payload.role },
    });
    const link = new URL(
      `/join?token=${encodeURIComponent(token)}`,
      environment.APP_URL,
    ).toString();
    const delivery = await mail.send({
      to: email,
      subject: "You're invited to IELTS Writing Coach",
      ...(record?.id
        ? { messageId: `<invitation-${record.id}@ielts-writing-coach.local>` }
        : {}),
      text: [
        "You have been invited to IELTS Writing Coach.",
        "",
        `Open this one-time link before ${record?.expiresAt.toISOString()}:`,
        link,
        "",
        "If you were not expecting this invitation, you can ignore this message.",
      ].join("\n"),
    });
    await db.insert(auditEvent).values({
      actorId: actor.id,
      action: "invitation.delivery",
      targetType: "invitation",
      targetId: record?.id,
      result: delivery.delivered ? "success" : "fallback",
      metadata: delivery.delivered
        ? { channel: "email" }
        : { channel: "manual_link", reason: delivery.reason },
    });
    const responseBody = {
      invitation: {
        id: record?.id,
        email,
        role: payload.role,
        expires_at: record?.expiresAt,
      },
      delivery: delivery.delivered ? "email" : "manual_link",
      ...(delivery.delivered
        ? {}
        : {
            one_time_link: link,
            fallback_reason: delivery.reason,
          }),
    };
    const status = active ? 200 : 201;
    await completeIdempotentResponse(
      db,
      actor.id,
      reservation.key,
      status,
      responseBody,
    );
    return Response.json(responseBody, {
      status,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return settleIdempotentError(db, actor.id, reservation.key, error);
  }
});
