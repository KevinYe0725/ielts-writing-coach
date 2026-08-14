import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import {
  createDatabase,
  DATABASE_SCHEMA_VERSION,
  EXPECTED_DATABASE_MIGRATION_COUNT,
  EXPECTED_DATABASE_MIGRATION_CREATED_AT,
  EXPECTED_DATABASE_MIGRATION_HASH,
  newDomainId,
} from "./index";
import { instanceConfiguration, lessonPlan } from "./schema";

describe("database identity primitives", () => {
  it("creates RFC 9562 UUIDv7 domain identifiers", () => {
    const ids = Array.from({ length: 8 }, () => newDomainId());
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });

  it("keeps the public schema descriptor aligned with the migration journal", () => {
    const journal = JSON.parse(
      readFileSync(
        new URL("../drizzle/meta/_journal.json", import.meta.url),
        "utf8",
      ),
    ) as {
      entries: Array<{ tag: string; when: number }>;
    };
    expect(journal.entries).toHaveLength(EXPECTED_DATABASE_MIGRATION_COUNT);
    expect(journal.entries.at(-1)).toEqual({
      tag: DATABASE_SCHEMA_VERSION,
      when: EXPECTED_DATABASE_MIGRATION_CREATED_AT,
      breakpoints: true,
      idx: EXPECTED_DATABASE_MIGRATION_COUNT - 1,
      version: "7",
    });
    const migration = readFileSync(
      new URL(`../drizzle/${DATABASE_SCHEMA_VERSION}.sql`, import.meta.url),
    );
    expect(createHash("sha256").update(migration).digest("hex")).toBe(
      EXPECTED_DATABASE_MIGRATION_HASH,
    );
  });

  it("has a private place to preserve a legacy practice before conversion", () => {
    expect(lessonPlan.legacyMigrationSnapshot).toBeDefined();
  });
});

const integrationUrl = process.env.DATABASE_URL;
const integration = integrationUrl ? describe : describe.skip;

integration("PostgreSQL migrations and transaction semantics", () => {
  if (!integrationUrl) return;
  const { db, pool } = createDatabase(integrationUrl);

  afterAll(async () => {
    await pool.end();
  });

  it("installs every application table and Graphile Worker schema", async () => {
    const result = await pool.query<{
      application_tables: string;
      graphile_tables: string;
    }>(
      `select
         (select count(*)::text from information_schema.tables where table_schema = 'public') as application_tables,
         (select count(*)::text from information_schema.tables where table_schema = 'graphile_worker') as graphile_tables`,
    );
    expect(Number(result.rows[0]?.application_tables)).toBeGreaterThanOrEqual(
      32,
    );
    expect(Number(result.rows[0]?.graphile_tables)).toBeGreaterThan(0);
  });

  it("keeps exercise evaluations append-only rather than one-per-response", async () => {
    const result = await pool.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
       where schemaname = 'public' and indexname = 'evaluation_attempt_idx'`,
    );
    expect(result.rows[0]?.indexdef).not.toContain("UNIQUE");
    const legacy = await pool.query(
      `select 1 from pg_indexes
       where schemaname = 'public' and indexname = 'evaluation_attempt_unique'`,
    );
    expect(legacy.rowCount).toBe(0);
    const retryFence = await pool.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
       where schemaname = 'public' and indexname = 'evaluation_ai_job_unique'`,
    );
    expect(retryFence.rows[0]?.indexdef).toContain("UNIQUE");
    expect(retryFence.rows[0]?.indexdef).toContain("ai_job_id");
  });

  it("rolls back a failed application transaction", async () => {
    const before = await db.$count(instanceConfiguration);
    await expect(
      db.transaction(async (transaction) => {
        await transaction.insert(instanceConfiguration).values({
          deploymentMode: "personal",
          defaultLocale: "en",
        });
        throw new Error("intentional rollback probe");
      }),
    ).rejects.toThrow("intentional rollback probe");
    expect(await db.$count(instanceConfiguration)).toBe(before);
  });
});
