import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, idempotencyRecord, newDomainId, user } from "@iwc/db";

import {
  completeIdempotentResponse,
  reserveIdempotencyKey,
  sanitizeIdempotencyResponseForPersistence,
  trustedRequestAddress,
} from "./security";

describe("trusted proxy address selection", () => {
  const request = new Request("https://coach.test/api/v1/auth/sign-in/email", {
    headers: {
      "cf-connecting-ip": "198.51.100.9",
      "x-real-ip": "203.0.113.9",
      "x-forwarded-for": "192.0.2.123, 203.0.113.40, 198.51.100.20",
    },
  });

  it("ignores every forwarding header unless proxy trust is explicit", () => {
    expect(trustedRequestAddress(request, 0)).toBe("proxy-headers-disabled");
  });

  it("selects from the right edge of the sanitized proxy chain", () => {
    expect(trustedRequestAddress(request, 1)).toBe("198.51.100.20");
    expect(trustedRequestAddress(request, 2)).toBe("203.0.113.40");
    expect(trustedRequestAddress(request, 3)).toBe("192.0.2.123");
    expect(trustedRequestAddress(request, 4)).toBe(
      "trusted-proxy-chain-invalid",
    );
  });

  it("bounds an attacker-controlled forwarded chain before hashing it", () => {
    const chain = Array.from(
      { length: 40 },
      (_, index) => `198.51.100.${(index % 200) + 1}`,
    ).join(", ");
    expect(
      trustedRequestAddress(
        new Request("https://coach.test/api/v1/auth/sign-in/email", {
          headers: { "x-forwarded-for": chain },
        }),
        1,
      ),
    ).toBe("trusted-proxy-chain-invalid");
  });
});

describe("idempotency response secret boundary", () => {
  it("omits one-time links and credential-shaped fields before persistence", () => {
    const sentinel = "unusual-token-£-秘密-987";
    const sanitized = sanitizeIdempotencyResponseForPersistence({
      delivery: "manual_link",
      one_time_link: `https://coach.test/join?token=${sentinel}`,
      nested: {
        api_key: sentinel,
        refreshToken: sentinel,
        setup_token: sentinel,
        safe: "kept",
      },
    });
    expect(sanitized).toEqual({
      delivery: "manual_link",
      nested: { safe: "kept" },
      sensitive_values_omitted_on_replay: true,
    });
    expect(JSON.stringify(sanitized)).not.toContain(sentinel);
  });
});

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("API idempotency invariants", () => {
  const database = createDatabase(process.env.DATABASE_URL!);
  const userId = `idempotency-test-${newDomainId()}`;

  beforeAll(async () => {
    await database.db.insert(user).values({
      id: userId,
      name: "Idempotency test",
      email: `${userId}@example.test`,
    });
  });

  afterAll(async () => {
    await database.db.delete(user).where(eq(user.id, userId));
    await database.pool.end();
  });

  it("scopes one key to the HTTP operation as well as its body", async () => {
    const key = newDomainId();
    const first = new Request("http://localhost/api/v1/questions", {
      method: "POST",
      headers: { "idempotency-key": key },
    });
    await reserveIdempotencyKey(database.db, userId, first, { value: 1 });
    await expect(
      reserveIdempotencyKey(
        database.db,
        userId,
        new Request("http://localhost/api/v1/preferences", {
          method: "PUT",
          headers: { "idempotency-key": key },
        }),
        { value: 1 },
      ),
    ).rejects.toMatchObject({
      problem: { status: 409, code: "IDEMPOTENCY_CONFLICT" },
    });
  });

  it("rejects control and non-ASCII idempotency keys before persistence", async () => {
    for (const key of ["contains space", "latin1-©"]) {
      await expect(
        reserveIdempotencyKey(
          database.db,
          userId,
          new Request("http://localhost/api/v1/questions", {
            method: "POST",
            headers: { "idempotency-key": key },
          }),
          {},
        ),
      ).rejects.toMatchObject({
        problem: { status: 400, code: "IDEMPOTENCY_KEY_INVALID" },
      });
    }
  });

  it("reclaims an expired key", async () => {
    const key = newDomainId();
    await database.db.insert(idempotencyRecord).values({
      userId,
      key,
      requestHash: "expired",
      expiresAt: new Date(Date.now() - 1_000),
    });
    const reservation = await reserveIdempotencyKey(
      database.db,
      userId,
      new Request("http://localhost/api/v1/questions", {
        method: "POST",
        headers: { "idempotency-key": key },
      }),
      { value: 2 },
    );
    expect(reservation).toEqual({ key });
  });

  it("restores Location when replaying a long-running response", async () => {
    const key = newDomainId();
    const request = new Request("http://localhost/api/v1/test-submit", {
      method: "POST",
      headers: { "idempotency-key": key },
    });
    await reserveIdempotencyKey(database.db, userId, request, {});
    const jobId = newDomainId();
    await completeIdempotentResponse(database.db, userId, key, 202, {
      job_id: jobId,
    });
    const replay = await reserveIdempotencyKey(
      database.db,
      userId,
      request,
      {},
    );
    expect(replay.replay?.status).toBe(202);
    expect(replay.replay?.headers.get("location")).toBe(
      `/api/v1/ai-jobs/${jobId}`,
    );
    expect(replay.replay?.headers.get("idempotency-replayed")).toBe("true");
  });

  it("never stores or replays a plaintext one-time token", async () => {
    const key = newDomainId();
    const sentinel = "unusual-token-£-秘密-987";
    const request = new Request("http://localhost/api/v1/invitations", {
      method: "POST",
      headers: { "idempotency-key": key },
    });
    await reserveIdempotencyKey(database.db, userId, request, {
      email: "learner@example.test",
    });
    await completeIdempotentResponse(database.db, userId, key, 201, {
      delivery: "manual_link",
      one_time_link: `https://coach.test/join?token=${sentinel}`,
    });

    const persisted = await database.db.query.idempotencyRecord.findFirst({
      where: (table, operators) =>
        operators.and(
          operators.eq(table.userId, userId),
          operators.eq(table.key, key),
        ),
    });
    expect(JSON.stringify(persisted?.responseBody)).not.toContain(sentinel);

    const replay = await reserveIdempotencyKey(database.db, userId, request, {
      email: "learner@example.test",
    });
    const replayText = await replay.replay?.text();
    expect(replayText).not.toContain(sentinel);
    expect(replayText).toContain("sensitive_values_omitted_on_replay");
  });
});
