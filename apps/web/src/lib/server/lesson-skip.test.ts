import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  createDatabase,
  learningObjective,
  lessonPlan,
  newDomainId,
  question,
  rewriteTask,
  skillEvidenceEvent,
  trainingCycle,
  user,
  userSkillState,
} from "@iwc/db";

import { skipFocusedLesson } from "./lesson-skip";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("lesson skip persistence (PostgreSQL)", () => {
  it("moves an unfinished lesson to USER_SKIPPED and creates an immediate non-retained rewrite", async () => {
    const database = createDatabase(databaseUrl!);
    const suffix = newDomainId();
    const userId = `lesson-skip-${suffix}`;
    const questionId = newDomainId();
    const cycleId = newDomainId();
    const planId = newDomainId();
    const objectiveId = newDomainId();
    const now = new Date("2026-08-13T10:00:00.000Z");
    try {
      await database.db.insert(user).values({
        id: userId,
        name: "Lesson skip test",
        email: `${suffix}@example.test`,
        role: "learner",
      });
      await database.db.insert(question).values({
        id: questionId,
        externalId: `lesson-skip-${suffix}`,
        source: "runtime_test",
        visibility: "public",
        questionType: "opinion",
        topic: "education",
        prompt: "Should learners be able to skip practice?",
      });
      await database.db.insert(trainingCycle).values({
        id: cycleId,
        userId,
        questionId,
        status: "LESSON_ACTIVE",
        schemaVersion: "1.0.0",
        timezone: "UTC",
        coreSkillId: "collocation_perspective",
      });
      await database.db.insert(learningObjective).values({
        id: objectiveId,
        cycleId,
        skillId: "collocation_perspective",
        role: "CORE",
        sourceEvidenceIds: [newDomainId()],
        priority: 1,
        successCriterion: "Use the target independently.",
      });
      await database.db.insert(lessonPlan).values({
        id: planId,
        cycleId,
        coreSkillId: "collocation_perspective",
        schemaVersion: "1.0.0",
        coreMinutes: 45,
        activeOutputRatio: 0.7,
        selectionRatio: 0.1,
        remediationMinutes: 15,
        stages: [],
        runtimeStatus: "ACTIVE",
        startedAt: new Date("2026-08-13T09:50:00.000Z"),
        activeStartedAt: new Date("2026-08-13T09:55:00.000Z"),
      });
      const result = await database.db.transaction((transaction) =>
        skipFocusedLesson(transaction, { lessonId: planId, userId, now }),
      );
      const [storedPlan, storedCycle, storedRewrite, evidenceRows, skillRows] =
        await Promise.all([
          database.db.query.lessonPlan.findFirst({
            where: eq(lessonPlan.id, planId),
          }),
          database.db.query.trainingCycle.findFirst({
            where: eq(trainingCycle.id, cycleId),
          }),
          database.db.query.rewriteTask.findFirst({
            where: eq(rewriteTask.cycleId, cycleId),
          }),
          database.db.query.skillEvidenceEvent.findMany({
            where: eq(skillEvidenceEvent.cycleId, cycleId),
          }),
          database.db.query.userSkillState.findMany({
            where: eq(userSkillState.userId, userId),
          }),
        ]);
      expect(result.cycleStatus).toBe("REWRITE_LOCKED");
      expect(storedPlan).toMatchObject({ runtimeStatus: "USER_SKIPPED" });
      expect(storedCycle?.status).toBe("REWRITE_LOCKED");
      expect(storedRewrite).toMatchObject({
        status: "SKIPPED_PREREQUISITE",
        availableAt: now,
        contractDueAt: null,
        lastInstructionExposureAt: null,
        prerequisiteSkipped: true,
        assisted: false,
      });
      expect(evidenceRows).toHaveLength(0);
      expect(skillRows).toHaveLength(0);
    } finally {
      await database.db.delete(user).where(eq(user.id, userId));
      await database.pool.end();
    }
  });
});
