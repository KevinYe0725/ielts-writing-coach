import { asc, eq } from "drizzle-orm";

import { rewriteTask } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { apiRoute } from "@/lib/server/problem";
import { requireSession } from "@/lib/server/session";

export const GET = apiRoute(async (request) => {
  const actor = await requireSession(request);
  const { db } = getServerContext();
  const now = new Date();
  const tasks = await db.query.rewriteTask.findMany({
    where: eq(rewriteTask.userId, actor.id),
    with: { cycle: { with: { question: true, writingAttempts: true } } },
    orderBy: [asc(rewriteTask.availableAt)],
  });
  return Response.json({
    rewrite_tasks: tasks.map((task) => ({
      id: task.id,
      cycle_id: task.cycleId,
      status:
        task.status === "LOCKED" && task.availableAt <= now
          ? "READY"
          : task.status,
      available_at: task.availableAt,
      expires_at: task.expiresAt,
      started_at: task.startedAt,
      completed_at: task.completedAt,
      question: task.cycle.question,
      version_1_locked: true,
      abstract_checklist_available:
        task.startedAt !== null &&
        Date.now() - task.startedAt.getTime() >= 35 * 60 * 1000,
    })),
  });
});
