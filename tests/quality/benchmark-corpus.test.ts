import { describe, expect, it } from "vitest";

import {
  ISSUE_EVIDENCE_CATEGORIES,
  SKILL_IDS,
  validateContract,
  validateCycleBundle,
  type CycleBundle,
  type IssueEvidence,
  type IssueEvidenceCategory,
  type MasteryLevel,
  type SkillEvidenceEvent,
  type SkillId,
  type TrainingCycleState,
} from "@iwc/learning-contracts";
import {
  evaluateAppliedGate,
  evaluateRetainedGate,
  evaluateTransferredGate,
} from "@iwc/learning-core";
import {
  createCycleBundleArchive,
  readCycleBundleArchive,
} from "@iwc/exchange";

import boundarySamplesJson from "../benchmarks/v1/boundary-samples.json";
import cycleSamplesJson from "../benchmarks/v1/cycle-samples.json";
import essaySamplesJson from "../benchmarks/v1/essay-samples.json";
import manifest from "../benchmarks/v1/manifest.json";

const ISO = "2026-08-13T12:00:00.000Z";
const EMPTY_CHECKSUM = "0".repeat(64);

interface BoundarySample {
  readonly id: string;
  readonly level: "sentence" | "paragraph";
  readonly skillId: SkillId;
  readonly text: string;
  readonly excerpt: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly expectedCategories: readonly IssueEvidenceCategory[];
  readonly expectedHardGrammarError: boolean;
  readonly adjudication: "SYNTHETIC_DETERMINISTIC_TARGET";
}

interface EssaySample {
  readonly id: string;
  readonly taskType: string;
  readonly prompt: string;
  readonly response: string;
  readonly wordCount: number;
  readonly targetSkillIds: readonly SkillId[];
  readonly provenance: "ORIGINAL_SYNTHETIC";
  readonly manualReviewStatus: "NOT_ADJUDICATED_FOR_BAND_OR_LANGUAGE_ACCURACY";
}

interface CycleSample {
  readonly id: string;
  readonly scenario: string;
  readonly cycleState: TrainingCycleState;
  readonly gate: "APPLIED" | "RETAINED" | "TRANSFERRED";
  readonly priorHighestLevel: MasteryLevel;
  readonly originalTopicId: string;
  readonly events: readonly SkillEvidenceEvent[];
  readonly expected: {
    readonly passed: boolean;
    readonly noOpportunity: boolean;
  };
}

const boundarySamples = boundarySamplesJson as readonly BoundarySample[];
const essaySamples = essaySamplesJson as readonly EssaySample[];
const cycleSamples = cycleSamplesJson as readonly CycleSample[];

function corpusBundle(sample: CycleSample): CycleBundle {
  const cycleId = `${sample.id}-cycle`;
  const questionId = `${sample.id}-question`;
  const rewriteId = `${sample.id}-rewrite`;
  const mixedReviewId = `${sample.id}-mixed-review`;
  return {
    contractVersion: "1.0.0",
    manifest: {
      bundleId: `${sample.id}-bundle`,
      cycleId,
      source: "WEB",
      exportedAt: ISO,
      revision: 1,
      parentRevision: null,
      appendOnlyEntityIds: [
        cycleId,
        questionId,
        ...sample.events.map((event) => event.id),
        rewriteId,
        mixedReviewId,
      ],
    },
    checksum: {
      algorithm: "SHA-256",
      canonicalization: "JCS",
      value: EMPTY_CHECKSUM,
    },
    cycle: {
      id: cycleId,
      state: sample.cycleState,
      question: {
        id: questionId,
        prompt: "Synthetic benchmark prompt for deterministic evidence gates.",
        instructions: "Write at least 250 words.",
      },
      createdAt: ISO,
      updatedAt: ISO,
    },
    attempts: [],
    assessment: null,
    issueEvidence: [],
    objectives: [],
    lesson: { plan: null, responses: [] },
    evidence: sample.events,
    dueTasks: {
      rewrite: {
        id: rewriteId,
        status: "PLANNED",
        targetRewriteAt: "2026-08-14T12:00:00.000Z",
        dueAt: null,
        lastInstructionExposureAt: null,
        assisted: false,
        prerequisiteSkipped: false,
      },
      transfers: [],
      mixedReview: {
        id: mixedReviewId,
        dueAt: "2026-08-27T12:00:00.000Z",
        status: "PLANNED",
      },
    },
    conflicts: [],
  };
}

describe("v1 benchmark manifest", () => {
  it("locks the required corpus sizes and records non-certification limits", () => {
    expect(manifest.corpusVersion).toBe("1.0.0");
    expect(manifest.license).toBe("Apache-2.0");
    expect(boundarySamples).toHaveLength(
      manifest.expectedCounts.boundarySamples,
    );
    expect(essaySamples).toHaveLength(manifest.expectedCounts.essaySamples);
    expect(cycleSamples).toHaveLength(manifest.expectedCounts.cycleSamples);

    const limitations = manifest.limitations.join(" ").toLowerCase();
    expect(limitations).toContain("estimates");
    expect(limitations).toContain("not official");
    expect(limitations).toContain("not been adjudicated");
    expect(limitations).toContain("human-labelled");
    expect(limitations).toContain("does not certify accessibility");
  });
});

