import { and, eq } from "drizzle-orm";

import { aiJob } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { requireSession } from "@/lib/server/session";

const terminal = new Set(["SUCCEEDED", "AI_BLOCKED", "FAILED"]);
const encoder = new TextEncoder();

export const dynamic = "force-dynamic";

export const GET = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireSession(request);
    const { id } = await context.params;
    const { db } = getServerContext();
    const initial = await db.query.aiJob.findFirst({
      where: and(eq(aiJob.id, id), eq(aiJob.ownerId, actor.id)),
    });
    if (!initial)
      throw new ApiProblem({
        title: "Job not found",
        status: 404,
        code: "AI_JOB_NOT_FOUND",
        detail: "The AI job does not exist.",
      });
    const stream = new ReadableStream({
      async start(controller) {
        let lastStatus = "";
        const deadline = Date.now() + 5 * 60 * 1000;
        const send = (event: string, data: unknown) =>
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        try {
          while (!request.signal.aborted && Date.now() < deadline) {
            const job = await db.query.aiJob.findFirst({
              where: and(eq(aiJob.id, id), eq(aiJob.ownerId, actor.id)),
            });
            if (!job) break;
            if (job.status !== lastStatus) {
              lastStatus = job.status;
              send("status", {
                id: job.id,
                status: job.status,
                completed_at: job.completedAt,
                error_code: job.lastErrorCode,
              });
            } else {
              send("heartbeat", { at: new Date().toISOString() });
            }
            if (terminal.has(job.status)) break;
            await new Promise((resolve) => setTimeout(resolve, 1_000));
          }
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  },
);
