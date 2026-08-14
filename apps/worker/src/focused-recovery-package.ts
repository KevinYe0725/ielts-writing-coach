import type { SkillId } from "@iwc/learning-contracts";

import type {
  FocusedLearningPackage,
  PracticePaperContent,
  TeachingBlueprint,
} from "./learning";

export interface FocusedRecoveryLesson {
  readonly titleZh: string;
  readonly titleEn: string;
  readonly coreAbilityZh: string;
  readonly coreAbilityEn: string;
  readonly explanationZh: string;
  readonly explanationEn: string;
  readonly weakExampleEn: string;
  readonly strongExampleEn: string;
  readonly decisionZh: string;
  readonly decisionEn: string;
  readonly practiceContextEn: string;
  readonly transferContextEn: string;
}

const lessons: Record<SkillId, FocusedRecoveryLesson> = {
  complete_comparison: {
    titleZh: "把比较对象写完整",
    titleEn: "Make every comparison complete",
    coreAbilityZh: "明确比较双方并写出完整比较关系",
    coreAbilityEn: "Name both sides and express a complete comparison",
    explanationZh: "比较句必须让读者知道谁和谁被比较，以及比较的具体方面。",
    explanationEn:
      "A comparison needs two clear sides and one stated point of comparison.",
    weakExampleEn: "Children learn languages more easily than adults.",
    strongExampleEn:
      "Children often absorb new language patterns more easily than adults because they receive frequent guided exposure at school.",
    decisionZh: "先圈出比较双方，再检查比较词是否连接了同一个方面。",
    decisionEn:
      "Name both sides first, then check that the comparison uses one shared measure.",
    practiceContextEn: "online learning and classroom learning",
    transferContextEn: "public transport and private cars",
  },
  verb_form_trigger: {
    titleZh: "先看触发词，再选动词形式",
    titleEn: "Choose verb forms from their triggers",
    coreAbilityZh: "根据触发词选择正确的动词形式",
    coreAbilityEn: "Choose the correct verb form from its trigger",
    explanationZh:
      "动词形式不是凭感觉决定的，介词、不定式和固定结构都会给出明确线索。",
    explanationEn:
      "Verb form is guided by its trigger, such as a preposition, an infinitive pattern, or a fixed structure.",
    weakExampleEn: "Students can improve by to practise every day.",
    strongExampleEn:
      "Students can improve by practising every day and reviewing one clear goal.",
    decisionZh: "先找到动词前的触发词，再决定使用原形、to do 还是动名词。",
    decisionEn:
      "Find the trigger before the verb, then choose the infinitive, base form, or gerund.",
    practiceContextEn: "regular exercise after school",
    transferContextEn: "planning a community project",
  },
  sentence_boundary: {
    titleZh: "让每个句子有清楚边界",
    titleEn: "Give each sentence a clear boundary",
    coreAbilityZh: "避免残句、逗号拼接和过长连写",
    coreAbilityEn: "Avoid fragments, comma splices, and run-on sentences",
    explanationZh: "一个完整句子需要完整主干；两个完整想法不能只用逗号硬连。",
    explanationEn:
      "A complete sentence needs a full clause, and two full ideas need more than a comma between them.",
    weakExampleEn:
      "Public parks are free, many residents visit them after work.",
    strongExampleEn:
      "Public parks are free to use, so many residents visit them after work.",
    decisionZh: "先数完整主谓结构，再决定用句号、连词还是从句连接。",
    decisionEn:
      "Count complete clauses first, then choose a full stop, conjunction, or subordinate clause.",
    practiceContextEn: "a school library after class",
    transferContextEn: "a city recycling scheme",
  },
  subject_verb_agreement: {
    titleZh: "找到真正的主语，再配动词",
    titleEn: "Match the verb to the real subject",
    coreAbilityZh: "识别核心主语并保持主谓一致",
    coreAbilityEn:
      "Identify the head subject and maintain subject-verb agreement",
    explanationZh: "介词短语和修饰语会把主语藏起来，动词仍要和核心名词一致。",
    explanationEn:
      "Extra phrases can hide the subject, but the verb must still agree with the head noun.",
    weakExampleEn: "The benefits of regular exercise improves concentration.",
    strongExampleEn:
      "The benefits of regular exercise improve concentration during demanding lessons.",
    decisionZh: "删去插入信息后，先读出主语中心词，再选动词形式。",
    decisionEn:
      "Remove extra phrases, find the head subject, and then choose the verb form.",
    practiceContextEn: "the advantages of public transport",
    transferContextEn: "a series of local workshops",
  },
  article_control: {
    titleZh: "先判断指代，再选择冠词",
    titleEn: "Choose articles from reference and countability",
    coreAbilityZh: "根据可数性和指代关系选择冠词",
    coreAbilityEn: "Choose articles from countability and reference",
    explanationZh:
      "冠词选择取决于名词是否可数、是否首次出现，以及读者能否确定所指对象。",
    explanationEn:
      "Article choice depends on countability, whether the noun is new, and whether the reader can identify it.",
    weakExampleEn:
      "Government should provide education for children in rural areas.",
    strongExampleEn:
      "The government should provide better educational access for children in rural areas.",
    decisionZh: "先问名词是否可数、是否特指，再选择 a、an、the 或零冠词。",
    decisionEn:
      "Ask whether the noun is countable and identifiable before choosing a, an, the, or no article.",
    practiceContextEn: "access to a community health centre",
    transferContextEn: "information in a public campaign",
  },
  collocation_perspective: {
    titleZh: "用自然搭配表达准确意思",
    titleEn: "Express the meaning with natural collocations",
    coreAbilityZh: "先确认意思，再选择自然的英语搭配",
    coreAbilityEn:
      "Confirm the meaning before choosing a natural English collocation",
    explanationZh:
      "自然表达不是逐词翻译；先确定想强调的关系，再选英语里常见的组合方式。",
    explanationEn:
      "Natural expression is not word-for-word translation; decide the relationship first, then choose a common English combination.",
    weakExampleEn: "Students should make more sports to keep healthy.",
    strongExampleEn:
      "Students should take part in regular physical activity to stay healthy.",
    decisionZh:
      "先写出中文意图中的重点，再比较哪个英文搭配最自然地承担这个重点。",
    decisionEn:
      "State the intended emphasis first, then choose the collocation that carries it naturally.",
    practiceContextEn: "building confidence through group work",
    transferContextEn: "reducing household waste",
  },
  word_form_precision: {
    titleZh: "让词形承担正确功能",
    titleEn: "Use word forms for the right function",
    coreAbilityZh: "根据句子功能选择准确的词形",
    coreAbilityEn: "Choose an accurate word form for the sentence function",
    explanationZh:
      "同一个词根可以承担名词、动词、形容词或副词功能，位置和语法角色决定选择。",
    explanationEn:
      "One word family can work as a noun, verb, adjective, or adverb; its grammatical role determines the form.",
    weakExampleEn:
      "Regular reading can improve students' language ability greatly.",
    strongExampleEn:
      "Regular reading can greatly improve students' language ability.",
    decisionZh:
      "先找空格或词语在句中的角色，再从同词族中选择能承担该角色的形式。",
    decisionEn:
      "Identify the word's role in the sentence before choosing a form from the same word family.",
    practiceContextEn: "describing a noticeable improvement",
    transferContextEn: "explaining an effective local policy",
  },
  task_instruction_coverage: {
    titleZh: "逐项回应题目要求",
    titleEn: "Cover every required part of the task",
    coreAbilityZh: "把题目中的每项要求转化为可见回应",
    coreAbilityEn: "Turn every task requirement into a visible response",
    explanationZh:
      "完成题意不是写得很多，而是让每个要求都能在段落中找到对应回应。",
    explanationEn:
      "Task completion is not about length; every stated requirement needs a visible response in the paragraph.",
    weakExampleEn:
      "Schools should teach financial skills because they are useful.",
    strongExampleEn:
      "Schools should teach financial skills because early guidance helps students make informed choices, while lessons should remain practical rather than overly technical.",
    decisionZh: "先把题目拆成要求清单，再为每一项安排一句可检查的回应。",
    decisionEn:
      "List the task requirements first, then assign each one a checkable response.",
    practiceContextEn: "benefits and risks of online courses",
    transferContextEn: "responsibilities of local governments",
  },
  mechanism_chain: {
    titleZh: "让读者看见观点如何一步步成立",
    titleEn: "Show how a claim works step by step",
    coreAbilityZh: "用原因机制结果完整展开一个观点",
    coreAbilityEn: "Develop one claim through a cause, mechanism, and result",
    explanationZh:
      "原因说明起点，机制解释发生了什么变化，结果让读者看见最后影响。",
    explanationEn:
      "A cause gives the starting point, a mechanism explains the change, and a result shows the final effect.",
    weakExampleEn:
      "Flexible schedules are useful, so employees perform better.",
    strongExampleEn:
      "Flexible schedules let employees work during productive hours, which improves concentration and raises the quality of their output.",
    decisionZh:
      "写完原因后追问：它先改变了什么具体过程，那个过程又怎样带来结果。",
    decisionEn:
      "After stating a cause, ask what concrete process changes and how that change creates the result.",
    practiceContextEn: "regular feedback at school",
    transferContextEn: "preventive healthcare in a city",
  },
  development_relevance: {
    titleZh: "用相关细节发展观点",
    titleEn: "Develop claims with relevant detail",
    coreAbilityZh: "用直接支持观点的细节展开论证",
    coreAbilityEn:
      "Develop an argument with details that directly support the claim",
    explanationZh: "细节的价值不在于数量，而在于它是否解释或证明了前面的观点。",
    explanationEn:
      "Details matter when they explain or support the earlier claim rather than simply adding information.",
    weakExampleEn:
      "Public libraries are important because they have many books and computers.",
    strongExampleEn:
      "Public libraries give residents free access to information and study space, helping job seekers build practical skills.",
    decisionZh: "每加一个细节都问：它怎样支持我的观点，而不是它本身是否有趣。",
    decisionEn:
      "For every detail, ask how it supports the claim instead of whether it is merely interesting.",
    practiceContextEn: "a school mentoring programme",
    transferContextEn: "investment in public parks",
  },
  weighing_qualification: {
    titleZh: "承认条件，再给出有分寸的判断",
    titleEn: "Qualify a claim with relevant conditions",
    coreAbilityZh: "在有条件的情况下作出平衡判断",
    coreAbilityEn: "Make a balanced judgement under stated conditions",
    explanationZh:
      "有分寸的观点会承认真实限制，同时说明这些限制是否改变最终结论。",
    explanationEn:
      "A balanced claim acknowledges a real limitation and explains whether it changes the final judgement.",
    weakExampleEn: "Remote work is always better than office work.",
    strongExampleEn:
      "Remote work can improve concentration for independent tasks, although teams that need daily coordination may still benefit from regular office contact.",
    decisionZh: "先说结论适用的情况，再加入真正会改变判断的限制。",
    decisionEn:
      "State when the claim applies, then add a limitation that genuinely changes the judgement.",
    practiceContextEn: "using technology in classrooms",
    transferContextEn: "tourism in historic towns",
  },
  paragraph_function_order: {
    titleZh: "按功能安排段落顺序",
    titleEn: "Order a paragraph by function",
    coreAbilityZh: "按观点、解释、例证和结果组织段落",
    coreAbilityEn:
      "Organise a paragraph through claim, explanation, support, and result",
    explanationZh: "段落中的句子要各自承担功能，并按读者容易理解的顺序推进。",
    explanationEn:
      "Each sentence needs a function, and the functions should progress in an order the reader can follow.",
    weakExampleEn:
      "Public transport reduces traffic. It is important. Many people use buses. Cities have roads.",
    strongExampleEn:
      "Reliable public transport can reduce traffic because it gives commuters a practical alternative to driving. As more people choose buses or trains, fewer private cars enter congested roads.",
    decisionZh: "先写观点，再解释原因，用支持细节推进，最后落到可观察结果。",
    decisionEn:
      "State the claim, explain it, add supporting detail, and finish with an observable result.",
    practiceContextEn: "a paragraph about school meals",
    transferContextEn: "a paragraph about urban green space",
  },
  reference_linking: {
    titleZh: "让代词和连接词指向清楚",
    titleEn: "Make reference and links clear",
    coreAbilityZh: "让指代词和连接关系清楚连接前后信息",
    coreAbilityEn: "Use clear reference words and links between ideas",
    explanationZh:
      "代词和连接词必须让读者立即找到它指向的内容，以及两句话之间的关系。",
    explanationEn:
      "Reference words and links must show the reader exactly what they refer to and how the ideas relate.",
    weakExampleEn: "Schools offer clubs. This improves it for students.",
    strongExampleEn:
      "Schools offer after-class clubs, and these activities give students more chances to build confidence through shared tasks.",
    decisionZh:
      "每次使用 this、they 或连接词时，都检查读者能否立刻找到所指对象和逻辑关系。",
    decisionEn:
      "Whenever you use this, they, or a linking word, check that the reader can find its referent and relation immediately.",
    practiceContextEn: "linking two ideas about volunteer work",
    transferContextEn: "linking two ideas about local health services",
  },
};

