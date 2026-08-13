/**
 * Keep this descriptor in lock-step with drizzle/meta/_journal.json. Readiness
 * compares both the number of applied migrations and Drizzle's latest journal
 * timestamp, so a database that is merely reachable cannot be reported current.
 */
export const DATABASE_SCHEMA_VERSION = "0010_full_practice_paper" as const;
export const EXPECTED_DATABASE_MIGRATION_COUNT = 11 as const;
export const EXPECTED_DATABASE_MIGRATION_CREATED_AT =
  1_786_610_400_000 as const;
export const EXPECTED_DATABASE_MIGRATION_HASH =
  "91492070803981d0fc6f7aa3ece4b9f0f3798b89979fcc19ff838231b6c34732" as const;
