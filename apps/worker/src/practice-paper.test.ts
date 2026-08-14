import { describe, expect, it } from "vitest";

import {
  sanitizePracticePaperJudgment,
  validateFocusedLearningPackage,
  validatePracticePaperContent,
  type FocusedLearningPackage,
  type PracticePaperContent,
  type PracticePaperJudgment,
} from "./learning";
import { focusedLearningPackageSchema } from "./schemas";

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

type FixtureBlock = {
  kind: string;
  titleZh: string;
  titleEn: string;
  [key: string]: unknown;
};

interface FixtureLearningPackage {
  teachingModule: {
    format: "ADAPTIVE_ARTICLE_V1";
    titleZh: string;
    titleEn: string;
    introductionZh: string;
    introductionEn: string;
    estimatedMinutes: number;
    blueprint: {
      coreAbilityZh: string;
      coreAbilityEn: string;
      difficultyType: string;
      completionStandardZh: string;
      completionStandardEn: string;
      prerequisiteAbilityZh: string;
      prerequisiteAbilityEn: string;
      supportingAbilityZh: string;
      supportingAbilityEn: string;
      selectedBlockKinds: string[];
    };
    sections: {
      anchor: string;
      titleZh: string;
      titleEn: string;
      blocks: FixtureBlock[];
    }[];
    [key: string]: unknown;
  };
  paper: PracticePaperContent;
}