export function focusedRecoveryLessonFor(
  skillId: SkillId,
): FocusedRecoveryLesson {
  return lessons[skillId];
}

function blueprint(lesson: FocusedRecoveryLesson): TeachingBlueprint {
  return {
    coreAbilityZh: lesson.coreAbilityZh,
    coreAbilityEn: lesson.coreAbilityEn,
    difficultyType: "REVISES_BUT_CANNOT_GENERATE",
    completionStandardZh: "能在两个陌生语境中独立使用本课方法完成清楚表达。",
    completionStandardEn:
      "Independently use this lesson method in two unfamiliar contexts.",
    prerequisiteAbilityZh: "能读懂英文题目中的基本要求",
    prerequisiteAbilityEn:
      "Understand the basic requirement in an English prompt",
    supportingAbilityZh: "用完整句表达一个具体意思",
    supportingAbilityEn: "Express one specific idea in a complete sentence",
    selectedBlockKinds: [
      "EXPLANATION",
      "CONTRAST",
      "REASONING",
      "TOOLKIT",
      "PITFALLS",
      "PRACTICE",
      "SUMMARY",
    ],
  };
}

function paper(lesson: FocusedRecoveryLesson): PracticePaperContent {
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
  const minutes = [5, 5, 7, 7, 8, 8, 10, 10] as const;
  return {
    titleZh: "专项能力训练卷",
    titleEn: "Focused ability practice paper",
    objectiveZh: `${lesson.coreAbilityZh}，并在不同语境中独立完成表达。`,
    objectiveEn: `${lesson.coreAbilityEn} in independent writing across different contexts.`,
    instructionsZh: [
      "限时60分钟，按顺序完成八道题。",
      "先独立作答，交卷前不查看答案。",
      "每题都按题面中可见的要求完成。",
    ],
    instructionsEn: [
      "Work for 60 minutes and complete all eight questions in order.",
      "Answer independently before submitting the full paper.",
      "Follow every visible requirement in each question.",
    ],
    items: sections.map((section, index) => {
      const number = index + 1;
      const requirement =
        index === 0 ? "选择唯一符合题意的表达。" : "准确落实本题要求。";
      const prompt = [
        `Which sentence best demonstrates this ability in ${lesson.practiceContextEn}?`,
        `Explain the key decision for ${lesson.practiceContextEn} in one clear English sentence.`,
        `Rewrite the source sentence so it shows ${lesson.coreAbilityEn.toLowerCase()}.`,
        `Repair the source sentence without changing its intended meaning.`,
        `Write one original sentence about ${lesson.practiceContextEn}.`,
        `Write one original sentence about ${lesson.transferContextEn}.`,
        `Write a short paragraph that applies this ability to an education topic.`,
        `Write a short paragraph that applies this ability to a community topic.`,
      ][index]!;
      return {
        section,
        titleZh: `第${number}题`,
        titleEn: `Question ${number}`,
        instructionZh:
          index === 0
            ? `选择唯一符合题意的表达；${requirement}`
            : index >= 6
              ? `写一个80至120词的英文段落；${requirement}`
              : `写一个20至45词的英文回答；${requirement}`,
        promptEn: prompt,
        sourceText:
          section === "REPAIR"
            ? index === 2
              ? lesson.weakExampleEn
              : "The idea is useful, it helps people in many ways."
            : "",
        responseMode:
          index === 0 ? "choice" : index >= 6 ? "paragraph" : "sentence",
        options:
          index === 0
            ? [
                {
                  key: "A",
                  labelEn:
                    "It gives a general opinion without showing the key decision.",
                },
                {
                  key: "B",
                  labelEn:
                    "It makes the required writing decision clear and specific.",
                },
                {
                  key: "C",
                  labelEn:
                    "It repeats the topic without developing the required idea.",
                },
              ]
            : [],
        acceptedAnswers: index === 0 ? ["B"] : [],
        answerExplanationZh:
          index === 0
            ? "正确选项必须把本课要求的写作决定说清楚。"
            : "答案需要直接回应题面要求，并保持表达清楚自然。",
        suggestedMinutes: minutes[index]!,
        minimumWords: index >= 6 ? 80 : index === 0 ? 1 : 20,
        maximumWords: index >= 6 ? 120 : index === 0 ? 1 : 45,
        publicCriteria: [
          {
            labelZh: index === 0 ? "题意判断" : "题意完成",
            labelEn: index === 0 ? "Task judgement" : "Task completion",
            descriptionZh: requirement,
            descriptionEn:
              index === 0
                ? "Choose the only expression that meets the task requirement."
                : "Meet the stated requirement accurately.",
            weight: 100,
          },
        ],
      };
    }),
  };
}

