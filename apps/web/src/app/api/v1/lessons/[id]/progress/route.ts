import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  exerciseAttempt,
  exerciseItem,
  lessonPlan,
  trainingCycle,
} from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import {
  expireLessonRuntime,
  buildAutoSplitModules,
  lessonRuntimeSnapshot,
  normalizeLessonRuntimeState,
  pauseLessonRuntime,
  recordAbnormalInterruption,
  refresherPlanForItem,
} from "@/lib/server/lesson-runtime";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { parseDomainId, parseJsonBody } from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";
import { protectMutation } from "@/lib/server/security";

const draftSchema = z
  .object({
    item_id: z.string().uuid(),
    answer: z.string().max(8_000),
    first_answer: z.string().max(8_000),
    response_id: z.string().uuid().optional(),
    attempts: z.number().int().min(0).max(10),
    hint_level: z.number().int().min(0).max(10),
    revealed: z.boolean(),
    updated_at: z.string().datetime(),
  })
  .strict();

const progressSchema = z
  .object({
    revision: z.number().int().min(1),
    action: z
      .enum([
        "SAVE_DRAFT",
        "PAUSE",
        "REPORT_INTERRUPTION",
        "SCHEDULE_SPLIT",
        "COMPLETE_REFRESHER",
      ])
      .default("SAVE_DRAFT"),
    interruption_kind: z
      .enum(["BROWSER", "NETWORK", "TIMER", "USER_ABNORMAL"])
      .optional(),
    draft: draftSchema.nullable().optional(),
    refresher_answer: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();

function parseIfMatch(request: Request): number | null {
  const header = request.headers.get("if-match");
  if (!header) return null;
  const match = /^(?:W\/)?"(\d+)"$/.exec(header.trim());
  if (!match?.[1]) {
    throw new ApiProblem({
      title: "Invalid revision precondition",
      status: 400,
      code: "INVALID_IF_MATCH",
      detail:
        'If-Match must use the lesson runtime revision, for example W/"3".',
    });
  }
  return Number(match[1]);
}

export const PATCH = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    protectMutation(request);
    const actor = await requireSession(request);
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "lesson_id");
    const payload = await parseJsonBody(request, progressSchema, {
      maximumBytes: 32 * 1_024,
    });
    const ifMatch = parseIfMatch(request);
    if (ifMatch !== null && ifMatch !== payload.revision) {
      throw new ApiProblem({
        title: "Revision precondition mismatch",
        status: 400,
        code: "REVISION_PRECONDITION_MISMATCH",
        detail: "The body revision and If-Match revision must be identical.",
      });
    }
    const { db } = getServerContext();
    const updated = await db.transaction(async (transaction) => {
      const [plan] = await transaction
        .select()
        .from(lessonPlan)
        .where(eq(lessonPlan.id, id))
        .for("update");
      if (!plan) {
        throw new ApiProblem({
          title: "Lesson not found",
          status: 404,
          code: "LESSON_NOT_FOUND",
          detail: "The lesson does not exist.",
        });
      }
      const ownerCycle = await transaction.query.trainingCycle.findFirst({
        where: and(
          eq(trainingCycle.id, plan.cycleId),
          eq(trainingCycle.userId, actor.id),
        ),
      });
      if (!ownerCycle) {
        throw new ApiProblem({
          title: "Lesson not found",
          status: 404,
          code: "LESSON_NOT_FOUND",
          detail: "The lesson does not belong to this learner.",
        });
      }
      if (plan.runtimeRevision !== payload.revision) {
        const state = normalizeLessonRuntimeState(plan.runtimeState);
        throw new ApiProblem({
          title: "Lesson progress conflict",
          status: 409,
          code: "LESSON_PROGRESS_CONFLICT",
          detail:
            "Another device saved newer lesson progress. The local draft remains in IndexedDB.",
          current_revision: plan.runtimeRevision,
          server_draft: state.draft ?? null,
        });
      }

      const items = await transaction.query.exerciseItem.findMany({
        where: eq(exerciseItem.lessonPlanId, plan.id),
      });
      const initialState = normalizeLessonRuntimeState(plan.runtimeState);
      const currentItemId =
        payload.draft?.item_id ?? initialState.draft?.itemId;
      const currentItem = items.find((item) => item.id === currentItemId);
      const now = new Date();
      const expiry = expireLessonRuntime(
        plan,
        now,
        refresherPlanForItem(currentItem),
      );
      let nextPlan = { ...plan, ...expiry };
      let state = normalizeLessonRuntimeState(nextPlan.runtimeState);
      if (payload.draft !== undefined) {
        if (payload.draft === null) {
          const { draft: _removedDraft, ...withoutDraft } = state;
          state = withoutDraft;
        } else {
          state = {
            ...state,
            draft: {
              itemId: payload.draft.item_id,
              answer: payload.draft.answer,
              firstAnswer: payload.draft.first_answer,
              ...(payload.draft.response_id
                ? { responseId: payload.draft.response_id }
                : {}),
              attempts: payload.draft.attempts,
              hintLevel: payload.draft.hint_level,
              revealed: payload.draft.revealed,
              updatedAt: payload.draft.updated_at,
            },
          };
        }
      }
      if (payload.action === "PAUSE") {
        nextPlan = { ...nextPlan, ...pauseLessonRuntime(nextPlan, now) };
      }
      if (payload.action === "REPORT_INTERRUPTION") {
        if (!payload.interruption_kind || nextPlan.runtimeStatus !== "ACTIVE") {
          throw new ApiProblem({
            title: "Abnormal interruption cannot be recorded",
            status: 409,
            code: "LESSON_INTERRUPTION_NOT_AVAILABLE",
            detail:
              "Choose an interruption reason while the focused lesson is active.",
          });
        }
        const itemIds = items.map((item) => item.id);
        const attempts =
          itemIds.length === 0
            ? []
            : await transaction.query.exerciseAttempt.findMany({
                columns: { exerciseItemId: true },
                where: and(
                  eq(exerciseAttempt.userId, actor.id),
                  inArray(exerciseAttempt.exerciseItemId, itemIds),
                ),
              });
        const modules = buildAutoSplitModules(
          items,
          attempts.map((attempt) => attempt.exerciseItemId),
          state.adaptive?.skippedItemIds ?? [],
        );
        const interruption = recordAbnormalInterruption({
          plan: nextPlan,
          kind: payload.interruption_kind,
          modules,
          now,
        });
        nextPlan = { ...nextPlan, ...interruption };
        state = normalizeLessonRuntimeState(nextPlan.runtimeState);
      }
      if (payload.action === "SCHEDULE_SPLIT") {
        if (nextPlan.runtimeStatus !== "TIMEBOX_EXPIRED") {
          throw new ApiProblem({
            title: "Lesson split is not available",
            status: 409,
            code: "LESSON_SPLIT_NOT_AVAILABLE",
            detail:
              "The remaining lesson can be split only after the server-authoritative 60-minute segment expires.",
          });
        }
        state = {
          ...state,
          split: "SCHEDULED",
          refresher: "REQUIRED",
        };
      }
      if (payload.action === "COMPLETE_REFRESHER") {
        if (
          nextPlan.runtimeStatus !== "ACTIVE" ||
          state.split !== "ACTIVE" ||
          state.refresher !== "REQUIRED" ||
          !payload.refresher_answer
        ) {
          throw new ApiProblem({
            title: "Refresher is not available",
            status: 409,
            code: "REFRESHER_NOT_AVAILABLE",
            detail:
              "A short recall check is only required when a split lesson resumes.",
          });
        }
        state = {
          ...state,
          refresher: "COMPLETED",
          refresherAnswer: payload.refresher_answer,
        };
      }
      const [result] = await transaction
        .update(lessonPlan)
        .set({
          runtimeStatus: nextPlan.runtimeStatus,
          startedAt: nextPlan.startedAt,
          activeStartedAt: nextPlan.activeStartedAt,
          pausedAt: nextPlan.pausedAt,
          timeboxExpiredAt: nextPlan.timeboxExpiredAt,
          elapsedSeconds: nextPlan.elapsedSeconds,
          runtimeState: state,
          runtimeRevision: plan.runtimeRevision + 1,
        })
        .where(eq(lessonPlan.id, id))
        .returning();
      if (!result) throw new Error("Lesson progress was not updated.");
      return result;
    });
    return Response.json(
      {
        runtime: lessonRuntimeSnapshot(updated),
        server_draft: updated.runtimeState.draft ?? null,
      },
      { headers: { etag: `W/"${updated.runtimeRevision}"` } },
    );
  },
);
