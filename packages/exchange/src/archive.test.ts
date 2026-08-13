import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import type { CycleBundle } from "@iwc/learning-contracts";

import {
  assertNoSecrets,
  canonicalJson,
  createCycleBundleArchive,
  createLearningRecordArchive,
  readCycleBundleArchive,
  sha256Hex,
} from "./index";

const ISO = "2026-08-13T00:00:00.000Z";

function cycleBundleFixture(): CycleBundle {
  return {
    contractVersion: "1.0.0",
    manifest: {
      bundleId: "archive-bundle-1",
      cycleId: "archive-cycle-1",
      source: "WEB",
      exportedAt: ISO,
      revision: 1,
      parentRevision: null,
      appendOnlyEntityIds: [
        "archive-cycle-1",
        "archive-question-1",
        "archive-attempt-v1",
        "archive-rewrite-1",
        "archive-mixed-review-1",
      ],
    },
    checksum: {
      algorithm: "SHA-256",
      canonicalization: "JCS",
      value: "0".repeat(64),
    },
    cycle: {
      id: "archive-cycle-1",
      state: "SUBMITTED",
      question: {
        id: "archive-question-1",
        prompt:
          "Some schools teach languages early. Do the advantages outweigh the disadvantages?",
        instructions: "Write at least 250 words.",
      },
      createdAt: ISO,
      updatedAt: ISO,
    },
    attempts: [
      {
        id: "archive-attempt-v1",
        version: "V1",
        content: "An original synthetic archive fixture.",
        startedAt: ISO,
        submittedAt: ISO,
        wordCount: 6,
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
        id: "archive-rewrite-1",
        status: "PLANNED",
        targetRewriteAt: "2026-08-14T00:00:00.000Z",
        dueAt: null,
        lastInstructionExposureAt: null,
        assisted: false,
        prerequisiteSkipped: false,
      },
      transfers: [],
      mixedReview: {
        id: "archive-mixed-review-1",
        dueAt: "2026-08-27T00:00:00.000Z",
        status: "PLANNED",
      },
    },
    conflicts: [],
  };
}

describe("CycleBundle exchange primitives", () => {
  it("canonicalizes object keys recursively and normalizes negative zero", () => {
    expect(canonicalJson({ z: -0, a: [{ y: 2, x: 1 }] })).toBe(
      '{"a":[{"x":1,"y":2}],"z":0}',
    );
  });

  it("matches the known SHA-256 vector", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("rejects secrets by field and likely token value", () => {
    expect(() => assertNoSecrets({ api_key: "hidden" })).toThrow(
      "Forbidden field",
    );
    expect(() => assertNoSecrets({ refreshToken: "hidden" })).toThrow(
      "Forbidden field",
    );
    expect(() => assertNoSecrets({ one_time_link: "hidden" })).toThrow(
      "Forbidden field",
    );
    expect(() =>
      assertNoSecrets({ note: "sk-this-is-not-allowed-123" }),
    ).toThrow("likely credential");
  });

  it("packages a secret-scanned learner record with JSON and Markdown", () => {
    const archive = createLearningRecordArchive(
      { learner: { name: "Simon" }, essays: ["A short original essay."] },
      "# Learning record\n",
    );
    const files = unzipSync(archive);
    expect(Object.keys(files).sort()).toEqual([
      "learning-record.json",
      "learning-record.md",
      "manifest.json",
    ]);
    expect(strFromU8(files["learning-record.md"]!)).toContain(
      "Learning record",
    );
    expect(() =>
      createLearningRecordArchive({ apiKey: "must-not-leak" }, "report"),
    ).toThrow("Forbidden field");
    expect(() =>
      createLearningRecordArchive(
        { learner: { name: "Simon" } },
        "# Report\n\nsk-custom-format-secret-12345\n",
      ),
    ).toThrow("likely credential");
  });

  it("round-trips a complete canonical CycleBundle ZIP", () => {
    const input = cycleBundleFixture();
    const archive = createCycleBundleArchive(input);
    const imported = readCycleBundleArchive(archive);

    expect(imported.cycle.id).toBe(input.cycle.id);
    expect(imported.attempts).toEqual(input.attempts);
    expect(imported.checksum.value).toMatch(/^[a-f0-9]{64}$/u);
    expect(imported.checksum.value).not.toBe(input.checksum.value);
  });

  it("rejects a CycleBundle ZIP whose signed content was changed", () => {
    const files = unzipSync(createCycleBundleArchive(cycleBundleFixture()));
    const parsed = JSON.parse(
      strFromU8(files["cycle-bundle.json"]!),
    ) as CycleBundle;
    const tampered: CycleBundle = {
      ...parsed,
      attempts: parsed.attempts.map((attempt) => ({
        ...attempt,
        content: `${attempt.content} Tampered after signing.`,
      })),
    };
    const archive = zipSync({
      "manifest.json": files["manifest.json"]!,
      "cycle-bundle.json": strToU8(`${JSON.stringify(tampered)}\n`),
      "report.md": files["report.md"]!,
    });

    expect(() => readCycleBundleArchive(archive)).toThrow(
      "checksum does not match",
    );
  });
});
