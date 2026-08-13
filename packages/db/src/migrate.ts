import { migrate } from "drizzle-orm/node-postgres/migrator";
import { runMigrations } from "graphile-worker";
import { fileURLToPath } from "node:url";

import { readServerEnvironment } from "@iwc/config";

import { createDatabase } from "./index";

const environment = readServerEnvironment();
const { db, pool } = createDatabase(environment.DATABASE_URL);

try {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  await runMigrations({ connectionString: environment.DATABASE_URL });
} finally {
  await pool.end();
}
