import type { Pool } from "pg";

import {
  APPLICATION_VERSION,
  inspectConfigurationReadiness,
  type ServerEnvironment,
} from "@iwc/config";
import {
  DATABASE_SCHEMA_VERSION,
  EXPECTED_DATABASE_MIGRATION_COUNT,
  EXPECTED_DATABASE_MIGRATION_CREATED_AT,
  EXPECTED_DATABASE_MIGRATION_HASH,
} from "@iwc/db";

export const WORKER_FRESHNESS_WINDOW_MS = 60_000;

export interface RuntimeReadiness {
  readonly ready: boolean;
  readonly checks: {
    readonly database: boolean;
    readonly migrations: boolean;
    readonly configuration: boolean;
    readonly taskExecutor: boolean;
  };
  readonly missing: readonly string[];
  readonly warnings: readonly string[];
  readonly versions: {
    readonly application: typeof APPLICATION_VERSION;
    readonly databaseSchema: typeof DATABASE_SCHEMA_VERSION;
  };
}

export async function inspectRuntimeReadiness(
  pool: Pool,
  environment: ServerEnvironment,
  now = new Date(),
): Promise<RuntimeReadiness> {
  const configuration = inspectConfigurationReadiness(environment);
  const database = await pool
    .query("select 1")
    .then(() => true)
    .catch(() => false);

  const migrations = database
    ? await pool
        .query<{
          count: string;
          latest: string | null;
          latest_hash: string | null;
        }>(
          `select count(*)::text as count,
                  max(created_at)::text as latest,
                  (array_agg(hash order by created_at desc))[1] as latest_hash
             from drizzle.__drizzle_migrations`,
        )
        .then((result) => {
          const row = result.rows[0];
          return (
            Number(row?.count) === EXPECTED_DATABASE_MIGRATION_COUNT &&
            Number(row?.latest) === EXPECTED_DATABASE_MIGRATION_CREATED_AT &&
            row?.latest_hash === EXPECTED_DATABASE_MIGRATION_HASH
          );
        })
        .catch(() => false)
    : false;

  const taskExecutor = database
    ? await pool
        .query<{ count: string }>(
          `select count(*)::text as count
             from worker_heartbeat
            where application_version = $1
              and last_heartbeat_at >= $2`,
          [
            APPLICATION_VERSION,
            new Date(now.getTime() - WORKER_FRESHNESS_WINDOW_MS),
          ],
        )
        .then((result) => Number(result.rows[0]?.count) > 0)
        .catch(() => false)
    : false;

  const checks = {
    database,
    migrations,
    configuration: configuration.ready,
    taskExecutor,
  };
  return {
    ready: Object.values(checks).every(Boolean),
    checks,
    missing: configuration.missing,
    warnings: configuration.warnings,
    versions: {
      application: APPLICATION_VERSION,
      databaseSchema: DATABASE_SCHEMA_VERSION,
    },
  };
}
