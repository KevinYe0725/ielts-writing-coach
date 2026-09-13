import { describe, expect, it } from "vitest";

import type {
  TeachingPracticePrompt,
  TeachingSectionMarkdown,
} from "@/lib/client/types";

import { buildTeachingPages, splitTeachingMarkdown } from "./teaching-pages";

const section = (markdown: string): TeachingSectionMarkdown => ({
  titleEn: "Build the missing link",
  titleZh: "补上缺失的中间步骤",
  markdown,
});

const prompt = {
  id: "prompt-1",
  instructionEn: "Write one sentence.",
  instructionZh: "写一句话。",
  optionsEn: [],
  promptEn: "Explain the change.",
  context: "SAME_TOPIC",
  referenceAnswerEn: "The process becomes visible.",
  referenceReasoningEn: "It names the intermediate change.",
  referenceReasoningZh: "它写出了中间变化。",
  responseMode: "SHORT_TEXT",
} as const satisfies TeachingPracticePrompt;

describe("knowledge-point teaching pages", () => {
  it("splits on semantic blocks without breaking a block", () => {
    expect(
      splitTeachingMarkdown("第一块\n\n> A complete example.\n\n第二块", 20),
    ).toEqual(["第一块", "> A complete example.", "第二块"]);
  });

  it("derives knowledge-point titles and gives practice its own step", () => {
    const pages = buildTeachingPages(
      [
        section(
          "**中间机制**\n\n说明原因如何带来结果。\n\n### 先写行为变化\n\n继续解释。",
        ),
      ],
      { bySection: [[prompt]], trailing: [] },
      30,
    );

    expect(pages.map((page) => page.kind)).toEqual([
      "knowledge",
      "knowledge",
      "practice",
      "finish",
    ]);
    expect(pages[0]).toMatchObject({
      pointTitleZh: "中间机制",
    });
    expect(pages[1]).toMatchObject({
      pointTitleZh: "先写行为变化",
    });
    expect(pages[2]).toMatchObject({
      kind: "practice",
      practicePrompts: [prompt],
    });

    const fallback = buildTeachingPages(
      [section("如果结论依赖条件，就把关键条件写出来。")],
      { bySection: [[]], trailing: [] },
    );
    expect(fallback[0]).toMatchObject({
      pointTitleZh: "如果结论依赖条件，就把关键条件写出来",
    });
  });

  it("keeps trailing exercises in a dedicated knowledge-point step", () => {
    const pages = buildTeachingPages(
      [section("核心概念")],
      { bySection: [[]], trailing: [prompt] },
      720,
    );
    expect(pages.at(-2)).toMatchObject({
      kind: "practice",
      practicePrompts: [prompt],
    });
    expect(pages.at(-1)).toEqual({ kind: "finish" });
  });
});
