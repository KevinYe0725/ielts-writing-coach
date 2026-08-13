import { and, eq, ne, sql } from "drizzle-orm";

import { LEARNING_CONTRACT_VERSION } from "@iwc/learning-contracts";
import {
  aiJob,
  auditEvent,
  idempotencyRecord,
  importRecord,
  learningPreference,
  learningSlot,
  notification,
  question,
  skillEvidenceEvent,
  trainingCycle,
  user,
  userSkillState,
  type Database,
} from "@iwc/db";

function iso(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
}

export async function buildLearningRecord(db: Database, userId: string) {
  const [
    learner,
    preference,
    slots,
    cycles,
    evidence,
    skills,
    notifications,
    imports,
  ] = await Promise.all([
    db.query.user.findFirst({ where: eq(user.id, userId) }),
    db.query.learningPreference.findFirst({
      where: eq(learningPreference.userId, userId),
    }),
    db.query.learningSlot.findMany({
      where: eq(learningSlot.userId, userId),
    }),
    db.query.trainingCycle.findMany({
      where: eq(trainingCycle.userId, userId),
      with: {
        question: true,
        writingAttempts: {
          with: {
            assessment: { with: { issues: true } },
            revisions: true,
          },
        },
        objectives: true,
        lessonPlans: {
          with: {
            items: {
              with: { attempts: { with: { evaluations: true } } },
            },
          },
        },
        rewriteTasks: true,
        transferTasks: true,
        mixedReviewTasks: true,
      },
    }),
    db.query.skillEvidenceEvent.findMany({
      where: eq(skillEvidenceEvent.userId, userId),
    }),
    db.query.userSkillState.findMany({
      where: eq(userSkillState.userId, userId),
    }),
    db.query.notification.findMany({
      where: eq(notification.userId, userId),
    }),
    db.query.importRecord.findMany({
      where: eq(importRecord.userId, userId),
    }),
  ]);

  if (!learner) throw new Error("The learner account no longer exists.");
  const exportedAt = new Date().toISOString();
  return {
    format: "iwc-learning-record",
    formatVersion: 1,
    contractVersion: LEARNING_CONTRACT_VERSION,
    exportedAt,
    profile: {
      id: learner.id,
      name: learner.name,
      email: learner.email,
      role: learner.role,
      locale: learner.locale,
      timezone: learner.timezone,
      createdAt: learner.createdAt.toISOString(),
    },
    preferences: preference
      ? {
          targetBand: preference.targetBand,
          ieltsTrack: preference.ieltsTrack,
          feedbackLocale: preference.feedbackLocale,
          reminderInApp: preference.reminderInApp,
          reminderEmail: preference.reminderEmail,
          quietHours: preference.quietHours,
        }
      : null,
    learningSlots: slots.map((slot) => ({
      weekday: slot.weekday,
      localTime: slot.localTime,
      timezone: slot.timezone,
      enabled: slot.enabled,
    })),
    cycles: cycles
      .sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      )
      .map((cycle) => ({
        id: cycle.id,
        state: cycle.status,
        schemaVersion: cycle.schemaVersion,
        timezone: cycle.timezone,
        coreSkillId: cycle.coreSkillId,
        startedAt: iso(cycle.startedAt),
        coreCompletedAt: iso(cycle.completedAt),
        archivedAt: iso(cycle.archivedAt),
        createdAt: cycle.createdAt.toISOString(),
        updatedAt: cycle.updatedAt.toISOString(),
        question: {
          id: cycle.question.externalId,
          ieltsTrack: cycle.question.ieltsTrack,
          questionType: cycle.question.questionType,
          topic: cycle.question.topic,
          prompt: cycle.question.prompt,
          promptZh: cycle.question.promptZh,
          source: cycle.question.source,
          attribution: cycle.question.attribution,
        },
        attempts: cycle.writingAttempts
          .sort(
            (left, right) =>
              left.createdAt.getTime() - right.createdAt.getTime(),
          )
          .map((attempt) => ({
            id: attempt.id,
            version: attempt.kind,
            revision: attempt.revision,
            content: attempt.content,
            wordCount: attempt.wordCount,
            durationSeconds: attempt.durationSeconds,
            submittedAt: iso(attempt.submittedAt),
            abnormalConditions: attempt.abnormalConditions,
            assisted: attempt.assisted,
            interrupted: attempt.interrupted,
            draftBeforeSelfCheck: attempt.draftBeforeSelfCheck,
            draftAfterSelfCheck: attempt.draftAfterSelfCheck,
            createdAt: attempt.createdAt.toISOString(),
            revisions: attempt.revisions
              .sort(
                (left, right) =>
                  left.createdAt.getTime() - right.createdAt.getTime(),
              )
              .map((revision) => ({
                id: revision.id,
                revision: revision.revision,
                baseRevision: revision.baseRevision,
                branch: revision.branch,
                content: revision.content,
                wordCount: revision.wordCount,
                createdAt: revision.createdAt.toISOString(),
              })),
            assessment: attempt.assessment
              ? {
                  id: attempt.assessment.id,
                  overallBand: attempt.assessment.overallBand,
                  criterionScores: attempt.assessment.criterionScores,
                  summary: attempt.assessment.summary,
                  confidence: attempt.assessment.confidence,
                  isAiEstimate: attempt.assessment.isAiEstimate,
                  versionSnapshot: attempt.assessment.versionSnapshot,
                  issues: attempt.assessment.issues.map((issue) => ({
                    id: issue.id,
                    skillId: issue.skillId,
                    startOffset: issue.startOffset,
                    endOffset: issue.endOffset,
                    excerpt: issue.excerpt,
                    diagnosis: issue.diagnosis,
                    categories: issue.categories,
                    hardGrammarError: issue.hardGrammarError,
                    severity: issue.severity,
                    confidence: issue.confidence,
                    adjudicationStatus: issue.adjudicationStatus,
                  })),
                }
              : null,
          })),
        objectives: cycle.objectives.map((objective) => ({
          id: objective.id,
          skillId: objective.skillId,
          role: objective.role,
          sourceEvidenceIds: objective.sourceEvidenceIds,
          priority: objective.priority,
          successCriterion: objective.successCriterion,
        })),
        lessons: cycle.lessonPlans.map((plan) => ({
          id: plan.id,
          coreSkillId: plan.coreSkillId,
          schemaVersion: plan.schemaVersion,
          plannedMinutes: plan.plannedMinutes,
          coreMinutes: plan.coreMinutes,
          activeOutputRatio: plan.activeOutputRatio,
          selectionRatio: plan.selectionRatio,
          remediationMinutes: plan.remediationMinutes,
          canonicalStages: plan.stages,
          items: plan.items
            .sort((left, right) => left.ordinal - right.ordinal)
            .map((item) => ({
              id: item.id,
              ordinal: item.ordinal,
              itemType: item.itemType,
              prompt: item.prompt,
              evaluationContract: item.evaluationContract,
              expectedMinutes: item.expectedMinutes,
              responses: item.attempts.map((response) => ({
                id: response.id,
                contractAttempts: response.contractAttempts,
                firstAnswer: response.firstAnswer,
                hintedAnswer: response.hintedAnswer,
                finalAnswer: response.finalAnswer,
                hintsUsed: response.hintsUsed,
                referenceAnswerSeen: response.referenceAnswerSeen,
                evaluations: response.evaluations
                  .sort(
                    (left, right) =>
                      left.createdAt.getTime() - right.createdAt.getTime(),
                  )
                  .map((result) => ({
                    id: result.id,
                    responseAttemptId: result.responseAttemptId,
                    passed: result.passed,
                    confidence: result.confidence,
                    feedback: result.feedback,
                    dimensionScores: result.dimensionScores,
                    userAnswerEvidence: result.userAnswerEvidence,
                    mostImportantSuggestion: result.mostImportantSuggestion,
                    adjudicationStatus: result.adjudicationStatus,
                    supersedesEvaluationId: result.supersedesEvaluationId,
                    validForEvidence: result.validForEvidence,
                    versionSnapshot: result.versionSnapshot,
                    createdAt: result.createdAt.toISOString(),
                  })),
              })),
            })),
        })),
        rewriteTasks: cycle.rewriteTasks.map((task) => ({
          id: task.id,
          status: task.status,
          availableAt: task.availableAt.toISOString(),
          expiresAt: iso(task.expiresAt),
          abstractChecklist: task.abstractChecklist,
          lastInstructionExposureAt: iso(task.lastInstructionExposureAt),
          assisted: task.assisted,
          prerequisiteSkipped: task.prerequisiteSkipped,
          startedAt: iso(task.startedAt),
          completedAt: iso(task.completedAt),
        })),
        transferTasks: cycle.transferTasks.map((task) => ({
          id: task.id,
          questionId: task.questionId,
          skillId: task.skillId,
          objectiveId: task.objectiveId,
          status: task.status,
          availableAt: task.availableAt.toISOString(),
          expiresAt: iso(task.expiresAt),
          completedAt: iso(task.completedAt),
        })),
        mixedReviewTasks: cycle.mixedReviewTasks.map((task) => ({
          id: task.id,
          status: task.status,
          dueAt: task.dueAt.toISOString(),
          targetCycleId: task.targetCycleId,
          result: task.result,
          completedAt: iso(task.completedAt),
        })),
      })),
    skillEvidence: evidence.map((event) => ({
      id: event.id,
      cycleId: event.cycleId,
      skillId: event.skillId,
      evidenceStage: event.evidenceStage,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      valid: event.valid,
      confidence: event.confidence,
      occurredAt: event.occurredAt.toISOString(),
      payload: event.payload,
    })),
    skillStates: skills.map((state) => ({
      skillId: state.skillId,
      appliedAt: iso(state.appliedAt),
      retainedAt: iso(state.retainedAt),
      transferredAt: iso(state.transferredAt),
      stability: state.stability,
      evidenceCount: state.evidenceCount,
    })),
    notifications: notifications.map((item) => ({
      id: item.id,
      channel: item.channel,
      kind: item.kind,
      payload: item.payload,
      scheduledAt: item.scheduledAt.toISOString(),
      sentAt: iso(item.sentAt),
      readAt: iso(item.readAt),
      failureCode: item.failureCode,
    })),
    imports: imports.map((item) => ({
      bundleId: item.bundleId,
      checksum: item.checksum,
      schemaVersion: item.schemaVersion,
      status: item.status,
      conflicts: item.conflicts,
      importedAt: item.importedAt.toISOString(),
    })),
  };
}