function mechanismPackage(): FixtureLearningPackage {
  const targetZh = "解释原因如何通过中间机制产生结果";
  const targetEn = "Explain how a cause produces a result through a mechanism";
  const teachingModule = {
    format: "ADAPTIVE_ARTICLE_V1" as const,
    titleZh: "别让论证从原因直接跳到结果",
    titleEn: "Build the missing link in a causal argument",
    introductionZh:
      "本教程集中训练一件事：把中间发生的过程说清楚，让读者能够跟上你的推理。",
    introductionEn:
      "This tutorial focuses on making the missing process in a causal argument visible.",
    estimatedMinutes: 18,
    blueprint: {
      coreAbilityZh: targetZh,
      coreAbilityEn: targetEn,
      difficultyType: "REVISES_BUT_CANNOT_GENERATE",
      completionStandardZh:
        "能在两个不同话题中独立写出原因、中间机制和可观察结果。",
      completionStandardEn:
        "Independently write a cause, mechanism, and observable result in two topics.",
      prerequisiteAbilityZh: "能区分原因和结果",
      prerequisiteAbilityEn: "Distinguish a cause from a result",
      supportingAbilityZh: "用代词准确回指前句概念",
      supportingAbilityEn: "Use reference words precisely",
      selectedBlockKinds: [
        "EXPLANATION",
        "CONTRAST",
        "REASONING",
        "PRACTICE",
        "SUMMARY",
      ],
    },
    sections: [
      {
        anchor: "see-the-missing-link",
        titleZh: "看见被跳过的一步",
        titleEn: "See the missing link",
        blocks: [
          {
            kind: "EXPLANATION",
            titleZh: "机制不是重复原因",
            titleEn: "A mechanism is not a repeated cause",
            paragraphsZh: [
              "原因告诉读者起点，结果告诉读者终点，机制说明变化如何从起点走到终点。",
            ],
            paragraphsEn: [
              "A cause supplies the starting condition; a mechanism shows what changes before the result appears.",
            ],
            keyPointZh: "机制句必须增加一个新的中间步骤。",
            keyPointEn: "A mechanism must add a new intermediate step.",
          },
          {
            kind: "CONTRAST",
            titleZh: "同一个观点，差在哪里",
            titleEn: "The same claim with and without a mechanism",
            weakExampleEn:
              "Remote work is flexible, so employees are more productive.",
            strongExampleEn:
              "Remote work removes many daily interruptions, allowing employees to protect longer periods for concentrated tasks and therefore complete demanding work more efficiently.",
            differenceZh:
              "较强的句子补上了“减少打断”和“保留专注时间”两个可理解步骤。",
            differenceEn:
              "The stronger version adds fewer interruptions and longer periods of concentration as the missing process.",
          },
        ],
      },
      {
        anchor: "build-one-step-at-a-time",
        titleZh: "从一个问题推出机制",
        titleEn: "Build the mechanism one step at a time",
        blocks: [
          {
            kind: "REASONING",
            titleZh: "把抽象好处推成可观察结果",
            titleEn: "Reason from an abstract benefit to an observable result",
            scenarioZh: "城市增加自行车道为什么可以改善通勤？",
            scenarioEn: "Why can additional cycle lanes improve commuting?",
            steps: [
              {
                thinkingZh: "先找到直接变化：骑行者不必与汽车争抢道路空间。",
                thinkingEn:
                  "Identify the immediate change: cyclists no longer compete with cars for the same road space.",
              },
              {
                thinkingZh: "再追问这会改变什么：更多人愿意在短途通勤时骑车。",
                thinkingEn:
                  "Ask what behavior changes: more people are willing to cycle on short commutes.",
              },
            ],
            resultEn:
              "Separated cycle lanes make short journeys feel safer, which encourages commuters to replace some car trips and reduces pressure on busy roads.",
            takeawayZh: "用“直接变化→行为变化→可观察结果”检查链条。",
            takeawayEn:
              "Check for an immediate change, a behavior change, and an observable result.",
          },
        ],
      },
      {
        anchor: "try-and-check",
        titleZh: "换一个话题验证方法",
        titleEn: "Transfer the method to a new topic",
        blocks: [
          {
            kind: "PRACTICE",
            titleZh: "两次主动生成",
            titleEn: "Generate two missing mechanisms",
            prompts: [
              {
                id: "workplace-mechanism",
                instructionZh: "用一句英文补出灵活工作与生产力之间的中间机制。",
                instructionEn:
                  "Write one English sentence that supplies the mechanism between flexible work and productivity.",
                promptEn:
                  "Flexible schedules can improve employee productivity because …",
                responseMode: "SHORT_TEXT",
                context: "SAME_TOPIC",
                optionsEn: [],
                referenceAnswerEn:
                  "Employees can reserve their most demanding tasks for the hours when they concentrate best.",
                referenceReasoningZh:
                  "参考答案说明了灵活时间如何改变任务安排。",
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
                referenceReasoningZh:
                  "价格变化先影响选择，再影响进入填埋场的废物量。",
                referenceReasoningEn:
                  "The price change affects choices before it changes the amount of landfill waste.",
              },
            ],
          },
          {
            kind: "SUMMARY",
            titleZh: "下次写作只检查这三件事",
            titleEn: "Three checks for your next essay",
            rulesZh: [
              "原因和结果之间是否出现了新的中间步骤？",
              "中间步骤是否回答了“如何发生”？",
              "结果是否具体到可以被观察？",
            ],
            rulesEn: [
              "Add a new intermediate step between cause and result.",
              "Make the step answer how the change happens.",
              "Finish with a result that could be observed.",
            ],
            selfCheckZh:
              "删掉中间句后，推理是否几乎没有变？如果是，它可能只在重复。",
            selfCheckEn:
              "If removing the middle sentence changes almost nothing, it may only repeat the claim.",
          },
        ],
      },
    ],
  };

  return {
    teachingModule,
    paper: {
      ...paper(),
      objectiveZh: `${targetZh}：通过完整试卷在新语境中验证这一能力。`,
      objectiveEn: `${targetEn}: verify this ability in new contexts through a complete paper.`,
    },
  };
}

