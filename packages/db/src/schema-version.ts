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
  "8bc678125245aeb2775d2a0283c2162872909082ad0203de15c1b60d57168367" as const;
