import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for database migrations.");
}

const appPackage = new URL("../apps/web/package.json", import.meta.url);
const requireFromApp = createRequire(appPackage);
const { Client } = requireFromApp("pg");
const migrationEntrypoint =
  process.env.IWC_MIGRATION_ENTRYPOINT ??
  fileURLToPath(new URL("../worker-runtime/dist/migrate.js", import.meta.url));

// Drizzle's PostgreSQL migrator does not serialize concurrent callers. Cloud
// web and worker pre-deploy hooks can overlap, so hold a session-level lock
// while the isolated migration process runs.
const migrationLockId = 1_930_527_492;
const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("select pg_advisory_lock($1)", [migrationLockId]);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [migrationEntrypoint], {
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Migration process terminated by ${signal}.`));
        return;
      }
      resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) {
    throw new Error(`Migration process exited with status ${exitCode}.`);
  }
} finally {
  await client
    .query("select pg_advisory_unlock($1)", [migrationLockId])
    .catch(() => undefined);
  await client.end().catch(() => undefined);
}
