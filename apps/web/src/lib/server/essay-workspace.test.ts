import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import {
  createDatabase,
  newDomainId,
  question,
  trainingCycle,
  user,
  writingAttempt,
} from "@iwc/db";

import { loadEssayWorkspace } from "./essay-workspace";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("essay workspace (PostgreSQL)", () => {
  const database = createDatabase(databaseUrl!);
  const createdUsers: string[] = [];

  afterEach(async () => {
    for (const userId of createdUsers.splice(0)) {
      await database.db.delete(user).where(eq(user.id, userId));
    }
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("projects one independent next action for every active essay", async () => {
    const suffix = newDomainId();
    const userId = `essay-workspace-${suffix}`;
    const questionIds = Array.from({ length: 4 }, () => newDomainId());
    const [activeCycleId, readyCycleId] = [newDomainId(), newDomainId()];
    createdUsers.push(userId);

    await database.db.insert(user).values({
      id: userId,
      name: "Essay workspace learner",
      email: `${suffix}@example.test`,
      role: "learner",
    });
    await database.db.insert(question).values(
      questionIds.map((id, index) => ({
        id,
        externalId: `essay-workspace-${suffix}-${index}`,
        ownerId: userId,
        source: "private_test" as const,
        visibility: "private" as const,
        questionType: "opinion" as const,
        topic: "education" as const,
        prompt: `Essay workspace prompt ${index + 1}?`,
      })),
    );
    await database.db.insert(trainingCycle).values([
      {
        id: activeCycleId,
        userId,
        questionId: questionIds[0]!,
        status: "ATTEMPT_1_ACTIVE",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      },
      {
        id: readyCycleId,
        userId,
        questionId: questionIds[1]!,
        status: "QUESTION_READY",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      },
      {
        userId,
        questionId: questionIds[2]!,
        status: "CORE_CYCLE_COMPLETED",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      },
      {
        userId,
        questionId: questionIds[3]!,
        status: "QUESTION_READY",
        schemaVersion: "1.0.0",
        timezone: "UTC",
        archivedAt: new Date("2026-08-14T12:00:00.000Z"),
      },
    ]);
    await database.db.insert(writingAttempt).values({
      cycleId: activeCycleId,
      userId,
      kind: "version_1",
      content: "A saved draft remains attached to this essay.",
      wordCount: 9,
    });

    const workspace = await loadEssayWorkspace(
      database.db,
      userId,
      "2026-08-14T13:00:00.000Z",
    );

    expect(workspace).toMatchObject({ activeCount: 2, activeLimit: 8 });
    expect(workspace.essays.map((essay) => essay.id).sort()).toEqual(
      [activeCycleId, readyCycleId].sort(),
    );
    expect(workspace.essays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: activeCycleId,
          nextAction: expect.objectContaining({ kind: "CONTINUE_ATTEMPT_1" }),
          resources: expect.objectContaining({
            cycleId: activeCycleId,
            writingAvailable: true,
          }),
        }),
        expect.objectContaining({
          id: readyCycleId,
          nextAction: expect.objectContaining({ kind: "START_ATTEMPT_1" }),
          resources: expect.objectContaining({
            cycleId: readyCycleId,
            writingAvailable: false,
          }),
        }),
      ]),
    );
  });
});
