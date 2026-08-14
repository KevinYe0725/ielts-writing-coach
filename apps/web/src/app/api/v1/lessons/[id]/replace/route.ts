import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { aiJob, lessonPlan, trainingCycle } from "@iwc/db";
import { SKILL_IDS, type SkillId } from "@iwc/learning-contracts";

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

import { learnerFacingTeachingArticle } from "../adaptive-teaching";

function isSkillId(value: unknown): value is SkillId {
  return (
    typeof value === "string" &&
    (SKILL_IDS as readonly string[]).includes(value)
  );
}

function highestValidIssueSkill(value: unknown): SkillId | null {
  if (!Array.isArray(value)) return null;
  const candidates = value
    .flatMap((issue) => {
      if (typeof issue !== "object" || issue === null) return [];
      const record = issue as {
        skillId?: unknown;
        severity?: unknown;
        confidence?: unknown;
      };
      if (!isSkillId(record.skillId)) return [];
      return [
        {
          skillId: record.skillId,
          severity: typeof record.severity === "number" ? record.severity : 0,
          confidence:
            typeof record.confidence === "number" ? record.confidence : 0,
        },
      ];
    })
    .sort(
      (left, right) =>
        right.severity - left.severity || right.confidence - left.confidence,
    );
  return candidates[0]?.skillId ?? null;
}

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
        const hasAdaptiveTeaching =
          learnerFacingTeachingArticle(plan.paperContent) !== null;
        if (
          plan.practiceFormat === "TIMED_PAPER_V2" &&
          plan.paperContent &&
          hasAdaptiveTeaching
        ) {
          return { lessonId: plan.id, jobId: null, jobStatus: "SUCCEEDED" };
        }
        const version1 = cycle.writingAttempts.find(
          (attempt) => attempt.kind === "version_1",
        );
        const assessmentId = version1?.assessment?.id;
        const coreSkillId =
          (isSkillId(cycle.coreSkillId) ? cycle.coreSkillId : null) ??
          (isSkillId(plan.coreSkillId) ? plan.coreSkillId : null) ??
          highestValidIssueSkill(version1?.assessment?.issues) ??
          "task_instruction_coverage";
        const activeJob = await transaction.query.aiJob.findFirst({
          where: and(
            eq(aiJob.ownerId, actor.id),
            eq(aiJob.taskKind, "exercise_generation"),
            inArray(aiJob.status, ["QUEUED", "RUNNING", "WAITING_FOR_CONSENT"]),
            sql`${aiJob.protectedReference}->>'lessonPlanId' = ${plan.id}`,
          ),
        });
        if (activeJob) {
          return {
            lessonId: null,
            jobId: activeJob.id,
            jobStatus: activeJob.status,
          };
        }
        const recentFailedRecovery = await transaction.query.aiJob.findFirst({
          where: and(
            eq(aiJob.ownerId, actor.id),
            eq(aiJob.taskKind, "exercise_generation"),
            eq(aiJob.status, "FAILED"),
            sql`${aiJob.protectedReference}->>'lessonPlanId' = ${plan.id}`,
          ),
          orderBy: [desc(aiJob.completedAt)],
        });
        if (
          recentFailedRecovery?.completedAt &&
          Date.now() - recentFailedRecovery.completedAt.getTime() <
            15 * 60 * 1_000
        ) {
          return {
            lessonId: null,
            jobId: null,
            jobStatus: "CONTINUING_SAFELY",
          };
        }
        const job = await enqueueAIJob(transaction, {
          ownerId: actor.id,
          taskKind: "exercise_generation",
          protectedReference: {
            lessonPlanId: plan.id,
            migrationMode: "LEGACY_RECOVERY",
            cycleId: cycle.id,
            skillId: coreSkillId,
            ...(version1 ? { attemptId: version1.id } : {}),
            ...(assessmentId ? { assessmentId } : {}),
          },
          idempotencyKey: `practice-paper:${plan.id}:legacy-recovery`,
        });
        return { lessonId: null, jobId: job.id, jobStatus: job.status };
      });
      const responseBody = {
        replacement_started:
          output.lessonId === null && output.jobStatus !== "CONTINUING_SAFELY",
        lesson_id: output.lessonId,
        job_id: output.jobId,
        job_status: output.jobStatus,
      };
      const safeContinuation = output.jobStatus === "CONTINUING_SAFELY";
      await completeIdempotentResponse(
        db,
        actor.id,
        reservation.key,
        output.lessonId || safeContinuation ? 200 : 202,
        responseBody,
      );
      return Response.json(responseBody, {
        status: output.lessonId || safeContinuation ? 200 : 202,
        ...(output.jobId
          ? { headers: { location: `/api/v1/ai-jobs/${output.jobId}` } }
          : {}),
      });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
