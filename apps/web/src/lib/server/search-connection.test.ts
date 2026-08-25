import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  auditEvent,
  createDatabase,
  newDomainId,
  searchConnection,
  user,
} from "@iwc/db";

import { decryptProviderSecret, parseMasterKey } from "@iwc/ai";

const state = vi.hoisted(() => ({
  validation: vi.fn(),
  environment: {
    APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    APP_ENCRYPTION_KEY_VERSION: 3,
    APP_URL: "https://coach.test",
    DEPLOYMENT_MODE: "personal" as "personal" | "shared",
  },
}));

vi.mock("@/lib/server/context", () => ({
  getServerContext: () => ({ environment: state.environment }),
}));

vi.mock("@iwc/search", () => ({
  BraveSearchAdapter: class {
    validateConnection = state.validation;
  },
}));

import {
  getSearchConnectionProjection,
  revokeSearchConnection,
  saveSearchConnection,
} from "./search-connection";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

const owner = {
  id: "",
  email: "owner@example.test",
  name: "Owner",
  role: "owner" as const,
};

integration("encrypted search connections (PostgreSQL)", () => {
  const database = createDatabase(databaseUrl!);
  const userIds: string[] = [];

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((resolvePromise) => {
      resolve = resolvePromise;
    });
    return { promise, resolve };
  }

  async function waitForAdvisoryLockWaiter(): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await database.pool.query<{ waiting: boolean }>(`
        select exists (
          select 1
          from pg_locks
          where locktype = 'advisory' and not granted
        ) as waiting
      `);
      if (result.rows[0]?.waiting) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Timed out waiting for the competing advisory lock");
  }

  async function createUser(role: "owner" | "admin" | "learner") {
    const id = `search-${role}-${newDomainId()}`;
    userIds.push(id);
    await database.db.insert(user).values({
      id,
      email: `${id}@example.test`,
      name: `${role} user`,
      role,
    });
    return { id, email: `${id}@example.test`, name: `${role} user`, role };
  }

  beforeEach(() => {
    state.environment.DEPLOYMENT_MODE = "personal";
    state.validation.mockReset().mockResolvedValue({
      ok: true,
      latencyMs: 12,
      safeMessage: "Brave Search connection validated.",
    });
  });

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await database.db
        .delete(searchConnection)
        .where(eq(searchConnection.configuredByUserId, id));
      await database.db.delete(auditEvent).where(eq(auditEvent.actorId, id));
      await database.db.delete(user).where(eq(user.id, id));
    }
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("stores a probed owner key as ciphertext and returns only the write-only projection", async () => {
    const actor = await createUser("owner");
    const apiKey = "brave-api-key-that-must-not-leak";

    const result = await saveSearchConnection(database.db, actor, apiKey);

    expect(result).toEqual({
      kind: "brave",
      status: "ACTIVE",
      tested_at: expect.any(String),
    });
    expect(JSON.stringify(result)).not.toContain(apiKey);

    const stored = await database.db.query.searchConnection.findFirst({
      where: eq(searchConnection.configuredByUserId, actor.id),
    });
    expect(stored?.encryptedApiKey).not.toContain(apiKey);
    expect(
      decryptProviderSecret(
        {
          ciphertext: stored!.encryptedApiKey,
          nonce: stored!.encryptedApiKeyNonce,
          keyVersion: stored!.encryptionKeyVersion,
        },
        parseMasterKey(state.environment.APP_ENCRYPTION_KEY),
        `search:${actor.id}:${stored!.id}`,
      ),
    ).toBe(apiKey);
    await expect(
      database.db.query.auditEvent.findFirst({
        where: eq(auditEvent.targetId, stored!.id),
      }),
    ).resolves.toMatchObject({
      actorId: actor.id,
      action: "search_connection.save",
      targetType: "search_connection",
      result: "success",
    });
  });

  it("rejects learner writes and invalid keys before probing or persistence", async () => {
    const learner = await createUser("learner");

    await expect(
      saveSearchConnection(database.db, learner, "valid-looking-key"),
    ).rejects.toMatchObject({ problem: { status: 403, code: "FORBIDDEN" } });
    await expect(
      saveSearchConnection(database.db, learner, " "),
    ).rejects.toMatchObject({
      problem: { status: 403, code: "FORBIDDEN" },
    });
    expect(state.validation).not.toHaveBeenCalled();
    await expect(
      database.db.query.searchConnection.findMany({
        where: eq(searchConnection.configuredByUserId, learner.id),
      }),
    ).resolves.toEqual([]);
  });

  it("rejects an invalid owner key without making a provider request", async () => {
    const actor = await createUser("owner");

    await expect(
      saveSearchConnection(database.db, actor, " "),
    ).rejects.toMatchObject({
      problem: { status: 422, code: "SEARCH_API_KEY_INVALID" },
    });
    expect(state.validation).not.toHaveBeenCalled();
  });

  it("replaces the actor's active connection and revokes the selected connection replay-safely", async () => {
    const actor = await createUser("owner");
    await saveSearchConnection(database.db, actor, "first-api-key");
    await saveSearchConnection(database.db, actor, "second-api-key");

    const records = await database.db.query.searchConnection.findMany({
      where: eq(searchConnection.configuredByUserId, actor.id),
    });
    expect(records.filter((record) => record.status === "ACTIVE")).toHaveLength(
      1,
    );
    expect(
      records.filter((record) => record.status === "REVOKED"),
    ).toHaveLength(1);

    await expect(revokeSearchConnection(database.db, actor)).resolves.toBe(
      true,
    );
    await expect(revokeSearchConnection(database.db, actor)).resolves.toBe(
      false,
    );
    await expect(
      getSearchConnectionProjection(database.db, actor),
    ).resolves.toBeNull();
    await expect(
      database.db.query.auditEvent.findMany({
        where: eq(auditEvent.actorId, actor.id),
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "search_connection.revoke",
          result: "success",
        }),
      ]),
    );
  });

  it("projects and revokes an invalid connection instead of treating it as absent", async () => {
    const actor = await createUser("owner");
    const testedAt = new Date("2026-08-25T00:00:00.000Z");
    await database.db.insert(searchConnection).values({
      configuredByUserId: actor.id,
      kind: "BRAVE",
      encryptedApiKey: "invalid-ciphertext",
      encryptedApiKeyNonce: "invalid-nonce",
      encryptionKeyVersion: 1,
      status: "INVALID",
      testedAt,
    });

    await expect(
      getSearchConnectionProjection(database.db, actor),
    ).resolves.toEqual({
      kind: "brave",
      status: "INVALID",
      tested_at: testedAt.toISOString(),
    });
    await expect(revokeSearchConnection(database.db, actor)).resolves.toBe(
      true,
    );
    await expect(
      database.db.query.searchConnection.findFirst({
        where: eq(searchConnection.configuredByUserId, actor.id),
      }),
    ).resolves.toMatchObject({ status: "REVOKED" });
  });

  it("replaces an invalid connection rather than leaving it selected", async () => {
    const actor = await createUser("owner");
    await database.db.insert(searchConnection).values({
      configuredByUserId: actor.id,
      kind: "BRAVE",
      encryptedApiKey: "invalid-ciphertext",
      encryptedApiKeyNonce: "invalid-nonce",
      encryptionKeyVersion: 1,
      status: "INVALID",
      testedAt: new Date(),
    });

    await saveSearchConnection(database.db, actor, "replacement-api-key");

    const records = await database.db.query.searchConnection.findMany({
      where: eq(searchConnection.configuredByUserId, actor.id),
    });
    expect(records.filter((record) => record.status === "ACTIVE")).toHaveLength(
      1,
    );
    expect(records.filter((record) => record.status === "INVALID")).toEqual([]);
  });

  it("serializes concurrent replacement so one actor retains one selected connection", async () => {
    const actor = await createUser("owner");

    await database.pool.query(`
      create function test_pause_search_connection_insert()
      returns trigger language plpgsql as $$
      begin
        perform pg_sleep(0.2);
        return new;
      end;
      $$;
      create trigger test_pause_search_connection_insert
      before insert on search_connection
      for each row execute function test_pause_search_connection_insert();
    `);
    try {
      await Promise.all([
        saveSearchConnection(database.db, actor, "concurrent-api-key-one"),
        saveSearchConnection(database.db, actor, "concurrent-api-key-two"),
      ]);
    } finally {
      await database.pool.query(
        "drop trigger if exists test_pause_search_connection_insert on search_connection; drop function if exists test_pause_search_connection_insert();",
      );
    }

    const records = await database.db.query.searchConnection.findMany({
      where: eq(searchConnection.configuredByUserId, actor.id),
    });
    expect(
      records.filter(
        (record) => record.status === "ACTIVE" || record.status === "INVALID",
      ),
    ).toHaveLength(1);
  });

  it("linearizes a revoke after an overlapping save so the replacement is not left selected", async () => {
    state.environment.DEPLOYMENT_MODE = "shared";
    const actor = await createUser("owner");
    const admin = await createUser("admin");
    await saveSearchConnection(database.db, actor, "initial-api-key");
    const replacementPersisted = deferred();
    const allowReplacementCommit = deferred();

    const save = saveSearchConnection(
      database.db,
      actor,
      "replacement-api-key",
      {
        afterPersist: async (_transaction, projection) => {
          expect(projection).toEqual({
            kind: "brave",
            status: "ACTIVE",
            tested_at: expect.any(String),
          });
          replacementPersisted.resolve();
          await allowReplacementCommit.promise;
        },
      },
    );
    await replacementPersisted.promise;
    const revoke = revokeSearchConnection(database.db, admin);

    try {
      await waitForAdvisoryLockWaiter();
    } finally {
      allowReplacementCommit.resolve();
    }

    await expect(save).resolves.toEqual({
      kind: "brave",
      status: "ACTIVE",
      tested_at: expect.any(String),
    });
    await expect(revoke).resolves.toBe(true);
    await expect(
      getSearchConnectionProjection(database.db, admin),
    ).resolves.toBeNull();
  });

  it("linearizes a save after an overlapping revoke so the later replacement remains selected", async () => {
    state.environment.DEPLOYMENT_MODE = "shared";
    const actor = await createUser("owner");
    const admin = await createUser("admin");
    await saveSearchConnection(database.db, actor, "initial-api-key");
    const revocationPersisted = deferred();
    const allowRevocationCommit = deferred();

    const revoke = revokeSearchConnection(database.db, admin, {
      afterPersist: async (_transaction, projection) => {
        expect(projection).toBeUndefined();
        revocationPersisted.resolve();
        await allowRevocationCommit.promise;
      },
    });
    await revocationPersisted.promise;
    const save = saveSearchConnection(
      database.db,
      actor,
      "replacement-api-key",
    );

    try {
      await waitForAdvisoryLockWaiter();
    } finally {
      allowRevocationCommit.resolve();
    }

    await expect(revoke).resolves.toBe(true);
    const savedProjection = await save;
    expect(savedProjection).toEqual({
      kind: "brave",
      status: "ACTIVE",
      tested_at: expect.any(String),
    });
    await expect(
      getSearchConnectionProjection(database.db, admin),
    ).resolves.toEqual(savedProjection);
  });

  it("rejects a second selected connection for one configuring user at the database boundary", async () => {
    const actor = await createUser("owner");
    await database.db.insert(searchConnection).values({
      configuredByUserId: actor.id,
      kind: "BRAVE",
      encryptedApiKey: "active-ciphertext",
      encryptedApiKeyNonce: "active-nonce",
      encryptionKeyVersion: 1,
      status: "ACTIVE",
    });

    await expect(
      database.db.insert(searchConnection).values({
        configuredByUserId: actor.id,
        kind: "BRAVE",
        encryptedApiKey: "invalid-ciphertext",
        encryptedApiKeyNonce: "invalid-nonce",
        encryptionKeyVersion: 1,
        status: "INVALID",
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("rolls back the connection and audit record when idempotency completion fails", async () => {
    const actor = await createUser("owner");

    await expect(
      saveSearchConnection(database.db, actor, "rollback-api-key", {
        afterPersist: async () => {
          throw new Error("injected idempotency failure");
        },
      }),
    ).rejects.toThrow("injected idempotency failure");

    await expect(
      database.db.query.searchConnection.findMany({
        where: eq(searchConnection.configuredByUserId, actor.id),
      }),
    ).resolves.toEqual([]);
    await expect(
      database.db.query.auditEvent.findMany({
        where: eq(auditEvent.actorId, actor.id),
      }),
    ).resolves.toEqual([]);
  });

  it("selects the shared canonical Owner connection before newer Admin connections", async () => {
    state.environment.DEPLOYMENT_MODE = "shared";
    const ownerActor = await createUser("owner");
    const admin = await createUser("admin");
    const learner = await createUser("learner");
    const now = new Date();
    await database.db.insert(searchConnection).values([
      {
        id: "00000000-0000-7000-8000-000000000001",
        configuredByUserId: admin.id,
        kind: "BRAVE",
        encryptedApiKey: "admin-ciphertext",
        encryptedApiKeyNonce: "admin-nonce",
        encryptionKeyVersion: 1,
        status: "ACTIVE",
        testedAt: new Date(now.getTime() + 1_000),
        createdAt: new Date(now.getTime() + 1_000),
        updatedAt: new Date(now.getTime() + 1_000),
      },
      {
        id: "00000000-0000-7000-8000-000000000002",
        configuredByUserId: ownerActor.id,
        kind: "BRAVE",
        encryptedApiKey: "owner-ciphertext",
        encryptedApiKeyNonce: "owner-nonce",
        encryptionKeyVersion: 1,
        status: "ACTIVE",
        testedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "00000000-0000-7000-8000-000000000003",
        configuredByUserId: learner.id,
        kind: "BRAVE",
        encryptedApiKey: "learner-ciphertext",
        encryptedApiKeyNonce: "learner-nonce",
        encryptionKeyVersion: 1,
        status: "ACTIVE",
        testedAt: new Date(now.getTime() + 2_000),
        createdAt: new Date(now.getTime() + 2_000),
        updatedAt: new Date(now.getTime() + 2_000),
      },
    ]);

    await expect(
      getSearchConnectionProjection(database.db, admin),
    ).resolves.toEqual({
      kind: "brave",
      status: "ACTIVE",
      tested_at: now.toISOString(),
    });
  });

  it("revokes only the shared canonical Owner connection before the newer Admin connection", async () => {
    state.environment.DEPLOYMENT_MODE = "shared";
    const ownerActor = await createUser("owner");
    const admin = await createUser("admin");
    const now = new Date();
    const ownerConnectionId = "00000000-0000-7000-8000-000000000011";
    const adminConnectionId = "00000000-0000-7000-8000-000000000012";
    await database.db.insert(searchConnection).values([
      {
        id: adminConnectionId,
        configuredByUserId: admin.id,
        kind: "BRAVE",
        encryptedApiKey: "admin-ciphertext",
        encryptedApiKeyNonce: "admin-nonce",
        encryptionKeyVersion: 1,
        status: "ACTIVE",
        testedAt: new Date(now.getTime() + 1_000),
        createdAt: new Date(now.getTime() + 1_000),
        updatedAt: new Date(now.getTime() + 1_000),
      },
      {
        id: ownerConnectionId,
        configuredByUserId: ownerActor.id,
        kind: "BRAVE",
        encryptedApiKey: "owner-ciphertext",
        encryptedApiKeyNonce: "owner-nonce",
        encryptionKeyVersion: 1,
        status: "INVALID",
        testedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await expect(revokeSearchConnection(database.db, admin)).resolves.toBe(
      true,
    );
    await expect(
      database.db.query.searchConnection.findFirst({
        where: eq(searchConnection.id, ownerConnectionId),
      }),
    ).resolves.toMatchObject({ status: "REVOKED" });
    await expect(
      getSearchConnectionProjection(database.db, admin),
    ).resolves.toEqual({
      kind: "brave",
      status: "ACTIVE",
      tested_at: new Date(now.getTime() + 1_000).toISOString(),
    });
  });
});
