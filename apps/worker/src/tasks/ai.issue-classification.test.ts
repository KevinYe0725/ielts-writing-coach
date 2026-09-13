import { beforeEach, describe, expect, it, vi } from "vitest";
import Ajv from "ajv";
import { issueBatchSchema } from "../schemas";

const state = vi.hoisted(() => ({
  response: { issues: [] as unknown[] },
  saved: [] as unknown[],
  child: null as any,
  succeeded: false,
  failure: null as unknown,
}));
vi.mock("../runtime", () => {
  const db = {
    query: {
      writingAttempt: {
        findFirst: async () => ({
          id: "attempt",
          cycleId: "cycle",
          userId: "learner",
          content:
            "Local libraries give residents access to books and quiet places to study.",
          assisted: false,
          submittedAt: null,
        }),
      },
      issueEvidence: { findMany: async () => [] },
      mixedReviewTask: { findFirst: async () => null },
    },
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    insert: () => ({
      values: async (values: unknown) => {
        state.saved.push(values);
      },
    }),
    transaction: async (
      callback: (transaction: unknown) => unknown,
    ): Promise<unknown> => callback(db),
  };
  return {
    databaseContext: { db },
    claimAIJob: async () => ({
      id: "job",
      ownerId: "learner",
      taskKind: "issue_classification",
      protectedReference: {
        attemptId: "attempt",
        cycleId: "cycle",
        assessmentId: "assessment",
      },
      versionSnapshot: { model: "test", providerKind: "compatible" },
      attemptCount: 1,
    }),
    adapterForJob: async () => ({
      generateStructured: async (request: {
        validate: (value: unknown) => boolean;
      }) => {
        if (!request.validate(state.response))
          throw new Error("response rejected");
        return {
          value: state.response,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        };
      },
    }),
    createChildJob: async (_job: unknown, kind: string, reference: unknown) => {
      state.child = { kind, reference };
      return { id: "child", graphileJobKey: "child-key" };
    },
    markJobSucceeded: async () => {
      state.succeeded = true;
    },
    markJobFailure: async (_job: unknown, error: unknown) => {
      state.failure = error;
    },
  };
});
import { runAIJob } from "./ai";

describe("honest issue classification", () => {
  beforeEach(() => {
    state.response = { issues: [] };
    state.saved = [];
    state.child = null;
    state.succeeded = false;
    state.failure = null;
  });

  it("accepts a clean answer in the actual provider response schema", () => {
    expect(
      new Ajv({ strict: false }).compile(issueBatchSchema)({ issues: [] }),
    ).toBe(true);
  });
  it("finishes a clean report without inventing errors and offers clearly labelled consolidation", async () => {
    await runAIJob({ jobId: "job" }, {
      job: { attempts: 1 },
      addJob: async () => undefined,
    } as never);
    expect(state.failure).toBeNull();
    expect(state.succeeded).toBe(true);
    expect(state.saved).toEqual([]);
    expect(state.child).toMatchObject({
      kind: "exercise_generation",
      reference: { diagnosisMode: "CONSOLIDATION" },
    });
  });
  it("does not turn an invented source quote into a synthetic learner weakness", async () => {
    state.response.issues = [
      {
        skillId: "mechanism_chain",
        startOffset: 0,
        endOffset: 24,
        excerpt: "Extraterrestrial mineral extraction",
        diagnosis: "A process needs explanation.",
        issueType: "LOGIC",
        correctedVersion: "Explain the process.",
        explanationZh: "需要说明过程。",
        knowledgePointZh: "解释中间过程。",
        transferRuleZh: "检查原因怎样产生结果。",
        severity: "MEDIUM",
        confidence: 0.9,
      },
    ];
    await runAIJob({ jobId: "job" }, {
      job: { attempts: 1 },
      addJob: async () => undefined,
    } as never);
    expect(state.saved).toEqual([]);
    expect(state.succeeded).toBe(false);
    expect(state.failure).toBeInstanceOf(Error);
  });
});
