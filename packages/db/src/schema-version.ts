/**
 * Keep this descriptor in lock-step with drizzle/meta/_journal.json. Readiness
 * compares both the number of applied migrations and Drizzle's latest journal
 * timestamp, so a database that is merely reachable cannot be reported current.
 */
export const DATABASE_SCHEMA_VERSION = "0013_adaptive_question_supply" as const;
export const EXPECTED_DATABASE_MIGRATION_COUNT = 14 as const;
export const EXPECTED_DATABASE_MIGRATION_CREATED_AT =
  1_787_587_955_973 as const;
export const EXPECTED_DATABASE_MIGRATION_HASH =
  "255710dbd5e211a18ad8677552590dfbd2adf17d603cfffe73c1734b58ebb326" as const;