export type LearningRecord = Awaited<ReturnType<typeof buildLearningRecord>>;

export async function deleteLearningRecord(
  db: Database,
  userId: string,
  preservedIdempotencyKey: string,
): Promise<{ cycles: number; evidenceEvents: number; queuedJobs: number }> {
  const jobs = await db
    .select({ key: aiJob.graphileJobKey })
    .from(aiJob)
    .where(eq(aiJob.ownerId, userId));
  return db.transaction(async (transaction) => {
    for (const job of jobs) {
      if (job.key)
        await transaction.execute(
          sql`select graphile_worker.remove_job(${job.key})`,
        );
    }
    const deletedEvidence = await transaction
      .delete(skillEvidenceEvent)
      .where(eq(skillEvidenceEvent.userId, userId))
      .returning({ id: skillEvidenceEvent.id });
    await transaction
      .delete(userSkillState)
      .where(eq(userSkillState.userId, userId));
    await transaction
      .delete(notification)
      .where(eq(notification.userId, userId));
    await transaction
      .delete(importRecord)
      .where(eq(importRecord.userId, userId));
    await transaction.delete(aiJob).where(eq(aiJob.ownerId, userId));
    const deletedCycles = await transaction
      .delete(trainingCycle)
      .where(eq(trainingCycle.userId, userId))
      .returning({ id: trainingCycle.id });
    await transaction.delete(question).where(eq(question.ownerId, userId));
    await transaction
      .delete(learningSlot)
      .where(eq(learningSlot.userId, userId));
    await transaction
      .delete(learningPreference)
      .where(eq(learningPreference.userId, userId));
    await transaction
      .delete(idempotencyRecord)
      .where(
        and(
          eq(idempotencyRecord.userId, userId),
          ne(idempotencyRecord.key, preservedIdempotencyKey),
        ),
      );
    await transaction.insert(auditEvent).values({
      actorId: userId,
      action: "learning_data.delete",
      targetType: "learner",
      targetId: userId,
      result: "success",
      metadata: {
        cycles: deletedCycles.length,
        evidenceEvents: deletedEvidence.length,
        queuedJobs: jobs.length,
      },
    });
    return {
      cycles: deletedCycles.length,
      evidenceEvents: deletedEvidence.length,
      queuedJobs: jobs.length,
    };
  });
}

