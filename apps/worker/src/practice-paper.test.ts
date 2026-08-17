import { describe, expect, it } from "vitest";

import {
  sanitizePracticePaperJudgment,
  validateFocusedLearningPackage,
  validatePracticePaperContent,
  type FocusedLearningPackage,
  type PracticePaperContent,
  type PracticePaperJudgment,
  type TeachingPracticePrompt,
} from "./learning";

const sections = [
  "FOUNDATION",
  "FOUNDATION",
  "REPAIR",
  "REPAIR",
  "GENERATION",
  "GENERATION",
  "INTEGRATION",
  "INTEGRATION",
] as const;

function paper(): PracticePaperContent {
  return {
    titleZh: "核心问题专项训练卷",
    titleEn: "Focused practice paper",
    objectiveZh:
      "用原因—机制—结果完整表达观点：通过完整试卷检验本篇作文的最高优先问题。",
    objectiveEn:
      "Test the priority issue from this essay in one complete paper.",
    instructionsZh: ["限时60分钟。", "完成后统一交卷。", "只按公开标准批改。"],
    instructionsEn: [
      "Work for 60 minutes.",
      "Submit all answers together.",
      "Only published criteria apply.",
    ],
    items: sections.map((section, index) => ({
      section,
      titleZh: `第${index + 1}题`,
      titleEn: `Question ${index + 1}`,
      instructionZh: "写一个8至60词的英文回答；覆盖题面明确列出的全部要求。",
      promptEn: `Write one complete English answer for context ${index + 1}.`,
      sourceText:
        section === "REPAIR" ? `Flawed source sentence ${index + 1}.` : "",
      responseMode: "sentence" as const,
      options: [],
      acceptedAnswers: [],
      answerExplanationZh: "回答必须覆盖题面列出的全部要求。",
      suggestedMinutes: [5, 5, 7, 7, 8, 8, 10, 10][index]!,
      minimumWords: 8,
      maximumWords: 60,
      publicCriteria: [
        {
          labelZh: "题意完成",
          labelEn: "Task completion",
          descriptionZh: "覆盖题面明确列出的全部要求。",
          descriptionEn: "Cover every requirement stated in the question.",
          weight: 100,
        },
      ],
    })),
  };
}

const practicePrompts = (): TeachingPracticePrompt[] => [
  {
    id: "spot-the-mechanism",
    instructionZh: "选出真正写出中间机制的一句英文。",
    instructionEn: "Choose the English sentence that states an intermediate mechanism.",
    promptEn: "A city creates protected cycle lanes on busy roads.",
    responseMode: "CHOICE",
    context: "SAME_TOPIC",
    optionsEn: [
      "Cycle lanes are beneficial for cities.",
      "Protected lanes reduce perceived danger, so more commuters feel able to cycle regularly.",
      "Many cities have busy roads.",
    ],
    referenceAnswerEn:
      "Protected lanes reduce perceived danger, so more commuters feel able to cycle regularly.",
    referenceReasoningZh: "它说明了道路设计先改变风险感受，再改变通勤选择。",
    referenceReasoningEn:
      "It shows infrastructure changing perceived risk before it changes commuter choices.",
  },
  {
    id: "workplace-mechanism",
    instructionZh: "用一句英文补出灵活工作与生产力之间的中间机制。",
    instructionEn:
      "Write one English sentence that supplies the mechanism between flexible work and productivity.",
    promptEn: "Flexible schedules can improve employee productivity because …",
    responseMode: "SHORT_TEXT",
    context: "SAME_TOPIC",
    optionsEn: [],
    referenceAnswerEn:
      "Employees can reserve their most demanding tasks for the hours when they concentrate best.",
    referenceReasoningZh: "参考答案说明了灵活时间如何改变任务安排。",
    referenceReasoningEn:
      "The reference explains how flexible time changes task scheduling.",
  },
  {
    id: "environment-transfer",
    instructionZh: "换到环境话题，用两句英文写出一条新的机制链。",
    instructionEn:
      "Move to an environmental topic and write a new two-sentence mechanism chain.",
    promptEn:
      "Explain how charging households for excess waste could reduce landfill use.",
    responseMode: "SHORT_TEXT",
    context: "UNSEEN_TOPIC",
    optionsEn: [],
    referenceAnswerEn:
      "A direct charge makes unnecessary disposal more expensive. Households therefore have a reason to reuse products and separate recyclable material.",
    referenceReasoningZh: "价格变化先影响选择，再影响进入填埋场的废物量。",
    referenceReasoningEn:
      "The price change affects choices before it changes the amount of landfill waste.",
  },
];

