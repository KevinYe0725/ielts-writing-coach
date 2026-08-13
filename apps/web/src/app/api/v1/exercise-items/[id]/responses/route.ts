import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  evaluation,
  exerciseAttempt,
  exerciseItem,
  lessonPlan,
  newDomainId,
  trainingCycle,
} from "@iwc/db";
import {
  judgeClosedExercise,
  parseExercisePresentation,
  productiveSecondsDelta,
} from "@iwc/learning-core";
import {
  isContract,
  type ExerciseItem as CanonicalExerciseItem,
} from "@iwc/learning-contracts";

import { getServerContext } from "@/lib/server/context";
import {
  validateExerciseWordRange,
  validateTargetedSelfCheck,
} from "@/lib/server/exercise-submission";
import { enqueueAIJob } from "@/lib/server/jobs";
import {
  deriveLessonProgress,
  expireLessonRuntime,
  normalizeLessonRuntimeState,
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

const answerSchema = z
  .object({
    response_id: z.string().uuid().optional(),
    first_answer: z.string().trim().min(1).max(8_000),
    hinted_answer: z.string().trim().min(1).max(8_000).optional(),
    final_answer: z.string().trim().min(1).max(8_000),
    hints_used: z.number().int().min(0).max(10).default(0),
    hint_level: z
      .enum(["NONE", "KEYWORD", "PARTIAL_FRAME", "FULL_FRAME", "ANSWER_SHOWN"])
      .default("NONE"),
    reference_answer_seen: z.boolean().default(false),
    elapsed_seconds: z
      .number()
      .int()
      .min(0)
      .max(60 * 60)
      .default(0),
    self_check_confirmations: z
      .array(z.string().trim().min(1).max(300))
      .max(10)
      .default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.hints_used === 0 && value.hint_level !== "NONE") {
      context.addIssue({
        code: "custom",
        path: ["hint_level"],
        message: "A non-zero hint level requires at least one hint.",
      });
    }
    if (value.hint_level === "ANSWER_SHOWN" && !value.reference_answer_seen) {
      context.addIssue({
        code: "custom",
        path: ["reference_answer_seen"],
        message: "ANSWER_SHOWN requires reference_answer_seen=true.",
      });
    }
  });