function collocationPackage(): FixtureLearningPackage {
  const targetZh = "根据语境选择自然而精确的英语搭配";
  const targetEn = "Choose natural and precise collocations for the context";
  return {
    teachingModule: {
      format: "ADAPTIVE_ARTICLE_V1",
      titleZh: "搭配不是词汇的随意相加",
      titleEn: "Collocation is more than combining correct words",
      introductionZh:
        "这篇教程训练你先辨别语境中的关系，再从看似正确的候选表达中做出稳定选择。",
      introductionEn:
        "This tutorial trains a context-first method for choosing among plausible expressions.",
      estimatedMinutes: 14,
      blueprint: {
        coreAbilityZh: targetZh,
        coreAbilityEn: targetEn,
        difficultyType: "UNSTABLE_CONTROL",
        completionStandardZh:
          "能说明两个候选搭配的语义差异，并在陌生话题中独立选择。",
        completionStandardEn:
          "Explain the difference between alternatives and choose independently in an unseen topic.",
        prerequisiteAbilityZh: "",
        prerequisiteAbilityEn: "",
        supportingAbilityZh: "识别动词的语义视角",
        supportingAbilityEn: "Recognise a verb's semantic perspective",
        selectedBlockKinds: [
          "EXPLANATION",
          "TOOLKIT",
          "PITFALLS",
          "CONTRAST",
          "PRACTICE",
          "SUMMARY",
        ],
      },
      sections: [
        {
          anchor: "choose-by-relationship",
          titleZh: "先判断关系，再选择词组",
          titleEn: "Choose by relationship, not translation",
          blocks: [
            {
              kind: "EXPLANATION",
              titleZh: "自然搭配同时受意义和使用情境限制",
              titleEn: "Natural collocation depends on meaning and context",
              paragraphsZh: [
                "两个词分别正确，不代表它们组合后就是母语者在该语境中的常见选择。",
              ],
              paragraphsEn: [
                "Two individually correct words do not automatically form the usual expression for a particular relationship.",
              ],
              keyPointZh: "先问这个动词通常由什么主语对什么宾语使用。",
              keyPointEn:
                "Check which subjects and objects usually participate in the expression.",
            },
            {
              kind: "TOOLKIT",
              titleZh: "用条件而不是中文释义记搭配",
              titleEn: "Store expressions with their usage conditions",
              tools: [
                {
                  expressionEn: "pose a risk to",
                  functionZh: "说明某事物带来潜在危害",
                  functionEn: "State that something creates a potential danger",
                  conditionZh: "主语是危险来源，宾语是受影响对象。",
                  conditionEn:
                    "The subject is the source of danger and the object is exposed to it.",
                  cautionZh: "不要用人作主语表示他感到担忧。",
                  cautionEn:
                    "Do not use a person as the subject merely because that person feels worried.",
                  exampleEn:
                    "Untreated industrial waste poses a serious risk to river ecosystems.",
                },
              ],
            },
            {
              kind: "PITFALLS",
              titleZh: "两种会让选择失稳的捷径",
              titleEn: "Two shortcuts that make choices unstable",
              items: [
                {
                  patternEn: "learn knowledge",
                  problemZh: "只根据中文“学知识”逐词翻译。",
                  problemEn:
                    "It follows a word-for-word translation instead of the usual English relationship.",
                  betterEn: "acquire knowledge",
                },
                {
                  patternEn: "a heavy improvement",
                  problemZh: "看到“大幅”就直接选择heavy。",
                  problemEn:
                    "It chooses heavy from a dictionary meaning rather than an established combination.",
                  betterEn: "a substantial improvement",
                },
              ],
            },
            {
              kind: "CONTRAST",
              titleZh: "相似词并不承担相同关系",
              titleEn: "Similar words do not express the same relationship",
              weakExampleEn:
                "The policy makes a strong influence on household spending.",
              strongExampleEn:
                "The policy has a substantial influence on household spending.",
              differenceZh:
                "make不influence不构成这个含义下的常见动宾组合；have an influence on才是稳定选择。",
              differenceEn:
                "Have an influence on is the established verb–noun pattern for this meaning.",
            },
          ],
        },
        {
          anchor: "decide-in-new-contexts",
          titleZh: "在新语境中做出选择",
          titleEn: "Decide in new contexts",
          blocks: [
            {
              kind: "PRACTICE",
              titleZh: "先辨别，再独立生成",
              titleEn: "Recognise once, then generate independently",
              prompts: [
                {
                  id: "risk-choice",
                  instructionZh: "选出能表示潜在危害的自然搭配。",
                  instructionEn:
                    "Choose the natural expression for creating a potential danger.",
                  promptEn:
                    "Air pollution may ___ a serious risk to children's health.",
                  responseMode: "CHOICE",
                  context: "SAME_TOPIC",
                  optionsEn: ["pose", "perform", "produce"],
                  referenceAnswerEn: "pose",
                  referenceReasoningZh:
                    "pose a risk to用于危险来源对暴露对象带来潜在危害。",
                  referenceReasoningEn:
                    "Pose a risk to expresses a source of potential danger affecting an exposed object.",
                },
                {
                  id: "health-transfer",
                  instructionZh:
                    "在陌生的健康话题中，用一个自然搭配写一句完整英文。",
                  instructionEn:
                    "Write one complete English sentence with a natural collocation in an unseen health topic.",
                  promptEn:
                    "Explain one effect of prolonged sleep deprivation on workers.",
                  responseMode: "SHORT_TEXT",
                  context: "UNSEEN_TOPIC",
                  optionsEn: [],
                  referenceAnswerEn:
                    "Prolonged sleep deprivation can seriously impair workers' ability to make safe decisions.",
                  referenceReasoningZh:
                    "impair someone's ability to do something清晰表示某因素削弱一种能力。",
                  referenceReasoningEn:
                    "Impair someone's ability to do something expresses a reduction in capability.",
                },
              ],
            },
            {
              kind: "SUMMARY",
              titleZh: "用三个问题管住搭配选择",
              titleEn: "Control collocation choices with three questions",
              rulesZh: [
                "这个表达通常由什么主语发出？",
                "它通常作用于什么对象？",
                "例句中的关系和我当前要表达的关系相同吗？",
              ],
              rulesEn: [
                "Identify the usual subject.",
                "Identify the usual object.",
                "Match the example's relationship to the present context.",
              ],
              selfCheckZh:
                "我能说明这个搭配在本句中为什么自然，而不是只说“课上见过”吗？",
              selfCheckEn:
                "Can I explain why this combination fits the relationship rather than only recall seeing it?",
            },
          ],
        },
      ],
    },
    paper: {
      ...paper(),
      objectiveZh: `${targetZh}：在八道题中练习语境判断与独立生成。`,
      objectiveEn: `${targetEn}: practise contextual decisions and independent generation in eight questions.`,
    },
  };
}

