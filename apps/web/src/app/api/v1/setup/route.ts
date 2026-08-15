import { count, eq } from "drizzle-orm";
import { z } from "zod";

import { providerVendorIds } from "@iwc/ai";
import { digestOpaqueToken, tokenMatchesDigest } from "@iwc/auth";
import {
  auditEvent,
  instanceConfiguration,
  learningPreference,
  newDomainId,
  user,
} from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import {
  assignDefaultModelRoutes,
  saveProviderConnection,
} from "@/lib/server/provider-save";
import { ianaTimezoneSchema, parseJsonBody } from "@/lib/server/request";
import { enforceRateLimit, protectMutation } from "@/lib/server/security";

const setupSchema = z
  .object({
    setup_token: z.string().min(16).max(512),
    name: z.string().trim().min(1).max(100),
    email: z.email().max(320),
    password: z.string().min(12).max(128),
    deployment_mode: z.enum(["personal", "shared"]).default("personal"),
    locale: z.enum(["zh-CN", "en"]).default("zh-CN"),
    timezone: ianaTimezoneSchema.default("UTC"),
    // The wizard's tested AI connection is saved atomically with the owner
    // account: a provider failure rolls the whole setup back instead of
    // leaving a silently unconfigured instance behind.
    provider: z
      .object({
        vendor: z.enum(providerVendorIds).optional(),
        kind: z.enum(["openai", "compatible", "mock"]).optional(),
        base_url: z.url().optional(),
        api_key: z.string().max(2_000).optional(),
        model: z.string().trim().min(1).max(200),
        secret_mode: z.enum(["encrypted", "session_only"]).default("encrypted"),
      })
      .optional(),
  })
  .strict();

export const POST = apiRoute(async (request) => {
  protectMutation(request);
  await enforceRateLimit(request, {
    bucket: "setup",
    limit: 5,
    windowSeconds: 15 * 60,
  });
  const payload = await parseJsonBody(request, setupSchema, {
    maximumBytes: 16 * 1_024,
  });
  const { db, auth, environment } = getServerContext();
  if (!auth || !environment.SETUP_TOKEN) {
    throw new ApiProblem({
      title: "Setup unavailable",
      status: 503,
      code: "SETUP_UNAVAILABLE",
      detail: "The setup token or authentication secret is not configured.",
    });
  }
  const expectedDigest = digestOpaqueToken(environment.SETUP_TOKEN);
  if (!tokenMatchesDigest(payload.setup_token, expectedDigest)) {
    throw new ApiProblem({
      title: "Invalid setup token",
      status: 401,
      code: "INVALID_SETUP_TOKEN",
      detail: "The one-time setup token is invalid.",
    });
  }

  const lockId = 1_930_527_491;
  const client = await getServerContext().pool.connect();
  let createdUserId: string | undefined;
  try {
    await client.query("select pg_advisory_lock($1)", [lockId]);
    const [countRow] = await db.select({ count: count() }).from(user);
    const userCount = countRow?.count ?? 0;
    const existing = await db.query.instanceConfiguration.findFirst();
    if ((userCount ?? 0) > 0 || existing?.setupCompletedAt) {
      throw new ApiProblem({
        title: "Setup already completed",
        status: 409,
        code: "SETUP_ALREADY_COMPLETED",
        detail:
          "The first Owner has already been created; this token is permanently invalid.",
      });
    }

    const created = await auth.api.signUpEmail({
      body: {
        name: payload.name,
        email: payload.email.toLowerCase(),
        password: payload.password,
        locale: payload.locale,
        timezone: payload.timezone,
      },
      headers: new Headers({ origin: environment.APP_URL }),
    });
    createdUserId = created.user.id;
    if (payload.provider?.vendor || payload.provider?.kind) {
      const saved = await saveProviderConnection(db, created.user.id, {
        vendor: payload.provider.vendor,
        kind: payload.provider.kind,
        baseUrl: payload.provider.base_url,
        apiKey: payload.provider.api_key,
        model: payload.provider.model,
        secretMode: payload.provider.secret_mode,
      });
      await assignDefaultModelRoutes(db, created.user.id, {
        providerConnectionId: saved.provider.id,
        model: payload.provider.model,
      });
    }
    await db.transaction(async (transaction) => {
      await transaction
        .update(user)
        .set({
          role: "owner",
          locale: payload.locale,
          timezone: payload.timezone,
        })
        .where(eq(user.id, created.user.id));
      if (existing) {
        await transaction
          .update(instanceConfiguration)
          .set({
            setupCompletedAt: new Date(),
            setupTokenDigest: expectedDigest,
            deploymentMode: payload.deployment_mode,
          })
          .where(eq(instanceConfiguration.id, existing.id));
      } else {
        await transaction.insert(instanceConfiguration).values({
          id: newDomainId(),
          setupCompletedAt: new Date(),
          setupTokenDigest: expectedDigest,
          deploymentMode: payload.deployment_mode,
          defaultLocale: payload.locale,
        });
      }
      await transaction
        .insert(learningPreference)
        .values({ userId: created.user.id, feedbackLocale: payload.locale });
      await transaction.insert(auditEvent).values({
        actorId: created.user.id,
        action: "instance.setup.complete",
        targetType: "instance",
        result: "success",
        metadata: { deploymentMode: payload.deployment_mode },
      });
    });
  } catch (error) {
    if (createdUserId)
      await db
        .delete(user)
        .where(eq(user.id, createdUserId))
        .catch(() => undefined);
    throw error;
  } finally {
    await client
      .query("select pg_advisory_unlock($1)", [lockId])
      .catch(() => undefined);
    client.release();
  }

  return Response.json(
    {
      setup_complete: true,
      owner: {
        id: createdUserId,
        email: payload.email.toLowerCase(),
        name: payload.name,
      },
    },
    {
      status: 201,
      headers: { location: "/signin", "cache-control": "no-store" },
    },
  );
});
