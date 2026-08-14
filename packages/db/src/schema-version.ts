/**
 * Keep this descriptor in lock-step with drizzle/meta/_journal.json. Readiness
 * compares both the number of applied migrations and Drizzle's latest journal
 * timestamp, so a database that is merely reachable cannot be reported current.
 */
export const DATABASE_SCHEMA_VERSION =
  "0011_teaching_practice_analysis" as const;
export const EXPECTED_DATABASE_MIGRATION_COUNT = 12 as const;
export const EXPECTED_DATABASE_MIGRATION_CREATED_AT =
  1_786_639_887_620 as const;
export const EXPECTED_DATABASE_MIGRATION_HASH =
  "b4c3634d7f30fdbdfbe741104fd3b526fc400dd75a6a4a06d4e5c521a3eaabe7" as const;
