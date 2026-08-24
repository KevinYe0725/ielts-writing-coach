/**
 * Keep this descriptor in lock-step with drizzle/meta/_journal.json. Readiness
 * compares both the number of applied migrations and Drizzle's latest journal
 * timestamp, so a database that is merely reachable cannot be reported current.
 */
export const DATABASE_SCHEMA_VERSION = "0013_adaptive_question_supply" as const;
export const EXPECTED_DATABASE_MIGRATION_COUNT = 14 as const;
export const EXPECTED_DATABASE_MIGRATION_CREATED_AT =
  1_787_588_543_138 as const;
export const EXPECTED_DATABASE_MIGRATION_HASH =
  "f590bbbb4e509160aca642ebdeec288e60976965c7e59292db9879f1f3352f3c" as const;
