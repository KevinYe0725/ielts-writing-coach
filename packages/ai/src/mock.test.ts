import { describe, expect, it } from "vitest";

import { MockAdapter } from "./mock";

describe("deterministic Mock Provider", () => {
  it("returns repeatable structured values that satisfy the caller validator", async () => {
    const adapter = new MockAdapter();
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["status"],
      properties: { status: { const: "ok" } },
    };
    const request = {
      model: "mock-deterministic-v1",
      input: "probe",
      schemaName: "probe",
      schema,
      validate: (value: unknown): value is { status: "ok" } =>
        typeof value === "object" &&
        value !== null &&
        (value as { status?: unknown }).status === "ok",
    };
    const first = await adapter.generateStructured(request);
    const second = await adapter.generateStructured(request);
    expect(first.value).toEqual({ status: "ok" });
    expect(first.responseId).toBe(second.responseId);
  });

  it("lets the free demo complete evidence gates without pretending to grade language", async () => {
    const adapter = new MockAdapter();
    const schema = {
      type: "object",
      required: [
        "passed",
        "firstAttemptPassed",
        "confidence",
        "userAnswerEvidence",
      ],
      properties: {
        passed: { type: "boolean" },
        firstAttemptPassed: { type: "boolean" },
        confidence: { type: "number" },
        userAnswerEvidence: {
          type: "array",
          items: { type: "string" },
        },
      },
    };
    const request = {
      model: "mock-deterministic-v1",
      input:
        'Learner first answer: "Regular guided practice helps students recognize financial risks before they borrow money."\nLearner hinted answer: null',
      schemaName: "iwc_exercise_evaluation_v1",
      schema,
      validate: (value: unknown): value is { passed: boolean } =>
        typeof value === "object" &&
        value !== null &&
        typeof (value as { passed?: unknown }).passed === "boolean",
    };

    const result = await adapter.generateStructured(request);

    expect(result.value.passed).toBe(true);
    expect(result.value).toMatchObject({
      confidence: 0.95,
      firstAttemptPassed: true,
    });
  });

  it("completes the transfer workflow while explicitly refusing language scoring", async () => {
    const adapter = new MockAdapter();
    const schema = {
      type: "object",
      required: [
        "targetApplied",
        "naturalOpportunity",
        "confidence",
        "feedbackEn",
      ],
      properties: {
        targetApplied: { type: "boolean" },
        naturalOpportunity: { type: "boolean" },
        confidence: { type: "number" },
        feedbackEn: { type: "string" },
      },
    };
    const answer =
      "Regular exposure to unfamiliar arguments helps learners test whether a language pattern can be produced independently and naturally in a new context.";
    const result = await adapter.generateStructured({
      model: "mock-deterministic-v1",
      input: `Learner immutable first answer: ${JSON.stringify(answer)}`,
      schemaName: "iwc_transfer_evaluation_v1",
      schema,
      validate: (
        value: unknown,
      ): value is { targetApplied: boolean; feedbackEn: string } =>
        typeof value === "object" &&
        value !== null &&
        typeof (value as { targetApplied?: unknown }).targetApplied ===
          "boolean" &&
        typeof (value as { feedbackEn?: unknown }).feedbackEn === "string",
    });

    expect(result.value.targetApplied).toBe(true);
    expect(result.value).toMatchObject({ naturalOpportunity: true });
    expect(result.value.feedbackEn).toContain("did not score language");
  });

  it("generates a clear, non-repeating complete practice paper", async () => {
    const adapter = new MockAdapter();
    const result = await adapter.generateStructured({
      model: "mock-deterministic-v1",
      input: "Create the paper.",
      schemaName: "iwc_practice_paper_v2",
      schema: { type: "object" },
      validate: (
        value: unknown,
      ): value is {
        items: Array<{
          section: string;
          promptEn: string;
          sourceText: string;
          suggestedMinutes: number;
          publicCriteria: Array<{ weight: number }>;
        }>;
      } =>
        typeof value === "object" &&
        value !== null &&
        Array.isArray((value as { items?: unknown }).items),
    });

    expect(result.value.items).toHaveLength(8);
    expect(new Set(result.value.items.map((item) => item.promptEn)).size).toBe(
      8,
    );
    expect(
      result.value.items.reduce((sum, item) => sum + item.suggestedMinutes, 0),
    ).toBe(60);
    expect(
      result.value.items
        .filter((item) => item.section === "REPAIR")
        .every((item) => item.sourceText.length > 0),
    ).toBe(true);
    expect(
      result.value.items.every(
        (item) =>
          item.publicCriteria.reduce(
            (sum, criterion) => sum + criterion.weight,
            0,
          ) === 100,
      ),
    ).toBe(true);
  });

  it("generates teaching and a paper with the same named target", async () => {
    const adapter = new MockAdapter();
    const result = await adapter.generateStructured({
      model: "mock-deterministic-v1",
      input: "Create the focused learning package.",
      schemaName: "iwc_focused_learning_package_v3",
      schema: { type: "object" },
      validate: (
        value: unknown,
      ): value is {
        teachingModule: {
          targetTitleZh: string;
          knowledgeCards: unknown[];
          expressionBank: unknown[];
        };
        paper: { objectiveZh: string; items: unknown[] };
      } =>
        typeof value === "object" &&
        value !== null &&
        "teachingModule" in value &&
        "paper" in value,
    });

    expect(result.value.teachingModule.knowledgeCards).toHaveLength(3);
    expect(
      result.value.teachingModule.expressionBank.length,
    ).toBeGreaterThanOrEqual(2);
    expect(result.value.paper.objectiveZh).toContain(
      result.value.teachingModule.targetTitleZh,
    );
    expect(result.value.paper.items).toHaveLength(8);
  });
});
