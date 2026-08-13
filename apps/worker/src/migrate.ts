import { migrate } from "drizzle-orm/node-postgres/migrator";
import { runMigrations } from "graphile-worker";

import { readServerEnvironment } from "@iwc/config";
import { createDatabase } from "@iwc/db";

const environment = readServerEnvironment();
const { db, pool } = createDatabase(environment.DATABASE_URL);

try {
  await migrate(db, {
    migrationsFolder: process.env.IWC_MIGRATIONS_DIRECTORY ?? "/app/drizzle",
  });
  await runMigrations({ connectionString: environment.DATABASE_URL });
} finally {
  await pool.end();
}
