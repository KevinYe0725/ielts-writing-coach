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
  "8e20d6f7748fc76e173860662f1f9aec98508abddf879e68f0ee56a7cb15b890" as const;
