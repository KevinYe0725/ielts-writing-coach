import { createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";

import { and, eq, lte, sql } from "drizzle-orm";

import { assertTrustedOrigin } from "@iwc/auth";
import { idempotencyRecord, rateLimitBucket, type Database } from "@iwc/db";

import { ApiProblem } from "./problem";
import { getServerContext } from "./context";

export function protectMutation(request: Request): void {
  const { environment } = getServerContext();
  assertTrustedOrigin(request, [environment.APP_URL]);
}

export function trustedRequestAddress(
  request: Request,
  trustedProxyHops: number,
): string {
  // Forwarding headers are attacker-controlled unless an explicitly trusted
  // ingress sanitizes/appends them and direct access to Web is blocked. With no
  // trusted proxy, use one conservative shared bucket instead of accepting a
  // spoofable address.
  if (trustedProxyHops === 0) return "proxy-headers-disabled";
  const chain = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (chain.length === 0 || chain.length > trustedProxyHops + 32) {
    return "trusted-proxy-chain-invalid";
  }
  const candidate = chain.at(-trustedProxyHops);
  return candidate && isIP(candidate) !== 0
    ? candidate
    : "trusted-proxy-chain-invalid";
}

export async function enforceRateLimit(
  request: Request,
  options: {
    bucket: string;
    limit: number;
    windowSeconds: number;
    identity?: string;
  },
): Promise<void> {
  const { db, environment } = getServerContext();
  const secret = environment.AUTH_SECRET ?? "iwc-unconfigured-rate-limit";
  const subject =
    options.identity ??
    trustedRequestAddress(request, environment.TRUST_PROXY_HOPS);
  const subjectDigest = createHmac("sha256", secret)
    .update(subject)
    .digest("hex");
  const now = Date.now();
  const windowMilliseconds = options.windowSeconds * 1000;
  const windowStartedAt = new Date(
    Math.floor(now / windowMilliseconds) * windowMilliseconds,
  );
  const [bucket] = await db
    .insert(rateLimitBucket)
    .values({
      bucket: options.bucket,
      subjectDigest,
      windowStartedAt,
      count: 1,
    })
    .onConflictDoUpdate({
      target: [
        rateLimitBucket.bucket,
        rateLimitBucket.subjectDigest,
        rateLimitBucket.windowStartedAt,
      ],
      set: { count: sql`${rateLimitBucket.count} + 1`, updatedAt: new Date() },
    })
    .returning({ count: rateLimitBucket.count });
  if ((bucket?.count ?? options.limit + 1) > options.limit) {
    throw new ApiProblem({
      title: "Too many requests",
      status: 429,
      code: "RATE_LIMITED",
      detail: "Wait before trying this operation again.",
      retry_after_seconds: options.windowSeconds,
    });
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function isNonPersistableResponseField(key: string): boolean {
  const normalized = key.replaceAll(/[-_]/gu, "").toLowerCase();
  return /(?:apikey|authorization|cookie|onetimelink|password|providersecret|secret|token)$/u.test(
    normalized,
  );
}

/**
 * Idempotency records are ordinary database rows, so they must not become a
 * second plaintext secret store. One-time links and credentials are returned
 * by the original request only; a replay receives an explicit omission marker.
 */
export function sanitizeIdempotencyResponseForPersistence(
  value: unknown,
): unknown {
  let omitted = false;

  function visit(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(visit);
    if (!input || typeof input !== "object") return input;

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(
      input as Record<string, unknown>,
    )) {
      if (isNonPersistableResponseField(key)) {
        omitted = true;
        continue;
      }
      output[key] = visit(item);
    }
    return output;
  }

  const sanitized = visit(value);
  if (
    omitted &&
    sanitized &&
    typeof sanitized === "object" &&
    !Array.isArray(sanitized)
  ) {
    return {
      ...(sanitized as Record<string, unknown>),
      sensitive_values_omitted_on_replay: true,
    };
  }
  return sanitized;
}

export async function reserveIdempotencyKey(
  db: Database,
  userId: string,
  request: Request,
  body: unknown,
): Promise<{ key: string; replay?: Response }> {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length > 200) {
    throw new ApiProblem({
      title: "Idempotency key required",
      status: 400,
      code: "IDEMPOTENCY_KEY_REQUIRED",
      detail: "Supply an Idempotency-Key header for this write operation.",
    });
  }
  if (!/^[\x21-\x7E]+$/u.test(key)) {
    throw new ApiProblem({
      title: "Invalid idempotency key",
      status: 400,
      code: "IDEMPOTENCY_KEY_INVALID",
      detail: "Use 1–200 visible ASCII characters for Idempotency-Key.",
    });
  }
  const requestIdentity = {
    method: request.method.toUpperCase(),
    pathname: new URL(request.url).pathname,
    body,
  };
  const requestHash = createHash("sha256")
    .update(stableJson(requestIdentity))
    .digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db
    .delete(idempotencyRecord)
    .where(
      and(
        eq(idempotencyRecord.userId, userId),
        eq(idempotencyRecord.key, key),
        lte(idempotencyRecord.expiresAt, new Date()),
      ),
    );
  const inserted = await db
    .insert(idempotencyRecord)
    .values({ userId, key, requestHash, expiresAt })
    .onConflictDoNothing()
    .returning({ key: idempotencyRecord.key });
  if (inserted.length > 0) return { key };

  const existing = await db.query.idempotencyRecord.findFirst({
    where: and(
      eq(idempotencyRecord.userId, userId),
      eq(idempotencyRecord.key, key),
    ),
  });
  if (!existing || existing.requestHash !== requestHash) {
    throw new ApiProblem({
      title: "Idempotency conflict",
      status: 409,
      code: "IDEMPOTENCY_CONFLICT",
      detail: "This Idempotency-Key was already used with a different request.",
    });
  }
  if (existing.responseStatus !== null && existing.responseBody !== null) {
    const replayHeaders: Record<string, string> = {
      "idempotency-replayed": "true",
      "cache-control": "no-store",
    };
    const replayBody = existing.responseBody as Record<string, unknown>;
    if (
      existing.responseStatus === 202 &&
      typeof replayBody.job_id === "string"
    ) {
      replayHeaders.location = `/api/v1/ai-jobs/${replayBody.job_id}`;
    }
    return {
      key,
      replay:
        existing.responseStatus === 204
          ? new Response(null, {
              status: 204,
              headers: replayHeaders,
            })
          : Response.json(existing.responseBody, {
              status: existing.responseStatus,
              headers: {
                ...replayHeaders,
                "content-type":
                  existing.responseStatus >= 400
                    ? "application/problem+json"
                    : "application/json",
              },
            }),
    };
  }
  throw new ApiProblem({
    title: "Request still processing",
    status: 409,
    code: "IDEMPOTENCY_IN_PROGRESS",
    detail: "A request with this Idempotency-Key is still being processed.",
  });
}

/** Persist deterministic API failures, but release keys after unexpected faults. */
export async function settleIdempotentError(
  db: Database,
  userId: string,
  key: string,
  error: unknown,
): Promise<never> {
  if (error instanceof ApiProblem) {
    await completeIdempotentResponse(
      db,
      userId,
      key,
      error.problem.status,
      error.problem,
    );
  } else {
    await db
      .delete(idempotencyRecord)
      .where(
        and(
          eq(idempotencyRecord.userId, userId),
          eq(idempotencyRecord.key, key),
        ),
      );
  }
  throw error;
}

export async function completeIdempotentResponse(
  db: Pick<Database, "update">,
  userId: string,
  key: string,
  status: number,
  responseBody: unknown,
): Promise<void> {
  await db
    .update(idempotencyRecord)
    .set({
      responseStatus: status,
      responseBody: sanitizeIdempotencyResponseForPersistence(responseBody),
    })
    .where(
      and(eq(idempotencyRecord.userId, userId), eq(idempotencyRecord.key, key)),
    );
}
