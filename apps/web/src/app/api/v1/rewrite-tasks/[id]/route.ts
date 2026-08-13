import { and, eq } from "drizzle-orm";

import { rewriteTask } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { parseDomainId } from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";

export const GET = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireSession(request);
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "rewrite_task_id");
    const { db } = getServerContext();
    const task = await db.query.rewriteTask.findFirst({
      where: and(eq(rewriteTask.id, id), eq(rewriteTask.userId, actor.id)),
      with: {
        cycle: {
          with: { question: true, writingAttempts: true },
        },
      },
    });
    if (!task) {
      throw new ApiProblem({
        title: "Rewrite task not found",
        status: 404,
        code: "REWRITE_TASK_NOT_FOUND",
        detail: "The rewrite task does not exist.",
      });
    }
    const elapsedSeconds = task.startedAt
      ? Math.max(0, Math.floor((Date.now() - task.startedAt.getTime()) / 1000))
      : 0;
    const effectiveStatus =
      task.status === "LOCKED" && task.availableAt.getTime() <= Date.now()
        ? "READY"
        : task.status;
    return Response.json(
      {
        rewrite_task: {
          id: task.id,
          cycle_id: task.cycleId,
          status: effectiveStatus,
          available_at: task.availableAt,
          expires_at: task.expiresAt,
          elapsed_seconds: elapsedSeconds,
          question: {
            id: task.cycle.question.externalId,
            prompt: task.cycle.question.prompt,
          },
          abstract_checklist:
            elapsedSeconds >= 35 * 60 ? task.abstractChecklist : null,
          personal_target_hidden: elapsedSeconds < 35 * 60,
          version_1_hidden: true,
          model_essay_hidden: true,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  },
);
