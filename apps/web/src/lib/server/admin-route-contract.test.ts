import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { readServerEnvironment } from "@iwc/config";
import { createDatabase, newDomainId, providerConnection, user } from "@iwc/db";

import type { SessionActor } from "./session";

const routeState = vi.hoisted(() => ({
  actor: {
    id: "",
    email: "",
    name: "Admin route fixture",
    role: "owner",
  } as SessionActor,
  backup: vi.fn(),
  context: null as unknown,
}));

vi.mock("@/lib/server/context", () => ({
  getServerContext: () => routeState.context,
}));

vi.mock("@/lib/server/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./session")>();
  return {
    ...actual,
    requireSession: async () => routeState.actor,
  };
});

vi.mock("@/lib/server/instance-backup", () => ({
  createInstanceBackup: routeState.backup,
}));

import { POST as createBackup } from "../../app/api/v1/admin/backups/route";
import { GET as getAdminStatus } from "../../app/api/v1/admin/status/route";
import { GET as getProviders } from "../../app/api/v1/providers/route";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)(
  "Admin and provider route contracts (PostgreSQL)",
  () => {
    const database = createDatabase(databaseUrl!);
    const suffix = newDomainId();
    const ownerId = `admin-route-owner-${suffix}`;
    const adminId = `admin-route-admin-${suffix}`;
    const learnerId = `admin-route-learner-${suffix}`;
    const providerId = newDomainId();
    const environment = readServerEnvironment({
      NODE_ENV: "test",
      APP_URL: "https://coach.test",
      AUTH_SECRET: "a".repeat(32),
      APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
      DATABASE_URL: databaseUrl!,
    });

    beforeAll(async () => {
      routeState.context = {
        db: database.db,
        pool: database.pool,
        environment,
        mail: { configured: false },
      };
      await database.db.insert(user).values([
        {
          id: ownerId,
          email: `${ownerId}@example.test`,
          name: "Route owner",
          role: "owner",
        },
        {
          id: adminId,
          email: `${adminId}@example.test`,
          name: "Route admin",
          role: "admin",
        },
        {
          id: learnerId,
          email: `${learnerId}@example.test`,
          name: "Route learner",
          role: "learner",
        },
      ]);
      await database.db.insert(providerConnection).values({
        id: providerId,
        ownerId,
        name: "Route contract provider",
        kind: "mock",
        secretMode: "encrypted",
      });
    });

    afterEach(() => {
      routeState.actor = {
        id: ownerId,
        email: `${ownerId}@example.test`,
        name: "Route owner",
        role: "owner",
      };
      routeState.backup.mockReset();
    });

    afterAll(async () => {
      await database.db.delete(user).where(eq(user.id, ownerId));
      await database.db.delete(user).where(eq(user.id, adminId));
      await database.db.delete(user).where(eq(user.id, learnerId));
      await database.pool.end();
    });

    it("denies the status route to a learner before exposing operations", async () => {
      routeState.actor = {
        id: learnerId,
        email: `${learnerId}@example.test`,
        name: "Route learner",
        role: "learner",
      };

      const response = await getAdminStatus(
        new Request("https://coach.test/api/v1/admin/status"),
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
      });
    });

    it("reports the migrated PostgreSQL state to the owner without content access", async () => {
      const response = await getAdminStatus(
        new Request("https://coach.test/api/v1/admin/status"),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        actor_role: "owner",
        content_access_default: false,
        database: {
          connected: true,
          healthy: true,
          migrations_current: true,
        },
      });
    });

    it("projects provider metadata without encrypted secret columns", async () => {
      const response = await getProviders(
        new Request("https://coach.test/api/v1/providers"),
      );
      const body = (await response.json()) as {
        providers: Array<Record<string, unknown>>;
      };

      expect(response.status).toBe(200);
      expect(body.providers).toContainEqual(
        expect.objectContaining({
          id: providerId,
          kind: "mock",
          name: "Route contract provider",
        }),
      );
      for (const provider of body.providers) {
        expect(provider).not.toHaveProperty("encryptedSecret");
        expect(provider).not.toHaveProperty("apiKey");
      }
    });

    it("denies backup creation to Admin without invoking the archive boundary", async () => {
      routeState.actor = {
        id: adminId,
        email: `${adminId}@example.test`,
        name: "Route admin",
        role: "admin",
      };
      const response = await createBackup(
        new Request("https://coach.test/api/v1/admin/backups", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `admin-backup-denied-${suffix}`,
            origin: "https://coach.test",
          },
          body: JSON.stringify({
            confirmation: "CREATE ENCRYPTED INSTANCE BACKUP",
            passphrase: "test-only-passphrase",
          }),
        }),
      );

      expect(response.status).toBe(403);
      expect(routeState.backup).not.toHaveBeenCalled();
    });
  },
);
