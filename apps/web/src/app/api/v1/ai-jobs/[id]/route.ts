import { and, eq } from "drizzle-orm";

import { aiJob } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { requireSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export const GET = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireSession(request);
    const { id } = await context.params;
    const { db } = getServerContext();
    const job = await db.query.aiJob.findFirst({
      where: and(eq(aiJob.id, id), eq(aiJob.ownerId, actor.id)),
    });
    if (!job)
      throw new ApiProblem({
        title: "Job not found",
        status: 404,
        code: "AI_JOB_NOT_FOUND",
        detail: "The AI job does not exist.",
      });
    return Response.json(
      {
        job: {
          id: job.id,
          task_kind: job.taskKind,
          status: job.status,
          attempt_count: job.attemptCount,
          available_at: job.availableAt,
          started_at: job.startedAt,
          completed_at: job.completedAt,
          error: job.lastErrorCode
            ? {
                code: job.lastErrorCode,
                safe_message: job.lastErrorSafeMessage,
              }
            : null,
          usage: job.usage,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  },
);
