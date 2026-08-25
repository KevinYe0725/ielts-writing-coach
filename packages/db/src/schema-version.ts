/**
 * Keep this descriptor in lock-step with drizzle/meta/_journal.json. Readiness
 * compares both the number of applied migrations and Drizzle's latest journal
 * timestamp, so a database that is merely reachable cannot be reported current.
 */
export const DATABASE_SCHEMA_VERSION = "0013_adaptive_question_supply" as const;
export const EXPECTED_DATABASE_MIGRATION_COUNT = 14 as const;
export const EXPECTED_DATABASE_MIGRATION_CREATED_AT =
  1_787_653_611_445 as const;
export const EXPECTED_DATABASE_MIGRATION_HASH =
  "b04e6006eb1bf21b6bbbfe8b49f4096ee02c37cae1cc093e344bb337c327f333" as const;
