import { and, desc, eq, sql } from "drizzle-orm";

import { aiJob, skillEvidenceEvent, trainingCycle } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { requireSession } from "@/lib/server/session";

export const GET = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireSession(request);
    const { id } = await context.params;
    const { db } = getServerContext();
    const [cycle, comparisonEvidence, failedLessonGenerationJob] =
      await Promise.all([
        db.query.trainingCycle.findFirst({
          where: and(
            eq(trainingCycle.id, id),
            eq(trainingCycle.userId, actor.id),
          ),
          with: {
            question: true,
            writingAttempts: {
              with: { assessment: { with: { issues: true } }, revisions: true },
            },
            lessonPlans: true,
            rewriteTasks: true,
            transferTasks: true,
          },
        }),
        db.query.skillEvidenceEvent.findFirst({
          where: and(
            eq(skillEvidenceEvent.userId, actor.id),
            eq(skillEvidenceEvent.cycleId, id),
            eq(skillEvidenceEvent.evidenceStage, "DELAYED_REWRITE"),
          ),
          orderBy: [desc(skillEvidenceEvent.occurredAt)],
        }),
        db.query.aiJob.findFirst({
          columns: {
            id: true,
            lastErrorCode: true,
            lastErrorSafeMessage: true,
            updatedAt: true,
          },
          where: and(
            eq(aiJob.ownerId, actor.id),
            eq(aiJob.taskKind, "exercise_generation"),
            eq(aiJob.status, "FAILED"),
            sql`${aiJob.protectedReference}->>'cycleId' = ${id}`,
          ),
          orderBy: [desc(aiJob.updatedAt), desc(aiJob.id)],
        }),
      ]);
    if (!cycle)
      throw new ApiProblem({
        title: "Cycle not found",
        status: 404,
        code: "CYCLE_NOT_FOUND",
        detail: "The training cycle does not exist.",
      });
    return Response.json({
      cycle: {
        ...cycle,
        comparisonEvidence: comparisonEvidence ?? null,
        lessonGenerationRetry: failedLessonGenerationJob
          ? {
              jobId: failedLessonGenerationJob.id,
              code:
                failedLessonGenerationJob.lastErrorCode ??
                "LESSON_GENERATION_FAILED",
              safeMessage:
                failedLessonGenerationJob.lastErrorSafeMessage ??
                "The focused lesson module could not be generated.",
              failedAt: failedLessonGenerationJob.updatedAt,
            }
          : null,
      },
    });
  },
);