function validateFixture(
  value: FixtureLearningPackage,
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

function actualKinds(value: FixtureLearningPackage): string[] {
  return [
    ...new Set(
      value.teachingModule.sections.flatMap((section) =>
        section.blocks.map((block) => block.kind),
      ),
    ),
  ];
}

function syncSelectedKinds(value: FixtureLearningPackage): void {
  value.teachingModule.blueprint.selectedBlockKinds = actualKinds(value);
}

interface FixturePracticePrompt {
  id: string;
  instructionZh: string;
  instructionEn: string;
  promptEn: string;
  responseMode: "CHOICE" | "SHORT_TEXT";
  context: "SAME_TOPIC" | "UNSEEN_TOPIC";
  optionsEn: string[];
  referenceAnswerEn: string;
  referenceReasoningZh: string;
  referenceReasoningEn: string;
}

function practicePrompts(
  value: FixtureLearningPackage,
): FixturePracticePrompt[] {
  const practice = value.teachingModule.sections
    .flatMap((section) => section.blocks)
    .find((block) => block.kind === "PRACTICE");
  if (!practice) throw new Error("Fixture does not contain a practice block.");
  return practice.prompts as FixturePracticePrompt[];
}

function fixtureBlock(
  value: FixtureLearningPackage,
  kind: string,
): FixtureBlock {
  const block = value.teachingModule.sections
    .flatMap((section) => section.blocks)
    .find((candidate) => candidate.kind === kind);
  if (!block) throw new Error(`Fixture does not contain a ${kind} block.`);
  return block;
}

function setAcceptedChoiceAnswer(
  value: FixtureLearningPackage,
  answerLabel: string,
): void {
  const items = [...value.paper.items];
  items[0] = {
    ...items[0]!,
    responseMode: "choice",
    options: [
      { key: "A", labelEn: answerLabel },
      { key: "B", labelEn: "A plausible but different response." },
      { key: "C", labelEn: "An unrelated response." },
    ],
    acceptedAnswers: ["A"],
    minimumWords: 1,
    maximumWords: 1,
  };
  value.paper = { ...value.paper, items };
}

describe("complete practice paper contract", () => {
  it("publishes mutually exclusive adaptive blocks through the provider-supported anyOf union", () => {
    const teachingModule =
      focusedLearningPackageSchema.properties.teachingModule;
    const blocks = teachingModule.properties.sections.items.properties.blocks;
    const union = blocks.items as {
      anyOf?: readonly {
        properties?: { kind?: { const?: unknown } };
      }[];
      oneOf?: unknown;
    };

    expect(union.oneOf).toBeUndefined();
    expect(
      union.anyOf?.map((branch) => branch.properties?.kind?.const),
    ).toEqual([
      "EXPLANATION",
      "CONTRAST",
      "REASONING",
      "TOOLKIT",
      "PITFALLS",
      "PRACTICE",
      "SUMMARY",
    ]);
  });

  it("accepts a reasoning-led tutorial whose target matches the timed paper", () => {
    expect(validateFixture(mechanismPackage())).toBe(true);

    const mismatched = mechanismPackage();
    mismatched.paper = {
      ...mismatched.paper,
      objectiveZh: "练习一个完全不同的目标。",
    };
    expect(validateFixture(mismatched)).toBe(false);
  });

  it("accepts a structurally different toolkit-led tutorial", () => {
    expect(validateFixture(collocationPackage())).toBe(true);
  });

  it("rejects an article without an explanation", () => {
    const value = mechanismPackage();
    for (const section of value.teachingModule.sections) {
      section.blocks = section.blocks.filter(
        (block) => block.kind !== "EXPLANATION",
      );
    }
    syncSelectedKinds(value);
    expect(validateFixture(value)).toBe(false);
  });

  it("rejects an article without a contrast or reasoning demonstration", () => {
    const value = mechanismPackage();
    for (const section of value.teachingModule.sections) {
      section.blocks = section.blocks.filter(
        (block) => block.kind !== "CONTRAST" && block.kind !== "REASONING",
      );
    }
    value.teachingModule.sections = value.teachingModule.sections.filter(
      (section) => section.blocks.length > 0,
    );
    const supplementalBlocks =
      collocationPackage().teachingModule.sections[0]!.blocks.filter(
        (block) => block.kind === "TOOLKIT" || block.kind === "PITFALLS",
      );
    value.teachingModule.sections[0]!.blocks.push(
      ...structuredClone(supplementalBlocks),
    );
    syncSelectedKinds(value);
    expect(validateFixture(value)).toBe(false);
  });

  it("rejects practice that only asks the learner to recognise answers", () => {
    const value = mechanismPackage();
    const prompts = practicePrompts(value);
    for (const prompt of prompts) {
      prompt.responseMode = "CHOICE";
      prompt.optionsEn = [
        prompt.referenceAnswerEn,
        "A plausible but incorrect alternative.",
        "Another plausible but incorrect alternative.",
      ];
    }

    const finalPrompt = prompts.at(-1)!;
    finalPrompt.responseMode = "SHORT_TEXT";
    finalPrompt.optionsEn = [];
    expect(validateFixture(value)).toBe(true);

    finalPrompt.responseMode = "CHOICE";
    finalPrompt.optionsEn = [
      finalPrompt.referenceAnswerEn,
      "A plausible but incorrect alternative.",
      "Another plausible but incorrect alternative.",
    ];
    expect(validateFixture(value)).toBe(false);
  });

  it("rejects practice without an unseen-topic transfer", () => {
    const value = mechanismPackage();
    for (const prompt of practicePrompts(value)) {
      prompt.context = "SAME_TOPIC";
    }
    expect(validateFixture(value)).toBe(false);
  });

  it("rejects duplicate section anchors", () => {
    const value = mechanismPackage();
    value.teachingModule.sections[1]!.anchor =
      value.teachingModule.sections[0]!.anchor;
    expect(validateFixture(value)).toBe(false);
  });

  it("rejects selected block kinds that do not match the article", () => {
    const value = mechanismPackage();
    value.teachingModule.blueprint.selectedBlockKinds.push("TOOLKIT");
    expect(validateFixture(value)).toBe(false);
  });

  it("rejects a summary that is not the final article block", () => {
    const value = mechanismPackage();
    const finalSection = value.teachingModule.sections.at(-1)!;
    finalSection.blocks = [finalSection.blocks[1]!, finalSection.blocks[0]!];
    expect(validateFixture(value)).toBe(false);
  });

  it("rejects an article with more than eight blocks", () => {
    const value = mechanismPackage();
    const explanation = value.teachingModule.sections[0]!.blocks[0]!;
    value.teachingModule.sections[0]!.blocks.push(
      structuredClone(explanation),
      structuredClone(explanation),
      structuredClone(explanation),
      structuredClone(explanation),
    );
    expect(validateFixture(value)).toBe(false);
  });

  it("rejects a twelve-word exact quotation from Version 1", () => {
    const quotation =
      "Children learn new language patterns quickly when teachers provide regular classroom exposure.";
    const value = mechanismPackage();
    const explanation = value.teachingModule.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.kind === "EXPLANATION")!;
    explanation.paragraphsEn = [quotation];

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
    ["model output", "The model output controls the visible tutorial."],
    ["model version", "The model version changed this example."],
    ["model provider", "The model provider returned this paragraph."],
    ["model action", "The model scored this sentence before displaying it."],
    ["system prompt", "Follow this system prompt before continuing."],
    ["internal prompt", "The internal prompt selected this explanation."],
    ["prompt version", "The prompt version controls this example."],
    ["prompt registry", "The prompt registry stores this instruction."],
    ["schema", "The schema requires this section to appear here."],
    ["job", "Wait for the job to finish before reading the explanation."],
    ["skill ID", "The skill ID selects the next teaching block."],
    ["evidence gate", "The evidence gate controls whether this rule appears."],
    [
      "scoring implementation",
      "The scoring implementation checks this sentence.",
    ],
    ["scoring rule", "The scoring rule awards points for this answer."],
    [
      "confidence score",
      "The confidence score is below the required threshold.",
    ],
  ])("rejects learner-facing English backend vocabulary: %s", (_, leak) => {
    const value = mechanismPackage();
    fixtureBlock(value, "EXPLANATION").paragraphsEn = [leak];
    expect(validateFixture(value)).toBe(false);
  });

  it.each([
    ["AI模型", "AI模型选择了当前例句。"],
    ["语言模型", "语言模型生成了这个解释。"],
    ["模型输出", "模型输出决定教程内容。"],
    ["模型版本", "模型版本改变了这个例句。"],
    ["模型供应商", "模型供应商返回了这段内容。"],
    ["评分模型操作", "评分模型已经为这个句子评分。"],
    ["系统提示词", "请按照系统提示词完成本节内容。"],
    ["内部提示词", "内部提示词选择了这个解释。"],
    ["提示词版本", "提示词版本决定当前例句。"],
    ["后台任务", "请等待后台任务完成后再继续。"],
    ["能力ID", "当前能力ID决定教学内容。"],
    ["证据门槛", "只有通过证据门槛才会显示结论。"],
    ["评分实现", "评分实现会检查这个句子。"],
    ["评分逻辑", "内部评分逻辑将决定结果。"],
    ["置信度", "这个判断的置信度低于阈值。"],
  ])("rejects learner-facing Chinese backend vocabulary: %s", (_, leak) => {
    const value = mechanismPackage();
    fixtureBlock(value, "EXPLANATION").paragraphsZh = [leak];
    expect(validateFixture(value)).toBe(false);
  });

  it.each([
    "A physical model can help pupils understand the shape of a molecule.",
    "Read the IELTS writing prompt carefully before choosing a position.",
    "When the prompt asks whether the advantages outweigh the disadvantages, state your position directly.",
    "A causal model helps writers make the missing link in an argument visible.",
    "An argument model can show how evidence supports a specific claim.",
    "A mental model helps learners organise a complex line of reasoning.",
    "Compare your paragraph with the model answer after writing independently.",
    "Stable jobs can improve household security during an economic downturn.",
    "Repeated practice can build a learner's confidence over time.",
  ])("allows ordinary teaching or IELTS-topic uses: %s", (ordinaryText) => {
    const value = mechanismPackage();
    fixtureBlock(value, "EXPLANATION").paragraphsEn = [ordinaryText];
    expect(validateFixture(value)).toBe(true);
  });

  it.each([
    "当题目提示需要比较优缺点时，先明确自己的立场。",
    "因果模型可以帮助作者检查原因与结果之间的链条。",
    "因果模型生成完整论证链后，写作者可以检查每一个中间步骤。",
    "论证模型能够显示证据如何支持一个具体观点。",
    "论证模型选择证据时，应优先保留与核心观点直接相关的信息。",
    "请在独立完成后对照示范答案，检查自己的段落。",
  ])("allows ordinary Chinese teaching vocabulary: %s", (ordinaryText) => {
    const value = mechanismPackage();
    fixtureBlock(value, "EXPLANATION").paragraphsZh = [ordinaryText];
    expect(validateFixture(value)).toBe(true);
  });

  it.each([
    "AI模型选择当前例句后将其显示给学习者。",
    "系统模型为这个英文句子评分，并决定是否继续。",
    "模型输出由后台生成，完成后才会显示这段内容。",
  ])("rejects explicit Chinese technical model context: %s", (leak) => {
    const value = mechanismPackage();
    fixtureBlock(value, "EXPLANATION").paragraphsZh = [leak];
    expect(validateFixture(value)).toBe(false);
  });

  it("rejects an exact eight-word accepted answer from the later paper", () => {
    const futureAnswer =
      "Libraries give residents reliable access to useful information.";
    const value = mechanismPackage();
    setAcceptedChoiceAnswer(value, futureAnswer);
    fixtureBlock(value, "EXPLANATION").paragraphsEn = [
      `A later response could state: ${futureAnswer}`,
    ];
    expect(validateFixture(value)).toBe(false);
  });

  it("allows an incidental seven-word accepted answer from the later paper", () => {
    const futureAnswer =
      "Libraries give residents reliable access to information.";
    const value = mechanismPackage();
    setAcceptedChoiceAnswer(value, futureAnswer);
    fixtureBlock(value, "EXPLANATION").paragraphsEn = [
      `A teaching example may state: ${futureAnswer}`,
    ];
    expect(validateFixture(value)).toBe(true);
  });

  it.each(["referenceAnswerEn", "modelAnswerEn"])(
    "rejects an exact long future %s field",
    (answerField) => {
      const futureAnswer =
        "Regular bus services allow rural residents to reach hospitals without relying on private cars.";
      const value = mechanismPackage();
      const items = [...value.paper.items];
      items[0] = { ...items[0]!, [answerField]: futureAnswer };
      value.paper = { ...value.paper, items };
      fixtureBlock(value, "EXPLANATION").paragraphsEn = [futureAnswer];
      expect(validateFixture(value)).toBe(false);
    },
  );

  it("does not treat an incidental short accepted token as answer leakage", () => {
    const value = mechanismPackage();
    setAcceptedChoiceAnswer(value, "Therefore");
    fixtureBlock(value, "EXPLANATION").paragraphsEn = [
      "Therefore, the result becomes clearer after the missing mechanism is added.",
    ];
    expect(validateFixture(value)).toBe(true);
  });

  it("rejects an exact eighteen-Han-character future answer", () => {
    const value = mechanismPackage();
    const futureAnswer = "政府资助使低收入家庭获得公平教育机会";
    const items = [...value.paper.items];
    const answerField: string = "referenceAnswerZh";
    items[0] = { ...items[0]!, [answerField]: futureAnswer };
    value.paper = { ...value.paper, items };
    fixtureBlock(value, "EXPLANATION").paragraphsZh = [futureAnswer];
    expect(validateFixture(value)).toBe(false);
  });

  it("allows an incidental seventeen-Han-character future answer", () => {
    const value = mechanismPackage();
    const futureAnswer = "政府资助帮助低收入家庭获得公平教育";
    const items = [...value.paper.items];
    const answerField: string = "referenceAnswerZh";
    items[0] = { ...items[0]!, [answerField]: futureAnswer };
    value.paper = { ...value.paper, items };
    fixtureBlock(value, "EXPLANATION").paragraphsZh = [futureAnswer];
    expect(validateFixture(value)).toBe(true);
  });

  it("allows a 120-word body-paragraph demonstration", () => {
    const value = mechanismPackage();
    fixtureBlock(value, "CONTRAST").strongExampleEn = Array.from(
      { length: 120 },
      (_, index) => (index % 2 === 0 ? "clear" : "reasoning"),
    ).join(" ");
    expect(validateFixture(value)).toBe(true);
  });

  it("allows a learner-facing field with exactly 140 English words", () => {
    const value = mechanismPackage();
    fixtureBlock(value, "EXPLANATION").paragraphsEn = [
      Array.from({ length: 140 }, () => "clear").join(" "),
    ];
    expect(validateFixture(value)).toBe(true);
  });

  it("rejects a learner-facing field with 141 English words", () => {
    const value = mechanismPackage();
    fixtureBlock(value, "EXPLANATION").paragraphsEn = [
      Array.from({ length: 141 }, () => "clear").join(" "),
    ];
    expect(validateFixture(value)).toBe(false);
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
