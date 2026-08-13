import { count, eq, sql } from "drizzle-orm";

import {
  aiJob,
  auditEvent,
  invitation,
  providerConnection,
  user,
} from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { apiRoute } from "@/lib/server/problem";
import { requireRole, requireSession } from "@/lib/server/session";
import { inspectRuntimeReadiness } from "@/lib/server/readiness";
import { publicVersionDescriptor } from "@/lib/server/version";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (request) => {
  const actor = await requireSession(request);
  requireRole(actor, ["owner", "admin"]);
  const { db, pool, environment, mail } = getServerContext();
  const [
    readiness,
    users,
    jobs,
    providers,
    pendingInvitations,
    auditCount,
    latestAudit,
  ] = await Promise.all([
    inspectRuntimeReadiness(pool, environment),
    db.select({ count: count() }).from(user),
    db
      .select({ status: aiJob.status, count: count() })
      .from(aiJob)
      .groupBy(aiJob.status),
    db
      .select({ count: count() })
      .from(providerConnection)
      .where(eq(providerConnection.enabled, true)),
    db
      .select({ count: count() })
      .from(invitation)
      .where(
        sql`${invitation.consumedAt} is null and ${invitation.expiresAt} > now()`,
      ),
    db.select({ count: count() }).from(auditEvent),
    db.query.auditEvent.findMany({
      orderBy: (table, operators) => [operators.desc(table.occurredAt)],
      limit: 20,
    }),
  ]);
  return Response.json(
    {
      status: readiness.ready ? "operational" : "degraded",
      actor_role: actor.role,
      deployment_mode: environment.DEPLOYMENT_MODE,
      telemetry_enabled: environment.TELEMETRY_ENABLED,
      database: {
        healthy: readiness.checks.database && readiness.checks.migrations,
        connected: readiness.checks.database,
        migrations_current: readiness.checks.migrations,
        checked_at: new Date().toISOString(),
      },
      task_executor: { healthy: readiness.checks.taskExecutor },
      configuration: { healthy: readiness.checks.configuration },
      versions: publicVersionDescriptor(),
      users: users[0]?.count ?? 0,
      providers: providers[0]?.count ?? 0,
      jobs: Object.fromEntries(jobs.map((row) => [row.status, row.count])),
      smtp_configured: mail.configured,
      smtp_state: mail.configured ? "configured_unverified" : "missing",
      worker_mode: environment.WORKER_MODE,
      recent_audit: latestAudit.map((event) => ({
        id: event.id,
        action: event.action,
        target_type: event.targetType,
        target_id: event.targetId,
        result: event.result,
        occurred_at: event.occurredAt.toISOString(),
      })),
      audit_event_count: auditCount[0]?.count ?? 0,
      pending_invitations: pendingInvitations[0]?.count ?? 0,
      content_access_default: false,
    },
    { headers: { "cache-control": "no-store" } },
  );
});