export function learningRecordMarkdown(record: LearningRecord): string {
  const lines = [
    "# IELTS Writing Coach learning record",
    "",
    `- Learner: ${record.profile.name} (${record.profile.email})`,
    `- Exported: ${record.exportedAt}`,
    `- Contract: ${record.contractVersion}`,
    "",
    "> All IELTS bands in this export are AI estimates, not official IELTS scores or teacher certification.",
  ];
  for (const cycle of record.cycles) {
    lines.push(
      "",
      `## Cycle ${cycle.id}`,
      "",
      `- State: ${cycle.state}`,
      `- Topic: ${cycle.question.topic}`,
      `- Type: ${cycle.question.questionType}`,
      "",
      "### Question",
      "",
      cycle.question.prompt,
    );
    for (const attempt of cycle.attempts) {
      lines.push(
        "",
        `### ${attempt.version}`,
        "",
        `${attempt.wordCount} words · submitted ${attempt.submittedAt ?? "not submitted"}`,
        "",
        attempt.content,
      );
      if (attempt.assessment) {
        const scores = attempt.assessment.criterionScores;
        lines.push(
          "",
          `AI-estimated overall band: ${attempt.assessment.overallBand}`,
          "",
          `- TR: ${scores.taskResponse}`,
          `- CC: ${scores.coherenceCohesion}`,
          `- LR: ${scores.lexicalResource}`,
          `- GRA: ${scores.grammar}`,
        );
      }
    }
    if (cycle.objectives.length > 0) {
      lines.push("", "### Learning objectives", "");
      for (const objective of cycle.objectives) {
        lines.push(
          `- ${objective.role} · ${objective.skillId}: ${objective.successCriterion}`,
        );
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
