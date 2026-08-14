import { beforeEach, describe, expect, it, vi } from "vitest";

import { MockAdapter } from "@iwc/ai";

const routeState = vi.hoisted(() => ({
  actor: {
    id: "learner-1",
    email: "learner@example.test",
    name: "Learner",
    role: "learner" as const,
  },
  lesson: null as Record<string, unknown> | null,
  cycle: null as Record<string, unknown> | null,
  deletedTables: [] as unknown[],
  queuedInput: null as Record<string, unknown> | null,
  activeRecoveryJob: null as Record<string, unknown> | null,
  recentRecoveryJob: null as Record<string, unknown> | null,
  recoveryLookupCount: 0,
}));

vi.mock("@/lib/server/session", () => ({
  requireSession: async () => routeState.actor,
}));

vi.mock("@/lib/server/security", () => ({
  protectMutation: () => undefined,
  reserveIdempotencyKey: async () => ({ key: "test-key", replay: null }),
  completeIdempotentResponse: async () => undefined,
  settleIdempotentError: async (
    _database: unknown,
    _actorId: string,
    _key: string,
    error: unknown,
  ) => {
    throw error;
  },
}));

vi.mock("@/lib/server/jobs", () => ({
  enqueueAIJob: async (
    _transaction: unknown,
    input: Record<string, unknown>,
  ) => {
    routeState.queuedInput = input;
    return { id: "replacement-job", status: "QUEUED" };
  },
}));

function mutationChain() {
  return {
    where: async () => undefined,
  };
}

const transaction = {
  select: () => ({
    from: () => ({
      where: () => ({
        for: async () => (routeState.lesson ? [routeState.lesson] : []),
      }),
    }),
  }),
  query: {
    trainingCycle: {
      findFirst: async () => routeState.cycle,
    },
    aiJob: {
      findFirst: async () => {
        routeState.recoveryLookupCount += 1;
        return routeState.recoveryLookupCount === 1
          ? routeState.activeRecoveryJob
          : routeState.recentRecoveryJob;
      },
    },
  },
  delete: (table: unknown) => {
    routeState.deletedTables.push(table);
    return mutationChain();
  },
  update: () => ({
    set: () => mutationChain(),
  }),
};

const routeContext = {
  db: {
    query: {
      lessonPlan: {
        findFirst: async () => routeState.lesson,
      },
    },
    transaction: async <T>(work: (tx: typeof transaction) => Promise<T>) =>
      work(transaction),
  },
};

vi.mock("@/lib/server/context", () => ({
  getServerContext: () => routeContext,
}));

import { POST as replaceTeaching } from "../replace/route";
import { GET as getTeaching } from "./route";

const lessonId = "0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

async function adaptivePackage(): Promise<{
  teachingModule: Record<string, unknown> & {
    sections: Array<{
      blocks: Array<Record<string, unknown>>;
    }>;
  };
  paper: Record<string, unknown>;
}> {
  const result = await new MockAdapter().generateStructured({
    model: "mock-deterministic-v1",
    input: "Create one adaptive teaching package for a route test.",
    schemaName: "iwc_focused_learning_package_v4",
    schema: {},
    validate: (
      value,
    ): value is {
      teachingModule: Record<string, unknown> & {
        sections: Array<{
          blocks: Array<Record<string, unknown>>;
        }>;
      };
      paper: Record<string, unknown>;
    } => typeof value === "object" && value !== null,
  });
  return structuredClone(result.value);
}

function replacementCycle() {
  return {
    id: "cycle-1",
    coreSkillId: "mechanism_chain",
    writingAttempts: [
      {
        id: "version-1",
        kind: "version_1",
        assessment: { id: "assessment-1", issues: [] },
      },
    ],
  };
}

function legacyTeaching() {
  return {
    targetTitleZh: "旧版固定课程",
    knowledgeCards: [],
    quickChecks: [],
  };
}

