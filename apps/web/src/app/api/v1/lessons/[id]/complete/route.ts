import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { transitionTrainingCycle } from "@iwc/learning-core";
import {
  evaluation,
  exerciseAttempt,
  exerciseItem,
  lessonPlan,
  rewriteTask,
  skillEvidenceEvent,
  trainingCycle,
} from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import {
  advanceAutoSplitModule,
  currentAutoSplitItemIds,
  deriveLessonProgress,
  expireLessonRuntime,
  lessonEvidenceApplied,
  lessonRuntimeSnapshot,
  normalizeLessonRuntimeState,
  refresherPlanForItem,
} from "@/lib/server/lesson-runtime";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { parseDomainId, parseJsonBody } from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

const completionSchema = z
  .object({
    mode: z.enum(["standard", "trim_optional"]).default("standard"),
  })
  .strict();

export const POST = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    protectMutation(request);
    const actor = await requireSession(request);
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "lesson_id");
    const payload = await parseJsonBody(request, completionSchema, {
      maximumBytes: 1_024,
      allowEmpty: true,
    });
    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      lessonId: id,
      mode: payload.mode,
    });
    if (reservation.replay) return reservation.replay;
    try {
      const output = await db.transaction(async (transaction) => {
        let plan = await transaction.query.lessonPlan.findFirst({
          where: eq(lessonPlan.id, id),
          with: { items: true },
        });
        if (!plan) {
          throw new ApiProblem({
            title: "Lesson not found",
            status: 404,
            code: "LESSON_NOT_FOUND",
            detail: "The lesson does not exist.",
          });
        }
        const [cycle] = await transaction
          .select()
          .from(trainingCycle)
          .where(
            and(
              eq(trainingCycle.id, plan.cycleId),
              eq(trainingCycle.userId, actor.id),
            ),
          )
          .for("update");
        if (!cycle) {
          throw new ApiProblem({
            title: "Lesson not found",
            status: 404,
            code: "LESSON_NOT_FOUND",
            detail: "The lesson does not exist.",
          });
        }
        await transaction
          .select({ id: lessonPlan.id })
          .from(lessonPlan)
          .where(eq(lessonPlan.id, id))
          .for("update");
        plan =
          (await transaction.query.lessonPlan.findFirst({
            where: eq(lessonPlan.id, id),
            with: { items: true },
          })) ?? plan;
        if (cycle.status !== "LESSON_ACTIVE") {
          throw new ApiProblem({
            title: "Lesson not active",
            status: 409,
            code: "LESSON_NOT_ACTIVE",
            detail: "Only an active lesson can be completed.",
          });
        }
        const now = new Date();
        const preExpiryState = normalizeLessonRuntimeState(plan.runtimeState);
        const expiry = expireLessonRuntime(
          plan,
          now,
          refresherPlanForItem(
            plan.items.find((item) => item.id === preExpiryState.draft?.itemId),
          ),
        );
        const runtimePlan = { ...plan, ...expiry };
        const state = normalizeLessonRuntimeState(runtimePlan.runtimeState);
        if (
          runtimePlan.runtimeStatus === "TIMEBOX_EXPIRED" &&
          payload.mode !== "trim_optional"
        ) {
          if (Object.keys(expiry).length > 0) {
            await transaction
              .update(lessonPlan)
              .set(expiry)
              .where(eq(lessonPlan.id, plan.id));
          }
          return { timeboxExpired: true as const };
        }
        const attempts =
          plan.items.length === 0
            ? []
            : await transaction.query.exerciseAttempt.findMany({
                where: and(
                  eq(exerciseAttempt.userId, actor.id),
                  inArray(
                    exerciseAttempt.exerciseItemId,
                    plan.items.map((item) => item.id),
                  ),
                ),
                with: {
                  evaluations: {
                    orderBy: [desc(evaluation.createdAt), desc(evaluation.id)],
                  },
                },
              });
        const progress = deriveLessonProgress({
          items: plan.items,
          attempts,
          ...(state.adaptive ? { previous: state.adaptive } : {}),
        });
        const moduleItemIds = currentAutoSplitItemIds(state);
        const moduleCompleted =
          moduleItemIds !== null &&
          moduleItemIds.every((itemId) =>
            progress.completedItemIds.includes(itemId),
          );
        if (moduleCompleted && !progress.coreAnswered) {
          const continuation = advanceAutoSplitModule(runtimePlan, now);
          if (continuation) {
            await transaction
              .update(lessonPlan)
              .set(continuation)
              .where(eq(lessonPlan.id, plan.id));
            return {
              timeboxExpired: false as const,
              segmentScheduled: true as const,
            };
          }
        }
        if (!progress.coreAnswered) {
          throw new ApiProblem({
            title: "Core lesson incomplete",
            status: 409,
            code: "LESSON_CORE_INCOMPLETE",
            detail:
              "Every core evidence opportunity needs a saved answer. Your current draft and remaining work are preserved.",
          });
        }
        const currentCycleEvidence =
          await transaction.query.skillEvidenceEvent.findMany({
            where: and(
              eq(skillEvidenceEvent.userId, actor.id),
              eq(skillEvidenceEvent.cycleId, plan.cycleId),
              eq(skillEvidenceEvent.skillId, plan.coreSkillId),
            ),
          });
        const evidenceApplied = lessonEvidenceApplied(
          plan.coreSkillId,
          currentCycleEvidence
            .filter((event) => event.valid)
            .map((event) => event.payload),
        );
        if (!evidenceApplied && state.refresher === "REQUIRED") {
          if (Object.keys(expiry).length > 0) {
            await transaction
              .update(lessonPlan)
              .set(expiry)
              .where(eq(lessonPlan.id, plan.id));
          }
          return {
            timeboxExpired: false as const,
            segmentScheduled: true as const,
            refresherScheduled: true as const,
          };
        }
        const lessonResolved = transitionTrainingCycle(
          cycle.status,
          "LESSON_RESOLVED",
        );
        const finalCycleStatus = evidenceApplied
          ? transitionTrainingCycle(lessonResolved, "REWRITE_LOCKED")
          : lessonResolved;
        const lastInstructionExposure = now;
        const availableAt = new Date(
          lastInstructionExposure.getTime() + 24 * 60 * 60 * 1000,
        );
        const rewrite = evidenceApplied
          ? (
              await transaction
                .insert(rewriteTask)
                .values({
                  cycleId: plan.cycleId,
                  userId: actor.id,
                  status: "LOCKED",
                  availableAt,
                  expiresAt: new Date(
                    lastInstructionExposure.getTime() + 48 * 60 * 60 * 1000,
                  ),
                  abstractChecklist: [
                    "Check the question instruction and your position.",
                    "Check paragraph purpose and logical development.",
                    "Check the personal target only after 35 minutes.",
                  ],
                  lastInstructionExposureAt: lastInstructionExposure,
                  prerequisiteSkipped: false,
                })
                .onConflictDoUpdate({
                  target: rewriteTask.cycleId,
                  set: {
                    status: "LOCKED",
                    availableAt,
                    expiresAt: new Date(
                      lastInstructionExposure.getTime() + 48 * 60 * 60 * 1000,
                    ),
                    lastInstructionExposureAt: lastInstructionExposure,
                    assisted: false,
                    prerequisiteSkipped: false,
                  },
                })
                .returning()
            )[0]
          : null;
        const { draft: _removedDraft, ...stateWithoutDraft } = state;
        await transaction
          .update(trainingCycle)
          .set({ status: finalCycleStatus })
          .where(eq(trainingCycle.id, plan.cycleId));
        const elapsed = lessonRuntimeSnapshot(
          runtimePlan,
          now,
        ).effectiveElapsedSeconds;
        const completionMode = evidenceApplied
          ? ("EVIDENCE_APPLIED" as const)
          : payload.mode === "trim_optional"
            ? ("TIMEBOX_TRIMMED" as const)
            : ("PRACTICE_ONLY" as const);
        await transaction
          .update(lessonPlan)
          .set({
            runtimeStatus: "CORE_COMPLETED",
            activeStartedAt: null,
            elapsedSeconds: elapsed,
            resolvedAt: now,
            runtimeRevision: plan.runtimeRevision + 1,
            runtimeState: {
              ...stateWithoutDraft,
              adaptive: progress.adaptive,
              split:
                state.split === "ACTIVE"
                  ? "COMPLETED"
                  : (state.split ?? "NONE"),
              completionMode,
            },
          })
          .where(eq(lessonPlan.id, plan.id));
        return {
          timeboxExpired: false as const,
          segmentScheduled: false as const,
          rewrite,
          status: finalCycleStatus,
          evidenceApplied,
          completionMode,
        };
      });
      if (output.timeboxExpired) {
        throw new ApiProblem({
          title: "Lesson timebox expired",
          status: 409,
          code: "LESSON_TIMEBOX_EXPIRED",
          detail:
            "The 60-minute session ended. Choose a split continuation or trim non-core remedial work.",
        });
      }
      if (output.segmentScheduled) {
        const responseBody = {
          completed: false,
          segment_scheduled: true,
          refresher_scheduled:
            "refresherScheduled" in output &&
            output.refresherScheduled === true,
          mastery_evidence_created: false,
        };
        await completeIdempotentResponse(
          db,
          actor.id,
          reservation.key,
          202,
          responseBody,
        );
        return Response.json(responseBody, { status: 202 });
      }
      const responseBody = {
        completed: true,
        cycle_status: output.status,
        rewrite_task: output.rewrite,
        completion_mode: output.completionMode,
        mastery_evidence_created: output.evidenceApplied,
      };
      await completeIdempotentResponse(
        db,
        actor.id,
        reservation.key,
        201,
        responseBody,
      );
      return Response.json(responseBody, {
        status: 201,
        ...(output.rewrite?.id
          ? {
              headers: {
                location: `/api/v1/rewrite-tasks/${output.rewrite.id}`,
              },
            }
          : {}),
      });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
