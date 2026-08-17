import { describe, expect, it } from "vitest";

import { findTeachingPrompt } from "./focused-learning";

const prompt = {
  id: "same-id",
  instructionZh: "选择明确呈现中间作用过程的一句。",
  instructionEn: "Choose the sentence that shows the intermediate process.",
  promptEn: "A city adds protected bicycle lanes to busy roads.",
  responseMode: "CHOICE",
  context: "SAME_TOPIC",
  optionsEn: [
    "Cycling infrastructure is beneficial for cities.",
    "Protected lanes reduce perceived danger, so more commuters cycle.",
  ],
  referenceAnswerEn:
    "Protected lanes reduce perceived danger, so more commuters cycle.",
  referenceReasoningZh: "参考选项写出了风险感受变化和行为变化。",
  referenceReasoningEn:
    "The reference connects changed risk perception to changed behaviour.",
  privateProviderInstruction: "Never cross the canonical boundary",
} as const;

function focusedContent(candidate: unknown) {
  return {
    teachingModule: {
      format: "ADAPTIVE_ARTICLE_V1",
      practicePrompts: [candidate],
    },
    paper: {
      items: [
        { id: "same-id", promptEn: "Timed shadow" },
        { id: "timed-only", promptEn: "Timed only" },
      ],
    },
  };
}

describe("focused-learning canonical tutorial lookup", () => {
  it("returns a new ten-field prompt projection and never falls back to paper items", () => {
    const content = focusedContent(prompt);

    expect(findTeachingPrompt(content, "same-id")).toEqual({
      id: "same-id",
      instructionZh: "选择明确呈现中间作用过程的一句。",
      instructionEn: "Choose the sentence that shows the intermediate process.",
      promptEn: "A city adds protected bicycle lanes to busy roads.",
      responseMode: "CHOICE",
      context: "SAME_TOPIC",
      optionsEn: [
        "Cycling infrastructure is beneficial for cities.",
        "Protected lanes reduce perceived danger, so more commuters cycle.",
      ],
      referenceAnswerEn:
        "Protected lanes reduce perceived danger, so more commuters cycle.",
      referenceReasoningZh: "参考选项写出了风险感受变化和行为变化。",
      referenceReasoningEn:
        "The reference connects changed risk perception to changed behaviour.",
    });
    expect(findTeachingPrompt(content, "same-id")).not.toBe(prompt);
    expect(findTeachingPrompt(content, "timed-only")).toBeNull();
  });

  it.each([
    {
      label: "malformed ID",
      candidate: { ...prompt, id: "Not Canonical" },
    },
    {
      label: "empty substantive instruction",
      candidate: { ...prompt, instructionZh: "   " },
    },
    {
      label: "oversized prompt",
      candidate: { ...prompt, promptEn: "x".repeat(701) },
    },
    {
      label: "undersized reference answer",
      candidate: {
        ...prompt,
        responseMode: "SHORT_TEXT",
        optionsEn: [],
        referenceAnswerEn: "x",
      },
    },
    {
      label: "oversized option",
      candidate: {
        ...prompt,
        optionsEn: ["x".repeat(301), prompt.referenceAnswerEn],
      },
    },
    {
      label: "oversized reference reasoning",
      candidate: { ...prompt, referenceReasoningEn: "x".repeat(701) },
    },
    {
      label: "blank choice option",
      candidate: {
        ...prompt,
        optionsEn: ["   ", prompt.referenceAnswerEn],
      },
    },
    {
      label: "oversized bilingual instruction",
      candidate: { ...prompt, instructionEn: "x".repeat(421) },
    },
    {
      label: "oversized reference answer",
      candidate: {
        ...prompt,
        responseMode: "SHORT_TEXT",
        optionsEn: [],
        referenceAnswerEn: "x".repeat(901),
      },
    },
    {
      label: "undersized reference reasoning",
      candidate: { ...prompt, referenceReasoningZh: "太短" },
    },
  ])("rejects a $label", ({ candidate }) => {
    expect(
      findTeachingPrompt(focusedContent(candidate), candidate.id),
    ).toBeNull();
  });

  it("accepts a bounded short-text prompt and copies its options array", () => {
    const shortTextPrompt = {
      ...prompt,
      id: "short-transfer",
      responseMode: "SHORT_TEXT",
      context: "UNSEEN_TOPIC",
      optionsEn: [],
      referenceAnswerEn:
        "Earlier detection gives patients time to begin treatment.",
    } as const;
    const result = findTeachingPrompt(
      focusedContent(shortTextPrompt),
      shortTextPrompt.id,
    );

    expect(result).toEqual({
      id: "short-transfer",
      instructionZh: "选择明确呈现中间作用过程的一句。",
      instructionEn: "Choose the sentence that shows the intermediate process.",
      promptEn: "A city adds protected bicycle lanes to busy roads.",
      responseMode: "SHORT_TEXT",
      context: "UNSEEN_TOPIC",
      optionsEn: [],
      referenceAnswerEn:
        "Earlier detection gives patients time to begin treatment.",
      referenceReasoningZh: "参考选项写出了风险感受变化和行为变化。",
      referenceReasoningEn:
        "The reference connects changed risk perception to changed behaviour.",
    });
    expect(result?.optionsEn).not.toBe(shortTextPrompt.optionsEn);
  });
});
