/**
 * Keep this descriptor in lock-step with drizzle/meta/_journal.json. Readiness
 * compares both the number of applied migrations and Drizzle's latest journal
 * timestamp, so a database that is merely reachable cannot be reported current.
 */
export const DATABASE_SCHEMA_VERSION = "0013_adaptive_question_supply" as const;
export const EXPECTED_DATABASE_MIGRATION_COUNT = 14 as const;
export const EXPECTED_DATABASE_MIGRATION_CREATED_AT =
  1_787_651_956_397 as const;
export const EXPECTED_DATABASE_MIGRATION_HASH =
  "8e8caf64e59c8392e1cbdd76ef5f0cf3c85ea4dfca2393ada08902802266857e" as const;
