import { and, asc, desc, eq, inArray } from "drizzle-orm";

import {
  aiJob,
  evaluation,
  exerciseAttempt,
  exerciseItem,
  lessonPlan,
} from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { projectExerciseItemForDelivery } from "@/lib/server/lesson-delivery";
import {
  deriveLessonProgress,
  expireLessonRuntime,
  currentAutoSplitItemIds,
  lessonRuntimeSnapshot,
  normalizeLessonRuntimeState,
  refresherPlanForItem,
  runtimeItem,
} from "@/lib/server/lesson-runtime";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { parseDomainId } from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";

export const GET = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireSession(request);
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "lesson_id");
    const { db } = getServerContext();
    let plan = await db.query.lessonPlan.findFirst({
      where: eq(lessonPlan.id, id),
      with: { cycle: true, items: { orderBy: [asc(exerciseItem.ordinal)] } },
    });
    if (!plan || plan.cycle.userId !== actor.id) {
      throw new ApiProblem({
        title: "Lesson not found",
        status: 404,
        code: "LESSON_NOT_FOUND",
        detail: "The lesson does not exist.",
      });
    }

    const initialState = normalizeLessonRuntimeState(plan.runtimeState);
    const expiry = expireLessonRuntime(
      plan,
      new Date(),
      refresherPlanForItem(
        plan.items.find((item) => item.id === initialState.draft?.itemId),
      ),
    );
    if (Object.keys(expiry).length > 0) {
      const [updated] = await db
        .update(lessonPlan)
        .set(expiry)
        .where(
          and(
            eq(lessonPlan.id, plan.id),
            eq(lessonPlan.runtimeRevision, plan.runtimeRevision),
          ),
        )
        .returning();
      if (updated) plan = { ...plan, ...updated };
    }

    const itemIds = plan.items.map((item) => item.id);
    const attempts =
      itemIds.length === 0
        ? []
        : await db.query.exerciseAttempt.findMany({
            where: and(
              eq(exerciseAttempt.userId, actor.id),
              inArray(exerciseAttempt.exerciseItemId, itemIds),
            ),
            orderBy: [
              desc(exerciseAttempt.updatedAt),
              desc(exerciseAttempt.id),
            ],
            with: {
              evaluations: {
                orderBy: [desc(evaluation.createdAt), desc(evaluation.id)],
              },
            },
          });
    const latestByItem = new Map<string, (typeof attempts)[number]>();
    for (const attempt of attempts) {
      if (!latestByItem.has(attempt.exerciseItemId))
        latestByItem.set(attempt.exerciseItemId, attempt);
    }
    const unassessedJobs = await db.query.aiJob.findMany({
      where: and(
        eq(aiJob.ownerId, actor.id),
        inArray(aiJob.status, ["WAITING_FOR_CONSENT", "AI_BLOCKED", "FAILED"]),
      ),
    });
    const attemptIds = new Set(attempts.map((attempt) => attempt.id));
    const unassessedAttemptIds = unassessedJobs
      .map((job) => job.protectedReference.exerciseAttemptId)
      .filter(
        (attemptId): attemptId is string =>
          typeof attemptId === "string" && attemptIds.has(attemptId),
      );
    const state = normalizeLessonRuntimeState(plan.runtimeState);
    const progress = deriveLessonProgress({
      items: plan.items,
      attempts,
      ...(state.adaptive ? { previous: state.adaptive } : {}),
      unassessedAttemptIds,
    });
    const moduleItemIds = currentAutoSplitItemIds(state);
    const moduleSet = moduleItemIds ? new Set(moduleItemIds) : null;
    const deliveredActiveItemIds = moduleSet
      ? progress.activeItemIds.filter((itemId) => moduleSet.has(itemId))
      : progress.activeItemIds;
    const deliveredCompletedItemIds = progress.completedItemIds.filter(
      (itemId) => deliveredActiveItemIds.includes(itemId),
    );
    const deliveredNextItemId =
      deliveredActiveItemIds.find(
        (itemId) => !deliveredCompletedItemIds.includes(itemId),
      ) ?? null;
    const nextCoreIndex =
      deliveredNextItemId === null
        ? Math.max(0, deliveredActiveItemIds.length - 1)
        : Math.max(
            0,
            deliveredActiveItemIds.findIndex(
              (itemId) => itemId === deliveredNextItemId,
            ),
          );
    if (JSON.stringify(state.adaptive) !== JSON.stringify(progress.adaptive)) {
      const nextState = { ...state, adaptive: progress.adaptive };
      const [updated] = await db
        .update(lessonPlan)
        .set({
          runtimeState: nextState,
          runtimeRevision: plan.runtimeRevision + 1,
        })
        .where(
          and(
            eq(lessonPlan.id, plan.id),
            eq(lessonPlan.runtimeRevision, plan.runtimeRevision),
          ),
        )
        .returning();
      if (updated) plan = { ...plan, ...updated };
    }
    const groupItems = new Map<string, string[]>();
    for (const item of plan.items) {
      const groupId = runtimeItem(item).independentGroupId;
      if (!groupId) continue;
      groupItems.set(groupId, [...(groupItems.get(groupId) ?? []), item.id]);
    }
    const releasedGroups = new Set(
      [...groupItems.entries()]
        .filter(([, ids]) =>
          ids.every(
            (itemId) => (latestByItem.get(itemId)?.evaluations.length ?? 0) > 0,
          ),
        )
        .map(([groupId]) => groupId),
    );
    const responses = Object.fromEntries(
      [...latestByItem.entries()].map(([itemId, attempt]) => {
        const item = plan.items.find((candidate) => candidate.id === itemId);
        const groupId = item ? runtimeItem(item).independentGroupId : undefined;
        const latest =
          groupId && !releasedGroups.has(groupId)
            ? undefined
            : attempt.evaluations[0];
        return [
          itemId,
          {
            response_id: attempt.id,
            first_answer: attempt.firstAnswer,
            final_answer: attempt.finalAnswer,
            hints_used: attempt.hintsUsed,
            hint_level: attempt.hintLevel,
            reference_answer_seen: attempt.referenceAnswerSeen,
            attempt_count: attempt.contractAttempts.length,
            evaluation: latest
              ? {
                  outcome: ["PASS", "FAIL", "NEUTRAL"].includes(
                    latest.feedback.outcome ?? "",
                  )
                    ? latest.feedback.outcome
                    : latest.passed
                      ? "PASS"
                      : "FAIL",
                  passed: latest.passed,
                  first_attempt_passed:
                    latest.feedback.firstAttemptPassed === "true",
                  confidence: latest.confidence,
                  feedback_zh: latest.feedback.zh ?? "",
                  feedback_en: latest.feedback.en ?? "",
                  evidence: latest.userAnswerEvidence,
                  dimension_scores: latest.dimensionScores,
                  criterion_results: (() => {
                    try {
                      return JSON.parse(
                        latest.feedback.criterionResults ?? "[]",
                      ) as unknown;
                    } catch {
                      return [];
                    }
                  })(),
                  suggestion_zh: latest.mostImportantSuggestion,
                  accepted_answers: (() => {
                    try {
                      const parsed: unknown = JSON.parse(
                        latest.feedback.acceptedAnswers ?? "[]",
                      );
                      return Array.isArray(parsed) ? parsed : [];
                    } catch {
                      return [];
                    }
                  })(),
                  confusion_id: latest.feedback.confusionId ?? null,
                  valid_for_evidence: latest.validForEvidence,
                  demo_only: latest.versionSnapshot.providerKind === "mock",
                }
              : null,
          },
        ];
      }),
    );
    const projectedItems = plan.items.map((item) => {
      const storedPresentation =
        typeof item.evaluationContract.presentation === "object" &&
        item.evaluationContract.presentation !== null
          ? (item.evaluationContract.presentation as Record<string, unknown>)
          : {};
      const revisionSourceItemId =
        typeof storedPresentation.revisionSourceItemId === "string"
          ? storedPresentation.revisionSourceItemId
          : undefined;
      const revisionSource = revisionSourceItemId
        ? latestByItem.get(revisionSourceItemId)
        : undefined;
      const revisionBaseline = revisionSource
        ? String(revisionSource.finalAnswer ?? revisionSource.firstAnswer ?? "")
        : undefined;
      return projectExerciseItemForDelivery(item, {
        ...(state.semanticBranch
          ? { semanticBranch: state.semanticBranch }
          : {}),
        ...(revisionBaseline ? { revisionBaseline } : {}),
      });
    });
    return Response.json(
      {
        // Row-level items are the live delivery contract. Do not leak the
        // immutable planner snapshot because it contains closed-card answers.
        lesson: { ...plan, stages: [], items: projectedItems },
        progress: {
          active_item_ids: deliveredActiveItemIds,
          completed_item_ids: deliveredCompletedItemIds,
          next_core_index: nextCoreIndex,
          next_item_id: deliveredNextItemId,
          remediation_active: progress.remediationActive,
          core_answered: progress.coreAnswered,
          responses,
        },
        runtime: {
          ...lessonRuntimeSnapshot(plan),
          server_draft:
            normalizeLessonRuntimeState(plan.runtimeState).draft ?? null,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  },
);
