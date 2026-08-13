import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import { v7 as uuidv7 } from "uuid";

import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase>["db"];

export function createDatabase(connection: string | PoolConfig) {
  const pool = new Pool(
    typeof connection === "string"
      ? { connectionString: connection }
      : connection,
  );
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export function newDomainId(): string {
  return uuidv7();
}

export * from "./schema";
export * from "./schema-version";
