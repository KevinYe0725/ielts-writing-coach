import { and, eq } from "drizzle-orm";

import {
  aiJob,
  lessonPlan,
  newDomainId,
  teachingPracticeResponse,
  trainingCycle,
} from "@iwc/db";

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
import { findTeachingPrompt } from "@/lib/server/teaching-practice-analysis";
import { publicTeachingPracticeResponse } from "@/lib/server/teaching-practice-response-api";

const activeStates = new Set<typeof aiJob.$inferSelect.status>([
  "QUEUED",
  "LEASED",
  "RUNNING",
  "RETRY_SCHEDULED",
]);

function notFound(): ApiProblem {
  return new ApiProblem({
    title: "Tutorial response not found",
    status: 404,
    code: "TEACHING_PRACTICE_RESPONSE_NOT_FOUND",
    detail: "The tutorial response does not exist.",
  });
}

export const POST = apiRoute(
  async (
    request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> => {
    protectMutation(request);
    const actor = await requireSession(request);
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "teaching_practice_response_id");
    await parseJsonBody(request, emptyObjectSchema, {
      allowEmpty: true,
      maximumBytes: 1_024,
    });
    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      responseId: id,
    });
    if (reservation.replay) return reservation.replay;
    try {
      const output = await db.transaction(async (transaction) => {
        const [response] = await transaction
          .select()
          .from(teachingPracticeResponse)
          .where(
            and(
              eq(teachingPracticeResponse.id, id),
              eq(teachingPracticeResponse.userId, actor.id),
            ),
          )
          .for("update");
        if (!response) throw notFound();
        const plan = await transaction.query.lessonPlan.findFirst({
          where: eq(lessonPlan.id, response.lessonPlanId),
        });
        const cycle = plan
          ? await transaction.query.trainingCycle.findFirst({
              columns: { id: true },
              where: and(
                eq(trainingCycle.id, plan.cycleId),
                eq(trainingCycle.userId, actor.id),
              ),
            })
          : null;
        if (
          !plan ||
          !cycle ||
          !findTeachingPrompt(plan.paperContent, response.promptId)
        )
          throw notFound();

        const complete = async (
          publicResponse: ReturnType<typeof publicTeachingPracticeResponse>,
          status: 200 | 202,
        ) => {
          const body = { response: publicResponse };
          await completeIdempotentResponse(
            transaction,
            actor.id,
            reservation.key,
            status,
            body,
          );
          return { body, status };
        };

        if (
          response.responseMode === "CHOICE" ||
          response.status === "DEMO_ONLY"
        )
          return complete(publicTeachingPracticeResponse(response), 200);

        const currentJob = response.aiJobId
          ? await transaction.query.aiJob.findFirst({
              where: and(
                eq(aiJob.id, response.aiJobId),
                eq(aiJob.ownerId, actor.id),
              ),
            })
          : null;
        if (currentJob && activeStates.has(currentJob.status))
          return complete(
            publicTeachingPracticeResponse(response, currentJob.status),
            202,
          );
        if (currentJob?.status === "WAITING_FOR_CONSENT")
          return complete(
            publicTeachingPracticeResponse(response, currentJob.status),
            200,
          );
        if (currentJob?.status === "SUCCEEDED") {
          const completedResponse = publicTeachingPracticeResponse(
            response,
            currentJob.status,
          );
          if (
            completedResponse.analysisState === "ANALYSIS_READY" &&
            completedResponse.analysis
          )
            return complete(completedResponse, 200);
        }

        const job = await enqueueAIJob(transaction, {
          ownerId: actor.id,
          taskKind: "teaching_practice_analysis",
          protectedReference: { teachingPracticeResponseId: response.id },
          idempotencyKey: `teaching-practice:${response.id}:retry:${newDomainId()}`,
        });
        const [updated] = await transaction
          .update(teachingPracticeResponse)
          .set({
            aiJobId: job.id,
            status:
              job.status === "QUEUED"
                ? "ANALYSIS_PENDING"
                : "ANALYSIS_UNAVAILABLE",
            analysis: null,
            updatedAt: new Date(),
          })
          .where(eq(teachingPracticeResponse.id, response.id))
          .returning();
        if (!updated) throw new Error("Tutorial response retry update failed.");
        return complete(
          publicTeachingPracticeResponse(updated, job.status),
          job.status === "QUEUED" ? 202 : 200,
        );
      });
      return Response.json(output.body, { status: output.status });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
