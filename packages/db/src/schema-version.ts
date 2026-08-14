/**
 * Keep this descriptor in lock-step with drizzle/meta/_journal.json. Readiness
 * compares both the number of applied migrations and Drizzle's latest journal
 * timestamp, so a database that is merely reachable cannot be reported current.
 */
export const DATABASE_SCHEMA_VERSION = "0012_calm_leopardon" as const;
export const EXPECTED_DATABASE_MIGRATION_COUNT = 13 as const;
export const EXPECTED_DATABASE_MIGRATION_CREATED_AT =
  1_786_686_022_106 as const;
export const EXPECTED_DATABASE_MIGRATION_HASH =
  "85dc54a11c80646c6204325407a28e4c357de1150e4aec74dc04946e9794bd3c" as const;
