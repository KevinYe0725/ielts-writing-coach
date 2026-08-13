import { describe, expect, it } from "vitest";

import {
  sanitizePracticePaperJudgment,
  validateFocusedLearningPackage,
  validatePracticePaperContent,
  type FocusedLearningPackage,
  type PracticePaperContent,
  type PracticePaperJudgment,
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

function learningPackage(): FocusedLearningPackage {
  return {
    teachingModule: {
      targetTitleZh: "用原因—机制—结果完整表达观点",
      targetTitleEn: "Develop a cause–mechanism–result chain",
      whyItMattersZh: "原文往往从观点直接跳到结果，读者看不到中间过程。",
      whyItMattersEn:
        "The essay often jumps from a claim to a result without explaining the process.",
      currentPattern: "Children learn quickly, so early lessons are useful.",
      decisionRuleZh: "先写原因，再写它如何产生影响，最后落到可观察的结果。",
      decisionRuleEn:
        "State the cause, explain how it works, and finish with an observable result.",
      knowledgeCards: [
        {
          titleZh: "观点不是论证",
          explanationZh:
            "观点只说明你相信什么；论证还要回答为什么以及如何发生。",
          exampleEn:
            "Regular exposure makes common patterns familiar, so later study requires less effort.",
        },
        {
          titleZh: "机制必须可理解",
          explanationZh:
            "中间步骤要能解释原因怎样推动结果，而不是换一种说法重复观点。",
          exampleEn:
            "Daily use builds automatic recall, which frees attention for more complex tasks.",
        },
        {
          titleZh: "结果要具体",
          explanationZh:
            "结果应落到学习、行为或社会影响，而不是只写it is beneficial。",
          exampleEn:
            "As a result, pupils can participate more confidently in later lessons.",
        },
      ],
      expressionBank: [
        {
          expressionEn: "This allows … to …",
          functionZh: "连接机制与结果",
          usageZh: "allow后接宾语和to do。",
          exampleEn:
            "This allows learners to process new material more efficiently.",
        },
        {
          expressionEn: "Over time, …",
          functionZh: "引出累积结果",
          usageZh: "用于确实需要时间积累的变化。",
          exampleEn: "Over time, repeated exposure builds confidence.",
        },
      ],
      workedExample: {
        taskZh: "说明早期语言接触为什么能降低后续学习难度。",
        weakAnswerEn: "Children learn quickly, so language lessons are useful.",
        thinkingStepsZh: [
          "原因：儿童经常接触声音和基本句型。",
          "机制：重复使这些模式逐渐熟悉。",
          "结果：正式学习时理解新内容所需的努力更少。",
        ],
        improvedAnswerEn:
          "Regular exposure makes basic sounds and patterns familiar, so children need less effort to process new material when formal study becomes more demanding.",
        explanationZh:
          "改写补上了可理解的中间过程，并把好处落到了具体学习结果。",
      },
      quickChecks: [
        {
          promptZh: "下列哪一句包含中间机制？",
          optionsZh: [
            "A. 早学语言很好。",
            "B. 重复接触使常见模式变熟悉，因此以后理解更快。",
          ],
          answerZh: "B",
          explanationZh: "B说明了重复接触如何转化为后续理解优势。",
        },
        {
          promptZh: "把it is beneficial改成一个可观察的学习结果。",
          optionsZh: [],
          answerZh:
            "例如：learners can process new material with less effort。",
          explanationZh: "结果落到了学习者可以做什么。",
        },
      ],
      readyChecklistZh: [
        "我能区分观点、机制和结果。",
        "我能在不套用示例原句的情况下写出完整链条。",
        "我知道何时使用结果表达，而不是只写beneficial。",
      ],
    },
    paper: paper(),
  };
}

describe("complete practice paper contract", () => {
  it("accepts one teaching package whose target matches the timed paper", () => {
    expect(validateFocusedLearningPackage(learningPackage())).toBe(true);
    const mismatched = learningPackage();
    expect(
      validateFocusedLearningPackage({
        ...mismatched,
        paper: {
          ...mismatched.paper,
          objectiveZh: "练习一个完全不同的目标。",
        },
      }),
    ).toBe(false);
  });

  it("rejects shallow teaching without thinking steps or usable expressions", () => {
    const value = learningPackage();
    expect(
      validateFocusedLearningPackage({
        ...value,
        teachingModule: {
          ...value.teachingModule,
          expressionBank: [],
          workedExample: {
            ...value.teachingModule.workedExample,
            thinkingStepsZh: [],
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts only the exact 8-question, 60-minute product shape", () => {
    expect(validatePracticePaperContent(paper())).toBe(true);
    expect(
      validatePracticePaperContent({
        ...paper(),
        items: paper().items.slice(0, 7),
      }),
    ).toBe(false);
    const hiddenMinute = paper();
    const changedItems = [...hiddenMinute.items];
    changedItems[0] = { ...changedItems[0]!, suggestedMinutes: 6 };
    expect(
      validatePracticePaperContent({ ...hiddenMinute, items: changedItems }),
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