describe("52 exact-boundary regression samples", () => {
  it("covers every fixed skill four times with exact UTF-16 offsets", () => {
    expect(boundarySamples).toHaveLength(52);
    expect(new Set(boundarySamples.map((sample) => sample.id)).size).toBe(52);
    expect(new Set(boundarySamples.map((sample) => sample.level))).toEqual(
      new Set(["sentence", "paragraph"]),
    );

    for (const skillId of SKILL_IDS) {
      expect(
        boundarySamples.filter((sample) => sample.skillId === skillId),
      ).toHaveLength(4);
    }

    for (const sample of boundarySamples) {
      expect(sample.text.slice(sample.startOffset, sample.endOffset)).toBe(
        sample.excerpt,
      );
      expect(sample.adjudication).toBe("SYNTHETIC_DETERMINISTIC_TARGET");
      expect(sample.expectedCategories.length).toBeGreaterThan(0);
      for (const category of sample.expectedCategories) {
        expect(ISSUE_EVIDENCE_CATEGORIES).toContain(category);
      }

      const issue: IssueEvidence = {
        schemaVersion: "1.0.0",
        id: `${sample.id}-issue`,
        essayAttemptId: `${sample.id}-attempt`,
        skillId: sample.skillId,
        startOffset: sample.startOffset,
        endOffset: sample.endOffset,
        excerpt: sample.excerpt,
        diagnosis: "Original synthetic target for deterministic regression.",
        categories: sample.expectedCategories,
        hardGrammarError: sample.expectedHardGrammarError,
        severity: "MEDIUM",
        confidence: 0.99,
        adjudicationStatus: "ACCEPTED",
      };
      expect(validateContract("issueEvidence", issue)).toEqual({
        valid: true,
        issues: [],
      });
      expect(sample.expectedCategories.includes("HARD_GRAMMAR_ERROR")).toBe(
        sample.expectedHardGrammarError,
      );
    }
  });

  it("keeps 'much slighter pressure' out of the hard-grammar category", () => {
    const sample = boundarySamples.find((candidate) =>
      candidate.excerpt.includes("much slighter"),
    );
    expect(sample).toBeDefined();
    expect(sample?.expectedHardGrammarError).toBe(false);
    expect(sample?.expectedCategories).toEqual([
      "COLLOCATION_NATURALNESS",
      "CHINESE_INFORMATION_ORGANIZATION",
    ]);
  });
});

describe("12 full-essay pipeline fixtures", () => {
  it("contains original, full-length inputs without invented gold bands", () => {
    expect(essaySamples).toHaveLength(12);
    expect(new Set(essaySamples.map((sample) => sample.id)).size).toBe(12);

    for (const sample of essaySamples) {
      const words = sample.response.trim().split(/\s+/u).filter(Boolean);
      expect(words).toHaveLength(sample.wordCount);
      expect(sample.wordCount).toBeGreaterThanOrEqual(250);
      expect(sample.prompt.trim().length).toBeGreaterThan(0);
      expect(sample.targetSkillIds.length).toBeGreaterThan(0);
      expect(sample.provenance).toBe("ORIGINAL_SYNTHETIC");
      expect(sample.manualReviewStatus).toBe(
        "NOT_ADJUDICATED_FOR_BAND_OR_LANGUAGE_ACCURACY",
      );
      expect(sample).not.toHaveProperty("overallBand");
      expect(sample).not.toHaveProperty("goldBand");
      expect(sample).not.toHaveProperty("score");
      for (const skillId of sample.targetSkillIds) {
        expect(SKILL_IDS).toContain(skillId);
      }
    }
  });
});

describe("6 canonical evidence-gate cycles", () => {
  it("validates each event and reproduces the expected mastery decision", () => {
    expect(cycleSamples).toHaveLength(6);
    expect(new Set(cycleSamples.map((sample) => sample.id)).size).toBe(6);

    for (const sample of cycleSamples) {
      for (const event of sample.events) {
        expect(validateContract("skillEvidenceEvent", event)).toEqual({
          valid: true,
          issues: [],
        });
      }
      const skillId = sample.events[0]?.skillId;
      expect(skillId).toBeDefined();
      if (skillId === undefined) continue;

      const result =
        sample.gate === "APPLIED"
          ? evaluateAppliedGate(skillId, sample.events)
          : sample.gate === "RETAINED"
            ? evaluateRetainedGate(
                skillId,
                sample.priorHighestLevel,
                sample.events,
              )
            : evaluateTransferredGate(
                skillId,
                sample.priorHighestLevel,
                sample.originalTopicId,
                sample.events,
              );

      expect(result.passed, sample.scenario).toBe(sample.expected.passed);
      expect(result.noOpportunity, sample.scenario).toBe(
        sample.expected.noOpportunity,
      );
      expect(result.finalMastery).toBe(false);
    }
  });

  it("round-trips every complete cycle through the canonical ZIP contract", () => {
    for (const sample of cycleSamples) {
      const bundle = corpusBundle(sample);
      expect(validateCycleBundle(bundle)).toEqual({ valid: true, issues: [] });

      const imported = readCycleBundleArchive(createCycleBundleArchive(bundle));
      expect(imported.cycle.id).toBe(bundle.cycle.id);
      expect(imported.evidence.map((event) => event.id)).toEqual(
        sample.events.map((event) => event.id),
      );
      expect(imported.checksum.value).toMatch(/^[a-f0-9]{64}$/u);
      expect(imported.checksum.value).not.toBe(EMPTY_CHECKSUM);
    }
  });
});