function answerText(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

function canonicalContract(item: {
  evaluationContract: Record<string, unknown>;
}) {
  const candidate = item.evaluationContract.canonicalItem;
  return typeof candidate === "object" && candidate !== null
    ? (candidate as Record<string, unknown>)
    : {};
}

function canonicalItem(item: {
  evaluationContract: Record<string, unknown>;
}): CanonicalExerciseItem {
  const candidate = item.evaluationContract.canonicalItem;
  if (!isContract("exerciseItem", candidate)) {
    throw new ApiProblem({
      title: "Invalid exercise contract",
      status: 500,
      code: "INVALID_EXERCISE_CONTRACT",
      detail: "This exercise cannot be judged from a canonical contract.",
    });
  }
  return candidate;
}

function presentation(item: {
  evaluationContract: Record<string, unknown>;
  prompt: Record<string, unknown>;
}) {
  return parseExercisePresentation(
    item.evaluationContract.presentation ?? item.prompt.presentation,
  );
}

function evaluationWire(result: typeof evaluation.$inferSelect) {
  const outcome = ["PASS", "FAIL", "NEUTRAL"].includes(
    result.feedback.outcome ?? "",
  )
    ? result.feedback.outcome
    : result.passed
      ? "PASS"
      : "FAIL";
  const acceptedAnswers = (() => {
    try {
      const parsed: unknown = JSON.parse(
        result.feedback.acceptedAnswers ?? "[]",
      );
      return Array.isArray(parsed)
        ? parsed.filter(
            (answer): answer is string => typeof answer === "string",
          )
        : [];
    } catch {
      return [];
    }
  })();
  const criterionResults = (() => {
    try {
      return JSON.parse(result.feedback.criterionResults ?? "[]") as unknown;
    } catch {
      return [];
    }
  })();
  return {
    outcome,
    passed: result.passed,
    first_attempt_passed: result.feedback.firstAttemptPassed === "true",
    confidence: result.confidence,
    feedback_zh: result.feedback.zh ?? "",
    feedback_en: result.feedback.en ?? "",
    evidence: result.userAnswerEvidence,
    dimension_scores: result.dimensionScores,
    criterion_results: criterionResults,
    suggestion_zh: result.mostImportantSuggestion,
    accepted_answers: acceptedAnswers,
    confusion_id: result.feedback.confusionId ?? null,
    valid_for_evidence: result.validForEvidence,
    demo_only: result.versionSnapshot.providerKind === "mock",
  };
}

function independentGroupId(item: {
  evaluationContract: Record<string, unknown>;
}): string | null {
  const candidate = canonicalContract(item).independentGroupId;
  return typeof candidate === "string" ? candidate : null;
}

export const GET = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireSession(request);
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "exercise_item_id");
    const rawResponseId = new URL(request.url).searchParams.get("response_id");
    if (!rawResponseId) {
      throw new ApiProblem({
        title: "Response id required",
        status: 400,
        code: "RESPONSE_ID_REQUIRED",
        detail: "Provide the exercise response id to read its evaluation.",
      });
    }
    const responseId = parseDomainId(rawResponseId, "response_id");
    const { db } = getServerContext();
    const attempt = await db.query.exerciseAttempt.findFirst({
      where: and(
        eq(exerciseAttempt.id, responseId),
        eq(exerciseAttempt.exerciseItemId, id),
        eq(exerciseAttempt.userId, actor.id),
      ),
      with: {
        evaluations: {
          orderBy: [desc(evaluation.createdAt), desc(evaluation.id)],
        },
        item: { with: { lessonPlan: { with: { items: true } } } },
      },
    });
    if (!attempt) {
      throw new ApiProblem({
        title: "Exercise response not found",
        status: 404,
        code: "EXERCISE_RESPONSE_NOT_FOUND",
        detail: "The exercise response does not exist.",
      });
    }
    const planItems = attempt.item.lessonPlan.items;
    const allAttempts = await db.query.exerciseAttempt.findMany({
      where: and(
        eq(exerciseAttempt.userId, actor.id),
        inArray(
          exerciseAttempt.exerciseItemId,
          planItems.map((item) => item.id),
        ),
      ),
      with: {
        evaluations: {
          orderBy: [desc(evaluation.createdAt), desc(evaluation.id)],
        },
      },
    });
    const state = normalizeLessonRuntimeState(
      attempt.item.lessonPlan.runtimeState,
    );
    const progress = deriveLessonProgress({
      items: planItems,
      attempts: allAttempts,
      ...(state.adaptive ? { previous: state.adaptive } : {}),
    });
    if (JSON.stringify(state.adaptive) !== JSON.stringify(progress.adaptive)) {
      await db
        .update(lessonPlan)
        .set({
          runtimeState: { ...state, adaptive: progress.adaptive },
          runtimeRevision: attempt.item.lessonPlan.runtimeRevision + 1,
        })
        .where(
          and(
            eq(lessonPlan.id, attempt.item.lessonPlanId),
            eq(
              lessonPlan.runtimeRevision,
              attempt.item.lessonPlan.runtimeRevision,
            ),
          ),
        );
    }
    const groupId = independentGroupId(attempt.item);
    const groupItems = groupId
      ? planItems.filter((item) => independentGroupId(item) === groupId)
      : [];
    const groupAttempts = groupItems
      .map((item) =>
        allAttempts.find((candidate) => candidate.exerciseItemId === item.id),
      )
      .filter((candidate): candidate is (typeof allAttempts)[number] =>
        Boolean(candidate),
      );
    const groupFeedbackReady =
      groupItems.length >= 2 &&
      groupAttempts.length === groupItems.length &&
      groupAttempts.every((candidate) => candidate.evaluations.length > 0);
    const latest =
      groupId && !groupFeedbackReady ? undefined : attempt.evaluations[0];
    return Response.json(
      {
        response: {
          id: attempt.id,
          first_answer_saved: true,
          evaluation: latest ? evaluationWire(latest) : null,
          batch:
            groupId === null
              ? null
              : {
                  group_id: groupId,
                  submitted: groupAttempts.length,
                  required: groupItems.length,
                  feedback_ready: groupFeedbackReady,
                  feedback: groupFeedbackReady
                    ? groupAttempts.map((candidate) => {
                        const result = candidate.evaluations[0]!;
                        return {
                          item_id: candidate.exerciseItemId,
                          ...evaluationWire(result),
                        };
                      })
                    : [],
                },
          remediation_active: progress.remediationActive,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  },
);

export const POST = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    protectMutation(request);
    const actor = await requireSession(request);
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "exercise_item_id");
    const payload = await parseJsonBody(request, answerSchema, {
      maximumBytes: 32 * 1_024,
    });
    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(
      db,
      actor.id,
      request,
      payload,
    );
    if (reservation.replay) return reservation.replay;
    try {
      const output = await db.transaction(async (transaction) => {
        // Serialize first submissions for one item so concurrent tabs cannot
        // create two response identities before either sees the other.
        await transaction
          .select({ id: exerciseItem.id })
          .from(exerciseItem)
          .where(eq(exerciseItem.id, id))
          .for("update");
        const item = await transaction.query.exerciseItem.findFirst({
          where: eq(exerciseItem.id, id),
          with: { lessonPlan: true },
        });
        if (!item) {
          throw new ApiProblem({
            title: "Exercise not found",
            status: 404,
            code: "EXERCISE_NOT_FOUND",
            detail: "The exercise does not exist.",
          });
        }
        const [cycle] = await transaction
          .select()
          .from(trainingCycle)
          .where(
            and(
              eq(trainingCycle.id, item.lessonPlan.cycleId),
              eq(trainingCycle.userId, actor.id),
            ),
          )
          .for("update");
        if (!cycle) {
          throw new ApiProblem({
            title: "Exercise not found",
            status: 404,
            code: "EXERCISE_NOT_FOUND",
            detail: "The exercise does not exist.",
          });
        }
        if (cycle.status !== "LESSON_ACTIVE") {
          throw new ApiProblem({
            title: "Lesson not active",
            status: 409,
            code: "LESSON_NOT_ACTIVE",
            detail: "Start the lesson before submitting an exercise response.",
          });
        }
        const now = new Date();
        const runtimePlanRows = await transaction
          .select()
          .from(lessonPlan)
          .where(eq(lessonPlan.id, item.lessonPlanId))
          .for("update");
        const runtimePlan = runtimePlanRows[0];
        if (!runtimePlan)
          throw new Error("The lesson runtime no longer exists.");
        const expiry = expireLessonRuntime(runtimePlan, now);
        if (Object.keys(expiry).length > 0) {
          await transaction
            .update(lessonPlan)
            .set(expiry)
            .where(eq(lessonPlan.id, runtimePlan.id));
          return { expired: true as const };
        }
        const runtimeState = normalizeLessonRuntimeState(
          runtimePlan.runtimeState,
        );
        if (
          runtimePlan.runtimeStatus !== "ACTIVE" ||
          runtimePlan.activeStartedAt === null
        ) {
          throw new ApiProblem({
            title: "Lesson is paused",
            status: 409,
            code: "LESSON_NOT_RUNNING",
            detail: "Resume the lesson before submitting an exercise response.",
          });
        }
        if (
          runtimeState.split === "ACTIVE" &&
          runtimeState.refresher === "REQUIRED"
        ) {
          throw new ApiProblem({
            title: "Short refresher required",
            status: 409,
            code: "LESSON_REFRESHER_REQUIRED",
            detail: "Complete the short closed-book recall before continuing.",
          });
        }
        const canonical = canonicalItem(item);
        const itemPresentation = presentation(item);
        const finalText = answerText(payload.final_answer);
        const rangeViolation = validateExerciseWordRange(
          itemPresentation,
          finalText,
        );
        if (rangeViolation) {
          throw new ApiProblem({
            title: "Paragraph length outside the exercise range",
            status: 422,
            code: rangeViolation.code,
            detail: rangeViolation.detail,
          });
        }
        if (itemPresentation?.form === "TARGETED_SELF_CHECK") {
          const sourceItemId = itemPresentation.revisionSourceItemId;
          if (!sourceItemId) {
            throw new ApiProblem({
              title: "Self-check source missing",
              status: 500,
              code: "SELF_CHECK_SOURCE_MISSING",
              detail:
                "The targeted self-check is not linked to its paragraph lab.",
            });
          }
          const sourceAttempt =
            await transaction.query.exerciseAttempt.findFirst({
              where: and(
                eq(exerciseAttempt.exerciseItemId, sourceItemId),
                eq(exerciseAttempt.userId, actor.id),
              ),
              orderBy: [
                desc(exerciseAttempt.updatedAt),
                desc(exerciseAttempt.id),
              ],
            });
          if (!sourceAttempt) {
            throw new ApiProblem({
              title: "Paragraph lab must be submitted first",
              status: 409,
              code: "SELF_CHECK_SOURCE_NOT_SUBMITTED",
              detail:
                "Submit the paragraph lab before its targeted self-check revision.",
            });
          }
          const sourceText = answerText(
            sourceAttempt.finalAnswer ?? sourceAttempt.firstAnswer,
          );
          const selfCheckViolation = validateTargetedSelfCheck({
            presentation: itemPresentation,
            sourceAnswer: sourceText,
            firstAnswer: answerText(payload.first_answer),
            finalAnswer: finalText,
            confirmations: payload.self_check_confirmations,
          });
          if (selfCheckViolation) {
            throw new ApiProblem({
              title:
                selfCheckViolation.code === "SELF_CHECK_BASELINE_MISMATCH"
                  ? "Self-check baseline does not match"
                  : selfCheckViolation.code ===
                      "SELF_CHECK_CONFIRMATIONS_REQUIRED"
                    ? "Targeted self-check incomplete"
                    : "A targeted second revision is required",
              status:
                selfCheckViolation.code === "SELF_CHECK_BASELINE_MISMATCH"
                  ? 409
                  : 422,
              code: selfCheckViolation.code,
              detail: selfCheckViolation.detail,
            });
          }
        }
        const submittedAt = now.toISOString();
        const existing = await transaction.query.exerciseAttempt.findFirst({
          where: and(
            ...(payload.response_id
              ? [eq(exerciseAttempt.id, payload.response_id)]
              : []),
            eq(exerciseAttempt.exerciseItemId, id),
            eq(exerciseAttempt.userId, actor.id),
          ),
          orderBy: [desc(exerciseAttempt.updatedAt), desc(exerciseAttempt.id)],
        });
        if (payload.response_id && !existing) {
          throw new ApiProblem({
            title: "Exercise response not found",
            status: 404,
            code: "EXERCISE_RESPONSE_NOT_FOUND",
            detail: "The response cannot be revised by this learner.",
          });
        }
        if (
          existing &&
          answerText(existing.firstAnswer) !== answerText(payload.first_answer)
        ) {
          throw new ApiProblem({
            title: "First answer is immutable",
            status: 409,
            code: "FIRST_ANSWER_IMMUTABLE",
            detail: "A revision cannot replace the saved first answer.",
          });
        }
        if (existing && existing.contractAttempts.length >= 10) {
          throw new ApiProblem({
            title: "Exercise retry limit reached",
            status: 409,
            code: "EXERCISE_RETRY_LIMIT_REACHED",
            detail:
              "This exercise already has the maximum number of saved attempts.",
          });
        }
        const responseId = existing?.id ?? newDomainId();
        const firstAttemptEventId =
          existing?.firstAttemptEventId ?? newDomainId();
        const requiresSecondRevision =
          itemPresentation?.form === "TARGETED_SELF_CHECK";
        const revisionEventId =
          existing || requiresSecondRevision
            ? newDomainId()
            : firstAttemptEventId;
        const contractAttempts: Array<{
          id: string;
          answer: string;
          submittedAt: string;
          elapsedSeconds: number;
          hintLevel:
            | "NONE"
            | "KEYWORD"
            | "PARTIAL_FRAME"
            | "FULL_FRAME"
            | "ANSWER_SHOWN";
          referenceAnswerSeen: boolean;
        }> = existing
          ? [...existing.contractAttempts]
          : [
              {
                id: firstAttemptEventId,
                answer: answerText(payload.first_answer),
                submittedAt,
                elapsedSeconds: payload.elapsed_seconds,
                hintLevel: payload.hint_level,
                referenceAnswerSeen: payload.reference_answer_seen,
              },
            ];
        if (existing || requiresSecondRevision) {
          contractAttempts.push({
            id: revisionEventId,
            answer: answerText(
              payload.final_answer ?? payload.hinted_answer ?? "",
            ),
            submittedAt,
            elapsedSeconds: payload.elapsed_seconds,
            hintLevel: payload.hint_level,
            referenceAnswerSeen: payload.reference_answer_seen,
          });
        }
        const finalAttemptEventId = revisionEventId;
        const attempt = existing
          ? (
              await transaction
                .update(exerciseAttempt)
                .set({
                  finalAttemptEventId,
                  contractAttempts,
                  hintedAnswer: payload.hinted_answer ?? existing.hintedAnswer,
                  finalAnswer: payload.final_answer ?? existing.finalAnswer,
                  hintsUsed: Math.max(existing.hintsUsed, payload.hints_used),
                  hintLevel: payload.hint_level,
                  referenceAnswerSeen:
                    existing.referenceAnswerSeen ||
                    payload.reference_answer_seen,
                })
                .where(eq(exerciseAttempt.id, existing.id))
                .returning()
            )[0]
          : (
              await transaction
                .insert(exerciseAttempt)
                .values({
                  id: responseId,
                  exerciseItemId: id,
                  userId: actor.id,
                  firstAttemptEventId,
                  finalAttemptEventId,
                  contractAttempts,
                  firstAnswer: payload.first_answer,
                  hintedAnswer: payload.hinted_answer,
                  finalAnswer: payload.final_answer,
                  hintsUsed: payload.hints_used,
                  hintLevel: payload.hint_level,
                  referenceAnswerSeen: payload.reference_answer_seen,
                })
                .returning()
            )[0];
        if (!attempt) throw new Error("Exercise response was not saved.");
        const productiveDelta = productiveSecondsDelta(
          payload.elapsed_seconds,
          existing?.contractAttempts.map((event) => event.elapsedSeconds) ?? [],
        );
        await transaction
          .update(lessonPlan)
          .set({
            productiveSeconds: runtimePlan.productiveSeconds + productiveDelta,
            ...(canonical.grading.mode === "UNSCORED_BRANCH"
              ? {
                  runtimeState: {
                    ...runtimeState,
                    semanticBranch: finalText,
                    semanticBranchSourceItemId: item.id,
                  },
                  runtimeRevision: runtimePlan.runtimeRevision + 1,
                }
              : {}),
          })
          .where(eq(lessonPlan.id, runtimePlan.id));

        const closedJudgment = judgeClosedExercise({
          item: canonical,
          presentation: itemPresentation,
          answer: finalText,
        });
        if (closedJudgment && !closedJudgment.validAnswer) {
          throw new ApiProblem({
            title: "Invalid closed exercise answer",
            status: 422,
            code: "INVALID_CLOSED_EXERCISE_ANSWER",
            detail:
              "Choose or submit one of the values offered by this exercise.",
          });
        }
        if (closedJudgment) {
          const deterministicEvaluationId = newDomainId();
          await transaction.insert(evaluation).values({
            id: deterministicEvaluationId,
            exerciseAttemptId: attempt.id,
            responseAttemptId: attempt.finalAttemptEventId,
            passed: closedJudgment.passed,
            confidence: closedJudgment.confidence,
            feedback: {
              outcome: closedJudgment.outcome,
              firstAttemptPassed: String(
                closedJudgment.passed &&
                  payload.hints_used === 0 &&
                  !payload.reference_answer_seen,
              ),
              zh: closedJudgment.feedbackZh,
              en: closedJudgment.feedbackEn,
              acceptedAnswers: JSON.stringify(closedJudgment.acceptedAnswers),
              ...(closedJudgment.confusionId
                ? { confusionId: closedJudgment.confusionId }
                : {}),
              ...(closedJudgment.selectedBranchId
                ? { selectedBranchId: closedJudgment.selectedBranchId }
                : {}),
            },
            dimensionScores: {},
            userAnswerEvidence: [...closedJudgment.evidence],
            mostImportantSuggestion: closedJudgment.passed
              ? ""
              : "Review the explicit accepted answer and try the same rule in a fresh item.",
            adjudicationStatus: "ACCEPTED",
            versionSnapshot: {
              providerKind: "deterministic",
              evaluatorVersion: "closed-exercise-judge@1.0.0",
            },
            // Closed recognition can inform feedback but never satisfies the
            // hard independent language-production mastery gate.
            validForEvidence: false,
          });
          return {
            expired: false as const,
            attempt,
            jobs: [],
            deterministic: true as const,
            evaluationId: deterministicEvaluationId,
            batch: null,
          };
        }

        const groupId = independentGroupId(item);
        const lessonItems = groupId
          ? await transaction.query.exerciseItem.findMany({
              where: eq(exerciseItem.lessonPlanId, item.lessonPlanId),
            })
          : [];
        const groupItems = groupId
          ? lessonItems.filter(
              (candidate) => independentGroupId(candidate) === groupId,
            )
          : [];
        const groupAttempts =
          groupItems.length === 0
            ? []
            : await transaction.query.exerciseAttempt.findMany({
                where: and(
                  eq(exerciseAttempt.userId, actor.id),
                  inArray(
                    exerciseAttempt.exerciseItemId,
                    groupItems.map((candidate) => candidate.id),
                  ),
                ),
                with: { evaluations: true, item: true },
              });
        if (groupId && groupAttempts.length < groupItems.length) {
          return {
            expired: false as const,
            attempt,
            jobs: [],
            deterministic: false as const,
            batch: {
              groupId,
              submitted: groupAttempts.length,
              required: groupItems.length,
              pending: true,
            },
          };
        }

        const candidates =
          groupId === null
            ? [{ ...attempt, item }]
            : groupAttempts.filter((candidate) =>
                candidate.id === attempt.id
                  ? true
                  : candidate.evaluations.length === 0,
              );
        const jobs = [];
        for (const candidate of candidates) {
          const taskKind = [
            "PARAGRAPH_WRITING",
            "MICRO_PARAGRAPH",
            "INTEGRATED_APPLICATION",
            "PARAGRAPH_SELF_CHECK",
            "SELF_CHECK",
          ].includes(candidate.item.itemType)
            ? "paragraph_evaluation"
            : "open_sentence_evaluation";
          jobs.push(
            await enqueueAIJob(transaction, {
              ownerId: actor.id,
              taskKind,
              protectedReference: {
                exerciseAttemptId: candidate.id,
                exerciseItemId: candidate.exerciseItemId,
                lessonId: item.lessonPlanId,
                cycleId: cycle.id,
              },
              idempotencyKey: `evaluation:${candidate.id}:${candidate.finalAttemptEventId}`,
            }),
          );
        }
        return {
          expired: false as const,
          attempt,
          jobs,
          deterministic: false as const,
          batch: groupId
            ? {
                groupId,
                submitted: groupAttempts.length,
                required: groupItems.length,
                pending: false,
              }
            : null,
        };
      });
      if (output.expired) {
        throw new ApiProblem({
          title: "Lesson timebox expired",
          status: 409,
          code: "LESSON_TIMEBOX_EXPIRED",
          detail:
            "The 60-minute session ended. Your draft is preserved; schedule the remainder or trim non-core work.",
        });
      }
      const responseBody = {
        response: { id: output.attempt.id, first_answer_saved: true },
        job_id: output.jobs[0]?.id ?? null,
        job_ids: output.jobs.map((job) => job.id),
        job_status: output.deterministic
          ? "DETERMINISTIC_COMPLETE"
          : output.batch?.pending === true
            ? "BATCH_PENDING"
            : (output.jobs[0]?.status ?? "BATCH_PENDING"),
        batch: output.batch,
      };
      await completeIdempotentResponse(
        db,
        actor.id,
        reservation.key,
        202,
        responseBody,
      );
      return Response.json(responseBody, {
        status: 202,
        ...(output.jobs[0]
          ? { headers: { location: output.jobs[0].location } }
          : {}),
      });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
