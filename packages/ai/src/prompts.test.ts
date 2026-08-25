import { describe, expect, it } from "vitest";

import { AI_TASK_KINDS, PROMPT_REGISTRY } from "./prompts";

describe("question-bank refill prompt contract", () => {
  it("registers the independently versioned shared-bank task", () => {
    expect(AI_TASK_KINDS).toContain("question_bank_refill");
    expect(PROMPT_REGISTRY.question_bank_refill).toMatchObject({
      task: "question_bank_refill",
      version: "1.0.0",
      rubricVersion: "iwc-question-bank-refill-1.0.0",
    });
  });
});