type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;
type MutablePackage = Mutable<FocusedLearningPackage>;

function teachingPackage(): MutablePackage {
  const coreAbilityZh = "用原因机制结果完整展开观点";
  const coreAbilityEn =
    "Develop one claim through a cause, mechanism, and result";
  const pkg: FocusedLearningPackage = {
    teachingModule: {
      format: "ADAPTIVE_ARTICLE_V1",
      titleZh: "别让论证从原因直接跳到结果",
      titleEn: "Build the missing link in a causal argument",
      introductionMarkdown:
        "本教程集中训练一件事：把中间发生的过程说清楚，让读者能够一步步跟上你的推理，而不是从原因直接跳到结论。",
      estimatedMinutes: 28,
      coreAbilityZh,
      coreAbilityEn,
      sections: [
        {
          titleZh: "看见被跳过的一步",
          titleEn: "See the missing link",
          markdown:
            "原因告诉读者起点，结果告诉读者终点，机制说明变化如何从起点走到终点。机制句必须增加一个新的中间步骤。",
        },
        {
          titleZh: "从一个问题推出机制",
          titleEn: "Build the mechanism step by step",
          markdown:
            "先找到直接变化，再追问这会改变什么，最后得到一个可观察的结果。用“直接变化→行为变化→可观察结果”检查链条。",
        },
        {
          titleZh: "换一个话题验证方法",
          titleEn: "Transfer the method",
          markdown:
            "1. 先确认题目要求读者看见的关系。2. 用具体信息完成这个关系。3. 换一个话题后再检查方法是否仍然成立。",
        },
      ],
      practicePrompts: practicePrompts(),
    },
    paper: {
      ...paper(),
      objectiveZh: `${coreAbilityZh}：通过完整试卷在新语境中验证这一能力。`,
      objectiveEn: `${coreAbilityEn}: verify this ability in new contexts through a complete paper.`,
    },
  };
  return pkg as unknown as MutablePackage;
}

function validateFixture(
  value: MutablePackage,
  version1Essay?: string,
): boolean {
  try {
    return validateFocusedLearningPackage(
      value as unknown as FocusedLearningPackage,
      version1Essay,
    );
  } catch {
    return false;
  }
}

