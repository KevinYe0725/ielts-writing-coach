import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { lessonPlan, trainingCycle } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { enqueueAIJob } from "@/lib/server/jobs";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { parseDomainId, parseJsonBody } from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

const submissionSchema = z
  .object({
    answers: z.record(z.string().uuid(), z.string().max(5_000)),
  })
  .strict();

function publicPaper(value: unknown): {
  items: Array<{
    id: string;
    responseMode: string;
    acceptedAnswers?: unknown;
    answerExplanationZh?: unknown;
  }>;
} | null {
  if (typeof value !== "object" || value === null) return null;
  const nested = (value as { paper?: unknown }).paper;
  const paperValue =
    typeof nested === "object" && nested !== null ? nested : value;
  const items = (paperValue as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  if (
    items.some(
      (item) =>
        typeof item !== "object" ||
        item === null ||
        typeof (item as { id?: unknown }).id !== "string" ||
        typeof (item as { responseMode?: unknown }).responseMode !== "string",
    )
  )
    return null;
  return paperValue as {
    items: Array<{
      id: string;
      responseMode: string;
      acceptedAnswers?: unknown;
      answerExplanationZh?: unknown;
    }>;
  };
}

function learnerPaper(value: unknown): Record<string, unknown> | null {
  const paper = publicPaper(value);
  if (!paper) return null;
  const { items: _items, ...header } = paper as unknown as Record<
    string,
    unknown
  > & {
    items: unknown;
  };
  return {
    ...header,
    items: paper.items.map(
      ({
        acceptedAnswers: _answers,
        answerExplanationZh: _explanation,
        ...item
      }) => item,
    ),
  };
}

export const GET = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireSession(request);
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "lesson_id");
    const { db } = getServerContext();
    const plan = await db.query.lessonPlan.findFirst({
      where: eq(lessonPlan.id, id),
      with: { cycle: true },
    });
    if (!plan || plan.cycle.userId !== actor.id) {
      throw new ApiProblem({
        title: "Practice paper not found",
        status: 404,
        code: "PRACTICE_PAPER_NOT_FOUND",
        detail: "The practice paper does not exist.",
      });
    }
    if (plan.practiceFormat !== "TIMED_PAPER_V2" || !plan.paperContent) {
      throw new ApiProblem({
        title: "Old practice format",
        status: 409,
        code: "PRACTICE_PAPER_REPLACEMENT_REQUIRED",
        detail:
          "This earlier interactive lesson has been retired. Generate the clearer complete-paper version.",
      });
    }
    const paper = learnerPaper(plan.paperContent);
    if (!paper) {
      throw new ApiProblem({
        title: "Practice paper unavailable",
        status: 500,
        code: "PRACTICE_PAPER_INVALID",
        detail: "Generate a new practice paper before answering.",
      });
    }
    return Response.json({
      paper,
      answers: plan.paperAnswers,
      result: plan.paperResult,
      submitted_at: plan.paperSubmittedAt,
      evaluation_pending:
        plan.paperSubmittedAt !== null && plan.paperResult === null,
      runtime: {
        status: plan.runtimeStatus,
        started_at: plan.startedAt,
        elapsed_seconds: plan.elapsedSeconds,
      },
    });
  },
);

export const POST = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    protectMutation(request);
    const actor = await requireSession(request);
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "lesson_id");
    const payload = await parseJsonBody(request, submissionSchema, {
      maximumBytes: 48_000,
    });
    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      lessonId: id,
      answers: payload.answers,
    });
    if (reservation.replay) return reservation.replay;
    try {
      const output = await db.transaction(async (transaction) => {
        const [locked] = await transaction
          .select()
          .from(lessonPlan)
          .where(eq(lessonPlan.id, id))
          .for("update");
        if (!locked) {
          throw new ApiProblem({
            title: "Practice paper not found",
            status: 404,
            code: "PRACTICE_PAPER_NOT_FOUND",
            detail: "The practice paper does not exist.",
          });
        }
        const cycle = await transaction.query.trainingCycle.findFirst({
          where: and(
            eq(trainingCycle.id, locked.cycleId),
            eq(trainingCycle.userId, actor.id),
          ),
        });
        if (!cycle) {
          throw new ApiProblem({
            title: "Practice paper not found",
            status: 404,
            code: "PRACTICE_PAPER_NOT_FOUND",
            detail: "The practice paper does not belong to this learner.",
          });
        }
        if (locked.paperSubmittedAt) {
          if (
            JSON.stringify(locked.paperAnswers) !==
            JSON.stringify(payload.answers)
          ) {
            throw new ApiProblem({
              title: "Practice paper already submitted",
              status: 409,
              code: "PRACTICE_PAPER_ALREADY_SUBMITTED",
              detail: "A submitted practice paper cannot be changed.",
            });
          }
          return {
            jobId: locked.paperEvaluationJobId,
            jobStatus: locked.paperResult ? "SUCCEEDED" : "QUEUED",
          };
        }
        const paper = publicPaper(locked.paperContent);
        if (!paper || paper.items.length !== 8) {
          throw new ApiProblem({
            title: "Practice paper is invalid",
            status: 500,
            code: "PRACTICE_PAPER_INVALID",
            detail: "Generate a new practice paper before answering.",
          });
        }
        const itemIds = new Set(paper.items.map((item) => item.id));
        const supplied = Object.keys(payload.answers);
        if (
          supplied.length !== itemIds.size ||
          supplied.some((itemId) => !itemIds.has(itemId))
        ) {
          throw new ApiProblem({
            title: "Complete every question",
            status: 422,
            code: "PRACTICE_PAPER_INCOMPLETE",
            detail:
              "The submitted answer sheet must match all eight questions.",
          });
        }
        const now = new Date();
        const job = await enqueueAIJob(transaction, {
          ownerId: actor.id,
          taskKind: "paragraph_evaluation",
          protectedReference: {
            lessonId: locked.id,
            cycleId: locked.cycleId,
            practicePaper: "true",
          },
          idempotencyKey: `practice-paper:${locked.id}:submission`,
        });
        await transaction
          .update(lessonPlan)
          .set({
            paperAnswers: payload.answers,
            paperSubmittedAt: now,
            paperEvaluationJobId: job.id,
            runtimeStatus: "EVALUATING",
            activeStartedAt: null,
          })
          .where(eq(lessonPlan.id, locked.id));
        return { jobId: job.id, jobStatus: job.status };
      });
      const responseBody = {
        submitted: true,
        job_id: output.jobId,
        job_status: output.jobStatus,
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
        ...(output.jobId
          ? { headers: { location: `/api/v1/ai-jobs/${output.jobId}` } }
          : {}),
      });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
