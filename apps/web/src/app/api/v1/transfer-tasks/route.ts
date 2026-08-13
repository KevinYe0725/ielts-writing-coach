import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { aiJob, question, skillEvidenceEvent, transferTask } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { parseDomainId } from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";

export const GET = apiRoute(async (request) => {
  const actor = await requireSession(request);
  const { db } = getServerContext();
  const searchParams = new URL(request.url).searchParams;
  const unknownParameters = [...searchParams.keys()].filter(
    (name) => name !== "task_id",
  );
  const rawTaskIds = searchParams.getAll("task_id");
  if (unknownParameters.length > 0 || rawTaskIds.length > 1) {
    throw new ApiProblem({
      title: "Invalid transfer task query",
      status: 400,
      code: "INVALID_TRANSFER_TASK_QUERY",
      detail: "Only one task_id query parameter is supported.",
    });
  }
  const requestedTaskId =
    rawTaskIds.length === 1 ? parseDomainId(rawTaskIds[0]!, "task_id") : null;
  const now = new Date();
  const tasks = await db.query.transferTask.findMany({
    where: requestedTaskId
      ? and(
          eq(transferTask.userId, actor.id),
          eq(transferTask.id, requestedTaskId),
        )
      : eq(transferTask.userId, actor.id),
    with: { cycle: { with: { question: true } } },
    orderBy: [asc(transferTask.availableAt)],
  });
  if (tasks.length === 0) {
    return Response.json({ transfer_tasks: [] });
  }
  const [questions, evidenceRows, transferJobs] = await Promise.all([
    db.query.question.findMany({
      where: inArray(
        question.id,
        tasks.map((task) => task.questionId),
      ),
    }),
    db.query.skillEvidenceEvent.findMany({
      where: and(
        eq(skillEvidenceEvent.userId, actor.id),
        eq(skillEvidenceEvent.evidenceStage, "CROSS_TOPIC_TRANSFER"),
      ),
      orderBy: [desc(skillEvidenceEvent.occurredAt)],
    }),
    db.query.aiJob.findMany({
      where: and(
        eq(aiJob.ownerId, actor.id),
        eq(aiJob.taskKind, "transfer_evaluation"),
      ),
      orderBy: [desc(aiJob.createdAt)],
    }),
  ]);
  const questionsById = new Map(questions.map((item) => [item.id, item]));
  const record = (value: unknown): Record<string, unknown> =>
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return Response.json({
    transfer_tasks: tasks.map((task) => {
      const targetQuestion = questionsById.get(task.questionId);
      const latestEvidence = evidenceRows.find(
        (row) => record(row.payload).transferTaskId === task.id,
      );
      const payload = record(latestEvidence?.payload);
      const canonicalEvidence = record(payload.canonicalEvidence);
      const transferGate = record(payload.transferGate);
      const judgment = record(payload.judgment);
      const latestJob = transferJobs.find(
        (job) => job.protectedReference.transferTaskId === task.id,
      );
      const activeJob =
        latestJob &&
        latestJob.protectedReference.transferTaskId === task.id &&
        [
          "WAITING_FOR_CONSENT",
          "QUEUED",
          "LEASED",
          "RUNNING",
          "RETRY_SCHEDULED",
          "AI_BLOCKED",
        ].includes(latestJob.status)
          ? latestJob
          : undefined;
      const failedJob =
        latestJob && ["FAILED"].includes(latestJob.status)
          ? latestJob
          : undefined;
      const effectiveStatus =
        ["PLANNED", "RESCHEDULED"].includes(task.status) &&
        task.availableAt <= now
          ? "READY"
          : task.status;
      const outcome = canonicalEvidence.outcome;
      const showPriorNoOpportunity =
        outcome === "NO_OPPORTUNITY" && task.status === "RESCHEDULED";
      const showResult = task.status === "COMPLETED" || showPriorNoOpportunity;
      const mockLanguageScoring = payload.providerKind === "mock";
      const result =
        showResult &&
        ["PASS", "FAIL", "NO_OPPORTUNITY"].includes(String(outcome))
          ? {
              outcome,
              confidence:
                !mockLanguageScoring &&
                typeof canonicalEvidence.confidence === "number"
                  ? canonicalEvidence.confidence
                  : null,
              feedback_zh:
                typeof judgment.feedbackZh === "string"
                  ? judgment.feedbackZh
                  : "迁移评估已记录。",
              feedback_en:
                typeof judgment.feedbackEn === "string"
                  ? judgment.feedbackEn
                  : "The transfer evaluation was recorded.",
              evidence:
                typeof judgment.evidenceEn === "string"
                  ? judgment.evidenceEn
                  : "",
              status: mockLanguageScoring
                ? "DEMO_ONLY_NOT_LANGUAGE_SCORED"
                : outcome === "NO_OPPORTUNITY"
                  ? "NO_OPPORTUNITY_RESCHEDULED"
                  : transferGate.passed === true
                    ? "QUALIFYING_CROSS_TOPIC_EVIDENCE"
                    : "RECORDED_NOT_TRANSFERRED",
              transferred: transferGate.passed === true,
              gate_missing: mockLanguageScoring
                ? ["real language-model evaluation"]
                : Array.isArray(transferGate.missing)
                  ? transferGate.missing
                  : [],
              mock_language_scoring: mockLanguageScoring,
            }
          : null;
      return {
        id: task.id,
        source_cycle_id: task.sourceCycleId,
        status: effectiveStatus,
        available_at: task.availableAt,
        expires_at: task.expiresAt,
        target_hint_hidden: true,
        question:
          targetQuestion &&
          (effectiveStatus === "READY" || effectiveStatus === "COMPLETED")
            ? {
                id: targetQuestion.externalId,
                prompt: targetQuestion.prompt,
                questionType: targetQuestion.questionType,
                topic: targetQuestion.topic,
                instructions:
                  "Write a concise 90–140 word response that addresses the task and develops its main idea. Do not use notes, hints, or earlier answers.",
              }
            : null,
        result,
        window_expired:
          task.expiresAt !== null && task.expiresAt.getTime() <= now.getTime(),
        pending_job_id: activeJob?.id ?? null,
        evaluation_error: failedJob
          ? {
              code: failedJob.lastErrorCode ?? failedJob.status,
              safe_message:
                failedJob.lastErrorSafeMessage ??
                "The transfer evaluation could not be completed.",
            }
          : null,
      };
    }),
  });
});
