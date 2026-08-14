import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  createDatabase,
  lessonPlan,
  newDomainId,
  question,
  teachingPracticeResponse,
  trainingCycle,
  user,
} from "@iwc/db";

import {
  buildDeterministicChoiceAnalysis,
  createOrGetTeachingPracticeResponse,
  findTeachingPrompt,
  projectTeachingPracticeAnalysis,
} from "./teaching-practice-analysis";

const tutorialPrompt = {
  id: "shared-prompt-id",
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

describe("teaching-practice analysis boundaries", () => {
  it("finds only the exact canonical tutorial prompt, never a timed-paper item", () => {
    const paperContent = {
      teachingModule: {
        format: "ADAPTIVE_ARTICLE_V1",
        sections: [
          {
            anchor: "practice",
            blocks: [{ kind: "PRACTICE", prompts: [tutorialPrompt] }],
          },
        ],
      },
      paper: { items: [{ ...tutorialPrompt, promptEn: "private timed item" }] },
    };

    expect(findTeachingPrompt(paperContent, tutorialPrompt.id)).toEqual(
      tutorialPrompt,
    );
    expect(
      findTeachingPrompt(
        {
          teachingModule: { format: "LEGACY_INTERACTIVE_V1" },
          paper: paperContent.paper,
        },
        tutorialPrompt.id,
      ),
    ).toBeNull();
  });

  it("projects only strict typed atoms with exact learner evidence", () => {
    const answer =
      "Protected lanes reduce perceived danger, so commuters choose bicycles.";
    expect(
      projectTeachingPracticeAnalysis(
        {
          kind: "PERSONALIZED_ATOMS_V1",
          strengths: [
            {
              code: "EXPLICIT_CAUSAL_LINK",
              evidence: "reduce perceived danger",
            },
          ],
          comparisons: [
            { code: "VALID_ALTERNATIVE_PATH", evidence: "choose bicycles" },
          ],
          improvements: [],
          uncertainty: "NONE",
        },
        answer,
      ),
    ).toEqual({
      kind: "PERSONALIZED_ATOMS_V1",
      strengths: [
        { code: "EXPLICIT_CAUSAL_LINK", evidence: "reduce perceived danger" },
      ],
      comparisons: [
        { code: "VALID_ALTERNATIVE_PATH", evidence: "choose bicycles" },
      ],
      improvements: [],
      uncertainty: "NONE",
    });
  });

  it.each([
    {
      kind: "PERSONALIZED",
      summary: { zh: "旧文案", en: "Legacy provider prose" },
      strengths: [],
      comparisonPoints: [],
      nextCheck: { zh: "检查", en: "Check" },
    },
    {
      kind: "PERSONALIZED_ATOMS_V1",
      strengths: [{ code: "UNKNOWN", evidence: "choose bicycles" }],
      comparisons: [],
      improvements: [],
      uncertainty: "NONE",
    },
    {
      kind: "PERSONALIZED_ATOMS_V1",
      strengths: [{ code: "DIRECT_RESPONSE", evidence: "invented" }],
      comparisons: [],
      improvements: [],
      uncertainty: "NONE",
    },
    {
      kind: "PERSONALIZED_ATOMS_V1",
      strengths: [],
      comparisons: [],
      improvements: [],
      uncertainty: "NONE",
      summaryEn: "The provider request failed.",
    },
    {
      kind: "PERSONALIZED_ATOMS_V1",
      strengths: [],
      comparisons: [],
      improvements: [],
      uncertainty: "PARTIAL_EVIDENCE",
    },
  ])(
    "rejects legacy, unknown, invented, or prose-bearing personalized analysis",
    (analysis) => {
      expect(
        projectTeachingPracticeAnalysis(
          analysis,
          "Protected lanes reduce danger, so commuters choose bicycles.",
        ),
      ).toBeNull();
    },
  );

  it("allows DEMO_ONLY only as an explicit uncertainty-bearing non-judgment", () => {
    const demo = {
      kind: "DEMO_ONLY",
      summary: {
        zh: "当前只展示反馈结构，不判断你的语言质量。",
        en: "This demonstrates the feedback structure without judging language quality.",
      },
      strengths: [],
      comparisonPoints: [],
      nextCheck: {
        zh: "请自行核对专项目标。",
        en: "Check the tutorial target yourself.",
      },
      uncertainty: {
        zh: "演示模式未进行语言分析。",
        en: "Demo mode does not perform language analysis.",
      },
    };
    expect(projectTeachingPracticeAnalysis(demo)).toEqual(demo);
    expect(
      projectTeachingPracticeAnalysis({
        ...demo,
        strengths: [
          { zh: "不应判断", en: "No judgment", userAnswerEvidence: ["text"] },
        ],
      }),
    ).toBeNull();
  });

  it("builds deterministic choice comparison without pass/fail semantics", () => {
    const submittedAnswer = tutorialPrompt.optionsEn[0];
    const first = buildDeterministicChoiceAnalysis(
      tutorialPrompt,
      submittedAnswer,
    );
    expect(first).toEqual(
      buildDeterministicChoiceAnalysis(tutorialPrompt, submittedAnswer),
    );
    expect(first).toMatchObject({
      kind: "DETERMINISTIC_CHOICE",
      comparisonPoints: [{ userAnswerEvidence: [submittedAnswer] }],
    });
    expect(JSON.stringify(first)).not.toMatch(/pass|fail|score|verdict/i);
  });
});

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)(
  "teaching-practice response idempotency (PostgreSQL)",
  () => {
    const database = createDatabase(databaseUrl!);

    afterAll(async () => {
      await database.pool.end();
    });

    it("returns the original row and cannot overwrite the first submitted answer", async () => {
      const suffix = newDomainId();
      const userId = `teaching-practice-${suffix}`;
      const questionId = newDomainId();
      const cycleId = newDomainId();
      const lessonPlanId = newDomainId();
      const firstAnswer =
        "  Regular checks reveal warning signs early,\nso treatment can begin sooner.  ";

      try {
        await database.db.insert(user).values({
          id: userId,
          name: "Teaching Practice Test",
          email: `${suffix}@example.test`,
          role: "learner",
        });
        await database.db.insert(question).values({
          id: questionId,
          externalId: `teaching-practice-${suffix}`,
          ownerId: userId,
          source: "private_test",
          visibility: "private",
          questionType: "opinion",
          topic: "health",
          prompt: "Should governments fund preventive healthcare?",
        });
        await database.db.insert(trainingCycle).values({
          id: cycleId,
          userId,
          questionId,
          schemaVersion: "1.0.0",
          timezone: "UTC",
        });
        await database.db.insert(lessonPlan).values({
          id: lessonPlanId,
          cycleId,
          coreSkillId: "causal_mechanism",
          schemaVersion: "1.0.0",
          coreMinutes: 45,
          activeOutputRatio: 0.6,
          selectionRatio: 0.4,
          stages: [],
        });

        const first = await createOrGetTeachingPracticeResponse(database.db, {
          lessonPlanId,
          userId,
          promptId: "unseen-health-transfer",
          submittedAnswer: firstAnswer,
          responseMode: "SHORT_TEXT",
          status: "ANALYSIS_PENDING",
        });
        const duplicate = await createOrGetTeachingPracticeResponse(
          database.db,
          {
            lessonPlanId,
            userId,
            promptId: "unseen-health-transfer",
            submittedAnswer:
              "A later answer that must never replace the first.",
            responseMode: "SHORT_TEXT",
            status: "ANALYSIS_UNAVAILABLE",
          },
        );

        expect(duplicate.id).toBe(first.id);
        expect(duplicate.submittedAnswer).toBe(firstAnswer);
        expect(duplicate.status).toBe("ANALYSIS_PENDING");
        expect(duplicate.analysis).toBeNull();
        expect(
          await database.db.query.teachingPracticeResponse.findMany({
            where: eq(teachingPracticeResponse.lessonPlanId, lessonPlanId),
          }),
        ).toHaveLength(1);
      } finally {
        await database.db.delete(user).where(eq(user.id, userId));
      }
    });
  },
);
