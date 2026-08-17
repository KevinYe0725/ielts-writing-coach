import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  aiJob,
  createDatabase,
  lessonPlan,
  newDomainId,
  question,
  teachingPracticeResponse,
  trainingCycle,
  user,
  type Database,
} from "@iwc/db";

const state = vi.hoisted(() => ({
  actorId: "",
  context: undefined as unknown,
  enqueueStatus: "QUEUED" as "QUEUED" | "WAITING_FOR_CONSENT",
  enqueueCalls: [] as Array<{
    taskKind: string;
    protectedReference: Record<string, string>;
    idempotencyKey: string;
  }>,
}));

vi.mock("@/lib/server/context", () => ({
  getServerContext: () => state.context,
}));
vi.mock("@/lib/server/session", async () => {
  const { ApiProblem } = await import("@/lib/server/problem");
  return {
    requireSession: async () => {
      if (!state.actorId)
        throw new ApiProblem({
          title: "Authentication required",
          status: 401,
          code: "UNAUTHENTICATED",
          detail: "Sign in to continue.",
        });
      return {
        id: state.actorId,
        email: `${state.actorId}@example.test`,
        name: "Retry learner",
        role: "learner" as const,
      };
    },
  };
});
vi.mock("@/lib/server/jobs", () => ({
  enqueueAIJob: async (
    transaction: Database,
    input: {
      ownerId: string;
      taskKind: string;
      protectedReference: Record<string, string>;
      idempotencyKey: string;
    },
  ) => {
    state.enqueueCalls.push(input);
    const id = newDomainId();
    await transaction.insert(aiJob).values({
      id,
      ownerId: input.ownerId,
      taskKind: input.taskKind,
      status: state.enqueueStatus,
      protectedReference: input.protectedReference,
      versionSnapshot: {
        promptVersion: "test",
        rubricVersion: "test",
        routeVersion: "1",
        model: "test",
        schemaVersion: "1.0.0",
        providerKind:
          state.enqueueStatus === "QUEUED" ? "openai" : "unconfigured",
      },
      idempotencyKey: input.idempotencyKey,
      graphileJobKey: `test:${id}`,
    });
    return {
      id,
      status: state.enqueueStatus,
      location: `/api/v1/ai-jobs/${id}`,
    };
  },
}));

import { POST } from "./route";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const shortPrompt = {
  id: "workplace-retry",
  instructionZh: "用一句英文补出灵活工作与生产力之间的机制。",
  instructionEn: "Write one sentence that links flexible work to productivity.",
  promptEn:
    "Flexible schedules can improve employee productivity because employees can …",
  responseMode: "SHORT_TEXT",
  context: "UNSEEN_TOPIC",
  optionsEn: [],
  referenceAnswerEn:
    "Employees can reserve demanding tasks for the hours when they concentrate best.",
  referenceReasoningZh: "参考答案说明灵活时间如何改变任务安排并支持专注。",
  referenceReasoningEn:
    "The reference shows how flexible time changes task scheduling and supports concentration.",
} as const;

const choicePrompt = {
  id: "choice-retry",
  instructionZh: "选择明确呈现中间作用过程的一句。",
  instructionEn: "Choose the sentence that shows the intermediate process.",
  promptEn: "A city adds protected bicycle lanes to busy roads.",
  responseMode: "CHOICE",
  context: "SAME_TOPIC",
  optionsEn: ["A broad claim.", "A specific causal mechanism."],
  referenceAnswerEn: "A specific causal mechanism.",
  referenceReasoningZh: "参考选项明确写出了中间的作用过程。",
  referenceReasoningEn: "The reference states the intermediate causal process.",
} as const;

function retryRequest(responseId: string, key: string): Request {
  return new Request(
    `https://coach.test/api/v1/teaching-practice-responses/${responseId}/retry`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key,
        origin: "https://coach.test",
      },
      body: "{}",
    },
  );
}

