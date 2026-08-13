import { and, eq, sql } from "drizzle-orm";

import { aiJob, learningObjective, lessonPlan, trainingCycle } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { enqueueAIJob } from "@/lib/server/jobs";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import {
  emptyObjectSchema,
  parseDomainId,
  parseJsonBody,
} from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

export const POST = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    protectMutation(request);
    const actor = await requireSession(request);
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "lesson_id");
    await parseJsonBody(request, emptyObjectSchema, {
      allowEmpty: true,
      maximumBytes: 1_024,
    });
    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      lessonId: id,
      replacement: "TIMED_PAPER_V2",
    });
    if (reservation.replay) return reservation.replay;
    try {
      const output = await db.transaction(async (transaction) => {
        const [plan] = await transaction
          .select()
          .from(lessonPlan)
          .where(eq(lessonPlan.id, id))
          .for("update");
        if (!plan) {
          throw new ApiProblem({
            title: "Practice not found",
            status: 404,
            code: "PRACTICE_PAPER_NOT_FOUND",
            detail: "The earlier practice does not exist.",
          });
        }
        const cycle = await transaction.query.trainingCycle.findFirst({
          where: and(
            eq(trainingCycle.id, plan.cycleId),
            eq(trainingCycle.userId, actor.id),
          ),
          with: {
            writingAttempts: {
              with: { assessment: { with: { issues: true } } },
            },
          },
        });
        if (!cycle) {
          throw new ApiProblem({
            title: "Practice not found",
            status: 404,
            code: "PRACTICE_PAPER_NOT_FOUND",
            detail: "The earlier practice does not belong to this learner.",
          });
        }
        const hasTeaching =
          typeof plan.paperContent === "object" &&
          plan.paperContent !== null &&
          typeof (plan.paperContent as { teachingModule?: unknown })
            .teachingModule === "object";
        if (
          plan.practiceFormat === "TIMED_PAPER_V2" &&
          plan.paperContent &&
          hasTeaching
        ) {
          return { lessonId: plan.id, jobId: null, jobStatus: "SUCCEEDED" };
        }
        const version1 = cycle.writingAttempts.find(
          (attempt) => attempt.kind === "version_1",
        );
        const assessmentId = version1?.assessment?.id;
        const coreSkillId = cycle.coreSkillId;
        if (!assessmentId || !coreSkillId) {
          throw new ApiProblem({
            title: "Diagnosis unavailable",
            status: 409,
            code: "PRACTICE_PAPER_DIAGNOSIS_REQUIRED",
            detail:
              "The original essay diagnosis is required to create a new paper.",
          });
        }
        await transaction.delete(lessonPlan).where(eq(lessonPlan.id, plan.id));
        await transaction
          .delete(learningObjective)
          .where(eq(learningObjective.cycleId, cycle.id));
        await transaction
          .delete(aiJob)
          .where(
            and(
              eq(aiJob.ownerId, actor.id),
              eq(aiJob.taskKind, "exercise_generation"),
              sql`${aiJob.protectedReference}->>'cycleId' = ${cycle.id}`,
            ),
          );
        await transaction
          .update(trainingCycle)
          .set({ status: "LESSON_GENERATING" })
          .where(eq(trainingCycle.id, cycle.id));
        const job = await enqueueAIJob(transaction, {
          ownerId: actor.id,
          taskKind: "exercise_generation",
          protectedReference: {
            attemptId: version1.id,
            cycleId: cycle.id,
            assessmentId,
            skillId: coreSkillId,
          },
          idempotencyKey: `practice-paper:${cycle.id}:v2`,
        });
        return { lessonId: null, jobId: job.id, jobStatus: job.status };
      });
      const responseBody = {
        replacement_started: output.lessonId === null,
        lesson_id: output.lessonId,
        job_id: output.jobId,
        job_status: output.jobStatus,
      };
      await completeIdempotentResponse(
        db,
        actor.id,
        reservation.key,
        output.lessonId ? 200 : 202,
        responseBody,
      );
      return Response.json(responseBody, {
        status: output.lessonId ? 200 : 202,
        ...(output.jobId
          ? { headers: { location: `/api/v1/ai-jobs/${output.jobId}` } }
          : {}),
      });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
