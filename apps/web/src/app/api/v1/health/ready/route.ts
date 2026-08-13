import { apiRoute } from "@/lib/server/problem";
import { getServerContext } from "@/lib/server/context";
import { inspectRuntimeReadiness } from "@/lib/server/readiness";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async () => {
  const { pool, environment } = getServerContext();
  const readiness = await inspectRuntimeReadiness(pool, environment);
  return Response.json(
    {
      status: readiness.ready ? "ready" : "not_ready",
      checks: {
        database: readiness.checks.database,
        migrations: readiness.checks.migrations,
        configuration: readiness.checks.configuration,
        task_executor: readiness.checks.taskExecutor,
      },
      missing: readiness.missing,
      warnings: readiness.warnings,
      versions: readiness.versions,
    },
    {
      status: readiness.ready ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
});