export function sourceOwnedFocusedRecoveryPackage(
  skillId: SkillId,
): FocusedLearningPackage {
  const lesson = focusedRecoveryLessonFor(skillId);
  return {
    teachingModule: {
      format: "ADAPTIVE_ARTICLE_V1",
      titleZh: lesson.titleZh,
      titleEn: lesson.titleEn,
      introductionZh: `本教程通过全新例子训练${lesson.coreAbilityZh}，并让你在陌生话题中独立使用。`,
      introductionEn: `This tutorial uses new examples to help you ${lesson.coreAbilityEn.toLowerCase()}.`,
      estimatedMinutes: 24,
      blueprint: blueprint(lesson),
      sections: [
        {
          anchor: "make-the-decision",
          titleZh: "先看清要做的表达决定",
          titleEn: "See the writing decision first",
          blocks: [
            {
              kind: "EXPLANATION",
              titleZh: "为什么这一步重要",
              titleEn: "Why this step matters",
              paragraphsZh: [lesson.explanationZh],
              paragraphsEn: [lesson.explanationEn],
              keyPointZh: lesson.decisionZh,
              keyPointEn: lesson.decisionEn,
            },
            {
              kind: "CONTRAST",
              titleZh: "比较两个表达",
              titleEn: "Compare two expressions",
              weakExampleEn: lesson.weakExampleEn,
              strongExampleEn: lesson.strongExampleEn,
              differenceZh:
                "更合适的表达把需要读者理解的关系和具体信息说得更清楚。",
              differenceEn:
                "The stronger version makes the relationship and needed detail clear to the reader.",
            },
          ],
        },
        {
          anchor: "use-a-repeatable-check",
          titleZh: "用一个可重复的检查方法",
          titleEn: "Use a repeatable check",
          blocks: [
            {
              kind: "REASONING",
              titleZh: "从题意走到完整句子",
              titleEn: "Move from the task to a complete sentence",
              scenarioZh: "面对一个新话题时，先决定句子必须让读者看见什么。",
              scenarioEn:
                "When you meet a new topic, first decide what the reader must be able to see.",
              steps: [
                {
                  thinkingZh: "找出题目要求的核心关系。",
                  thinkingEn: "Find the key relationship required by the task.",
                },
                {
                  thinkingZh: "选择能把这个关系说清的具体表达。",
                  thinkingEn:
                    "Choose specific wording that makes this relationship clear.",
                },
              ],
              resultEn:
                "A clear sentence gives the reader one complete, checkable idea.",
              takeawayZh: lesson.decisionZh,
              takeawayEn: lesson.decisionEn,
            },
            {
              kind: "TOOLKIT",
              titleZh: "写前检查工具",
              titleEn: "A tool for checking before you write",
              tools: [
                {
                  expressionEn: "First check the relationship.",
                  functionZh: "先确认句子要表达的关系。",
                  functionEn:
                    "Identify the relationship the sentence must express.",
                  conditionZh: "在写出第一个英文词之前使用。",
                  conditionEn:
                    "Use it before drafting the first English words.",
                  cautionZh: "不要只写一个积极或消极的空泛判断。",
                  cautionEn:
                    "Do not replace the relationship with a vague positive or negative judgement.",
                  exampleEn: lesson.strongExampleEn,
                },
              ],
            },
            {
              kind: "PITFALLS",
              titleZh: "常见误区",
              titleEn: "A common trap",
              items: [
                {
                  patternEn: "A vague claim",
                  problemZh: "只给出结论，读者看不到完成题意所需的信息。",
                  problemEn:
                    "A conclusion alone does not show the information needed to complete the task.",
                  betterEn: lesson.strongExampleEn,
                },
              ],
            },
          ],
        },
        {
          anchor: "try-and-transfer",
          titleZh: "先练习，再迁移到新话题",
          titleEn: "Practise, then transfer to a new topic",
          blocks: [
            {
              kind: "PRACTICE",
              titleZh: "独立完成三次小练习",
              titleEn: "Complete three short attempts independently",
              prompts: [
                {
                  id: "notice-the-decision",
                  instructionZh: "选择最清楚落实本课要求的一句英文表达。",
                  instructionEn:
                    "Choose the sentence that makes this lesson decision clearest.",
                  promptEn: `Which option best applies the method to ${lesson.practiceContextEn}?`,
                  responseMode: "CHOICE",
                  context: "SAME_TOPIC",
                  optionsEn: [
                    "The topic is important for everyone.",
                    "The sentence makes the required relationship clear through specific information.",
                    "Many people have different opinions about the topic.",
                  ],
                  referenceAnswerEn:
                    "The sentence makes the required relationship clear through specific information.",
                  referenceReasoningZh:
                    "它没有停在空泛判断，而是把读者需要理解的关系说清楚。",
                  referenceReasoningEn:
                    "It states the relationship the reader needs instead of stopping at a vague judgement.",
                },
                {
                  id: "write-with-guidance",
                  instructionZh:
                    "用一句英文完成题目，并把本课的关键关系写清楚。",
                  instructionEn:
                    "Write one English sentence and make this lesson's key relationship clear.",
                  promptEn: `Write about ${lesson.practiceContextEn} with one complete, specific idea.`,
                  responseMode: "SHORT_TEXT",
                  context: "SAME_TOPIC",
                  optionsEn: [],
                  referenceAnswerEn:
                    "A complete answer makes the required relationship visible through one specific detail.",
                  referenceReasoningZh:
                    "参考写法展示一种路径，不是唯一正确表达。",
                  referenceReasoningEn:
                    "The reference shows one route rather than the only correct expression.",
                },
                {
                  id: "transfer-to-new-topic",
                  instructionZh:
                    "换到陌生话题，用一至两句英文独立完成同一种表达决定。",
                  instructionEn:
                    "Transfer the same writing decision to a new topic in one or two English sentences.",
                  promptEn: `Apply the method to ${lesson.transferContextEn} without copying the earlier examples.`,
                  responseMode: "SHORT_TEXT",
                  context: "UNSEEN_TOPIC",
                  optionsEn: [],
                  referenceAnswerEn:
                    "A new answer should make the same relationship clear in different content.",
                  referenceReasoningZh:
                    "换题后仍能完成同一表达决定，才说明方法可以迁移。",
                  referenceReasoningEn:
                    "Using the same decision in new content shows that the method can transfer.",
                },
              ],
            },
            {
              kind: "SUMMARY",
              titleZh: "带进训练卷的三条规则",
              titleEn: "Three rules to carry into the paper",
              rulesZh: [
                "先确认题目要求读者看见的关系。",
                "用具体信息完成这个关系，而不是停在空泛判断。",
                "换一个话题后，再检查方法是否仍然成立。",
              ],
              rulesEn: [
                "Identify the relationship the task requires first.",
                "Use specific information rather than a vague judgement.",
                "Check whether the method still works in a new topic.",
              ],
              selfCheckZh: "遮住连接词后，我还能指出句子怎样完成题目要求吗？",
              selfCheckEn:
                "If I hide the linking words, can I still show how the sentence meets the task?",
            },
          ],
        },
      ],
    },
    paper: paper(lesson),
  };
}
