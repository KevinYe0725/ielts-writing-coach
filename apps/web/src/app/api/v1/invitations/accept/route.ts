import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";

import { digestOpaqueToken } from "@iwc/auth";
import { auditEvent, invitation, learningPreference, user } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { ianaTimezoneSchema, parseJsonBody } from "@/lib/server/request";
import { enforceRateLimit, protectMutation } from "@/lib/server/security";

const acceptSchema = z
  .object({
    token: z.string().min(16).max(512),
    name: z.string().trim().min(1).max(100),
    password: z.string().min(12).max(128),
    locale: z.enum(["zh-CN", "en"]).default("zh-CN"),
    timezone: ianaTimezoneSchema.default("UTC"),
  })
  .strict();

export const POST = apiRoute(async (request) => {
  protectMutation(request);
  await enforceRateLimit(request, {
    bucket: "invitation-accept",
    limit: 10,
    windowSeconds: 15 * 60,
  });
  const payload = await parseJsonBody(request, acceptSchema, {
    maximumBytes: 4 * 1_024,
  });
  const { db, auth, environment } = getServerContext();
  if (!auth) {
    throw new ApiProblem({
      title: "Authentication unavailable",
      status: 503,
      code: "AUTH_NOT_CONFIGURED",
      detail: "Authentication is not configured.",
    });
  }
  const tokenDigest = digestOpaqueToken(payload.token);
  const record = await db.query.invitation.findFirst({
    where: and(
      eq(invitation.tokenDigest, tokenDigest),
      isNull(invitation.consumedAt),
      gt(invitation.expiresAt, new Date()),
    ),
  });
  if (!record) {
    throw new ApiProblem({
      title: "Invalid invitation",
      status: 410,
      code: "INVITATION_INVALID",
      detail: "This invitation is invalid, expired, or already used.",
    });
  }
  const created = await auth.api.signUpEmail({
    body: {
      name: payload.name,
      email: record.email,
      password: payload.password,
      locale: payload.locale,
      timezone: payload.timezone,
    },
    headers: new Headers({ origin: environment.APP_URL }),
  });
  try {
    await db.transaction(async (transaction) => {
      const consumed = await transaction
        .update(invitation)
        .set({ consumedAt: new Date(), consumedBy: created.user.id })
        .where(and(eq(invitation.id, record.id), isNull(invitation.consumedAt)))
        .returning({ id: invitation.id });
      if (consumed.length !== 1) {
        throw new ApiProblem({
          title: "Invitation already used",
          status: 409,
          code: "INVITATION_REPLAY",
          detail: "This invitation was used by another request.",
        });
      }
      await transaction
        .update(user)
        .set({
          role: record.role,
          locale: payload.locale,
          timezone: payload.timezone,
        })
        .where(eq(user.id, created.user.id));
      await transaction
        .insert(learningPreference)
        .values({ userId: created.user.id, feedbackLocale: payload.locale });
      await transaction.insert(auditEvent).values({
        actorId: created.user.id,
        action: "invitation.accept",
        targetType: "invitation",
        targetId: record.id,
        result: "success",
        metadata: { role: record.role },
      });
    });
  } catch (error) {
    await db
      .delete(user)
      .where(eq(user.id, created.user.id))
      .catch(() => undefined);
    throw error;
  }
  return Response.json(
    {
      accepted: true,
      user: { id: created.user.id, email: record.email, role: record.role },
    },
    {
      status: 201,
      headers: { location: "/signin", "cache-control": "no-store" },
    },
  );
});