describe.skipIf(!databaseUrl)(
  "tutorial-practice dedicated retry route (PostgreSQL)",
  () => {
    const database = createDatabase(databaseUrl!);
    const suffix = newDomainId();
    const learnerId = `practice-retry-${suffix}`;
    const otherId = `practice-retry-other-${suffix}`;
    const questionId = newDomainId();
    const cycleId = newDomainId();
    const lessonId = newDomainId();
    let responseId = "";

    beforeAll(async () => {
      state.context = {
        db: database.db,
        pool: database.pool,
        environment: {
          APP_URL: "https://coach.test",
          DEPLOYMENT_MODE: "personal",
          TRUST_PROXY_HOPS: 0,
        },
      };
      await database.db.insert(user).values([
        {
          id: learnerId,
          name: "Retry learner",
          email: `${learnerId}@example.test`,
          role: "learner",
        },
        {
          id: otherId,
          name: "Other learner",
          email: `${otherId}@example.test`,
          role: "learner",
        },
      ]);
      await database.db.insert(question).values({
        id: questionId,
        externalId: `retry-${suffix}`,
        ownerId: learnerId,
        source: "private_test",
        visibility: "private",
        questionType: "opinion",
        topic: "work",
        prompt: "Should workplaces use flexible schedules?",
      });
      await database.db.insert(trainingCycle).values({
        id: cycleId,
        userId: learnerId,
        questionId,
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });
      await database.db.insert(lessonPlan).values({
        id: lessonId,
        cycleId,
        coreSkillId: "causal_mechanism",
        schemaVersion: "1.0.0",
        coreMinutes: 45,
        activeOutputRatio: 0.7,
        selectionRatio: 0.2,
        stages: [],
        paperContent: {
          teachingModule: {
            format: "ADAPTIVE_ARTICLE_V1",
            practicePrompts: [shortPrompt, choicePrompt],
          },
        },
      });
    });

    beforeEach(async () => {
      state.actorId = learnerId;
      state.enqueueStatus = "QUEUED";
      state.enqueueCalls.length = 0;
      await database.db
        .delete(teachingPracticeResponse)
        .where(eq(teachingPracticeResponse.lessonPlanId, lessonId));
      await database.db.delete(aiJob).where(eq(aiJob.ownerId, learnerId));
      const [created] = await database.db
        .insert(teachingPracticeResponse)
        .values({
          lessonPlanId: lessonId,
          userId: learnerId,
          promptId: shortPrompt.id,
          submittedAnswer: "The immutable answer used by every retry.",
          responseMode: "SHORT_TEXT",
          status: "ANALYSIS_UNAVAILABLE",
        })
        .returning();
      responseId = created!.id;
    });

    afterAll(async () => {
      await database.db.delete(user).where(eq(user.id, learnerId));
      await database.db.delete(user).where(eq(user.id, otherId));
      await database.pool.end();
    });

    async function attachJob(status: typeof aiJob.$inferSelect.status) {
      const [job] = await database.db
        .insert(aiJob)
        .values({
          ownerId: learnerId,
          taskKind: "teaching_practice_analysis",
          status,
          protectedReference: { teachingPracticeResponseId: responseId },
          versionSnapshot: {
            promptVersion: "test",
            rubricVersion: "test",
            routeVersion: "1",
            model: "test",
            schemaVersion: "1.0.0",
            providerKind: "openai",
          },
          idempotencyKey: `prior:${newDomainId()}`,
        })
        .returning();
      await database.db
        .update(teachingPracticeResponse)
        .set({ aiJobId: job!.id })
        .where(eq(teachingPracticeResponse.id, responseId));
      return job!;
    }

    it.each(["QUEUED", "LEASED", "RUNNING", "RETRY_SCHEDULED"] as const)(
      "deduplicates an active %s job",
      async (status) => {
        await attachJob(status);
        const response = await POST(
          retryRequest(responseId, `active-${status}`),
          {
            params: Promise.resolve({ id: responseId }),
          },
        );
        expect(response.status).toBe(202);
        expect(await response.json()).toMatchObject({
          response: {
            id: responseId,
            submittedAnswer: "The immutable answer used by every retry.",
            analysisState: "ANALYSIS_PENDING",
          },
        });
        expect(state.enqueueCalls).toHaveLength(0);
      },
    );

    it("keeps a waiting configuration unavailable without piling up jobs", async () => {
      await attachJob("WAITING_FOR_CONSENT");
      const response = await POST(retryRequest(responseId, "waiting-1"), {
        params: Promise.resolve({ id: responseId }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        response: { analysisState: "ANALYSIS_UNAVAILABLE" },
      });
      expect(state.enqueueCalls).toHaveLength(0);
    });

    it("turns an unconfigured fresh retry into a reusable unavailable resource", async () => {
      state.enqueueStatus = "WAITING_FOR_CONSENT";
      const first = await POST(
        retryRequest(responseId, "unconfigured-fresh-1"),
        {
          params: Promise.resolve({ id: responseId }),
        },
      );
      expect(first.status).toBe(200);
      const body = await first.json();
      expect(body).toMatchObject({
        response: {
          id: responseId,
          submittedAnswer: "The immutable answer used by every retry.",
          analysisState: "ANALYSIS_UNAVAILABLE",
        },
      });
      expect(JSON.stringify(body)).not.toMatch(
        /aiJob|taskKind|model|provider|routeVersion|schemaVersion|confidence|retryCount|score|passed|verdict/i,
      );
      expect(state.enqueueCalls).toHaveLength(1);

      const second = await POST(
        retryRequest(responseId, "unconfigured-fresh-2"),
        {
          params: Promise.resolve({ id: responseId }),
        },
      );
      expect(second.status).toBe(200);
      expect((await second.json()).response.analysisState).toBe(
        "ANALYSIS_UNAVAILABLE",
      );
      expect(state.enqueueCalls).toHaveLength(1);
    });

    it.each([
      {
        enqueueStatus: "QUEUED" as const,
        expectedHttpStatus: 202,
        expectedState: "ANALYSIS_PENDING",
        expectedPersistedStatus: "ANALYSIS_PENDING",
      },
      {
        enqueueStatus: "WAITING_FOR_CONSENT" as const,
        expectedHttpStatus: 200,
        expectedState: "ANALYSIS_UNAVAILABLE",
        expectedPersistedStatus: "ANALYSIS_UNAVAILABLE",
      },
    ])(
      "atomically clears an old ready analysis when attaching a fresh $enqueueStatus retry",
      async ({
        enqueueStatus,
        expectedHttpStatus,
        expectedState,
        expectedPersistedStatus,
      }) => {
        state.enqueueStatus = enqueueStatus;
        const oldAnalysis = {
          kind: "PERSONALIZED",
          summary: { zh: "旧解析。", en: "An old analysis." },
          strengths: [],
          comparisonPoints: [],
          nextCheck: { zh: "旧检查项。", en: "An old next check." },
        };
        await database.db
          .update(teachingPracticeResponse)
          .set({ status: "ANALYSIS_READY", analysis: oldAnalysis })
          .where(eq(teachingPracticeResponse.id, responseId));
        const oldJob = await attachJob("SUCCEEDED");

        const response = await POST(
          retryRequest(responseId, `ready-old-retry-${enqueueStatus}`),
          {
            params: Promise.resolve({ id: responseId }),
          },
        );
        expect(response.status).toBe(expectedHttpStatus);
        expect(await response.json()).toMatchObject({
          response: {
            id: responseId,
            submittedAnswer: "The immutable answer used by every retry.",
            analysisState: expectedState,
            analysis: null,
          },
        });

        const persisted =
          await database.db.query.teachingPracticeResponse.findFirst({
            where: eq(teachingPracticeResponse.id, responseId),
          });
        expect(persisted).toMatchObject({
          id: responseId,
          status: expectedPersistedStatus,
          analysis: null,
        });
        expect(persisted?.aiJobId).not.toBe(oldJob.id);
        expect(state.enqueueCalls).toHaveLength(1);
      },
    );

    it("returns a valid completed typed analysis unchanged instead of starting a replacement job", async () => {
      const completedAnalysis = {
        kind: "PERSONALIZED_ATOMS_V1",
        strengths: [
          {
            code: "DIRECT_RESPONSE",
            evidence: "immutable answer",
          },
        ],
        comparisons: [],
        improvements: [],
        uncertainty: "NONE",
      };
      await database.db
        .update(teachingPracticeResponse)
        .set({ status: "ANALYSIS_READY", analysis: completedAnalysis })
        .where(eq(teachingPracticeResponse.id, responseId));
      const completedJob = await attachJob("SUCCEEDED");
      const before = await database.db.query.teachingPracticeResponse.findFirst(
        {
          where: eq(teachingPracticeResponse.id, responseId),
        },
      );

      const response = await POST(
        retryRequest(responseId, "completed-typed-noop"),
        { params: Promise.resolve({ id: responseId }) },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        response: {
          id: responseId,
          submittedAnswer: "The immutable answer used by every retry.",
          analysisState: "ANALYSIS_READY",
          analysis: completedAnalysis,
        },
      });
      const after = await database.db.query.teachingPracticeResponse.findFirst({
        where: eq(teachingPracticeResponse.id, responseId),
      });
      expect(after).toEqual(before);
      expect(after?.aiJobId).toBe(completedJob.id);
      expect(state.enqueueCalls).toHaveLength(0);
    });

    it("creates fresh protected-ID jobs after more than three terminal cycles with no learner cap", async () => {
      for (const index of [1, 2, 3, 4]) {
        const current =
          await database.db.query.teachingPracticeResponse.findFirst({
            where: eq(teachingPracticeResponse.id, responseId),
          });
        if (current?.aiJobId) {
          await database.db
            .update(aiJob)
            .set({ status: index % 2 === 0 ? "SUCCEEDED" : "FAILED" })
            .where(eq(aiJob.id, current.aiJobId));
        }
        const response = await POST(
          retryRequest(responseId, `fresh-terminal-${index}`),
          { params: Promise.resolve({ id: responseId }) },
        );
        expect(response.status).toBe(202);
        expect(await response.json()).toMatchObject({
          response: {
            id: responseId,
            submittedAnswer: "The immutable answer used by every retry.",
            analysisState: "ANALYSIS_PENDING",
          },
        });
      }
      expect(state.enqueueCalls).toHaveLength(4);
      expect(
        state.enqueueCalls.every(
          (call) =>
            JSON.stringify(call.protectedReference) ===
            JSON.stringify({ teachingPracticeResponseId: responseId }),
        ),
      ).toBe(true);
      expect(
        new Set(state.enqueueCalls.map((call) => call.idempotencyKey)).size,
      ).toBe(4);
    });

    it("replays one retry request without a duplicate fresh job", async () => {
      await attachJob("FAILED");
      const first = await POST(retryRequest(responseId, "retry-replay"), {
        params: Promise.resolve({ id: responseId }),
      });
      const firstBody = await first.json();
      const replay = await POST(retryRequest(responseId, "retry-replay"), {
        params: Promise.resolve({ id: responseId }),
      });
      expect(await replay.json()).toEqual(firstBody);
      expect(replay.headers.get("idempotency-replayed")).toBe("true");
      expect(state.enqueueCalls).toHaveLength(1);
    });

    it("does not retry choice feedback and never exposes a foreign response", async () => {
      const [choice] = await database.db
        .insert(teachingPracticeResponse)
        .values({
          lessonPlanId: lessonId,
          userId: learnerId,
          promptId: choicePrompt.id,
          submittedAnswer: choicePrompt.referenceAnswerEn,
          responseMode: "CHOICE",
          status: "ANALYSIS_READY",
          analysis: {
            kind: "DETERMINISTIC_CHOICE",
            summary: { zh: "本地对照。", en: "Local comparison." },
            strengths: [],
            comparisonPoints: [],
            nextCheck: { zh: "再检查。", en: "Check again." },
          },
        })
        .returning();
      const noOp = await POST(retryRequest(choice!.id, "choice-noop"), {
        params: Promise.resolve({ id: choice!.id }),
      });
      expect(noOp.status).toBe(200);
      expect((await noOp.json()).response.analysisState).toBe("ANALYSIS_READY");
      expect(state.enqueueCalls).toHaveLength(0);

      state.actorId = otherId;
      const foreign = await POST(retryRequest(responseId, "foreign-retry"), {
        params: Promise.resolve({ id: responseId }),
      });
      expect(foreign.status).toBe(404);
    });

    it("returns an existing demonstration unchanged without creating another job", async () => {
      const demo = {
        kind: "DEMO_ONLY",
        summary: { zh: "答案已保存。", en: "The answer was saved." },
        strengths: [],
        comparisonPoints: [],
        nextCheck: { zh: "稍后自检。", en: "Self-check later." },
        uncertainty: {
          zh: "当前只展示流程，不评价语言质量。",
          en: "This only demonstrates the flow and does not judge language quality.",
        },
      };
      await database.db
        .update(teachingPracticeResponse)
        .set({ status: "DEMO_ONLY", analysis: demo })
        .where(eq(teachingPracticeResponse.id, responseId));
      const response = await POST(retryRequest(responseId, "demo-noop"), {
        params: Promise.resolve({ id: responseId }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        response: {
          submittedAnswer: "The immutable answer used by every retry.",
          analysisState: "DEMO_ONLY",
          analysis: { kind: "DEMO_ONLY", strengths: [], comparisonPoints: [] },
        },
      });
      expect(state.enqueueCalls).toHaveLength(0);
    });
  },
);
