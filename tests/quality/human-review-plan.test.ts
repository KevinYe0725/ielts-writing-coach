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
    const reviews = () => [
      { reviewerId: "reviewer-a", independent: true, reviewedAt },
      { reviewerId: "reviewer-b", independent: true, reviewedAt },
    ];
    const generatedItems = SKILL_IDS.flatMap((skillId, skillIndex) =>
      Array.from({ length: 4 }, (_, index) => ({
        sampleId: `generated-${skillIndex}-${index}`,
        skillId,
        itemType: "SYNTHETIC_VALIDATOR_FIXTURE",
        prompt: "Synthetic validator fixture; not a language-quality sample.",
        reviews: reviews(),
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
        reviews: reviews(),
        adjudicated: { pass: true, rationale: "Synthetic validator fixture." },
        modelJudgment: { pass: true, evidence: "Synthetic fixture evidence." },
      })),
    );
    const criterion = { band: 6, rationale: "Synthetic validator fixture." };
    const essayAdjudications = Array.from({ length: 12 }, (_, index) => ({
      essayId: `essay-${String(index + 1).padStart(3, "0")}`,
      reviews: reviews(),
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
        generatedItemAccepted: 52,
        generatedItemAcceptanceRate: 1,
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
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
