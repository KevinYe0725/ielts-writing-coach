import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { SKILL_IDS } from "@iwc/learning-contracts";

import plan from "../human-review/v1/review-plan.json";
import template from "../human-review/v1/review-run.template.json";

describe("v1 human-review package", () => {
  it("locks stratified coverage and the PRD's generated-item threshold", () => {
    expect(plan.protocolVersion).toBe("1.0.0");
    expect(plan.status).toBe("NOT_RUN");
    expect(plan.generatedItemReview.minimumItems).toBe(52);
    expect(plan.generatedItemReview.minimumPerSkill).toBe(4);
    expect(plan.generatedItemReview.requiredSkillIds).toEqual(SKILL_IDS);
    expect(plan.generatedItemReview.minimumAcceptanceRate).toBe(0.95);
    expect(plan.generatedItemReview.acceptanceRule).toBe(
      "ALL_REQUIRED_CRITERIA_PASS",
    );
    expect(plan.generatedItemReview.reviewersPerItem).toBe(2);
    expect(plan.generatedItemReview.providerPolicy).toContain("NO_MOCK");
  });

  it("requires a separately labelled open-response set and all 12 essays", () => {
    expect(plan.openResponseReview.minimumResponses).toBe(26);
    expect(plan.openResponseReview.minimumPerSkill).toBe(2);
    expect(plan.openResponseReview.requiredSkillIds).toEqual(SKILL_IDS);
    expect(plan.openResponseReview.responseLevels).toEqual([
      "sentence",
      "paragraph",
    ]);
    expect(plan.openResponseReview.passThresholdPolicy).toContain(
      "BEFORE_MODEL_EXECUTION",
    );
    expect(plan.essayAdjudication.requiredEssays).toBe(12);
    expect(plan.essayAdjudication.status).toBe("NOT_ADJUDICATED");
  });

  it("cannot be mistaken for a completed or certified result", () => {
    expect(template.status).toBe("NOT_RUN");
    expect(template.provider).toBeNull();
    expect(template.generatedItems).toEqual([]);
    expect(template.openResponses).toEqual([]);
    expect(template.essayAdjudications).toEqual([]);
    expect(template.summary).toBeNull();
    expect(
      [...plan.limitations, ...template.limitations].join(" ").toLowerCase(),
    ).toContain("not official ielts");
  });

  it("fails clearly when the completed release review file is absent", () => {
    const validator = fileURLToPath(
      new URL("./validate-human-review.mjs", import.meta.url),
    );
    const result = spawnSync(
      process.execPath,
      [validator, "/definitely-missing/iwc-review-run.json"],
      { encoding: "utf8" },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("A completed human-review run is required");
    expect(result.stderr).not.toContain("node:fs:");
  });

  it("rejects the NOT_RUN template and accepts an internally consistent synthetic validator fixture", () => {
    const validator = fileURLToPath(
      new URL("./validate-human-review.mjs", import.meta.url),
    );
    const templatePath = fileURLToPath(
      new URL("../human-review/v1/review-run.template.json", import.meta.url),
    );
    const pending = spawnSync(process.execPath, [validator, templatePath], {
      encoding: "utf8",
    });
    expect(pending.status).not.toBe(0);
    expect(pending.stderr).toContain("status must be COMPLETE");

    const reviewedAt = "2026-08-13T12:00:00.000Z";
    const generatedReviews = () => [
      {
        reviewerId: "reviewer-a",
        independent: true,
        reviewedAt,
        labels: {
          goalClarity: true,
          answerDeterminacy: true,
          meaningPreservation: true,
          languageNaturalness: true,
        },
        rationale: "Synthetic validator fixture.",
      },
      {
        reviewerId: "reviewer-b",
        independent: true,
        reviewedAt,
        labels: {
          goalClarity: true,
          answerDeterminacy: true,
          meaningPreservation: true,
          languageNaturalness: true,
        },
        rationale: "Synthetic validator fixture.",
      },
    ];
    const openReviews = (pass: boolean) => [
      {
        reviewerId: "reviewer-a",
        independent: true,
        reviewedAt,
        pass,
        rationale: "Synthetic validator fixture.",
      },
      {
        reviewerId: "reviewer-b",
        independent: true,
        reviewedAt,
        pass,
        rationale: "Synthetic validator fixture.",
      },
    ];
    const essayReviews = () => [
      {
        reviewerId: "reviewer-a",
        independent: true,
        reviewedAt,
        overallBand: 6,
        criteria: {
          TR: { band: 6, rationale: "Synthetic validator fixture." },
          CC: { band: 6, rationale: "Synthetic validator fixture." },
          LR: { band: 6, rationale: "Synthetic validator fixture." },
          GRA: { band: 6, rationale: "Synthetic validator fixture." },
        },
      },
      {
        reviewerId: "reviewer-b",
        independent: true,
        reviewedAt,
        overallBand: 6,
        criteria: {
          TR: { band: 6, rationale: "Synthetic validator fixture." },
          CC: { band: 6, rationale: "Synthetic validator fixture." },
          LR: { band: 6, rationale: "Synthetic validator fixture." },
          GRA: { band: 6, rationale: "Synthetic validator fixture." },
        },
      },
    ];
    const generatedItems = SKILL_IDS.flatMap((skillId, skillIndex) =>
      Array.from({ length: 4 }, (_, index) => ({
        sampleId: `generated-${skillIndex}-${index}`,
        skillId,
        itemType: "SYNTHETIC_VALIDATOR_FIXTURE",
        prompt: "Synthetic validator fixture; not a language-quality sample.",
        reviews: generatedReviews(),
        adjudicated: {
          goalClarity: true,
          answerDeterminacy: true,
          meaningPreservation: true,
          languageNaturalness: !(skillIndex === 0 && index === 0),
          accepted: !(skillIndex === 0 && index === 0),
          adjudicatorId: "reviewer-a",
          adjudicatedAt: reviewedAt,
        },
      })),
    );
    const openResponses = SKILL_IDS.flatMap((skillId, skillIndex) =>
      (["sentence", "paragraph"] as const).map((level, index) => {
        const pass = (skillIndex + index) % 2 === 0;
        return {
          sampleId: `open-${skillIndex}-${index}`,
          skillId,
          level,
          prompt: "Synthetic validator prompt.",
          answer: "Synthetic fixture evidence appears in this answer.",
          reviews: openReviews(pass),
          adjudicated: {
            pass,
            rationale: "Synthetic validator fixture.",
            adjudicatorId: "reviewer-a",
            adjudicatedAt: reviewedAt,
          },
          modelJudgment: {
            pass,
            evidence: "Synthetic fixture evidence",
            confidence: 0.8,
          },
        };
      }),
    );
    const criterion = { band: 6, rationale: "Synthetic validator fixture." };
    const essayAdjudications = Array.from({ length: 12 }, (_, index) => ({
      essayId: `essay-${String(index + 1).padStart(3, "0")}`,
      reviews: essayReviews(),
      adjudicated: {
        overallBand: 6,
        adjudicatorId: "reviewer-a",
        adjudicatedAt: reviewedAt,
        criteria: {
          TR: criterion,
          CC: criterion,
          LR: criterion,
          GRA: criterion,
        },
      },
    }));
    const run = {
      ...template,
      runId: "synthetic-validator-fixture",
      status: "COMPLETE",
      startedAt: reviewedAt,
      completedAt: reviewedAt,
      provider: "synthetic-validator-provider",
      modelId: "synthetic-validator-model",
      promptVersion: "synthetic@1.0.0",
      rubricVersion: "synthetic@1.0.0",
      reviewers: [
        {
          id: "reviewer-a",
          qualification: "Synthetic validator fixture",
          consentToPublishDeidentifiedReview: true,
        },
        {
          id: "reviewer-b",
          qualification: "Synthetic validator fixture",
          consentToPublishDeidentifiedReview: true,
        },
      ],
      openResponsePassThresholdsDeclaredAt: reviewedAt,
      generatedItems,
      openResponses,
      essayAdjudications,
      summary: {
        generatedItemDenominator: 52,
        generatedItemAccepted: 51,
        generatedItemAcceptanceRate: 51 / 52,
        openResponseDenominator: 26,
        essayDenominator: 12,
      },
    };
    const directory = mkdtempSync(join(tmpdir(), "iwc-human-review-"));
    const runPath = join(directory, "synthetic-run.json");
    try {
      writeFileSync(runPath, JSON.stringify(run), "utf8");
      const complete = spawnSync(process.execPath, [validator, runPath], {
        encoding: "utf8",
      });
      expect(complete.stderr).toBe("");
      expect(complete.status).toBe(0);
      expect(complete.stdout).toContain("internally consistent");

      openResponses[0]!.modelJudgment.confidence = 1.2;
      essayAdjudications[0]!.reviews[0]!.criteria.TR.band = 10;
      writeFileSync(runPath, JSON.stringify(run), "utf8");
      const outOfRange = spawnSync(process.execPath, [validator, runPath], {
        encoding: "utf8",
      });
      expect(outOfRange.status).not.toBe(0);
      expect(outOfRange.stderr).toContain(
        "model confidence must be between 0 and 1",
      );
      expect(outOfRange.stderr).toContain(
        "essay review bands must use IELTS half-band values from 0 to 9",
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("rejects placeholder independent reviews that contain no reviewer judgment", () => {
    const validator = fileURLToPath(
      new URL("./validate-human-review.mjs", import.meta.url),
    );
    const reviewedAt = "2026-08-13T12:00:00.000Z";
    const reviewers = [
      {
        id: "reviewer-a",
        qualification: "Synthetic validator fixture",
        consentToPublishDeidentifiedReview: true,
      },
      {
        id: "reviewer-b",
        qualification: "Synthetic validator fixture",
        consentToPublishDeidentifiedReview: true,
      },
    ];
    const emptyReviews = [
      { reviewerId: "reviewer-a", independent: true, reviewedAt },
      { reviewerId: "reviewer-b", independent: true, reviewedAt },
    ];
    const generatedItems = SKILL_IDS.flatMap((skillId, skillIndex) =>
      Array.from({ length: 4 }, (_, index) => ({
        sampleId: `generated-${skillIndex}-${index}`,
        skillId,
        itemType: "SYNTHETIC_VALIDATOR_FIXTURE",
        prompt: "Synthetic validator fixture; not a quality sample.",
        reviews: emptyReviews,
        adjudicated: {
          goalClarity: true,
          answerDeterminacy: true,
          meaningPreservation: true,
          languageNaturalness: true,
          accepted: true,
          adjudicatorId: "reviewer-a",
          adjudicatedAt: reviewedAt,
        },
      })),
    );
    const openResponses = SKILL_IDS.flatMap((skillId, skillIndex) =>
      (["sentence", "paragraph"] as const).map((level, index) => ({
        sampleId: `open-${skillIndex}-${index}`,
        skillId,
        level,
        reviews: emptyReviews,
        adjudicated: { pass: true, rationale: "Synthetic fixture." },
        modelJudgment: { pass: true, evidence: "Synthetic fixture evidence." },
      })),
    );
    const criterion = { band: 6, rationale: "Synthetic validator fixture." };
    const essayAdjudications = Array.from({ length: 12 }, (_, index) => ({
      essayId:
        index === 0
          ? "not-a-locked-benchmark"
          : `essay-${String(index + 1).padStart(3, "0")}`,
      reviews: emptyReviews,
      adjudicated: {
        overallBand: 6,
        criteria: {
          TR: criterion,
          CC: criterion,
          LR: criterion,
          GRA: criterion,
        },
      },
    }));
    const incompleteRun = {
      protocolVersion: "1.0.0",
      runId: "placeholder-review-fixture",
      status: "COMPLETE",
      startedAt: reviewedAt,
      completedAt: reviewedAt,
      provider: "synthetic-validator-provider",
      modelId: "synthetic-validator-model",
      promptVersion: "synthetic@1.0.0",
      rubricVersion: "synthetic@1.0.0",
      corpusVersion: "1.0.0",
      reviewers,
      openResponsePassThresholdsDeclaredAt: reviewedAt,
      generatedItems,
      openResponses,
      essayAdjudications,
      summary: {
        generatedItemDenominator: 52,
        generatedItemAccepted: 52,
        generatedItemAcceptanceRate: 1,
        openResponseDenominator: 26,
        essayDenominator: 12,
      },
      limitations: [
        "AI-generated IELTS bands are estimates, not official IELTS results.",
      ],
    };
    const directory = mkdtempSync(join(tmpdir(), "iwc-empty-reviews-"));
    const runPath = join(directory, "incomplete-run.json");
    try {
      writeFileSync(runPath, JSON.stringify(incompleteRun), "utf8");
      const result = spawnSync(process.execPath, [validator, runPath], {
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "independent generated-item reviews must include all four labels",
      );
      expect(result.stderr).toContain(
        "independent open-response reviews must include pass and rationale",
      );
      expect(result.stderr).toContain(
        "independent essay reviews must include four criterion bands",
      );
      expect(result.stderr).toContain(
        "open-response prompt, answer, and exact model evidence are required",
      );
      expect(result.stderr).toContain(
        "open-response adjudicator and adjudicatedAt are required",
      );
      expect(result.stderr).toContain(
        "essay adjudications must use the locked benchmark essay IDs",
      );
      expect(result.stderr).toContain(
        "essay adjudicator and adjudicatedAt are required",
      );
      expect(result.stderr).toContain(
        "generated-item review must retain both accepted and rejected samples",
      );
      expect(result.stderr).toContain(
        "open-response review must include both pass and fail cases",
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
