/**
 * Keep this descriptor in lock-step with drizzle/meta/_journal.json. Readiness
 * compares both the number of applied migrations and Drizzle's latest journal
 * timestamp, so a database that is merely reachable cannot be reported current.
 */
export const DATABASE_SCHEMA_VERSION = "0009_sharp_maddog" as const;
export const EXPECTED_DATABASE_MIGRATION_COUNT = 10 as const;
export const EXPECTED_DATABASE_MIGRATION_CREATED_AT =
  1_786_600_068_109 as const;
export const EXPECTED_DATABASE_MIGRATION_HASH =
  "1107fd0da4926d3e2c240f629a251a2fd9ece6cbe601ec1be5cdae8c7c7f6a5a" as const;
