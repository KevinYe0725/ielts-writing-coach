import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  aiJob,
  lessonPlan,
  teachingPracticeResponse,
  trainingCycle,
  type Database,
} from "@iwc/db";

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
import {
  buildDeterministicChoiceAnalysis,
  createOrGetTeachingPracticeResponse,
  findTeachingPrompt,
} from "@/lib/server/teaching-practice-analysis";
import {
  publicTeachingPracticeResponse,
  responseHttpStatus,
} from "@/lib/server/teaching-practice-response-api";

const answerSchema = z
  .object({
    answer: z
      .string()
      .max(4_000)
      .refine((value) => value.trim().length > 0, "Answer cannot be blank."),
  })
  .strict();
const promptIdSchema = z
  .string()
  .max(160)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);

interface RouteContext {
  params: Promise<{ id: string; promptId: string }>;
}

function notFound(): ApiProblem {
  return new ApiProblem({
    title: "Tutorial response not found",
    status: 404,
    code: "TEACHING_PRACTICE_RESPONSE_NOT_FOUND",
    detail: "The tutorial response does not exist.",
  });
}

async function linkedJobStatus(
  database: Database,
  response: { aiJobId: string | null; userId: string },
): Promise<typeof aiJob.$inferSelect.status | null> {
  if (!response.aiJobId) return null;
  const job = await database.query.aiJob.findFirst({
    columns: { status: true },
    where: and(
      eq(aiJob.id, response.aiJobId),
      eq(aiJob.ownerId, response.userId),
    ),
  });
  return job?.status ?? null;
}

export const GET = apiRoute(
  async (request, context: RouteContext): Promise<Response> => {
    const actor = await requireSession(request);
    const { id: rawId, promptId: rawPromptId } = await context.params;
    const id = parseDomainId(rawId, "lesson_id");
    const promptId = promptIdSchema.parse(rawPromptId);
    const { db } = getServerContext();
    const plan = await db.query.lessonPlan.findFirst({
      where: eq(lessonPlan.id, id),
      with: { cycle: true },
    });
    if (
      !plan ||
      plan.cycle.userId !== actor.id ||
      !findTeachingPrompt(plan.paperContent, promptId)
    )
      throw notFound();
    const response = await db.query.teachingPracticeResponse.findFirst({
      where: and(
        eq(teachingPracticeResponse.lessonPlanId, id),
        eq(teachingPracticeResponse.userId, actor.id),
        eq(teachingPracticeResponse.promptId, promptId),
      ),
    });
    if (!response) throw notFound();
    return Response.json({
      response: publicTeachingPracticeResponse(
        response,
        await linkedJobStatus(db, response),
      ),
    });
  },
);

export const POST = apiRoute(
  async (request, context: RouteContext): Promise<Response> => {
    protectMutation(request);
    const actor = await requireSession(request);
    const { id: rawId, promptId: rawPromptId } = await context.params;
    const id = parseDomainId(rawId, "lesson_id");
    const promptId = promptIdSchema.parse(rawPromptId);
    const payload = await parseJsonBody(request, answerSchema, {
      maximumBytes: 8 * 1_024,
    });
    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      lessonId: id,
      promptId,
      answer: payload.answer,
    });
    if (reservation.replay) return reservation.replay;
    try {
      const output = await db.transaction(async (transaction) => {
        const [plan] = await transaction
          .select()
          .from(lessonPlan)
          .where(eq(lessonPlan.id, id))
          .for("update");
        if (!plan) throw notFound();
        const cycle = await transaction.query.trainingCycle.findFirst({
          columns: { id: true },
          where: and(
            eq(trainingCycle.id, plan.cycleId),
            eq(trainingCycle.userId, actor.id),
          ),
        });
        const prompt = findTeachingPrompt(plan.paperContent, promptId);
        if (!cycle || !prompt) throw notFound();

        const existing =
          await transaction.query.teachingPracticeResponse.findFirst({
            where: and(
              eq(teachingPracticeResponse.lessonPlanId, id),
              eq(teachingPracticeResponse.userId, actor.id),
              eq(teachingPracticeResponse.promptId, promptId),
            ),
          });
        if (existing) {
          const response = publicTeachingPracticeResponse(
            existing,
            await linkedJobStatus(transaction as unknown as Database, existing),
          );
          const status = responseHttpStatus(response);
          const body = { response };
          await completeIdempotentResponse(
            transaction,
            actor.id,
            reservation.key,
            status,
            body,
          );
          return { body, status };
        }

        if (
          prompt.responseMode === "CHOICE" &&
          !prompt.optionsEn.includes(payload.answer)
        ) {
          throw new ApiProblem({
            title: "Choose one available answer",
            status: 422,
            code: "TEACHING_PRACTICE_CHOICE_INVALID",
            detail:
              "The answer must exactly match one of the displayed choices.",
          });
        }

        const deterministic =
          prompt.responseMode === "CHOICE"
            ? buildDeterministicChoiceAnalysis(prompt, payload.answer)
            : null;
        if (prompt.responseMode === "CHOICE" && !deterministic) {
          throw new ApiProblem({
            title: "Tutorial choice unavailable",
            status: 422,
            code: "TEACHING_PRACTICE_CHOICE_INVALID",
            detail: "The selected tutorial choice cannot be compared.",
          });
        }
        let created = await createOrGetTeachingPracticeResponse(
          transaction as unknown as Database,
          {
            lessonPlanId: id,
            userId: actor.id,
            promptId,
            submittedAnswer: payload.answer,
            responseMode: prompt.responseMode,
            status:
              prompt.responseMode === "CHOICE"
                ? "ANALYSIS_READY"
                : "REFERENCE_READY",
            ...(deterministic ? { analysis: deterministic } : {}),
          },
        );
        let createdJobStatus: typeof aiJob.$inferSelect.status | null = null;

        if (prompt.responseMode === "SHORT_TEXT") {
          const job = await enqueueAIJob(transaction, {
            ownerId: actor.id,
            taskKind: "teaching_practice_analysis",
            protectedReference: { teachingPracticeResponseId: created.id },
            idempotencyKey: `teaching-practice:${created.id}:initial`,
          });
          const [updated] = await transaction
            .update(teachingPracticeResponse)
            .set({
              aiJobId: job.id,
              status:
                job.status === "QUEUED"
                  ? "ANALYSIS_PENDING"
                  : "ANALYSIS_UNAVAILABLE",
              updatedAt: new Date(),
            })
            .where(eq(teachingPracticeResponse.id, created.id))
            .returning();
          if (!updated) throw new Error("Tutorial response update failed.");
          created = { ...updated, analysis: null };
          createdJobStatus = job.status;
        }

        const response = publicTeachingPracticeResponse(
          created,
          createdJobStatus,
        );
        const status = responseHttpStatus(response);
        const body = { response };
        await completeIdempotentResponse(
          transaction,
          actor.id,
          reservation.key,
          status,
          body,
        );
        return { body, status };
      });
      return Response.json(output.body, { status: output.status });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
