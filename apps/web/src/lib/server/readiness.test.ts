import { describe, expect, it } from "vitest";
import type { Pool } from "pg";

import { readServerEnvironment } from "@iwc/config";
import {
  EXPECTED_DATABASE_MIGRATION_COUNT,
  EXPECTED_DATABASE_MIGRATION_CREATED_AT,
  EXPECTED_DATABASE_MIGRATION_HASH,
} from "@iwc/db";

import {
  inspectRuntimeReadiness,
  WORKER_FRESHNESS_WINDOW_MS,
} from "./readiness";

const environment = readServerEnvironment({
  NODE_ENV: "test",
  AUTH_SECRET: "a".repeat(32),
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
});

function queryResult(rows: unknown[]): unknown {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

function poolWith(input: {
  migrations?: {
    count: string;
    latest: string | null;
    latest_hash: string | null;
  };
  heartbeatCount?: string;
}): Pool {
  return {
    query: async (statement: string) => {
      if (statement === "select 1") return queryResult([{ ok: 1 }]);
      if (statement.includes("__drizzle_migrations"))
        return queryResult([
          input.migrations ?? {
            count: String(EXPECTED_DATABASE_MIGRATION_COUNT),
            latest: String(EXPECTED_DATABASE_MIGRATION_CREATED_AT),
            latest_hash: EXPECTED_DATABASE_MIGRATION_HASH,
          },
        ]);
      if (statement.includes("worker_heartbeat"))
        return queryResult([{ count: input.heartbeatCount ?? "1" }]);
      throw new Error(`Unexpected query: ${statement}`);
    },
  } as unknown as Pool;
}

describe("runtime readiness", () => {
  it("requires current migrations, configuration, and a real worker lease", async () => {
    const result = await inspectRuntimeReadiness(poolWith({}), environment);
    expect(result.ready).toBe(true);
    expect(result.checks).toEqual({
      database: true,
      migrations: true,
      configuration: true,
      taskExecutor: true,
    });
  });

  it("rejects a reachable database with the wrong migration lineage", async () => {
    const result = await inspectRuntimeReadiness(
      poolWith({
        migrations: { count: "8", latest: "1", latest_hash: "wrong" },
      }),
      environment,
    );
    expect(result.checks.database).toBe(true);
    expect(result.checks.migrations).toBe(false);
    expect(result.ready).toBe(false);
  });

  it("rejects an instance without a fresh task executor", async () => {
    const now = new Date("2026-08-13T12:00:00.000Z");
    const pool = poolWith({ heartbeatCount: "0" });
    const result = await inspectRuntimeReadiness(pool, environment, now);
    expect(result.checks.taskExecutor).toBe(false);
    expect(result.ready).toBe(false);
    expect(WORKER_FRESHNESS_WINDOW_MS).toBeGreaterThan(15_000);
  });
});
