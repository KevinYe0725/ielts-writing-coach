import { createHash } from "node:crypto";

import { mockValueFromSchema } from "./json";
import { normalizeProviderError } from "./errors";
import type {
  AIProviderAdapter,
  ConnectionValidation,
  GenerationResult,
  ModelDescriptor,
  NormalizedUsage,
  ProviderCapabilities,
  StructuredGenerationRequest,
  TextGenerationRequest,
} from "./types";

const MODEL = "mock-deterministic-v1";

function section(input: string, label: string): string {
  const line = input
    .split("\n")
    .find((candidate) => candidate.startsWith(`${label}: `));
  if (!line) return "";
  const serialized = line.slice(label.length + 2);
  try {
    const value: unknown = JSON.parse(serialized);
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return serialized;
  }
}

function mockStructuredValue(
  request: StructuredGenerationRequest<unknown>,
): unknown {
  const generated = mockValueFromSchema(request.schema);
  if (
    request.schemaName === "iwc_practice_paper_v2" ||
    request.schemaName === "iwc_focused_learning_package_v3" ||
    request.schemaName === "iwc_focused_learning_package_v4"
  ) {
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
    const modes = [
      "choice",
      "short_text",
      "sentence",
      "sentence",
      "sentence",
      "sentence",
      "paragraph",
      "paragraph",
    ] as const;
    const minutes = [5, 5, 7, 7, 8, 8, 10, 10];
    const minimumWords = [1, 20, 8, 8, 25, 25, 80, 80];
    const maximumWords = [1, 35, 40, 40, 45, 45, 120, 120];
    const instructions = [
      "选择唯一一项同时包含原因、作用过程和结果的英文句子。",
      "用20至35个英文词解释为什么早期接触能降低以后的学习难度；必须写出作用过程和结果。",
      "将原句改写成一个语法正确、比较对象完整的英文句子；保持原意，不增加新观点。",
      "将原句改写成一个自然的英文句子；明确谁承受压力以及比较对象，不使用much slighter。",
      "用25至45个英文词解释校内体育活动如何改善课堂学习；必须包含直接作用和学习结果。",
      "用25至45个英文词解释公共交通如何减少城市拥堵；必须包含中间机制，不得使用because。",
      "写一个80至120词的英文段落，说明早期语言学习的一个长期好处；必须包含观点、原因、机制和结果。",
      "写一个80至120词的英文段落，承认早期语言课程的一个风险，并说明学校如何通过课程设计降低该风险。",
    ];
    const prompts = [
      "Which option presents a complete cause–mechanism–result chain?",
      "Explain why early language exposure can make later study easier.",
      "Children always have a better ability to absorb new knowledges than the elder one.",
      "The pressure from the courses in primary school is much slighter.",
      "Explain how regular physical activity at school can improve classroom learning.",
      "Explain how reliable public transport can reduce congestion in large cities.",
      "Explain one long-term benefit of beginning foreign-language lessons in primary school.",
      "Explain how schools can preserve the benefits of early language learning without creating excessive pressure.",
    ];
    const targetTitleZh = "用原因—机制—结果完整表达观点";
    const paper = {
      titleZh: "核心问题专项训练卷",
      titleEn: "Focused writing practice paper",
      objectiveZh: `${targetTitleZh}：用清楚的任务要求完成识别、修改、独立造句和段落应用；Mock 仅演示整卷流程。`,
      objectiveEn:
        "Complete diagnosis, repair, independent generation and paragraph application under explicit requirements.",
      instructionsZh: [
        "限时60分钟，所有题目一次性完成后再交卷。",
        "交卷前不显示答案、提示或单题评价。",
        "题目已经写明全部作答要求，不会在批改时增加条件。",
      ],
      instructionsEn: [
        "Finish the complete paper in 60 minutes.",
        "No answer or item feedback is shown before submission.",
        "Every requirement is stated in the question before you answer.",
      ],
      items: sections.map((paperSection, index) => {
        const choice = modes[index] === "choice";
        const paragraph = modes[index] === "paragraph";
        return {
          section: paperSection,
          titleZh: `第${index + 1}题`,
          titleEn: `Question ${index + 1}`,
          instructionZh: instructions[index],
          promptEn: prompts[index],
          sourceText: choice
            ? "Children learn languages at primary school."
            : paperSection === "REPAIR"
              ? prompts[index]
              : "",
          responseMode: modes[index],
          options: choice
            ? [
                {
                  key: "A",
                  labelEn:
                    "Early exposure builds a foundation, so later study becomes easier.",
                },
                { key: "B", labelEn: "Early exposure is useful." },
                { key: "C", labelEn: "Languages are taught in many schools." },
              ]
            : [],
          acceptedAnswers: choice ? ["A"] : [],
          answerExplanationZh:
            "答案需要呈现明确的原因、作用过程和结果，并保持英文自然。",
          suggestedMinutes: minutes[index],
          minimumWords: minimumWords[index],
          maximumWords: maximumWords[index],
          publicCriteria: [
            {
              labelZh: "按题面作答",
              labelEn: "Follow the instruction",
              descriptionZh: instructions[index],
              descriptionEn:
                "Follow every requirement in the visible instruction.",
              weight: 100,
            },
          ],
        };
      }),
    };
    if (request.schemaName === "iwc_practice_paper_v2") return paper;
    if (request.schemaName === "iwc_focused_learning_package_v4") {
      const coreAbilityZh = "用原因机制结果完整展开一个观点";
      const coreAbilityEn =
        "Develop one claim through a cause, mechanism, and result";
      return {
        teachingModule: {
          format: "ADAPTIVE_ARTICLE_V1",
          titleZh: "让读者看见观点如何一步步成立",
          titleEn: "Show how a claim works step by step",
          introductionZh:
            "这篇短教程用全新的例子说明如何补上中间机制，并让你在陌生话题中独立完成一次迁移。",
          introductionEn:
            "This short tutorial uses fresh examples to make the missing mechanism visible and then asks you to transfer the method to an unfamiliar topic.",
          estimatedMinutes: 28,
          blueprint: {
            coreAbilityZh,
            coreAbilityEn,
            difficultyType: "REVISES_BUT_CANNOT_GENERATE",
            completionStandardZh:
              "能够在陌生话题中独立写出包含原因、作用过程和具体结果的两至三句话。",
            completionStandardEn:
              "Independently write two or three sentences that contain a cause, a working mechanism, and a specific result on an unseen topic.",
            prerequisiteAbilityZh: "",
            prerequisiteAbilityEn: "",
            supportingAbilityZh: "",
            supportingAbilityEn: "",
            selectedBlockKinds: [
              "EXPLANATION",
              "CONTRAST",
              "REASONING",
              "TOOLKIT",
              "PITFALLS",
              "PRACTICE",
              "SUMMARY",
            ],
          },
          sections: [
            {
              anchor: "see-the-link",
              titleZh: "先找到缺失的中间一环",
              titleEn: "Find the missing middle link",
              blocks: [
                {
                  kind: "EXPLANATION",
                  titleZh: "结果不会自动证明原因",
                  titleEn: "A result does not explain its own cause",
                  paragraphsZh: [
                    "完整论证不只是把原因和好处放在同一句里。读者还需要看到原因改变了什么，这个变化又怎样推动最终结果。",
                  ],
                  paragraphsEn: [
                    "A complete argument does more than place a cause beside a benefit. It shows what the cause changes and how that change produces the final outcome.",
                  ],
                  keyPointZh:
                    "写完原因后追问：它先改变了什么具体过程？答案就是需要补出的机制。",
                  keyPointEn:
                    "After stating the cause, ask what process changes first; that answer supplies the missing mechanism.",
                },
                {
                  kind: "CONTRAST",
                  titleZh: "对比跳跃论证与完整论证",
                  titleEn: "Compare a jump with a complete explanation",
                  weakExampleEn:
                    "Flexible schedules are useful, so employees perform better.",
                  strongExampleEn:
                    "Flexible schedules let employees work during their most productive hours, which improves concentration and raises the quality of their output.",
                  differenceZh:
                    "较强的版本没有重复“有用”，而是说明弹性安排先改善专注，再带来可观察的工作结果。",
                  differenceEn:
                    "The stronger version replaces a vague benefit with the intermediate change in concentration and a concrete workplace outcome.",
                },
              ],
            },
            {
              anchor: "build-the-process",
              titleZh: "把中间过程一步步写出来",
              titleEn: "Build the process one step at a time",
              blocks: [
                {
                  kind: "REASONING",
                  titleZh: "先找直接变化，再找行为变化",
                  titleEn:
                    "Find the immediate change before the behaviour change",
                  scenarioZh: "城市新建连续自行车道为什么可能改善高峰期通勤？",
                  scenarioEn:
                    "Why can a connected network of cycle lanes improve peak-hour commuting?",
                  steps: [
                    {
                      thinkingZh:
                        "直接变化不是“交通变好”，而是骑车的人与汽车分开的道路空间更多。",
                      thinkingEn:
                        "The immediate change is not simply better traffic; cyclists have more protected space away from cars.",
                    },
                    {
                      thinkingZh:
                        "这会降低短途骑行的不确定感，因此更多通勤者愿意把短途汽车出行换成骑车。",
                      thinkingEn:
                        "That reduces the uncertainty of short journeys, so more commuters are willing to replace short car trips with cycling.",
                    },
                    {
                      thinkingZh:
                        "当一部分短途车程被替代后，拥堵道路上的车辆压力才会下降。",
                      thinkingEn:
                        "Only after some short car trips are replaced does pressure on congested roads fall.",
                    },
                  ],
                  resultEn:
                    "Connected cycle lanes make short journeys feel safer, encouraging commuters to replace some car trips and easing pressure on busy roads.",
                  takeawayZh:
                    "每一环都要回答前一环改变了什么，而不是重复“这很好”。",
                  takeawayEn:
                    "Each link should say what the previous link changes instead of repeating that the policy is beneficial.",
                },
                {
                  kind: "TOOLKIT",
                  titleZh: "三种把链条写清的连接方式",
                  titleEn: "Three ways to make the chain visible",
                  tools: [
                    {
                      expressionEn: "This means that …",
                      functionZh: "把直接变化解释成下一步影响。",
                      functionEn:
                        "Explain what the immediate change leads to next.",
                      conditionZh:
                        "前一句已经写出具体变化时，再用它说明后续影响。",
                      conditionEn:
                        "Use it after naming a concrete change and before explaining its consequence.",
                      cautionZh: "不要把它放在两个都很空泛的判断之间。",
                      cautionEn: "Do not place it between two vague claims.",
                      exampleEn:
                        "Regular feedback identifies small gaps early. This means that learners can correct them before the gaps become habits.",
                    },
                    {
                      expressionEn: "which in turn …",
                      functionZh: "把一个已说明的结果推进到下一步。",
                      functionEn:
                        "Extend one explained effect to a further consequence.",
                      conditionZh: "只有前一个变化确实会造成下一个变化时使用。",
                      conditionEn:
                        "Use it only when the first change plausibly causes the second one.",
                      cautionZh: "不要把它当作“因此”的装饰性替换。",
                      cautionEn:
                        "Do not use it as a decorative replacement for therefore.",
                      exampleEn:
                        "Clearer instructions reduce confusion, which in turn saves time during group work.",
                    },
                  ],
                },
                {
                  kind: "PITFALLS",
                  titleZh: "两个看似完整、其实断开的写法",
                  titleEn: "Two chains that only look complete",
                  items: [
                    {
                      patternEn:
                        "Public libraries are useful, so communities become stronger.",
                      problemZh:
                        "句子只把“有用”和“更强”放在一起，没有说明图书馆改变了什么行为或机会。",
                      problemEn:
                        "The sentence places useful beside stronger without explaining which behaviour or opportunity changes.",
                      betterEn:
                        "Public libraries give residents free access to information and study space, helping more people develop practical skills and participate in local opportunities.",
                    },
                    {
                      patternEn:
                        "Exercise improves concentration because it is healthy.",
                      problemZh:
                        "healthy重复了积极评价，没有解释身体活动如何影响课堂注意力。",
                      problemEn:
                        "Healthy repeats a positive judgement instead of explaining how activity affects attention in class.",
                      betterEn:
                        "Regular exercise can reduce stress and improve sleep quality, leaving students better able to concentrate during demanding lessons.",
                    },
                  ],
                },
              ],
            },
            {
              anchor: "try-and-transfer",
              titleZh: "从有支架练习到陌生话题",
              titleEn: "Move from guided practice to a new topic",
              blocks: [
                {
                  kind: "PRACTICE",
                  titleZh: "先辨别，再补全，再独立生成",
                  titleEn: "Recognise, complete, then generate independently",
                  prompts: [
                    {
                      id: "spot-the-mechanism",
                      instructionZh:
                        "选择真正解释了中间作用过程的一句，并在作答后查看理由。",
                      instructionEn:
                        "Choose the sentence that explains an intermediate process, then reveal the reasoning.",
                      promptEn:
                        "A city adds protected bicycle lanes to several busy roads.",
                      responseMode: "CHOICE",
                      context: "SAME_TOPIC",
                      optionsEn: [
                        "Cycling infrastructure is beneficial for cities.",
                        "Protected lanes reduce perceived danger, so more commuters feel able to cycle regularly.",
                        "Many cities experience traffic during peak hours.",
                      ],
                      referenceAnswerEn:
                        "Protected lanes reduce perceived danger, so more commuters feel able to cycle regularly.",
                      referenceReasoningZh:
                        "这句话写出了基础设施先降低风险感受，再改变通勤者选择的中间过程。",
                      referenceReasoningEn:
                        "It shows the infrastructure reducing perceived risk before that change affects commuters' choices.",
                    },
                    {
                      id: "guided-workplace-link",
                      instructionZh:
                        "用一句英文补全灵活工作时间与更高工作质量之间的中间过程；写清工作习惯怎样改变。",
                      instructionEn:
                        "In one English sentence, supply the mechanism between flexible schedules and higher-quality work by naming the changed work habit.",
                      promptEn:
                        "Flexible schedules can improve the quality of employees' work because …",
                      responseMode: "SHORT_TEXT",
                      context: "SAME_TOPIC",
                      optionsEn: [],
                      referenceAnswerEn:
                        "Employees can complete demanding tasks during the hours when they concentrate best, reducing avoidable mistakes.",
                      referenceReasoningZh:
                        "参考思路没有直接说“弹性安排很好”，而是写出任务安排先改变，再落到错误减少这个结果。",
                      referenceReasoningEn:
                        "The reference names a change in task timing before reaching the concrete result of fewer avoidable errors.",
                    },
                    {
                      id: "unseen-health-transfer",
                      instructionZh:
                        "用两至三句英文解释定期健康检查如何减少严重疾病风险，必须写出原因、机制和具体结果。",
                      instructionEn:
                        "In two or three English sentences, explain how regular health checks can reduce serious illness through a cause, mechanism, and concrete result.",
                      promptEn:
                        "Transfer the reasoning pattern to preventive healthcare without copying the examples above.",
                      responseMode: "SHORT_TEXT",
                      context: "UNSEEN_TOPIC",
                      optionsEn: [],
                      referenceAnswerEn:
                        "Regular screening can reveal warning signs before symptoms become severe. Earlier detection gives patients time to begin treatment, reducing the likelihood of avoidable complications.",
                      referenceReasoningZh:
                        "参考思路依次写出早期发现、及时治疗和降低并发症风险，没有只停留在“检查有好处”。",
                      referenceReasoningEn:
                        "The response moves from early detection to timely treatment and then to a reduced risk of complications.",
                    },
                  ],
                },
                {
                  kind: "SUMMARY",
                  titleZh: "把方法带进下一次写作",
                  titleEn: "Carry the method into the next essay",
                  rulesZh: [
                    "先明确原因改变的对象或过程，不要从原因直接跳到好处。",
                    "中间句必须增加新的行为、条件或可解释的变化。",
                    "把最终结果写成读者能够观察或验证的变化。",
                  ],
                  rulesEn: [
                    "Name the process or condition changed by the cause instead of jumping straight to a benefit.",
                    "Make the middle sentence add a new behaviour, condition, or explainable change.",
                    "Express the final result as a change a reader could observe or verify.",
                  ],
                  selfCheckZh:
                    "遮住连接词后，我还能指出这段话里的原因、中间变化和具体结果吗？",
                  selfCheckEn:
                    "If I hide the linking words, can I still identify the cause, the intermediate change, and the concrete result?",
                },
              ],
            },
          ],
        },
        paper: {
          ...paper,
          objectiveZh: `${coreAbilityZh}：在识别、修改、独立造句和段落应用中完成一次完整训练。`,
          objectiveEn: `${coreAbilityEn}: apply the ability through diagnosis, repair, independent generation, and paragraph writing.`,
        },
      };
    }
    return {
      teachingModule: {
        targetTitleZh,
        targetTitleEn: "Build a complete cause–mechanism–result chain",
        whyItMattersZh:
          "原文能够提出观点，但有时会直接跳到结果，使读者看不到原因如何产生影响。",
        whyItMattersEn:
          "The essay can state claims, but sometimes jumps directly to the result without showing how the cause works.",
        currentPattern:
          "Children can learn languages easily, so it is beneficial for their future.",
        decisionRuleZh:
          "先写原因，再解释它通过什么过程产生影响，最后写出一个具体、可观察的结果。",
        decisionRuleEn:
          "State the cause, explain the process through which it works, and end with a specific observable result.",
        knowledgeCards: [
          {
            titleZh: "观点不等于论证",
            explanationZh:
              "观点说明你相信什么；完整论证还要解释为什么以及影响是怎样产生的。",
            exampleEn:
              "Regular exposure makes common patterns familiar, so later study requires less effort.",
          },
          {
            titleZh: "机制是中间过程",
            explanationZh:
              "机制不能只是重复原因，而要说明原因如何一步步推动最终结果。",
            exampleEn:
              "Repeated use builds automatic recall, which frees attention for more complex tasks.",
          },
          {
            titleZh: "结果要具体",
            explanationZh:
              "避免只写it is useful或it is beneficial，要说明学习者最终能做什么。",
            exampleEn:
              "As a result, pupils can understand later lessons more confidently.",
          },
        ],
        expressionBank: [
          {
            expressionEn: "This allows … to …",
            functionZh: "从机制连接到结果",
            usageZh: "allow后面写清受影响的人或事物，再接to do。",
            exampleEn:
              "This allows learners to process new material more efficiently.",
          },
          {
            expressionEn: "Over time, …",
            functionZh: "引出累积变化",
            usageZh: "只用于确实需要重复或时间积累的过程。",
            exampleEn: "Over time, repeated exposure builds confidence.",
          },
          {
            expressionEn: "which in turn …",
            functionZh: "补充下一步影响",
            usageZh: "前一结果确实会继续引发另一个结果时使用。",
            exampleEn:
              "Familiar patterns reduce processing effort, which in turn makes later learning less demanding.",
          },
        ],
        workedExample: {
          taskZh: "说明早期语言接触为什么能降低后续学习难度。",
          weakAnswerEn:
            "Children learn quickly, so language lessons are beneficial.",
          thinkingStepsZh: [
            "原因：儿童反复接触声音和基本句型。",
            "机制：重复使常见模式逐渐变得熟悉。",
            "结果：以后理解正式课程的新内容时需要付出的努力更少。",
          ],
          improvedAnswerEn:
            "Regular exposure makes basic sounds and patterns familiar, so children need less effort to process new material when formal study becomes more demanding.",
          explanationZh:
            "改写没有堆砌连接词，而是补上了可理解的中间过程，并把好处落到具体学习结果。",
        },
        quickChecks: [
          {
            promptZh: "哪一句真正写出了中间机制？",
            optionsZh: [
              "A. Early lessons are very beneficial.",
              "B. Repeated exposure makes common patterns familiar, so later processing becomes easier.",
            ],
            answerZh: "B",
            explanationZh:
              "B说明重复接触怎样转化为熟悉度，并继续产生学习结果。",
          },
          {
            promptZh: "把it is beneficial替换成一个可观察的学习结果。",
            optionsZh: [],
            answerZh:
              "例如：learners can process new material with less effort。",
            explanationZh: "这个结果明确写出学习者以后能够做到什么。",
          },
        ],
        readyChecklistZh: [
          "我能区分观点、机制和结果。",
          "我能不用照抄示例，也写出原因怎样产生结果。",
          "我会把beneficial换成具体、可观察的影响。",
        ],
      },
      paper,
    };
  }
  if (request.schemaName === "iwc_practice_paper_evaluation_v2") {
    const serializedPaper = section(request.input, "Paper");
    const serializedAnswers = section(
      request.input,
      "Learner answers submitted together",
    );
    const paper = JSON.parse(serializedPaper) as {
      items: Array<{ id: string; responseMode: string }>;
    };
    const answers = JSON.parse(serializedAnswers) as Record<string, string>;
    const itemResults = paper.items.map((item) => {
      const answer = answers[item.id]?.trim() ?? "";
      const meets =
        item.responseMode === "choice" ? answer === "A" : answer.length >= 20;
      return {
        itemId: item.id,
        status: meets ? "MEETS_STANDARD" : "NEEDS_WORK",
        score: meets ? 100 : 50,
        feedbackZh: meets
          ? "已完成题面公开要求。Mock 不判断真实语言质量。"
          : "回答尚未完整覆盖题面要求。Mock 仅按完整度演示。",
        strengthsZh: meets ? ["回答形式完整"] : [],
        problems: meets
          ? []
          : [
              {
                criterionLabelZh: "题意完成",
                explanationZh: "当前回答过短或未选择正确选项。",
                evidence: answer.slice(0, 120),
              },
            ],
        improvedAnswerEn: meets
          ? ""
          : "Add a complete cause, mechanism and result that directly answer the question.",
        nextStepZh: meets ? "继续保持。" : "对照题面逐项补齐明确要求。",
      };
    });
    return {
      totalScore:
        itemResults.reduce((sum, item) => sum + item.score, 0) /
        Math.max(1, itemResults.length),
      summaryZh:
        "这是整卷流程演示结果；连接真实模型后，系统才会评价语言准确性、自然度和论证质量。",
      itemResults,
    };
  }
  if (request.schemaName === "iwc_teaching_practice_analysis_v2") {
    return {
      disposition: "INSUFFICIENT_EVIDENCE",
      strengths: [],
      comparisons: [],
      improvements: [],
      confidence: 0,
    };
  }
  if (request.schemaName === "iwc_exercise_evaluation_v1") {
    const answer = section(request.input, "Learner first answer").trim();
    const passed = answer.length >= 40;
    const canonicalTarget = section(
      request.input,
      "Canonical target and evidence opportunity",
    );
    let criterionIds = ["target"];
    try {
      const canonical = JSON.parse(canonicalTarget) as {
        grading?: { criteria?: Array<{ id?: unknown }> };
        criteria?: Array<{ objectiveId?: unknown; skillId?: unknown }>;
      };
      criterionIds = Array.from(
        new Set([
          ...(canonical.grading?.criteria ?? []).flatMap((criterion) =>
            typeof criterion.id === "string" ? [criterion.id] : [],
          ),
          ...(canonical.criteria ?? []).flatMap((criterion) =>
            typeof criterion.objectiveId === "string" &&
            typeof criterion.skillId === "string"
              ? [`${criterion.objectiveId}:${criterion.skillId}`]
              : [],
          ),
        ]),
      );
      if (criterionIds.length === 0) criterionIds = ["target"];
    } catch {
      // Keep the deterministic fallback criterion for malformed demo input.
    }
    const evidence = passed
      ? answer.slice(0, 180)
      : "No sufficiently developed answer was found.";
    return {
      ...(generated as Record<string, unknown>),
      passed,
      firstAttemptPassed: passed,
      confidence: 0.95,
      feedbackZh: passed
        ? "Mock 演示已确认回答具备足够长度与独立输出形式；请使用真实模型获得语言质量判断。"
        : "回答过短，尚不足以形成可验证的独立输出证据。",
      evidenceEn: passed
        ? "The response contains a complete independent answer."
        : "The response is too short for the deterministic demo gate.",
      dimensionScores: {
        targetCorrectness: passed ? 0.9 : 0.4,
        meaningPreservation: passed ? 0.9 : 0.4,
        naturalness: passed ? 0.9 : 0.4,
      },
      criterionResults: criterionIds.map((id) => ({
        id,
        score: passed ? 0.9 : 0.4,
        userAnswerEvidence: [evidence],
      })),
      userAnswerEvidence: [evidence],
      mostImportantSuggestionZh: passed
        ? "连接真实模型后复核语言准确性与自然度。"
        : "先写出一个意思完整、可独立判断的英文句子。",
      naturalOpportunity: true,
      coreErrorRecurred: !passed,
    };
  }
  if (request.schemaName === "iwc_version_comparison_v1") {
    const marker = "\n\nV2 before self-check:\n";
    const version2 = request.input.split(marker)[1]?.trim() ?? "";
    const targetApplied = version2.length >= 100;
    return {
      ...(generated as Record<string, unknown>),
      targetApplied,
      naturalOpportunity: true,
      confidence: 0.95,
      improvementsZh: targetApplied
        ? ["Version 2 在闭卷条件下完成了足够展开的独立写作。"]
        : [],
      regressionsZh: targetApplied
        ? []
        : ["Version 2 过短，Mock 演示无法确认目标能力得到保留。"],
      evidenceV2: version2.slice(0, 240),
      coreIssueSpansV1: [],
      coreIssueSpansV2: [],
      modelEssay:
        version2.length >= 200
          ? version2
          : "Mock Provider does not generate a scored reference essay. Configure a real AI provider for a task-specific model.",
    };
  }
  if (request.schemaName === "iwc_transfer_evaluation_v1") {
    const answer = section(
      request.input,
      "Learner immutable first answer",
    ).trim();
    const completeDemoResponse = answer.length >= 80;
    return {
      ...(generated as Record<string, unknown>),
      targetApplied: completeDemoResponse,
      naturalOpportunity: true,
      confidence: 0.99,
      feedbackZh: completeDemoResponse
        ? "Mock 仅确认流程中存在一段完整首答；它没有评价英语质量，也不会授予 transferred。"
        : "Mock 仅检测到首答内容不足以演示完整流程；它没有评价英语质量。",
      feedbackEn: completeDemoResponse
        ? "Mock confirmed only that a developed first answer exists. It did not score language and cannot award transferred."
        : "Mock found too little text for the workflow demo. It did not score language.",
      evidenceEn: completeDemoResponse
        ? answer.slice(0, 240)
        : "No developed first answer was available for the workflow demo.",
      dimensionScores: {
        targetCorrectness: 0,
        meaningPreservation: 0,
        naturalness: 0,
      },
      userAnswerEvidence: completeDemoResponse ? [answer.slice(0, 240)] : [],
      mostImportantSuggestionZh:
        "连接真实语言模型后，才能判断目标能力是否在陌生话题中自然、准确地出现。",
    };
  }
  return generated;
}

