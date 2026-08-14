import { getServerContext } from "@/lib/server/context";
import { loadEssayWorkspace } from "@/lib/server/essay-workspace";
import { apiRoute } from "@/lib/server/problem";
import { requireSession } from "@/lib/server/session";

export const GET = apiRoute(async (request) => {
  const actor = await requireSession(request);
  const { db } = getServerContext();
  const workspace = await loadEssayWorkspace(db, actor.id);
  return Response.json({
    active_count: workspace.activeCount,
    active_limit: workspace.activeLimit,
    essays: workspace.essays.map((essay) => ({
      id: essay.id,
      prompt: essay.prompt,
      topic: essay.topic,
      status: essay.status,
      updated_at: essay.updatedAt,
      next_action: {
        kind: essay.nextAction.kind,
        entity_id: essay.nextAction.entityId,
        reason: essay.nextAction.reason,
        due_at: essay.nextAction.dueAt,
        overdue: essay.nextAction.overdue,
      },
      resources: {
        cycle_id: essay.resources.cycleId,
        writing_available: essay.resources.writingAvailable,
        feedback_available: essay.resources.feedbackAvailable,
        lesson_id: essay.resources.lessonId,
        rewrite_task_id: essay.resources.rewriteTaskId,
        comparison_available: essay.resources.comparisonAvailable,
        transfer_task_id: essay.resources.transferTaskId,
      },
    })),
  });
});
