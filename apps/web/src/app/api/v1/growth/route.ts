import { desc, eq } from "drizzle-orm";

import {
  exerciseAttempt,
  learningPreference,
  skillEvidenceEvent,
  userSkillState,
  writingAttempt,
} from "@iwc/db";
import { SKILL_DEFINITIONS, type SkillId } from "@iwc/learning-contracts";

import { getServerContext } from "@/lib/server/context";
import { recordedExerciseDurationSeconds } from "@/lib/server/growth-metrics";
import { apiRoute } from "@/lib/server/problem";
import { requireSession } from "@/lib/server/session";

export const GET = apiRoute(async (request) => {
  const actor = await requireSession(request);
  const { db } = getServerContext();
  const [states, evidence, attempts, exerciseAttempts, preferences] =
    await Promise.all([
      db.query.userSkillState.findMany({
        where: eq(userSkillState.userId, actor.id),
        orderBy: [desc(userSkillState.updatedAt)],
      }),
      db.query.skillEvidenceEvent.findMany({
        where: eq(skillEvidenceEvent.userId, actor.id),
        orderBy: [desc(skillEvidenceEvent.occurredAt)],
        limit: 1_000,
      }),
      db.query.writingAttempt.findMany({
        where: eq(writingAttempt.userId, actor.id),
        orderBy: [desc(writingAttempt.submittedAt)],
        with: { assessment: true },
      }),
      db.query.exerciseAttempt.findMany({
        where: eq(exerciseAttempt.userId, actor.id),
      }),
      db.query.learningPreference.findFirst({
        where: eq(learningPreference.userId, actor.id),
      }),
    ]);

  const submittedFirstAttempts = attempts.filter(
    (attempt) => attempt.kind === "version_1" && attempt.submittedAt,
  );
  const scoreHistory = submittedFirstAttempts
    .filter(
      (attempt) =>
        attempt.assessment?.isAiEstimate !== false &&
        attempt.assessment?.versionSnapshot.providerKind !== "mock" &&
        typeof attempt.assessment?.overallBand === "number",
    )
    .map((attempt) => ({
      assessed_at: (
        attempt.submittedAt ?? attempt.assessment!.createdAt
      ).toISOString(),
      score: attempt.assessment!.overallBand,
    }));
  const recurrence = evidence.flatMap(recurrenceObservation);
  const recurrenceBySkill = new Map<
    string,
    { checks: number; recurred: number }
  >();
  for (const observation of recurrence) {
    const count = recurrenceBySkill.get(observation.skillId) ?? {
      checks: 0,
      recurred: 0,
    };
    count.checks += 1;
    if (observation.recurred) count.recurred += 1;
    recurrenceBySkill.set(observation.skillId, count);
  }
  const definitions = new Map(
    SKILL_DEFINITIONS.map((definition) => [definition.id, definition]),
  );
  const recordedWritingSeconds = attempts.reduce(
    (total, attempt) => total + Math.max(0, attempt.durationSeconds ?? 0),
    0,
  );
  const recordedExerciseSeconds =
    recordedExerciseDurationSeconds(exerciseAttempts);
  const nonRecurrenceChecks = recurrence.filter(
    (observation) => !observation.recurred,
  ).length;

  return Response.json(
    {
      summary: {
        essays_completed: submittedFirstAttempts.length,
        recorded_learning_minutes: Math.floor(
          (recordedWritingSeconds + recordedExerciseSeconds) / 60,
        ),
        current_estimated_band: scoreHistory[0]?.score ?? null,
        target_band: preferences?.targetBand ?? 7,
        independent_recurrence_checks: recurrence.length,
        independent_non_recurrence_rate:
          recurrence.length === 0
            ? null
            : Math.round((nonRecurrenceChecks / recurrence.length) * 100),
      },
      score_history: scoreHistory.slice(0, 8).reverse(),
      skills: states.map((state) => {
        const definition = definitions.get(state.skillId as SkillId);
        const skillRecurrence = recurrenceBySkill.get(state.skillId);
        return {
          skill_id: state.skillId,
          definition: definition
            ? {
                dimension: definition.dimension,
                name_zh: definition.nameZh,
                description_en: definition.description,
              }
            : null,
          state: state.transferredAt
            ? "transferred"
            : state.retainedAt
              ? "retained"
              : state.appliedAt
                ? "applied"
                : "practicing",
          stability: state.stability,
          evidence_count: state.evidenceCount,
          recurrence_checks: skillRecurrence?.checks ?? 0,
          recurrence_rate:
            skillRecurrence && skillRecurrence.checks > 0
              ? Math.round(
                  (skillRecurrence.recurred / skillRecurrence.checks) * 100,
                )
              : null,
          updated_at: state.updatedAt,
          disclaimer:
            "Transferred is an evidence state in this system, not permanent mastery or an official IELTS judgment.",
        };
      }),
      evidence,
      metric_notes: {
        learning_minutes:
          "Sum of recorded writing time plus the maximum elapsed snapshot per exercise; response retries are not double-counted and unrecorded reading time is excluded.",
        non_recurrence_rate:
          "Share of eligible independent mixed-review checks where the old target was not among detected issues; this is not mastery evidence.",
        scores: "AI estimates, not official IELTS scores.",
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
});

function recurrenceObservation(event: {
  evidenceStage: string;
  skillId: string;
  payload: Record<string, unknown>;
}): Array<{ skillId: string; recurred: boolean }> {
  if (event.evidenceStage !== "RECURRENCE") return [];
  const result = objectValue(event.payload.mixedReviewResult);
  const canonical = objectValue(event.payload.canonicalEvidence);
  if (
    result.language_scoring === "DEMO_ONLY" ||
    canonical.assisted === true ||
    canonical.independent !== true ||
    (result.outcome !== "RECURRED" &&
      result.outcome !== "NOT_AMONG_DETECTED_ISSUES")
  )
    return [];
  return [{ skillId: event.skillId, recurred: result.outcome === "RECURRED" }];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
