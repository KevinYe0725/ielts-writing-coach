import { describe, expect, it } from "vitest";

import { pedagogyGuidanceFor } from "./pedagogy-knowledge";

describe("runtime pedagogy knowledge", () => {
  it("gives assessment an evidence-first diagnostic contract", () => {
    const guidance = pedagogyGuidanceFor("ielts_assessment");

    expect(guidance).toContain("exact learner evidence");
    expect(guidance).toContain("optional style");
    expect(guidance).toContain("AI estimate");
    expect(guidance).toContain("paragraph");
    expect(guidance).not.toContain("eight-question paper");
  });

  it("gives paper generation a one-place instruction contract", () => {
    const guidance = pedagogyGuidanceFor("exercise_generation");

    expect(guidance).toContain("one visible instruction");
    expect(guidance).toContain("must not add a requirement");
    expect(guidance).toContain("different contexts");
    expect(guidance).toContain("teach the decision rule before testing it");
    expect(guidance).not.toContain("estimated half-band");
  });

  it("makes paper evaluation evidence-based and non-blocking", () => {
    const guidance = pedagogyGuidanceFor("paragraph_evaluation");

    expect(guidance).toContain("immutable answer sheet");
    expect(guidance).toContain("Blank answers are NOT_SCORABLE");
    expect(guidance).toContain("never trap");
  });
});