function usageFor(input: string, output: string): NormalizedUsage {
  const inputTokens = Math.max(1, Math.ceil(input.length / 4));
  const outputTokens = Math.max(1, Math.ceil(output.length / 4));
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

export class MockAdapter implements AIProviderAdapter {
  readonly kind = "mock" as const;

  async validateConnection(): Promise<ConnectionValidation> {
    return {
      ok: true,
      latencyMs: 0,
      safeMessage: "Deterministic Mock Provider is ready.",
    };
  }

  async listModels(): Promise<ModelDescriptor[]> {
    return [{ id: MODEL, ownedBy: "ielts-writing-coach" }];
  }

  async probeCapabilities(model: string): Promise<ProviderCapabilities> {
    return {
      text: true,
      structuredOutput: true,
      nativeJsonSchema: true,
      model,
      probedAt: new Date().toISOString(),
      notes: [
        "Deterministic and free; intended for demos and automated tests.",
      ],
    };
  }

  async generateText(
    request: TextGenerationRequest,
  ): Promise<GenerationResult<string>> {
    const digest = createHash("sha256")
      .update(request.input)
      .digest("hex")
      .slice(0, 12);
    const value = `Mock Provider response (${digest}). Configure a real provider for language feedback.`;
    return {
      value,
      model: request.model || MODEL,
      responseId: `mock_${digest}`,
      usage: usageFor(request.input, value),
    };
  }

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<GenerationResult<T>> {
    const value = mockStructuredValue(
      request as StructuredGenerationRequest<unknown>,
    );
    if (!request.validate(value)) {
      throw new Error(
        `The deterministic mock could not satisfy schema ${request.schemaName}.`,
      );
    }
    const serialized = JSON.stringify(value);
    const digest = createHash("sha256")
      .update(`${request.schemaName}:${request.input}`)
      .digest("hex")
      .slice(0, 12);
    return {
      value,
      model: request.model || MODEL,
      responseId: `mock_${digest}`,
      usage: usageFor(request.input, serialized),
    };
  }

  normalizeUsage(raw: unknown): NormalizedUsage {
    const usage = raw as Partial<NormalizedUsage>;
    return {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      totalTokens:
        usage.totalTokens ??
        (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
      ...(usage.cachedInputTokens === undefined
        ? {}
        : { cachedInputTokens: usage.cachedInputTokens }),
      ...(usage.reasoningTokens === undefined
        ? {}
        : { reasoningTokens: usage.reasoningTokens }),
    };
  }

  normalizeError = normalizeProviderError;
}
