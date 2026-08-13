import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://iwc:iwc@127.0.0.1:5432/iwc";

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/schema.ts",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
