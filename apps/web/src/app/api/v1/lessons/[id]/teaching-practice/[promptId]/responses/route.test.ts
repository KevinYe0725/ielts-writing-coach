import { and, eq } from "drizzle-orm";
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
  evaluation,
  lessonPlan,
  mixedReviewTask,
  newDomainId,
  question,
  skillEvidenceEvent,
  teachingPracticeResponse,
  trainingCycle,
  transferTask,
  user,
  userSkillState,
  rewriteTask,
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
      if (!state.actorId) {
        throw new ApiProblem({
          title: "Authentication required",
          status: 401,
          code: "UNAUTHENTICATED",
          detail: "Sign in to continue.",
        });
      }
      return {
        id: state.actorId,
        email: `${state.actorId}@example.test`,
        name: "Route learner",
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
    state.enqueueCalls.push({
      taskKind: input.taskKind,
      protectedReference: input.protectedReference,
      idempotencyKey: input.idempotencyKey,
    });
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

import { GET, POST } from "./route";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const choicePrompt = {
  id: "city-cycle-choice",
  instructionZh: "选择明确呈现中间作用过程的一句。",
  instructionEn: "Choose the sentence that shows the intermediate process.",
  promptEn: "A city adds protected bicycle lanes to busy roads.",
  responseMode: "CHOICE",
  context: "SAME_TOPIC",
  optionsEn: [
    "Cycling infrastructure is beneficial for cities.",
    "Protected lanes reduce perceived danger, so more commuters feel able to cycle regularly.",
  ],
  referenceAnswerEn:
    "Protected lanes reduce perceived danger, so more commuters feel able to cycle regularly.",
  referenceReasoningZh:
    "参考选项写出了道路先降低风险感受，再改变通勤选择的中间过程。",
  referenceReasoningEn:
    "The reference option shows perceived risk changing before commuter behaviour changes.",
} as const;

const shortPrompt = {
  id: "workplace-link",
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

function request(
  lessonId: string,
  promptId: string,
  options: {
    answer?: string;
    idempotencyKey?: string;
    origin?: string;
    method?: "GET" | "POST";
    extra?: Record<string, unknown>;
  } = {},
): Request {
  const method = options.method ?? "POST";
  const headers = new Headers();
  if (method === "POST") {
    headers.set("content-type", "application/json");
    if (options.origin !== null)
      headers.set("origin", options.origin ?? "https://coach.test");
    if (options.idempotencyKey)
      headers.set("idempotency-key", options.idempotencyKey);
  }
  return new Request(
    `https://coach.test/api/v1/lessons/${lessonId}/teaching-practice/${promptId}/responses`,
    {
      method,
      headers,
      ...(method === "POST"
        ? {
            body: JSON.stringify({
              answer: options.answer ?? "A useful mechanism.",
              ...options.extra,
            }),
          }
        : {}),
    },
  );
}

describe.skipIf(!databaseUrl)(
  "tutorial-practice response route (PostgreSQL)",
  () => {
    const database = createDatabase(databaseUrl!);
    const suffix = newDomainId();
    const learnerId = `practice-route-${suffix}`;
    const otherId = `practice-route-other-${suffix}`;
    const questionId = newDomainId();
    const cycleId = newDomainId();
    const lessonId = newDomainId();

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
          name: "Practice route learner",
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
        externalId: `route-${suffix}`,
        ownerId: learnerId,
        source: "private_test",
        visibility: "private",
        questionType: "opinion",
        topic: "education",
        prompt: "Should schools teach financial literacy?",
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
            practicePrompts: [choicePrompt, shortPrompt],
          },
          paper: { items: [{ id: "timed-only", promptEn: "Private paper" }] },
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
    });

    afterAll(async () => {
      await database.db.delete(user).where(eq(user.id, learnerId));
      await database.db.delete(user).where(eq(user.id, otherId));
      await database.pool.end();
    });

    it("enforces authentication, trusted origin, idempotency, strict input and non-disclosing ownership", async () => {
      state.actorId = "";
      expect(
        (
          await POST(
            request(lessonId, shortPrompt.id, { idempotencyKey: "unauth" }),
            {
              params: Promise.resolve({
                id: lessonId,
                promptId: shortPrompt.id,
              }),
            },
          )
        ).status,
      ).toBe(401);

      state.actorId = learnerId;
      expect(
        (
          await POST(
            request(lessonId, shortPrompt.id, {
              idempotencyKey: "bad-origin",
              origin: "https://attacker.test",
            }),
            {
              params: Promise.resolve({
                id: lessonId,
                promptId: shortPrompt.id,
              }),
            },
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await POST(request(lessonId, shortPrompt.id), {
            params: Promise.resolve({ id: lessonId, promptId: shortPrompt.id }),
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await POST(
            request(lessonId, shortPrompt.id, {
              idempotencyKey: "extra-field",
              extra: { score: 99 },
            }),
            {
              params: Promise.resolve({
                id: lessonId,
                promptId: shortPrompt.id,
              }),
            },
          )
        ).status,
      ).toBe(422);
      expect(
        (
          await POST(
            request(lessonId, shortPrompt.id, {
              answer: "x".repeat(4_001),
              idempotencyKey: "too-long",
            }),
            {
              params: Promise.resolve({
                id: lessonId,
                promptId: shortPrompt.id,
              }),
            },
          )
        ).status,
      ).toBe(422);

      state.actorId = otherId;
      const foreign = await POST(
        request(lessonId, shortPrompt.id, { idempotencyKey: "foreign" }),
        { params: Promise.resolve({ id: lessonId, promptId: shortPrompt.id }) },
      );
      const missing = await POST(
        request(newDomainId(), shortPrompt.id, { idempotencyKey: "missing" }),
        {
          params: Promise.resolve({
            id: newDomainId(),
            promptId: shortPrompt.id,
          }),
        },
      );
      expect(foreign.status).toBe(404);
      expect(missing.status).toBe(404);
      expect((await foreign.json()).code).toBe((await missing.json()).code);
    });

    it("returns deterministic choice feedback synchronously with no AI or internals", async () => {
      const response = await POST(
        request(lessonId, choicePrompt.id, {
          answer: choicePrompt.optionsEn[1],
          idempotencyKey: "choice-1",
        }),
        {
          params: Promise.resolve({ id: lessonId, promptId: choicePrompt.id }),
        },
      );
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.response).toMatchObject({
        promptId: choicePrompt.id,
        submittedAnswer: choicePrompt.optionsEn[1],
        responseMode: "CHOICE",
        analysisState: "ANALYSIS_READY",
        analysis: { kind: "DETERMINISTIC_CHOICE" },
      });
      expect(state.enqueueCalls).toHaveLength(0);
      expect(Object.keys(body.response).sort()).toEqual([
        "analysis",
        "analysisState",
        "id",
        "promptId",
        "responseMode",
        "submittedAnswer",
      ]);
      expect(JSON.stringify(body)).not.toMatch(
        /aiJob|taskKind|model|provider|routeVersion|schemaVersion|confidence|retry|score|passed|verdict/i,
      );
    });

    it("rejects a non-option choice and never accepts a timed-paper-only prompt", async () => {
      const invalidChoice = await POST(
        request(lessonId, choicePrompt.id, {
          answer: "An option invented by the browser.",
          idempotencyKey: "invalid-choice",
        }),
        {
          params: Promise.resolve({ id: lessonId, promptId: choicePrompt.id }),
        },
      );
      expect(invalidChoice.status).toBe(422);
      expect((await invalidChoice.json()).code).toBe(
        "TEACHING_PRACTICE_CHOICE_INVALID",
      );

      const timedOnly = await POST(
        request(lessonId, "timed-only", {
          answer: "A private paper answer.",
          idempotencyKey: "timed-only",
        }),
        { params: Promise.resolve({ id: lessonId, promptId: "timed-only" }) },
      );
      expect(timedOnly.status).toBe(404);
      expect(state.enqueueCalls).toHaveLength(0);
    });

    it("queues short text by protected response id only and preserves the immutable first answer", async () => {
      const firstAnswer =
        "  Employees can schedule complex work during their peak hours.  ";
      const first = await POST(
        request(lessonId, shortPrompt.id, {
          answer: firstAnswer,
          idempotencyKey: "short-1",
        }),
        { params: Promise.resolve({ id: lessonId, promptId: shortPrompt.id }) },
      );
      const firstBody = await first.json();
      expect(first.status).toBe(202);
      expect(firstBody.response).toMatchObject({
        submittedAnswer: firstAnswer,
        analysisState: "ANALYSIS_PENDING",
      });
      expect(state.enqueueCalls).toEqual([
        {
          taskKind: "teaching_practice_analysis",
          protectedReference: {
            teachingPracticeResponseId: firstBody.response.id,
          },
          idempotencyKey: `teaching-practice:${firstBody.response.id}:initial`,
        },
      ]);

      const second = await POST(
        request(lessonId, shortPrompt.id, {
          answer: "A later answer that must not replace the first.",
          idempotencyKey: "short-2",
        }),
        { params: Promise.resolve({ id: lessonId, promptId: shortPrompt.id }) },
      );
      expect((await second.json()).response.submittedAnswer).toBe(firstAnswer);
      expect(state.enqueueCalls).toHaveLength(1);
      expect(
        await database.db.query.teachingPracticeResponse.findMany({
          where: and(
            eq(teachingPracticeResponse.lessonPlanId, lessonId),
            eq(teachingPracticeResponse.promptId, shortPrompt.id),
          ),
        }),
      ).toHaveLength(1);
    });

    it("serializes concurrent first submissions into one immutable response and one initial job", async () => {
      const answers = [
        "The first concurrent answer.",
        "The second concurrent answer.",
      ];
      const responses = await Promise.all(
        answers.map((answer, index) =>
          POST(
            request(lessonId, shortPrompt.id, {
              answer,
              idempotencyKey: `concurrent-${index}`,
            }),
            {
              params: Promise.resolve({
                id: lessonId,
                promptId: shortPrompt.id,
              }),
            },
          ),
        ),
      );
      const bodies = await Promise.all(
        responses.map((response) => response.json()),
      );
      expect(bodies[0].response.id).toBe(bodies[1].response.id);
      expect(bodies[0].response.submittedAnswer).toBe(
        bodies[1].response.submittedAnswer,
      );
      expect(answers).toContain(bodies[0].response.submittedAnswer);
      expect(state.enqueueCalls).toHaveLength(1);
      expect(
        await database.db.query.teachingPracticeResponse.findMany({
          where: eq(teachingPracticeResponse.lessonPlanId, lessonId),
        }),
      ).toHaveLength(1);
    });

    it("maps unconfigured AI to a successful unavailable resource and leaves formal learning state untouched", async () => {
      state.enqueueStatus = "WAITING_FOR_CONSENT";
      const cycleBefore = await database.db.query.trainingCycle.findFirst({
        where: eq(trainingCycle.id, cycleId),
      });
      const planBefore = await database.db.query.lessonPlan.findFirst({
        where: eq(lessonPlan.id, lessonId),
      });
      const evidenceBefore = await database.db
        .select()
        .from(skillEvidenceEvent)
        .where(eq(skillEvidenceEvent.userId, learnerId));
      const skillsBefore = await database.db
        .select()
        .from(userSkillState)
        .where(eq(userSkillState.userId, learnerId));
      const evaluationsBefore = await database.db.select().from(evaluation);
      const rewritesBefore = await database.db
        .select()
        .from(rewriteTask)
        .where(eq(rewriteTask.userId, learnerId));
      const transfersBefore = await database.db
        .select()
        .from(transferTask)
        .where(eq(transferTask.userId, learnerId));
      const reviewsBefore = await database.db
        .select()
        .from(mixedReviewTask)
        .where(eq(mixedReviewTask.userId, learnerId));

      const response = await POST(
        request(lessonId, shortPrompt.id, {
          answer: "The learner keeps this answer even without AI.",
          idempotencyKey: "unconfigured-1",
        }),
        { params: Promise.resolve({ id: lessonId, promptId: shortPrompt.id }) },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        response: {
          submittedAnswer: "The learner keeps this answer even without AI.",
          analysisState: "ANALYSIS_UNAVAILABLE",
          analysis: null,
        },
      });
      expect(
        await database.db.query.trainingCycle.findFirst({
          where: eq(trainingCycle.id, cycleId),
        }),
      ).toEqual(cycleBefore);
      expect(
        await database.db.query.lessonPlan.findFirst({
          where: eq(lessonPlan.id, lessonId),
        }),
      ).toEqual(planBefore);
      expect(
        await database.db
          .select()
          .from(skillEvidenceEvent)
          .where(eq(skillEvidenceEvent.userId, learnerId)),
      ).toEqual(evidenceBefore);
      expect(
        await database.db
          .select()
          .from(userSkillState)
          .where(eq(userSkillState.userId, learnerId)),
      ).toEqual(skillsBefore);
      expect(await database.db.select().from(evaluation)).toEqual(
        evaluationsBefore,
      );
      expect(
        await database.db
          .select()
          .from(rewriteTask)
          .where(eq(rewriteTask.userId, learnerId)),
      ).toEqual(rewritesBefore);
      expect(
        await database.db
          .select()
          .from(transferTask)
          .where(eq(transferTask.userId, learnerId)),
      ).toEqual(transfersBefore);
      expect(
        await database.db
          .select()
          .from(mixedReviewTask)
          .where(eq(mixedReviewTask.userId, learnerId)),
      ).toEqual(reviewsBefore);
    });

    it("restores only the safe response and replays one idempotent submission", async () => {
      const submitted = await POST(
        request(lessonId, shortPrompt.id, {
          answer: "A restorable answer.",
          idempotencyKey: "restore-1",
        }),
        { params: Promise.resolve({ id: lessonId, promptId: shortPrompt.id }) },
      );
      const replay = await POST(
        request(lessonId, shortPrompt.id, {
          answer: "A restorable answer.",
          idempotencyKey: "restore-1",
        }),
        { params: Promise.resolve({ id: lessonId, promptId: shortPrompt.id }) },
      );
      expect(replay.headers.get("idempotency-replayed")).toBe("true");
      expect(await replay.json()).toEqual(await submitted.json());
      const conflict = await POST(
        request(lessonId, shortPrompt.id, {
          answer: "A different body under the same key.",
          idempotencyKey: "restore-1",
        }),
        { params: Promise.resolve({ id: lessonId, promptId: shortPrompt.id }) },
      );
      expect(conflict.status).toBe(409);
      expect((await conflict.json()).code).toBe("IDEMPOTENCY_CONFLICT");

      const restored = await GET(
        request(lessonId, shortPrompt.id, { method: "GET" }),
        { params: Promise.resolve({ id: lessonId, promptId: shortPrompt.id }) },
      );
      expect(restored.status).toBe(200);
      const body = await restored.json();
      expect(Object.keys(body.response).sort()).toEqual([
        "analysis",
        "analysisState",
        "id",
        "promptId",
        "responseMode",
        "submittedAnswer",
      ]);
    });

    it("does not leave a succeeded job with a stale pending row pending forever", async () => {
      const submitted = await POST(
        request(lessonId, shortPrompt.id, {
          answer: "A safely recoverable answer.",
          idempotencyKey: "stale-success-1",
        }),
        { params: Promise.resolve({ id: lessonId, promptId: shortPrompt.id }) },
      );
      const submittedBody = await submitted.json();
      const stored = await database.db.query.teachingPracticeResponse.findFirst(
        {
          where: eq(teachingPracticeResponse.id, submittedBody.response.id),
        },
      );
      await database.db
        .update(aiJob)
        .set({ status: "SUCCEEDED" })
        .where(eq(aiJob.id, stored!.aiJobId!));

      const restored = await GET(
        request(lessonId, shortPrompt.id, { method: "GET" }),
        { params: Promise.resolve({ id: lessonId, promptId: shortPrompt.id }) },
      );
      expect(await restored.json()).toMatchObject({
        response: {
          submittedAnswer: "A safely recoverable answer.",
          analysisState: "ANALYSIS_UNAVAILABLE",
        },
      });
    });
  },
);