describe("focused teaching adaptive article routes", () => {
  beforeEach(() => {
    routeState.lesson = null;
    routeState.cycle = null;
    routeState.deletedTables = [];
    routeState.queuedInput = null;
    routeState.activeRecoveryJob = null;
    routeState.recentRecoveryJob = null;
    routeState.recoveryLookupCount = 0;
  });

  it("returns replacement-required instead of serving a legacy teaching module", async () => {
    routeState.lesson = {
      id: lessonId,
      cycle: { userId: routeState.actor.id },
      paperContent: { teachingModule: legacyTeaching() },
    };

    const response = await getTeaching(
      new Request(`https://coach.test/api/v1/lessons/${lessonId}/teaching`),
      { params: Promise.resolve({ id: lessonId }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "FOCUSED_TEACHING_REPLACEMENT_REQUIRED",
    });
  });

  it("serves only the learner-facing adaptive article and keeps its blueprint private", async () => {
    const focusedPackage = await adaptivePackage();
    const teaching = focusedPackage.teachingModule;
    routeState.lesson = {
      id: lessonId,
      cycle: { userId: routeState.actor.id },
      paperContent: focusedPackage,
    };

    const response = await getTeaching(
      new Request(`https://coach.test/api/v1/lessons/${lessonId}/teaching`),
      { params: Promise.resolve({ id: lessonId }) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      teaching: Record<string, unknown>;
    };
    expect(body.teaching).toEqual({
      format: teaching.format,
      titleZh: teaching.titleZh,
      titleEn: teaching.titleEn,
      introductionZh: teaching.introductionZh,
      introductionEn: teaching.introductionEn,
      estimatedMinutes: teaching.estimatedMinutes,
      sections: teaching.sections,
    });
    expect(body.teaching).not.toHaveProperty("blueprint");
  });

  it("requires replacement when a block is missing its kind-specific teaching content", async () => {
    const focusedPackage = await adaptivePackage();
    delete focusedPackage.teachingModule.sections[0]?.blocks[0]?.paragraphsEn;
    routeState.lesson = {
      id: lessonId,
      cycle: { userId: routeState.actor.id },
      paperContent: focusedPackage,
    };

    const response = await getTeaching(
      new Request(`https://coach.test/api/v1/lessons/${lessonId}/teaching`),
      { params: Promise.resolve({ id: lessonId }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "FOCUSED_TEACHING_REPLACEMENT_REQUIRED",
    });
  });

  it("never exposes a private nested field from a persisted teaching block", async () => {
    const focusedPackage = await adaptivePackage();
    focusedPackage.teachingModule.sections[0]!.blocks[0]!.privateBlueprint = {
      marker: "sensitive-marker-947",
    };
    routeState.lesson = {
      id: lessonId,
      cycle: { userId: routeState.actor.id },
      paperContent: focusedPackage,
    };

    const response = await getTeaching(
      new Request(`https://coach.test/api/v1/lessons/${lessonId}/teaching`),
      { params: Promise.resolve({ id: lessonId }) },
    );

    expect(response.status).toBe(200);
    const responseText = await response.text();
    expect(responseText).not.toContain("privateBlueprint");
    expect(responseText).not.toContain("sensitive-marker-947");
    expect(responseText).not.toContain("blueprint");
  });

  it("requires replacement when the adaptive article has no valid timed paper", async () => {
    const focusedPackage = await adaptivePackage();
    focusedPackage.paper = {};
    routeState.lesson = {
      id: lessonId,
      cycle: { userId: routeState.actor.id },
      paperContent: focusedPackage,
    };

    const response = await getTeaching(
      new Request(`https://coach.test/api/v1/lessons/${lessonId}/teaching`),
      { params: Promise.resolve({ id: lessonId }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "FOCUSED_TEACHING_REPLACEMENT_REQUIRED",
    });
  });

  it("requires replacement when paper metadata violates the authoritative schema", async () => {
    const focusedPackage = await adaptivePackage();
    focusedPackage.paper.titleZh = "";
    focusedPackage.paper.instructionsZh = [];
    routeState.lesson = {
      id: lessonId,
      cycle: { userId: routeState.actor.id },
      paperContent: focusedPackage,
    };

    const response = await getTeaching(
      new Request(`https://coach.test/api/v1/lessons/${lessonId}/teaching`),
      { params: Promise.resolve({ id: lessonId }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "FOCUSED_TEACHING_REPLACEMENT_REQUIRED",
    });
  });

  it("regenerates a timed-paper lesson whose teaching module is legacy", async () => {
    routeState.lesson = {
      id: lessonId,
      cycleId: "cycle-1",
      practiceFormat: "TIMED_PAPER_V2",
      paperContent: { teachingModule: legacyTeaching(), paper: {} },
    };
    routeState.cycle = replacementCycle();

    const response = await replaceTeaching(
      new Request(`https://coach.test/api/v1/lessons/${lessonId}/replace`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "replace-legacy",
          origin: "https://coach.test",
        },
        body: "{}",
      }),
      { params: Promise.resolve({ id: lessonId }) },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      replacement_started: true,
      lesson_id: null,
      job_id: "replacement-job",
      job_status: "QUEUED",
    });
  });

  it("regenerates an adaptive-marked lesson when a block is structurally incomplete", async () => {
    const focusedPackage = await adaptivePackage();
    delete focusedPackage.teachingModule.sections[0]?.blocks[0]?.paragraphsZh;
    routeState.lesson = {
      id: lessonId,
      cycleId: "cycle-1",
      practiceFormat: "TIMED_PAPER_V2",
      paperContent: focusedPackage,
    };
    routeState.cycle = replacementCycle();

    const response = await replaceTeaching(
      new Request(`https://coach.test/api/v1/lessons/${lessonId}/replace`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "replace-incomplete-adaptive",
          origin: "https://coach.test",
        },
        body: "{}",
      }),
      { params: Promise.resolve({ id: lessonId }) },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      replacement_started: true,
      lesson_id: null,
      job_id: "replacement-job",
    });
  });

  it("regenerates a valid adaptive article whose timed paper is corrupt", async () => {
    const focusedPackage = await adaptivePackage();
    focusedPackage.paper = {};
    routeState.lesson = {
      id: lessonId,
      cycleId: "cycle-1",
      practiceFormat: "TIMED_PAPER_V2",
      paperContent: focusedPackage,
    };
    routeState.cycle = replacementCycle();

    const response = await replaceTeaching(
      new Request(`https://coach.test/api/v1/lessons/${lessonId}/replace`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "replace-corrupt-paper",
          origin: "https://coach.test",
        },
        body: "{}",
      }),
      { params: Promise.resolve({ id: lessonId }) },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      replacement_started: true,
      lesson_id: null,
      job_id: "replacement-job",
    });
  });

  it("reuses a complete valid adaptive package without changing its paper", async () => {
    const focusedPackage = await adaptivePackage();
    routeState.lesson = {
      id: lessonId,
      cycleId: "cycle-1",
      practiceFormat: "TIMED_PAPER_V2",
      paperContent: focusedPackage,
    };
    routeState.cycle = replacementCycle();

    const response = await replaceTeaching(
      new Request(`https://coach.test/api/v1/lessons/${lessonId}/replace`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "reuse-valid-package",
          origin: "https://coach.test",
        },
        body: "{}",
      }),
      { params: Promise.resolve({ id: lessonId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      replacement_started: false,
      lesson_id: lessonId,
      job_id: null,
      job_status: "SUCCEEDED",
    });
  });

  it("recovers a historical lesson from its preserved skill without deleting records", async () => {
    routeState.lesson = {
      id: lessonId,
      cycleId: "cycle-1",
      coreSkillId: "mechanism_chain",
      practiceFormat: "LEGACY_EXERCISES",
      paperContent: { teachingModule: legacyTeaching(), paper: {} },
    };
    routeState.cycle = {
      id: "cycle-1",
      coreSkillId: null,
      writingAttempts: [],
    };

    const response = await replaceTeaching(
      new Request(`https://coach.test/api/v1/lessons/${lessonId}/replace`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "recover-historical-lesson",
          origin: "https://coach.test",
        },
        body: "{}",
      }),
      { params: Promise.resolve({ id: lessonId }) },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      replacement_started: true,
      job_id: "replacement-job",
    });
    expect(routeState.queuedInput).toMatchObject({
      taskKind: "exercise_generation",
      protectedReference: {
        lessonPlanId: lessonId,
        migrationMode: "LEGACY_RECOVERY",
        cycleId: "cycle-1",
        skillId: "mechanism_chain",
      },
    });
    expect(routeState.deletedTables).toEqual([]);
  });

  it("derives a recoverable skill from the preserved assessment when an old cycle has no core skill", async () => {
    routeState.lesson = {
      id: lessonId,
      cycleId: "cycle-1",
      coreSkillId: null,
      practiceFormat: "LEGACY_EXERCISES",
      paperContent: { teachingModule: legacyTeaching(), paper: {} },
    };
    routeState.cycle = {
      id: "cycle-1",
      coreSkillId: null,
      writingAttempts: [
        {
          id: "version-1",
          kind: "version_1",
          assessment: {
            id: "assessment-1",
            issues: [
              {
                skillId: "reference_linking",
                severity: 4,
                confidence: 0.9,
              },
              {
                skillId: "mechanism_chain",
                severity: 3,
                confidence: 1,
              },
            ],
          },
        },
      ],
    };

    const response = await replaceTeaching(
      new Request(`https://coach.test/api/v1/lessons/${lessonId}/replace`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "recover-assessment-skill",
          origin: "https://coach.test",
        },
        body: "{}",
      }),
      { params: Promise.resolve({ id: lessonId }) },
    );

    expect(response.status).toBe(202);
    expect(routeState.queuedInput).toMatchObject({
      protectedReference: { skillId: "reference_linking" },
    });
  });

  it("uses the conservative foundation skill when neither cycle nor assessment provides one", async () => {
    routeState.lesson = {
      id: lessonId,
      cycleId: "cycle-1",
      coreSkillId: null,
      practiceFormat: "LEGACY_EXERCISES",
      paperContent: { teachingModule: legacyTeaching(), paper: {} },
    };
    routeState.cycle = {
      id: "cycle-1",
      coreSkillId: null,
      writingAttempts: [],
    };

    const response = await replaceTeaching(
      new Request(`https://coach.test/api/v1/lessons/${lessonId}/replace`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "recover-conservative-skill",
          origin: "https://coach.test",
        },
        body: "{}",
      }),
      { params: Promise.resolve({ id: lessonId }) },
    );

    expect(response.status).toBe(202);
    expect(routeState.queuedInput).toMatchObject({
      protectedReference: { skillId: "task_instruction_coverage" },
    });
  });

  it("reuses an active legacy recovery job instead of queuing a second one", async () => {
    routeState.lesson = {
      id: lessonId,
      cycleId: "cycle-1",
      coreSkillId: "mechanism_chain",
      practiceFormat: "LEGACY_EXERCISES",
      paperContent: { teachingModule: legacyTeaching(), paper: {} },
    };
    routeState.cycle = {
      id: "cycle-1",
      coreSkillId: null,
      writingAttempts: [],
    };
    routeState.activeRecoveryJob = {
      id: "existing-recovery-job",
      status: "QUEUED",
    };

    const response = await replaceTeaching(
      new Request(`https://coach.test/api/v1/lessons/${lessonId}/replace`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "recover-historical-lesson-again",
          origin: "https://coach.test",
        },
        body: "{}",
      }),
      { params: Promise.resolve({ id: lessonId }) },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      job_id: "existing-recovery-job",
      job_status: "QUEUED",
    });
    expect(routeState.queuedInput).toBeNull();
    expect(routeState.deletedTables).toEqual([]);
  });

  it("waits safely instead of repeatedly queuing a lesson whose recovery just failed", async () => {
    routeState.lesson = {
      id: lessonId,
      cycleId: "cycle-1",
      coreSkillId: "mechanism_chain",
      practiceFormat: "LEGACY_EXERCISES",
      paperContent: { teachingModule: legacyTeaching(), paper: {} },
    };
    routeState.cycle = replacementCycle();
    routeState.recentRecoveryJob = {
      id: "recent-failed-recovery",
      status: "FAILED",
      completedAt: new Date(Date.now() - 5 * 60 * 1_000),
    };

    const response = await replaceTeaching(
      new Request(`https://coach.test/api/v1/lessons/${lessonId}/replace`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "wait-after-recent-failure",
          origin: "https://coach.test",
        },
        body: "{}",
      }),
      { params: Promise.resolve({ id: lessonId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      replacement_started: false,
      lesson_id: null,
      job_id: null,
      job_status: "CONTINUING_SAFELY",
    });
    expect(routeState.queuedInput).toBeNull();
  });
});