describe("markdown teaching article + timed paper contract", () => {
  it("accepts a valid markdown teaching article and matching paper", () => {
    expect(validateFixture(teachingPackage())).toBe(true);
  });

  it("requires the paper objective to contain the teaching core ability", () => {
    const value = teachingPackage();
    value.paper = { ...value.paper, objectiveZh: "练习一个完全不同的目标。" };
    expect(validateFixture(value)).toBe(false);
  });

  it("requires at least two sections with substantive markdown", () => {
    const one = teachingPackage();
    one.teachingModule.sections = one.teachingModule.sections.slice(0, 1);
    expect(validateFixture(one)).toBe(false);

    const thin = teachingPackage();
    thin.teachingModule.sections[0] = {
      ...thin.teachingModule.sections[0]!,
      markdown: "太短",
    };
    expect(validateFixture(thin)).toBe(false);
  });

  it("keeps coreAbility within its length limits", () => {
    const value = teachingPackage();
    value.teachingModule.coreAbilityEn = "a".repeat(161);
    expect(validateFixture(value)).toBe(false);
  });

  it("rejects practice that only asks the learner to recognise answers", () => {
    const value = teachingPackage();
    for (const prompt of value.teachingModule.practicePrompts) {
      prompt.responseMode = "CHOICE";
      prompt.optionsEn = [
        prompt.referenceAnswerEn,
        "A plausible but incorrect alternative.",
        "Another plausible but incorrect alternative.",
      ];
    }
    expect(validateFixture(value)).toBe(false);
  });

  it("rejects practice without an unseen-topic transfer", () => {
    const value = teachingPackage();
    for (const prompt of value.teachingModule.practicePrompts) {
      prompt.context = "SAME_TOPIC";
    }
    expect(validateFixture(value)).toBe(false);
  });

  it("rejects a twelve-word exact quotation from Version 1", () => {
    const quotation =
      "Children learn new language patterns quickly when teachers provide regular classroom exposure.";
    const value = teachingPackage();
    value.teachingModule.sections[0]!.markdown = quotation;
    expect(
      validateFixture(
        value,
        `Opening context. ${quotation} A different sentence follows.`,
      ),
    ).toBe(false);
  });

  it.each([
    ["AI model", "The AI model chose this example for the learner."],
    ["language model", "A language model generated this explanation."],
    ["system prompt", "Follow this system prompt before continuing."],
    ["skill ID", "The skill ID selects the next teaching block."],
  ])("rejects learner-facing English backend vocabulary: %s", (_, leak) => {
    const value = teachingPackage();
    value.teachingModule.sections[0]!.markdown = `${leak} ${"clear ".repeat(20)}`;
    expect(validateFixture(value)).toBe(false);
  });

  it.each([
    ["AI模型", "AI模型选择了当前例句。"],
    ["语言模型", "语言模型生成了这个解释。"],
    ["系统提示词", "请按照系统提示词完成本节内容。"],
  ])("rejects learner-facing Chinese backend vocabulary: %s", (_, leak) => {
    const value = teachingPackage();
    value.teachingModule.sections[0]!.markdown = `${leak} ${"说明".repeat(40)}`;
    expect(validateFixture(value)).toBe(false);
  });

  it("allows ordinary teaching or IELTS-topic prose", () => {
    const value = teachingPackage();
    value.teachingModule.sections[0]!.markdown =
      "A physical model can help pupils understand the shape of a molecule and follow a line of reasoning.";
    expect(validateFixture(value)).toBe(true);
  });

  it("rejects a learner-facing field with 141 English words", () => {
    const value = teachingPackage();
    value.teachingModule.sections[0]!.markdown = Array.from(
      { length: 141 },
      () => "clear",
    ).join(" ");
    expect(validateFixture(value)).toBe(false);
  });

  it("rejects an exact eight-word accepted answer from the later paper", () => {
    const futureAnswer =
      "Libraries give residents reliable access to useful information.";
    const value = teachingPackage();
    const items = [...value.paper.items];
    items[0] = {
      ...items[0]!,
      responseMode: "choice",
      options: [
        { key: "A", labelEn: futureAnswer },
        { key: "B", labelEn: "A plausible but different response." },
        { key: "C", labelEn: "An unrelated response." },
      ],
      acceptedAnswers: ["A"],
      minimumWords: 1,
      maximumWords: 1,
    };
    value.paper = { ...value.paper, items };
    value.teachingModule.sections[0]!.markdown = `A later response could state: ${futureAnswer}`;
    expect(validateFixture(value)).toBe(false);
  });

  it("accepts the 8-question paper shape with a 55–65 minute total", () => {
    expect(validatePracticePaperContent(paper())).toBe(true);
    expect(
      validatePracticePaperContent({
        ...paper(),
        items: paper().items.slice(0, 7),
      }),
    ).toBe(false);
    const offRange = paper();
    const changedItems = [...offRange.items];
    changedItems[0] = { ...changedItems[0]!, suggestedMinutes: 14 };
    expect(
      validatePracticePaperContent({ ...offRange, items: changedItems }),
    ).toBe(false);
  });

  it("rejects a choice answer key that was not shown to the learner", () => {
    const value = paper();
    const changedItems = [...value.items];
    changedItems[0] = {
      ...changedItems[0]!,
      responseMode: "choice",
      options: [
        { key: "A", labelEn: "A" },
        { key: "B", labelEn: "B" },
        { key: "C", labelEn: "C" },
      ],
      acceptedAnswers: ["hidden"],
      minimumWords: 1,
      maximumWords: 1,
    };
    expect(
      validatePracticePaperContent({ ...value, items: changedItems }),
    ).toBe(false);
  });

  it("rejects an internal requirement that is absent from the visible instruction", () => {
    const value = paper();
    const changedItems = [...value.items];
    changedItems[1] = {
      ...changedItems[1]!,
      instructionZh: "用20至35个英文词解释早期接触语言的好处。",
      publicCriteria: [
        {
          labelZh: "机制完整",
          labelEn: "Complete mechanism",
          descriptionZh: "第二句话必须说明长期学习结果。",
          descriptionEn:
            "A second sentence must state the long-term learning result.",
          weight: 100,
        },
      ],
    };
    expect(
      validatePracticePaperContent({ ...value, items: changedItems }),
    ).toBe(false);
  });

  it("rejects vague learner instructions that hide the required output", () => {
    const value = paper();
    const changedItems = [...value.items];
    changedItems[4] = {
      ...changedItems[4]!,
      instructionZh: "请使用本轮目标完成下面的表达。",
    };
    expect(
      validatePracticePaperContent({ ...value, items: changedItems }),
    ).toBe(false);
  });

  it("removes invented evidence and details from already-passed items", () => {
    const items = paper().items.map((_, index) => ({ id: `item-${index}` }));
    const judgment: PracticePaperJudgment = {
      totalScore: 120,
      summaryZh: "整卷已经完成，重点查看不达标题。",
      itemResults: items.map((item, index) => ({
        itemId: item.id,
        status: index === 0 ? "NEEDS_WORK" : "MEETS_STANDARD",
        score: index === 0 ? 40 : 100,
        feedbackZh: "反馈",
        strengthsZh: [],
        problems: [
          {
            criterionLabelZh: "题意完成",
            explanationZh: "证据必须来自答案。",
            evidence: index === 0 ? "invented" : "answer",
          },
        ],
        improvedAnswerEn: "Improved answer.",
        nextStepZh: "下一步",
      })),
    };
    const sanitized = sanitizePracticePaperJudgment({
      paper: { items },
      answers: Object.fromEntries(items.map((item) => [item.id, "answer"])),
      judgment,
    });
    expect(sanitized.totalScore).toBe(92.5);
    expect(sanitized.itemResults[0]?.problems).toEqual([]);
    expect(sanitized.itemResults[1]?.problems).toEqual([]);
    expect(sanitized.itemResults[1]?.improvedAnswerEn).toBe("");
  });

  it("marks an unanswered question as not scorable without inventing analysis", () => {
    const items = paper().items.map((_, index) => ({ id: `item-${index}` }));
    const judgment: PracticePaperJudgment = {
      totalScore: 100,
      summaryZh: "批改摘要",
      itemResults: items.map((item) => ({
        itemId: item.id,
        status: "MEETS_STANDARD",
        score: 100,
        feedbackZh: "达标",
        strengthsZh: [],
        problems: [],
        improvedAnswerEn: "",
        nextStepZh: "继续",
      })),
    };
    const sanitized = sanitizePracticePaperJudgment({
      paper: { items },
      answers: Object.fromEntries(
        items.map((item, index) => [item.id, index === 0 ? "" : "answer"]),
      ),
      judgment,
    });
    expect(sanitized.itemResults[0]).toMatchObject({
      status: "NOT_SCORABLE",
      score: 0,
      problems: [],
    });
    expect(sanitized.totalScore).toBe(87.5);
  });
});
