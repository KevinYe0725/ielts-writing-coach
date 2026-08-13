import { describe, expect, it } from "vitest";

import { SKILL_DEFINITIONS } from "./skill-catalog";
import {
  ISSUE_EVIDENCE_CATEGORIES,
  SKILL_IDS,
  type CycleBundle,
} from "./types";
import {
  validateContract,
  validateAiIssueJudgment,
  validateCycleBundle,
  validateCycleBundleAppendOnly,
} from "./validators";

const ISO = "2026-08-13T00:00:00.000Z";
const HASH = "a".repeat(64);

function cycleBundleFixture(): CycleBundle {
  return {
    contractVersion: "1.0.0",
    manifest: {
      bundleId: "bundle-1",
      cycleId: "cycle-1",
      source: "WEB",
      exportedAt: ISO,
      revision: 1,
      parentRevision: null,
      appendOnlyEntityIds: [
        "cycle-1",
        "question-1",
        "attempt-v1",
        "rewrite-1",
        "mixed-1",
      ],
    },
    checksum: { algorithm: "SHA-256", canonicalization: "JCS", value: HASH },
    cycle: {
      id: "cycle-1",
      state: "SUBMITTED",
      question: {
        id: "question-1",
        prompt:
          "Some schools teach foreign languages in primary school. Do the advantages outweigh the disadvantages?",
        instructions: "Write at least 250 words.",
      },
      createdAt: ISO,
      updatedAt: ISO,
    },
    attempts: [
      {
        id: "attempt-v1",
        version: "V1",
        content: "Primary-school pupils generally face less academic pressure.",
        startedAt: ISO,
        submittedAt: ISO,
        wordCount: 8,
        assisted: false,
        interrupted: false,
      },
    ],
    assessment: null,
    issueEvidence: [],
    objectives: [],
    lesson: { plan: null, responses: [] },
    evidence: [],
    dueTasks: {
      rewrite: {
        id: "rewrite-1",
        status: "PLANNED",
        targetRewriteAt: "2026-08-14T00:00:00.000Z",
        dueAt: null,
        lastInstructionExposureAt: null,
        assisted: false,
        prerequisiteSkipped: false,
      },
      transfers: [],
      mixedReview: {
        id: "mixed-1",
        dueAt: "2026-08-27T00:00:00.000Z",
        status: "PLANNED",
      },
    },
    conflicts: [],
  };
}

describe("fixed v1 skill catalog", () => {
  it("defines exactly the fixed 13 skill IDs once and satisfies the authoritative schema", () => {
    expect(SKILL_IDS).toHaveLength(13);
    expect(SKILL_DEFINITIONS).toHaveLength(13);
    expect(
      new Set(SKILL_DEFINITIONS.map((definition) => definition.id)),
    ).toEqual(new Set(SKILL_IDS));

    for (const definition of SKILL_DEFINITIONS) {
      expect(validateContract("skillDefinition", definition)).toEqual({
        valid: true,
        issues: [],
      });
      expect(definition.allowedItemTypes).toContain("SELF_CHECK");
      expect(definition.minimumGradingConfidence).toBeGreaterThanOrEqual(0.85);
      expect(definition.fallbackStrategy.maxRemedialItems).toBe(2);
    }
  });
});

describe("AI-owned judgment boundaries", () => {
  const criterion = (rationale: string) => ({
    band: 6,
    confidence: 0.88,
    rationale,
  });

  it("accepts semantic assessment judgment and rejects server-owned metadata", () => {
    const judgment = {
      overallBand: 6,
      overallSummaryZh: "文章回应了题目，但语言准确度限制了表达。",
      overallSummaryEn:
        "The essay addresses the task, but language accuracy limits expression.",
      strengthZh: "立场明确，而且主体结构可辨认。",
      strengthEn:
        "The position is clear and the body structure is recognisable.",
      paragraphFeedback: [
        {
          paragraphIndex: 1,
          excerpt: "Children learn quickly.",
          roleZh: "主体段观点句",
          roleEn: "Body-paragraph claim",
          diagnosisZh: "观点清楚，但没有说明为什么或如何产生后续好处。",
          diagnosisEn:
            "The claim is clear, but the cause and mechanism are missing.",
          actionZh: "补充一个原因、一个中间机制和一个具体结果。",
          actionEn:
            "Add a cause, an intermediate mechanism and a specific result.",
        },
      ],
      criteria: {
        TR: criterion("The position is clear but development is uneven."),
        CC: criterion("Paragraph organization is generally clear."),
        LR: criterion("Several collocations remain unnatural."),
        GRA: criterion("Complex forms are attempted with recurring errors."),
      },
    };
    expect(validateContract("aiAssessmentJudgment", judgment).valid).toBe(true);
    expect(
      validateContract("aiAssessmentJudgment", {
        ...judgment,
        id: "ai-must-not-create-this",
      }).valid,
    ).toBe(false);
    expect(
      validateContract("aiAssessmentJudgment", { ...judgment, createdAt: ISO })
        .valid,
    ).toBe(false);
  });

  it("limits issue judgment to fixed skills, snapshot offsets, and diagnosis fields", () => {
    const issue = {
      skillId: "collocation_perspective",
      startOffset: 32,
      endOffset: 54,
      excerpt: "much slighter pressure",
      diagnosis:
        "The comparative is grammatical; the phrase is unnatural in collocation and perspective.",
      issueType: "COLLOCATION",
      correctedVersion:
        "Academic pressure is generally lower in primary school than in secondary school.",
      explanationZh:
        "much slighter并非语法错误，但slight与pressure搭配生硬，而且原句没有写明比较对象。",
      knowledgePointZh:
        "比较结构要写清A和B；描述压力时通常用higher/lower或lighter/heavier workload。",
      transferRuleZh: "先确认谁承受压力，再写清与谁比较。",
      severity: "MEDIUM",
      confidence: 0.94,
    };
    expect(validateContract("aiIssueJudgment", issue).valid).toBe(true);
    expect(
      validateContract("aiIssueJudgment", {
        ...issue,
        skillId: "invented_skill",
      }).valid,
    ).toBe(false);
    expect(
      validateContract("aiIssueJudgment", { ...issue, issueId: "server-id" })
        .valid,
    ).toBe(false);
    const essay = `x`.repeat(32) + "much slighter pressure";
    expect(validateAiIssueJudgment(issue, essay).valid).toBe(true);
    expect(
      validateAiIssueJudgment({ ...issue, endOffset: 31 }, essay).valid,
    ).toBe(false);
  });
});

