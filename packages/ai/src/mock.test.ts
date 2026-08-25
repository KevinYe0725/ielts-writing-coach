import Ajv2020, { type AnySchemaObject } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  QUESTION_BANK,
  QUESTION_TYPES,
  TOPICS,
  type QuestionTopic,
  type QuestionType,
} from "../../question-bank/src";

import {
  type FocusedLearningPackage,
  validateFocusedLearningPackage,
} from "../../../apps/worker/src/learning";
import {
  focusedLearningPackageSchema,
  teachingPracticeAnalysisSchema,
} from "../../../apps/worker/src/schemas";
import * as workerSchemas from "../../../apps/worker/src/schemas";
import { validateGeneratedQuestionBatch } from "../../../apps/worker/src/question-generation";
import { MockAdapter } from "./mock";
import type { StructuredGenerationContractContext } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: true });

describe("deterministic Mock Provider", () => {
  it("uses the exact bounded refill target mix across every task form and topic", async () => {
    const adapter = new MockAdapter();
    expect(workerSchemas).toHaveProperty("questionBankRefillSchema");
    const questionBankRefillSchema = (workerSchemas as Record<string, unknown>)
      .questionBankRefillSchema;
    if (!questionBankRefillSchema) return;
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      questionBankRefillSchema as AnySchemaObject,
    );

    const targetMix = [
      { questionType: "opinion", topic: "education", count: 2 },
      { questionType: "discussion", topic: "technology", count: 1 },
      {
        questionType: "advantages_disadvantages",
        topic: "environment",
        count: 1,
      },
      { questionType: "problems_solutions", topic: "health", count: 1 },
      { questionType: "two_part", topic: "government", count: 1 },
      { questionType: "opinion", topic: "work_economy", count: 1 },
      { questionType: "discussion", topic: "society_culture", count: 1 },
      {
        questionType: "advantages_disadvantages",
        topic: "urban_transport",
        count: 1,
      },
    ] as const;
    const request = {
      model: "mock-deterministic-v1",
      input:
        "Create an original shared question-bank refill without web research.",
      schemaName: "iwc_question_bank_refill_v1",
      schema: questionBankRefillSchema as unknown as Record<string, unknown>,
      contractContext: {
        kind: "question_bank_refill_v1",
        targetMix,
      },
      validate: (
        value: unknown,
      ): value is {
        proposals: Array<{
          type: QuestionType;
          topic: QuestionTopic;
          prompt: string;
        }>;
      } => validate(value) === true,
    } as const;
    const result = await adapter.generateStructured(request);
    const replay = await adapter.generateStructured(request);

    expect(validate(result.value), ajv.errorsText(validate.errors)).toBe(true);
    expect(result.value.proposals).toHaveLength(9);
    expect(replay).toEqual(result);
    expect(
      result.value.proposals.map((proposal) => [proposal.type, proposal.topic]),
    ).toEqual([
      ["opinion", "education"],
      ["opinion", "education"],
      ["discussion", "technology"],
      ["advantages_disadvantages", "environment"],
      ["problems_solutions", "health"],
      ["two_part", "government"],
      ["opinion", "work_economy"],
      ["discussion", "society_culture"],
      ["advantages_disadvantages", "urban_transport"],
    ]);
    expect(new Set(result.value.proposals.map(({ type }) => type))).toEqual(
      new Set(QUESTION_TYPES),
    );
    expect(new Set(result.value.proposals.map(({ topic }) => topic))).toEqual(
      new Set(TOPICS),
    );
    expect(JSON.stringify(result.value)).not.toMatch(
      /web[_ -]?research|https?:\/\/|www\.|citation|source url/i,
    );
    expect(
      new Set(result.value.proposals.map((proposal) => proposal.prompt)).size,
    ).toBe(9);

    const semanticJudgments = Object.fromEntries(
      result.value.proposals.map((_, index) => [
        index,
        {
          duplicate: false,
          confidence: 0.99,
          rationale: "The deterministic variant has a distinct durable focus.",
        },
      ]),
    );
    const validation = validateGeneratedQuestionBatch({
      proposals: result.value.proposals,
      existingQuestions: QUESTION_BANK,
      researchSources: [],
      targetMix,
      semanticJudgments,
    });
    expect(validation.accepted).toHaveLength(9);
    expect(validation.pendingSemanticReview).toEqual([]);
    expect(validation.rejected).toEqual([]);
  });

  it.each(QUESTION_TYPES)(
    "creates fifteen distinct valid %s variants for one approved pair",
    async (questionType) => {
      const adapter = new MockAdapter();
      const validate = ajv.compile(
        workerSchemas.questionBankRefillSchema as AnySchemaObject,
      );
      const targetMix = [
        { questionType, topic: "urban_transport", count: 15 },
      ] as const;
      const result = await adapter.generateStructured({
        model: "mock-deterministic-v1",
        input: "Create a bounded deterministic refill.",
        schemaName: "iwc_question_bank_refill_v1",
        schema: workerSchemas.questionBankRefillSchema as unknown as Record<
          string,
          unknown
        >,
        contractContext: { kind: "question_bank_refill_v1", targetMix },
        validate: (
          value: unknown,
        ): value is {
          proposals: Array<{
            type: QuestionType;
            topic: QuestionTopic;
            prompt: string;
          }>;
        } => validate(value) === true,
      });
      const semanticJudgments = Object.fromEntries(
        result.value.proposals.map((_, index) => [
          index,
          {
            duplicate: false,
            confidence: 0.99,
            rationale:
              "The deterministic variant has a distinct durable focus.",
          },
        ]),
      );

      expect(result.value.proposals).toHaveLength(15);
      expect(
        new Set(result.value.proposals.map(({ prompt }) => prompt)).size,
      ).toBe(15);
      expect(
        validateGeneratedQuestionBatch({
          proposals: result.value.proposals,
          existingQuestions: QUESTION_BANK,
          researchSources: [],
          targetMix,
          semanticJudgments,
        }),
      ).toMatchObject({ accepted: expect.any(Array), rejected: [] });
    },
  );

  it.each([
    ["missing", undefined],
    [
      "malformed",
      {
        kind: "question_bank_refill_v1",
        targetMix: [
          { questionType: "opinion", topic: "government", count: 16 },
        ],
      },
    ],
  ])(
    "fails refill generation closed when contract context is %s",
    async (_label, contractContext) => {
      const adapter = new MockAdapter();
      const validate = ajv.compile(
        workerSchemas.questionBankRefillSchema as AnySchemaObject,
      );

      await expect(
        adapter.generateStructured({
          model: "mock-deterministic-v1",
          input: "Create a bounded deterministic refill.",
          schemaName: "iwc_question_bank_refill_v1",
          schema: workerSchemas.questionBankRefillSchema as unknown as Record<
            string,
            unknown
          >,
          ...(contractContext === undefined
            ? {}
            : {
                contractContext:
                  contractContext as StructuredGenerationContractContext,
              }),
          validate: (value: unknown): value is { proposals: unknown[] } =>
            validate(value) === true,
        }),
      ).rejects.toThrow(
        "The deterministic mock could not satisfy schema iwc_question_bank_refill_v1.",
      );
    },
  );

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

  it("returns deterministic tutorial demo atoms without a learner judgment", async () => {
    const adapter = new MockAdapter();
    const validate = ajv.compile(
      teachingPracticeAnalysisSchema as AnySchemaObject,
    );
    const answer =
      "Protected lanes reduce perceived danger, which gives more commuters a practical reason to cycle.";
    const request = {
      model: "mock-deterministic-v1",
      input: `Immutable learner answer: ${JSON.stringify(answer)}`,
      schemaName: "iwc_teaching_practice_analysis_v2",
      schema: teachingPracticeAnalysisSchema,
      validate,
    };

    const first = await adapter.generateStructured(request);
    const second = await adapter.generateStructured(request);
    const value = first.value as {
      disposition: string;
      strengths: unknown[];
      comparisons: unknown[];
      improvements: unknown[];
      confidence: number;
    };

    expect(first.value).toEqual(second.value);
    expect(validate(first.value), ajv.errorsText(validate.errors)).toBe(true);
    expect(value).toMatchObject({
      disposition: "INSUFFICIENT_EVIDENCE",
      strengths: [],
      comparisons: [],
      improvements: [],
      confidence: 0,
    });
    expect(JSON.stringify(value)).not.toMatch(/summary|rewrite|score|grade/i);
  });

  it("gives strong- and weak-looking tutorial answers the same non-judgmental Mock semantics", async () => {
    const adapter = new MockAdapter();
    const validate = ajv.compile(
      teachingPracticeAnalysisSchema as AnySchemaObject,
    );
    const answers = [
      "Regular screening reveals warning signs early, allowing treatment to begin before avoidable complications develop.",
      "bad",
    ];

    const values = await Promise.all(
      answers.map(async (answer) => {
        const result = await adapter.generateStructured({
          model: "mock-deterministic-v1",
          input: `Immutable learner answer: ${JSON.stringify(answer)}`,
          schemaName: "iwc_teaching_practice_analysis_v2",
          schema: teachingPracticeAnalysisSchema,
          validate,
        });
        return result.value as Record<string, unknown>;
      }),
    );

    for (const value of values) {
      expect(value.strengths).toEqual([]);
      expect(value.comparisons).toEqual([]);
      expect(value.improvements).toEqual([]);
      expect(value.disposition).toBe("INSUFFICIENT_EVIDENCE");
      expect(JSON.stringify(value)).not.toMatch(
        /\b(?:pass|fail|score|mastery|applied|retained|transferred)\b/i,
      );
    }
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

  it("generates a valid adaptive article and isolated paper without legacy fields or source leakage", async () => {
    const adapter = new MockAdapter();
    const version1 =
      "Children always have a better ability to absorb new knowledge than adults because early lessons introduce regular exposure to common language patterns.";
    const result = await adapter.generateStructured({
      model: "mock-deterministic-v1",
      input: `Create the focused learning package. Learner Version 1 for context only: ${version1}`,
      schemaName: "iwc_focused_learning_package_v4",
      schema: focusedLearningPackageSchema as unknown as Record<
        string,
        unknown
      >,
      validate: (value: unknown): value is FocusedLearningPackage =>
        typeof value === "object" &&
        value !== null &&
        validateFocusedLearningPackage(
          value as FocusedLearningPackage,
          version1,
        ),
    });

    expect(result.value.teachingModule).toMatchObject({
      format: "ADAPTIVE_ARTICLE_V1",
      coreAbilityZh: expect.any(String),
      coreAbilityEn: expect.any(String),
    });
    expect(result.value.teachingModule.sections.length).toBeGreaterThanOrEqual(
      2,
    );
    expect(result.value.teachingModule.estimatedMinutes).toBeGreaterThanOrEqual(
      25,
    );
    expect(
      result.value.teachingModule.practicePrompts.length,
    ).toBeGreaterThanOrEqual(3);
    expect(result.value.teachingModule).not.toHaveProperty("knowledgeCards");
    expect(result.value.teachingModule).not.toHaveProperty("expressionBank");
    expect(result.value.teachingModule).not.toHaveProperty("workedExample");
    expect(JSON.stringify(result.value.teachingModule)).not.toContain(
      "Children always have a better ability to absorb new knowledge than adults",
    );
    expect(result.value.paper.objectiveZh).toContain(
      result.value.teachingModule.coreAbilityZh,
    );
    expect(result.value.paper.objectiveEn).toContain(
      result.value.teachingModule.coreAbilityEn,
    );
    expect(result.value.paper.items).toHaveLength(8);
  });
});
