/**
 * Keep this descriptor in lock-step with drizzle/meta/_journal.json. Readiness
 * compares both the number of applied migrations and Drizzle's latest journal
 * timestamp, so a database that is merely reachable cannot be reported current.
 */
export const DATABASE_SCHEMA_VERSION = "0008_flowery_red_ghost" as const;
export const EXPECTED_DATABASE_MIGRATION_COUNT = 9 as const;
export const EXPECTED_DATABASE_MIGRATION_CREATED_AT =
  1_786_569_298_186 as const;
export const EXPECTED_DATABASE_MIGRATION_HASH =
  "055e8a278c482a935539b58619798ea032e90112a6ba86c9ca5ecc43f690f2e4" as const;