describe("stable issue-evidence categories", () => {
  it("accepts every v1 category while retaining the original generic fallback", () => {
    expect(ISSUE_EVIDENCE_CATEGORIES).toEqual([
      "HARD_GRAMMAR_ERROR",
      "COLLOCATION_NATURALNESS",
      "CHINESE_INFORMATION_ORGANIZATION",
      "LEXICAL_PRECISION",
      "TASK_COVERAGE",
      "ARGUMENT_DEVELOPMENT",
      "COHESION_ORGANIZATION",
      "OPTIONAL_OPTIMIZATION",
    ]);

    for (const category of ISSUE_EVIDENCE_CATEGORIES) {
      const issue = {
        schemaVersion: "1.0.0",
        id: `issue-${category.toLowerCase()}`,
        essayAttemptId: "attempt-v1",
        skillId: "development_relevance",
        startOffset: 0,
        endOffset: 7,
        excerpt: "Example",
        diagnosis: "Synthetic contract fixture.",
        categories: [category],
        hardGrammarError: category === "HARD_GRAMMAR_ERROR",
        severity: "MEDIUM",
        confidence: 0.95,
        adjudicationStatus: "ACCEPTED",
      };
      expect(validateContract("issueEvidence", issue)).toEqual({
        valid: true,
        issues: [],
      });
    }
  });
});

describe("canonical cycle bundle", () => {
  it("validates a complete portable skeleton and rejects secret/internal fields", () => {
    const bundle = cycleBundleFixture();
    expect(validateCycleBundle(bundle)).toEqual({ valid: true, issues: [] });
    expect(
      validateContract("cycleBundle", { ...bundle, providerApiKey: "secret" })
        .valid,
    ).toBe(false);
    expect(
      validateContract("cycleBundle", { ...bundle, chatHistory: [] }).valid,
    ).toBe(false);
  });

  it("enforces append-only concrete entity IDs across round trips", () => {
    const before = cycleBundleFixture();
    const after: CycleBundle = {
      ...before,
      manifest: { ...before.manifest, revision: 2, parentRevision: 1 },
      attempts: [],
    };
    expect(validateCycleBundle(after).valid).toBe(true);
    const roundTrip = validateCycleBundleAppendOnly(before, after);
    expect(roundTrip.valid).toBe(false);
    expect(
      roundTrip.issues.some((issue) => issue.message.includes("attempt-v1")),
    ).toBe(true);
  });

  it("requires a direct persisted parent and immutable question content", () => {
    const before = cycleBundleFixture();
    const branch: CycleBundle = {
      ...before,
      manifest: { ...before.manifest, revision: 3, parentRevision: 2 },
      cycle: {
        ...before.cycle,
        question: { ...before.cycle.question, prompt: "Changed prompt" },
      },
    };
    const result = validateCycleBundleAppendOnly(before, branch);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(
        (issue) => issue.instancePath === "/manifest/parentRevision",
      ),
    ).toBe(true);
    expect(
      result.issues.some((issue) => issue.instancePath === "/cycle/question"),
    ).toBe(true);
  });

  it("requires explicit conflict records to use strict portable fields", () => {
    const bundle = cycleBundleFixture();
    const withConflict: CycleBundle = {
      ...bundle,
      manifest: {
        ...bundle.manifest,
        appendOnlyEntityIds: [
          ...bundle.manifest.appendOnlyEntityIds,
          "conflict-1",
        ],
      },
      conflicts: [
        {
          id: "conflict-1",
          entityType: "ATTEMPT",
          entityId: "attempt-v1",
          fieldPaths: ["/content"],
          localValueHash: HASH,
          incomingValueHash: "b".repeat(64),
          status: "UNRESOLVED",
          detectedAt: ISO,
        },
      ],
    };
    expect(validateCycleBundle(withConflict).valid).toBe(true);
  });
});
