import type {
  AiConnection,
  AiConnectionInput,
  AiTaskKind,
  AttemptData,
  AttemptSubmission,
  BootstrapInput,
  ComparisonData,
  ConnectionProbe,
  CustomQuestionInput,
  CycleExportOption,
  CycleBundleImportResult,
  EssayWorkspaceData,
  FeedbackData,
  FocusedTeachingData,
  GrowthData,
  LearningClient,
  LessonData,
  PracticePaperData,
  ModelRouteSetting,
  QuestionOption,
  SettingsData,
  SystemStatus,
  TodayData,
  TeachingPracticePrompt,
  TeachingPracticeResponseData,
  TransferResponseInput,
  TransferResult,
  TransferSubmission,
  TransferTaskData,
  UserPreferences,
} from "./types";
import {
  buildLearningDestinations,
  mergeLearningDestinations,
} from "./learning-navigation";
import { LearningClientError } from "./errors";
import {
  projectTeachingPracticeResponse,
  unavailableTeachingPracticeResponse,
} from "./teaching-practice-projection";

const STORAGE_KEYS = {
  ai: "iwc.demo.ai-enabled",
  draftV1: "iwc.demo.draft.v1",
  draftV2: "iwc.demo.draft.v2",
  lesson: "iwc.demo.lesson-index",
  lessonElapsed: "iwc.demo.lesson-elapsed",
  lessonEvaluationFailure: "iwc.demo.lesson-evaluation-failure",
  lessonGenerationFailure: "iwc.demo.lesson-generation-failure",
  lessonPracticeComplete: "iwc.demo.lesson-practice-complete",
  lessonRefresher: "iwc.demo.lesson-refresher",
  lessonSplit: "iwc.demo.lesson-split",
  preferences: "iwc.demo.preferences",
  rewriteWindowExpired: "iwc.demo.rewrite-window-expired",
  selectedQuestion: "iwc.demo.selected-question",
  transferAnswer: "iwc.demo.transfer-answer",
  transferWindowExpired: "iwc.demo.transfer-window-expired",
  transferResult: "iwc.demo.transfer-result",
  teachingPracticeResponses: "iwc.demo.teaching-practice-responses",
} as const;

const delay = async (milliseconds = 160): Promise<void> => {
  await new Promise<void>((resolve) =>
    window.setTimeout(resolve, milliseconds),
  );
};

const canUseStorage = (): boolean => typeof window !== "undefined";

const readStorage = (key: string): string | null =>
  canUseStorage() ? window.localStorage.getItem(key) : null;

const writeStorage = (key: string, value: string): void => {
  if (canUseStorage()) window.localStorage.setItem(key, value);
};

const countWords = (value: string): number =>
  value.trim().split(/\s+/).filter(Boolean).length;

const removeStorage = (key: string): void => {
  if (canUseStorage()) window.localStorage.removeItem(key);
};

function demoDraftStorageKey(version: 1 | 2, cycleId: string): string {
  const base = version === 1 ? STORAGE_KEYS.draftV1 : STORAGE_KEYS.draftV2;
  return cycleId === "cycle-demo" ? base : `${base}:${cycleId}`;
}

function demoAttemptId(version: 1 | 2, cycleId: string): string {
  const base = version === 1 ? "attempt-v1" : "attempt-v2";
  return cycleId === "cycle-demo" ? base : `${base}:${cycleId}`;
}

function cycleIdFromDemoAttempt(attemptId: string): string {
  const separator = attemptId.indexOf(":");
  return separator < 0 ? "cycle-demo" : attemptId.slice(separator + 1);
}

const teachingPracticeResponseKey = (lessonId: string, promptId: string) =>
  `${lessonId}:${promptId}`;

const readTeachingPracticeResponses = (): Record<
  string,
  TeachingPracticeResponseData
> => {
  const stored = readStorage(STORAGE_KEYS.teachingPracticeResponses);
  if (!stored) return {};
  try {
    const value = JSON.parse(stored) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const responses: Record<string, TeachingPracticeResponseData> = {};
    for (const [key, candidate] of Object.entries(value)) {
      const projected = projectTeachingPracticeResponse(candidate);
      if (projected) responses[key] = projected;
    }
    return responses;
  } catch {
    return {};
  }
};

const writeTeachingPracticeResponses = (
  value: Record<string, TeachingPracticeResponseData>,
) =>
  writeStorage(STORAGE_KEYS.teachingPracticeResponses, JSON.stringify(value));

function deterministicMockChoice(
  prompt: TeachingPracticePrompt,
  answer: string,
): TeachingPracticeResponseData["analysis"] {
  const followsReference = answer === prompt.referenceAnswerEn;
  return {
    kind: "DETERMINISTIC_CHOICE",
    summary: followsReference
      ? {
          zh: "你的选择与参考思路采用了同一条作用路径；参考选项只是其中一种可行表达。",
          en: "Your choice follows the reference path, which is one possible answer rather than the only valid wording.",
        }
      : {
          zh: "你的选择强调了不同的句子功能；下面只做结构对照，不把参考选项当作唯一答案。",
          en: "Your choice emphasizes a different sentence function. This is a structural comparison, not a single-answer verdict.",
        },
    strengths: followsReference
      ? [
          {
            zh: "你识别出了参考思路强调的作用过程。",
            en: "You identified the functional process emphasized by the reference.",
            userAnswerEvidence: [answer],
          },
        ]
      : [],
    comparisonPoints: [
      {
        aspect: { zh: "句子功能", en: "Sentence function" },
        referenceFeature: {
          zh: prompt.referenceReasoningZh,
          en: prompt.referenceReasoningEn,
        },
        learnerDifference: followsReference
          ? {
              zh: "你的选择呈现了相同的作用过程。",
              en: "Your choice presents the same functional process.",
            }
          : {
              zh: "你的选择呈现了另一条表达路径，可以继续检查它是否完成题目要求。",
              en: "Your choice takes another path; check whether it completes the requested function.",
            },
        userAnswerEvidence: [answer],
      },
    ],
    nextCheck: {
      zh: "检查选项是否明确完成题目要求的句子功能。",
      en: "Check whether the option clearly performs the requested sentence function.",
    },
  };
}

function mockShortTextAnalysis(): TeachingPracticeResponseData["analysis"] {
  return {
    kind: "DEMO_ONLY",
    summary: {
      zh: "你的答案已保存；当前演示只展示解析版式。",
      en: "Your answer was saved; this demo only shows the analysis layout.",
    },
    strengths: [],
    comparisonPoints: [],
    nextCheck: {
      zh: "完整解析可用后，再根据你的原句查看有证据支持的个性化建议。",
      en: "When full analysis is available, review evidence-based suggestions tied to your sentence.",
    },
    uncertainty: {
      zh: "演示模式没有判断你的英语质量，也不会据此记录能力。",
      en: "Demo mode did not judge your English quality or record a skill result.",
    },
  };
}

const defaultEssay = `In recent years, an increasing number of primary schools have introduced foreign-language lessons. In my view, the advantages of beginning this process at an early age outweigh the possible disadvantages.

Young children are usually more willing to imitate unfamiliar sounds and are less afraid of making mistakes. Regular exposure therefore helps them become familiar with basic language patterns before their academic work becomes more demanding. This foundation can make later learning more efficient. Early language lessons can also introduce children to different cultures, which may encourage curiosity and a more open attitude towards people from other backgrounds.

Admittedly, adding another subject can place pressure on some pupils. Language classes may take up time that could otherwise be spent playing, exercising or resting, and children who have little interest in the subject may eventually lose motivation. However, this drawback is manageable if schools keep lessons short, interactive and appropriate for the pupils' age. At primary level, the aim should be exposure and enjoyment rather than examinations or large amounts of homework.

In conclusion, early foreign-language education offers lasting linguistic and cultural benefits. Although poorly designed courses may create extra pressure, this risk can be reduced through suitable teaching methods, so the advantages are more significant overall.`;

const writingPrompt = {
  id: "prompt-foreign-language",
  category: "Education · Advantages / Disadvantages",
  question:
    "Some experts believe that it is better for children to begin learning a foreign language at primary school rather than secondary school.",
  instruction: "Do the advantages of this outweigh the disadvantages?",
  sourceLabel: "Practice question · Task 2",
};

const transferPrompt = {
  id: "prompt-transfer-technology",
  category: "Technology · Advantages / Disadvantages",
  question:
    "Some people believe that children should begin using computers in primary school.",
  instruction: "Do the advantages outweigh the disadvantages?",
  sourceLabel: "D5–D7 unfamiliar question · hints hidden",
};

const mockTransferResult = (): TransferResult => ({
  outcome: "PASS",
  confidence: null,
  feedbackZh:
    "Mock 模式只验证提交流程，不评判你的英语，也不会据此授予 transferred。连接真实评估服务后才能生成语言证据。",
  feedbackEn:
    "Mock mode validates the submission flow only. It does not judge your English or award transferred; connect a real evaluator for language evidence.",
  evidence: "Demo submission saved; no linguistic claim was generated.",
  evidenceStatus: "DEMO_ONLY_NOT_LANGUAGE_SCORED",
  transferred: false,
  gateMissing: ["server_language_evaluation"],
  mockLanguageScoring: true,
});

const connectedAi: AiConnection = {
  id: "connection-primary",
  provider: "openai",
  vendor: "openai",
  displayName: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-5.4-mini",
  state: "connected",
  secretSource: "encrypted",
  secretHint: "••••••••••••",
  lastTestedZh: "今天 14:32",
  lastTestedEn: "Today at 14:32",
  latencyMs: 842,
  structuredOutput: true,
};

const missingAi: AiConnection = {
  ...connectedAi,
  id: "connection-missing",
  displayName: "尚未连接",
  model: "—",
  state: "missing",
  secretSource: "none",
  lastTestedZh: "尚未测试",
  lastTestedEn: "Not tested",
  latencyMs: null,
  structuredOutput: false,
};

const defaultPreferences: UserPreferences = {
  deploymentMode: "personal",
  locale: "zh-CN",
  feedbackLanguage: "zh-with-en",
  examType: "academic",
  targetBand: 7,
  timezone: "Asia/Shanghai",
  studyTime: "20:00",
  studyDays: ["Tue", "Thu", "Sat"],
  strictTimedMode: true,
  emailNotifications: true,
  email: "simon@example.com",
  quietHoursEnabled: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
};

const getPreferences = (): UserPreferences => {
  const stored = readStorage(STORAGE_KEYS.preferences);
  if (!stored) return defaultPreferences;
  try {
    return JSON.parse(stored) as UserPreferences;
  } catch {
    return defaultPreferences;
  }
};

const aiEnabled = (): boolean => readStorage(STORAGE_KEYS.ai) !== "false";

const feedbackEssay =
  "First of all, children always have a better ability to absorb new knowledges than the elder one especially in learning a new foreign language. They can understand new vocabulary and improve their listening skills easily, which makes children can develop a foreign language mindset more naturally.\n\nOn the other hand, the pressure from the courses in primary school is much slighter. Children have more time to explore new cultures and take part in other activities.\n\nIn conclusion, the advantages of learning a foreign language at primary school outweigh the disadvantages.";

const feedbackSpan = (evidence: string) => {
  const startOffset = feedbackEssay.indexOf(evidence);
  if (startOffset < 0) {
    throw new Error(
      `Demo feedback evidence is not present in Version 1: ${evidence}`,
    );
  }
  return { endOffset: startOffset + evidence.length, startOffset };
};

const feedback: FeedbackData = {
  cycleId: "cycle-demo",
  attemptId: "attempt-v1",
  lessonId: "lesson-collocation-perspective",
  overallScore: 6,
  languageScored: false,
  scoreRange: "6.0–6.5",
  modelLabel: "Deterministic demo · not language scored",
  rubricVersion: "IELTS Task 2 rubric · 2026.1",
  strengthZh:
    "立场清晰，而且优缺点都有回应；你已经在写一篇真正的议论文，而不是堆砌观点。",
  strengthEn:
    "Your position is clear and both sides are addressed with a recognisable argument structure.",
  prompt:
    "Some experts believe that it is better for children to begin learning a foreign language at primary school rather than secondary school. Do the advantages outweigh the disadvantages?",
  originalEssay: feedbackEssay,
  overallSummaryZh:
    "文章立场明确并完成了优缺点比较，但语言准确度、自然搭配和因果展开仍限制说服力。",
  overallSummaryEn:
    "The essay has a clear position and addresses both sides, but accuracy, collocation and causal development limit its persuasiveness.",
  paragraphFeedback: [
    {
      paragraphIndex: 1,
      excerpt:
        "First of all, children always have a better ability to absorb new knowledges than the elder one...",
      roleZh: "优势段：提出儿童学习能力更强",
      roleEn: "Advantages paragraph: stronger learning ability",
      diagnosisZh:
        "核心观点清楚，但比较对象、knowledge的可数性和结果句动词结构都有问题；从学习能力跳到长期好处时也缺少中间机制。",
      diagnosisEn:
        "The main claim is clear, but the comparison, countability and result-clause grammar need correction, and the mechanism is underdeveloped.",
      actionZh:
        "先写清儿童与成年人之间的同类比较，再补充“反复接触使语言模式变熟悉”这一中间过程。",
      actionEn:
        "Make the child–adult comparison parallel, then add the process by which exposure makes patterns familiar.",
      revisionZh:
        "First of all, children often absorb a new foreign language more easily than older learners. Because they meet new words and sentence patterns every day, these patterns become familiar through repeated contact, which helps them develop a natural language mindset.",
      revisionEn:
        "First of all, children often absorb a new foreign language more easily than older learners. Because they meet new words and sentence patterns every day, these patterns become familiar through repeated contact, which helps them develop a natural language mindset.",
    },
    {
      paragraphIndex: 2,
      excerpt:
        "On the other hand, the pressure from the courses in primary school is much slighter.",
      roleZh: "让步段：讨论课程压力",
      roleEn: "Concession paragraph: course pressure",
      diagnosisZh:
        "段落方向可以支持总体立场，但原句没有写清与什么阶段相比，也从课程视角直译了“压力更小”。",
      diagnosisEn:
        "The paragraph can support the position, but the comparison point is missing and the pressure expression follows an unnatural perspective.",
      actionZh:
        "明确比较对象，并根据意思选择pupils face less pressure或the workload is lighter。",
      actionEn:
        "Name the comparison and choose either pupils face less pressure or the workload is lighter according to the intended meaning.",
      revisionZh:
        "On the other hand, pupils face less pressure in primary school than at later stages. With a lighter workload, they have more time to explore new cultures and take part in other activities.",
      revisionEn:
        "On the other hand, pupils face less pressure in primary school than at later stages. With a lighter workload, they have more time to explore new cultures and take part in other activities.",
    },
    {
      paragraphIndex: 3,
      excerpt:
        "In conclusion, the advantages of learning a foreign language at primary school outweigh the disadvantages.",
      roleZh: "结论：重申权衡结果",
      roleEn: "Conclusion: restate the weighing judgment",
      diagnosisZh: "立场明确，但只重复结论，没有用一句话概括为什么优势更重要。",
      diagnosisEn:
        "The position is clear, but the conclusion repeats it without summarising why the advantages carry more weight.",
      actionZh:
        "补充一条权衡标准，例如长期收益持续更久，而压力风险可通过课程设计控制。",
      actionEn:
        "Add a weighing criterion, such as lasting benefits versus manageable course-design risks.",
      revisionZh:
        "In conclusion, the advantages of learning a foreign language at primary school outweigh the disadvantages because the lasting benefits of early exposure persist well beyond school, while the pressure risk can be controlled through careful course design.",
      revisionEn:
        "In conclusion, the advantages of learning a foreign language at primary school outweigh the disadvantages because the lasting benefits of early exposure persist well beyond school, while the pressure risk can be controlled through careful course design.",
    },
  ],
  lessonGenerationRetry: null,
  issueClassificationRetry: null,
  scores: [
    {
      criterion: "TR",
      labelZh: "任务回应",
      labelEn: "Task Response",
      score: 6.5,
      confidence: "high",
      summaryZh: "回应完整，但优势为何更重要还可以比较得更明确。",
      summaryEn:
        "The response is complete, but the weighing criterion needs to be more explicit.",
    },
    {
      criterion: "CC",
      labelZh: "连贯与衔接",
      labelEn: "Coherence & Cohesion",
      score: 6,
      confidence: "high",
      summaryZh: "段落清楚，个别因果链缺少中间机制。",
      summaryEn:
        "Paragraphing is clear, while some causal chains skip an intermediate step.",
    },
    {
      criterion: "LR",
      labelZh: "词汇资源",
      labelEn: "Lexical Resource",
      score: 6,
      confidence: "medium",
      summaryZh: "能表达复杂意思，但仍有从中文逐词拼装的搭配。",
      summaryEn:
        "Complex ideas are expressed, but several collocations are assembled too literally.",
    },
    {
      criterion: "GRA",
      labelZh: "语法范围与准确度",
      labelEn: "Grammar Range & Accuracy",
      score: 5.5,
      confidence: "high",
      summaryZh: "句型有变化，比较结构和动词形式仍会反复失误。",
      summaryEn:
        "There is structural variety, with recurring comparison and verb-form errors.",
    },
  ],
  issues: [
    {
      id: "issue-collocation",
      priority: 1,
      categoryZh: "自然搭配与英语视角",
      categoryEn: "Collocation & perspective",
      titleZh: "从“课程造成压力”切换为“学生承受压力”",
      titleEn: "Shift from courses causing pressure to pupils facing pressure",
      evidence:
        "the pressure from the courses in primary school is much slighter.",
      ...feedbackSpan(
        "the pressure from the courses in primary school is much slighter.",
      ),
      explanationZh:
        "much slighter 在形式上可以构成比较级，但英语更常让承受压力的人作主语，并搭配 face academic pressure。",
      explanationEn:
        "Although much slighter can form a comparison, English more naturally makes the person experiencing pressure the subject.",
      transferRuleZh:
        "先判断你描述的是人承受压力、课业量，还是课程要求，再选择对应词块。",
      transferRuleEn:
        "First identify whether you mean pressure, workload, or course demands; then choose the matching chunk.",
      issueType: "COLLOCATION",
      correctedVersion:
        "Academic pressure is generally lower in primary school than in secondary school.",
      knowledgePointZh:
        "much可以修饰比较级；真正的问题是slighter pressure搭配生硬、比较对象缺失，以及表达视角不自然。",
      severity: "naturalness",
      confidence: 0.93,
    },
    {
      id: "issue-comparison",
      priority: 2,
      categoryZh: "比较结构",
      categoryEn: "Comparison structure",
      titleZh: "比较对象必须完整且属于同一类别",
      titleEn: "Make both sides of a comparison complete and parallel",
      evidence:
        "children always have a better ability to absorb new knowledges than the elder one",
      ...feedbackSpan(
        "children always have a better ability to absorb new knowledges than the elder one",
      ),
      explanationZh:
        "older 在这里是形容词，缺少 people 或 learners，导致比较对象不完整。",
      explanationEn:
        "Older is adjectival here and needs a noun such as people or learners.",
      transferRuleZh: "写 than 后立即检查：A 与 B 是否同类，B 是否写完整。",
      transferRuleEn:
        "After than, check that A and B are parallel and that B is complete.",
      issueType: "GRAMMAR",
      correctedVersion:
        "Children generally absorb new knowledge more readily than adults.",
      knowledgePointZh:
        "knowledge在这里通常不可数；than前后应比较同类且名词成分完整。",
      severity: "must_fix",
      confidence: 0.97,
    },
    {
      id: "issue-argument",
      priority: 3,
      categoryZh: "论证链",
      categoryEn: "Argument chain",
      titleZh: "补足原因到长期意义之间的机制",
      titleEn:
        "Add the mechanism between a cause and its long-term significance",
      evidence:
        "They can understand new vocabulary and improve their listening skills easily, which makes children can develop a foreign language mindset more naturally.",
      ...feedbackSpan(
        "They can understand new vocabulary and improve their listening skills easily, which makes children can develop a foreign language mindset more naturally.",
      ),
      explanationZh:
        "观点方向正确，但需要说明早期接触如何形成基础，以及这个基础为何能降低后期学习成本。",
      explanationEn:
        "The direction is sound, but the mechanism from exposure to a useful foundation is missing.",
      transferRuleZh: "每个主体观点至少回答 Why、How 和 So what。",
      transferRuleEn: "For each body idea, answer Why, How, and So what.",
      issueType: "LOGIC",
      correctedVersion:
        "Regular exposure makes basic language patterns familiar, so children need less effort to process them during later study.",
      knowledgePointZh:
        "完整主体观点通常需要观点、原因、中间机制和具体结果，而不只是claim + beneficial。",
      severity: "must_fix",
      confidence: 0.9,
    },
  ],
  targetIssueId: "issue-argument",
  lessonScheduledLabelZh: "专项教学已经准备好；学完后再进入60分钟训练卷。",
  lessonScheduledLabelEn:
    "Your focused teaching is ready; the 60-minute paper follows after it.",
};

export const mechanismChainTeachingFixture: FocusedTeachingData = {
  id: "lesson-demo",
  cycleId: "cycle-demo",
  format: "ADAPTIVE_ARTICLE_V1",
  titleZh: "别让论证从原因直接跳到结果",
  titleEn: "Build the missing link in a causal argument",
  introductionMarkdown:
    "这篇教程集中训练一件事：把中间发生的过程说清楚，让读者能够跟上你的推理。",
  estimatedMinutes: 28,
  sections: [
    {
      titleZh: "看见被跳过的一步",
      titleEn: "See the missing link",
      markdown:
        "原因告诉读者起点，结果告诉读者终点，机制说明变化如何从起点走到终点。只有补出中间发生的变化，论证才真正向前推进。\n\n**核心判断**：机制句必须增加一个新的中间步骤。\n\n对比下面两个表达：\n\n- 较弱：Remote work is flexible, so employees are more productive.\n- 较强：Remote work removes many daily interruptions, allowing employees to protect longer periods for concentrated tasks and therefore complete demanding work more efficiently.\n\n较强的句子补上了“减少打断”和“保留专注时间”两个可理解步骤，而不是只重复远程办公有好处。",
    },
    {
      titleZh: "从一个问题推出机制",
      titleEn: "Build the mechanism one step at a time",
      markdown:
        "城市增加独立自行车道为什么可以改善通勤？\n\n1. 先找到直接变化：骑行者不必与汽车争抢道路空间。\n2. 再追问行为会怎样改变：更多人愿意在短途通勤时骑车。\n3. 最后落到可以观察的结果：繁忙道路上的汽车压力下降。\n\n> Separated cycle lanes make short journeys feel safer, which encourages commuters to replace some car trips and reduces pressure on busy roads.\n\n**写前检查**：用 This means that 连接“具体变化→下一步影响”，不要用它连接两个空泛的积极判断。\n\n**常见误区**：把积极评价当成解释。*Exercise improves concentration because it is healthy.* 没有说明身体活动怎样影响课堂注意力。",
    },
    {
      titleZh: "换一个话题验证方法",
      titleEn: "Transfer the method to a new topic",
      markdown:
        "下次写作只检查这三件事：\n\n1. 原因和结果之间是否出现了新的中间步骤？\n2. 中间步骤是否回答了影响如何发生？\n3. 结果是否具体到可以被观察？\n\n**自检**：删掉中间句后，推理是否几乎没有变？如果是，它可能只在重复。",
    },
  ],
  practicePrompts: [
    {
      id: "spot-the-mechanism",
      instructionZh: "选出真正写出中间机制的一句英文。",
      instructionEn:
        "Choose the English sentence that states an intermediate mechanism.",
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
      promptEn:
        "Flexible schedules can improve employee productivity because …",
      responseMode: "SHORT_TEXT",
      context: "SAME_TOPIC",
      optionsEn: [],
      referenceAnswerEn:
        "Employees can reserve their most demanding tasks for the hours when they concentrate best.",
      referenceReasoningZh:
        "参考答案说明了灵活时间如何改变任务安排，而不只是再次声称生产力会上升。",
      referenceReasoningEn:
        "The reference explains how flexible time changes task scheduling rather than repeating the outcome.",
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
        "价格变化先影响家庭选择，再影响进入填埋场的废物量。",
      referenceReasoningEn:
        "The price change affects choices before it changes the amount of landfill waste.",
    },
  ],
};

export const collocationControlTeachingFixture: FocusedTeachingData = {
  id: "lesson-collocation-control",
  cycleId: "cycle-collocation-control",
  format: "ADAPTIVE_ARTICLE_V1",
  titleZh: "搭配不是正确单词的随意相加",
  titleEn: "Collocation is more than combining correct words",
  introductionMarkdown:
    "这篇教程训练你先辨别语境中的关系，再从看似正确的候选表达中做出稳定选择。",
  estimatedMinutes: 14,
  sections: [
    {
      titleZh: "先判断关系，再选择词组",
      titleEn: "Choose by relationship, not translation",
      markdown:
        "两个词分别正确，不代表它们组合后就是英语使用者在这个语境中的常见选择。\n\n**核心判断**：先问这个动词通常由什么主语对什么宾语使用。\n\n- *pose a risk to*：说明某事物带来潜在危害；主语是危险来源，宾语是受到影响的对象。\n  - Untreated industrial waste poses a serious risk to river ecosystems.\n- *have an influence on*：说明一个因素对另一事物产生影响；不能写成 make an influence on。\n  - Housing costs have a substantial influence on where young adults choose to live.\n\n**常见误区**：只按中文逐词翻译。*learn knowledge* 应为 *acquire knowledge*；*a heavy improvement* 应为 *a substantial improvement*。",
    },
    {
      titleZh: "在新语境中做出选择",
      titleEn: "Decide in new contexts",
      markdown:
        "用三个问题管住搭配选择：\n\n1. 这个表达通常由什么主语发出？\n2. 它通常作用于什么对象？\n3. 例句中的关系和当前语境相同吗？\n\n**自检**：我能说明这个搭配在本句中为什么自然，而不是只说“以前见过”吗？",
    },
  ],
  practicePrompts: [
    {
      id: "risk-choice",
      instructionZh: "选出能表示潜在危害的自然搭配。",
      instructionEn:
        "Choose the natural expression for creating a potential danger.",
      promptEn: "Air pollution may ___ a serious risk to children's health.",
      responseMode: "CHOICE",
      context: "SAME_TOPIC",
      optionsEn: ["pose", "perform", "produce"],
      referenceAnswerEn: "pose",
      referenceReasoningZh:
        "pose a risk to表示危险来源对暴露对象带来潜在危害。",
      referenceReasoningEn:
        "Pose a risk to expresses a source of potential danger affecting an exposed object.",
    },
    {
      id: "health-transfer",
      instructionZh: "在新的健康话题中，用一个自然搭配写一句完整英文。",
      instructionEn:
        "Write one complete English sentence with a natural collocation in a new health topic.",
      promptEn: "Explain one effect of prolonged sleep deprivation on workers.",
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
    {
      id: "policy-transfer",
      instructionZh: "在政策语境中，用一个自然搭配写一句完整英文。",
      instructionEn:
        "Write one complete English sentence with a natural collocation in a policy context.",
      promptEn:
        "Explain how stricter safety rules can reduce a risk in factories.",
      responseMode: "SHORT_TEXT",
      context: "UNSEEN_TOPIC",
      optionsEn: [],
      referenceAnswerEn:
        "Stricter safety rules can reduce the risk of avoidable injuries in factories.",
      referenceReasoningZh:
        "reduce the risk of清晰表达政策降低某种后果的关系。",
      referenceReasoningEn:
        "Reduce the risk of expresses a policy lowering the likelihood of a consequence.",
    },
  ],
};

const lesson: LessonData = {
  id: "lesson-collocation-perspective",
  titleZh: "让英语按英语的方式组织信息",
  titleEn: "Organise the idea through a natural English perspective",
  coreTargetZh: "区分学业压力、课业量和课程要求，并调用正确词块。",
  coreTargetEn:
    "Distinguish academic pressure, workload, and course demands, then choose the right chunk.",
  totalMinutes: 60,
  initialItemIndex: 0,
  initialResponse: null,
  runtime: {
    status: "ACTIVE",
    revision: 1,
    startedAt: new Date().toISOString(),
    effectiveElapsedSeconds: 0,
    productiveSeconds: 0,
    segmentLimitSeconds: 3_600,
    timeboxExpired: false,
    split: "NONE",
    refresher: "NOT_REQUIRED",
    interruptionCount: 0,
    autoSplit: null,
    refresherPlan: null,
    serverDraft: null,
    observedAtMs: Date.now(),
  },
  remediationActive: false,
  rewriteUnlockZh: "后天 20:00 解锁闭卷重写",
  rewriteUnlockEn: "Closed-book rewrite unlocks at 20:00 in two days",
  items: [
    {
      id: "intent",
      form: "MEANING_FORK",
      responseMode: "choice",
      stage: "diagnose",
      kind: "choice",
      estimatedMinutes: 3,
      eyebrowZh: "含义岔路 · 不计分",
      eyebrowEn: "Meaning check · not scored",
      source:
        "The pressure from the courses in primary school is much slighter.",
      promptZh: "你在这句话里最想表达什么？",
      promptEn: "What did you most want this sentence to mean?",
      helperZh: "先确认真实意思，系统才不会把句子改得自然却偏离原意。",
      helperEn: "Confirm the intended meaning before changing the language.",
      choices: [
        {
          id: "pressure",
          labelZh: "小学生承受的学业压力较小",
          labelEn: "Primary pupils face less academic pressure",
        },
        {
          id: "workload",
          labelZh: "小学生需要完成的课业较少",
          labelEn: "Primary pupils have a lighter workload",
        },
        {
          id: "demand",
          labelZh: "小学课程本身要求较低",
          labelEn: "Primary-school courses are less demanding",
        },
      ],
      successZh: "意图已确认：你描述的是学生承受的学业压力。",
      successEn:
        "Meaning confirmed: you are describing the academic pressure pupils experience.",
    },
    {
      id: "contrast",
      form: "MINIMAL_CONTRAST",
      responseMode: "choice",
      stage: "understand",
      kind: "explain",
      estimatedMinutes: 8,
      eyebrowZh: "最小对比",
      eyebrowEn: "Minimal contrast",
      source: "pressure · workload · demanding",
      promptZh: "哪一句最准确地表达“课程本身要求较低”？",
      promptEn:
        "Which sentence most precisely means that the courses themselves require less effort?",
      helperZh:
        "注意：pressure 描述人的体验，workload 描述任务量，demanding 描述课程要求。",
      helperEn:
        "Pressure describes experience, workload describes volume, and demanding describes course requirements.",
      choices: [
        {
          id: "a",
          labelZh: "Pupils face less academic pressure.",
          labelEn: "Pupils face less academic pressure.",
        },
        {
          id: "b",
          labelZh: "Pupils have a lighter workload.",
          labelEn: "Pupils have a lighter workload.",
        },
        {
          id: "c",
          labelZh: "Primary-school courses are less demanding.",
          labelEn: "Primary-school courses are less demanding.",
        },
      ],
      successZh:
        "正确。这里描述课程的要求，因此使用 courses are less demanding。",
      successEn:
        "Correct. The focus is on course requirements, so courses are less demanding fits.",
    },
    {
      id: "rewrite",
      form: "OPEN_GENERATION",
      responseMode: "sentence",
      stage: "produce",
      kind: "rewrite",
      estimatedMinutes: 12,
      eyebrowZh: "无提示生成",
      eyebrowEn: "Independent production",
      source:
        "The pressure from the courses in primary school is much slighter.",
      promptZh: "让“学生”作主语，重写原句。必须使用 face，并写出完整比较对象。",
      promptEn:
        "Rewrite with pupils as the subject. Use face and include a complete comparison.",
      helperZh: "请写一个完整英文句子。第一次答案会被保留，用于判断真实能力。",
      helperEn:
        "Write one complete English sentence. Your first answer is preserved as evidence.",
      hintZh:
        "局部支架：Primary-school pupils ___ less academic pressure than ___.",
      hintEn:
        "Scaffold: Primary-school pupils ___ less academic pressure than ___.",
      modelAnswer:
        "Primary-school pupils face less academic pressure than secondary-school students.",
      successZh: "表达自然，主语、搭配和比较对象都完整。",
      successEn:
        "Natural and complete: the subject, collocation, and comparison all work.",
    },
    {
      id: "transfer",
      form: "PARAGRAPH_LAB",
      responseMode: "paragraph",
      minimumWords: 80,
      maximumWords: 120,
      criteria: [
        {
          id: "collocation_perspective:target",
          description: "Use the academic-pressure perspective naturally.",
          passingScore: 0.8,
        },
        {
          id: "mechanism_chain:secondary",
          description: "Connect the workload cause to its consequence.",
          passingScore: 0.8,
        },
      ],
      stage: "apply",
      kind: "transfer",
      estimatedMinutes: 18,
      eyebrowZh: "陌生语境迁移",
      eyebrowEn: "New-context transfer",
      promptZh:
        "用自然英语表达：大学生通常比中学生承受更大的学业压力，因为他们需要独立完成更多研究任务。",
      promptEn:
        "Express this naturally: university students generally experience more academic pressure than secondary students because they complete more research independently.",
      helperZh:
        "不要照抄上一题；你可以改变句式，但要准确使用 pressure 的英语视角。",
      helperEn:
        "Do not copy the previous sentence. You may change the structure while keeping the perspective natural.",
      hintZh: "可以从 University students generally face... 开始。",
      hintEn: "You could begin with University students generally face...",
      modelAnswer:
        "University students generally face greater academic pressure than secondary-school students because they are expected to complete more research independently.",
      successZh: "你已经把目标搭配迁移到了新的教育语境。",
      successEn:
        "You have transferred the target collocation to a new educational context.",
    },
    {
      id: "exit",
      stage: "finish",
      kind: "exit",
      estimatedMinutes: 4,
      eyebrowZh: "出门测 · 无提示",
      eyebrowEn: "Exit check · no hints",
      promptZh:
        "不看前面的答案，用一句英文表达：繁重的课业量会占用儿童本可用于运动的时间。",
      promptEn:
        "Without looking back, write one sentence saying that a heavy workload can use time children could spend exercising.",
      helperZh: "这是新的表层形式。提交后本课最多只会标记为“临时通过”。",
      helperEn:
        "This uses a new surface form. This lesson can mark the skill only as provisionally applied.",
      modelAnswer:
        "A heavy workload can take up time that children could otherwise spend exercising.",
      successZh:
        "出门测完成。系统会在延迟重写中重新验证，而不会现在就宣称你已掌握。",
      successEn:
        "Exit check complete. The skill will be tested again in the delayed rewrite before it is considered retained.",
    },
  ],
};

const comparison: ComparisonData = {
  promptTitle: "Early foreign-language learning",
  v1Score: 6,
  v2Score: 6.5,
  overallDelta: 0.5,
  criterionDeltas: [
    {
      criterion: "TR",
      labelZh: "任务回应",
      labelEn: "Task Response",
      v1: 6,
      v2: 6.5,
      delta: 0.5,
    },
    {
      criterion: "CC",
      labelZh: "连贯与衔接",
      labelEn: "Coherence & Cohesion",
      v1: 5.5,
      v2: 6,
      delta: 0.5,
    },
    {
      criterion: "LR",
      labelZh: "词汇资源",
      labelEn: "Lexical Resource",
      v1: 6,
      v2: 6.5,
      delta: 0.5,
    },
    {
      criterion: "GRA",
      labelZh: "语法多样性与准确性",
      labelEn: "Grammar Range & Accuracy",
      v1: 6,
      v2: 6.5,
      delta: 0.5,
    },
  ],
  recurrence: {
    v1Occurrences: 3,
    v2Occurrences: 0,
    v1Per100Words: 1.09,
    v2Per100Words: 0,
    deltaPer100Words: -1.09,
    recurred: false,
    evidenceVerified: true,
  },
  scoringVersion: {
    schemaVersion: "1.0.0",
    promptVersion: "1.0.0",
    rubricVersion: "iwc-task2-rubric-1.0.0",
    model: "mock-deterministic-v1",
  },
  v1Words: 276,
  v2Words: 291,
  retained: true,
  summaryZh:
    "目标表达在自检前的闭卷版本中再次出现；Mock 数据仅用于演示证据状态。",
  summaryEn:
    "The target appeared again in the blind pre-check draft; Mock data demonstrates the evidence state only.",
  modelEssaySource: "mock",
  modelEssay:
    "Introducing foreign-language lessons in primary school can create practical difficulties, but the long-term benefits are greater when teaching is appropriate for children. Young learners are generally willing to imitate unfamiliar sounds and are less anxious about making mistakes. Regular exposure can therefore make common language patterns familiar before academic work becomes more demanding.\n\nThe main concern is that an additional subject may increase pupils' workload and take time away from play, exercise, or rest. This risk is real when schools rely on tests and heavy homework. However, it is largely a question of course design. Short, interactive lessons based on stories and communication can provide useful exposure without placing children under excessive academic pressure.\n\nIn conclusion, early language education offers lasting linguistic and cultural value, while its principal disadvantage is manageable. Provided that lessons remain enjoyable and age-appropriate, the advantages outweigh the costs.",
  points: [
    {
      id: "point-pressure",
      state: "resolved",
      titleZh: "学业压力的自然表达",
      titleEn: "Natural expression of academic pressure",
      before:
        "The pressure from the courses in primary school is much slighter.",
      after:
        "Primary-school pupils generally face less academic pressure than secondary-school students.",
      noteZh:
        "旧问题没有复发，并且在闭卷阶段独立使用了 face academic pressure。",
      noteEn:
        "The old issue did not recur, and face academic pressure was produced independently.",
    },
    {
      id: "point-chain",
      state: "improved",
      titleZh: "早期接触的因果链",
      titleEn: "Causal chain for early exposure",
      before:
        "Children learn languages easily, so it is good for their future.",
      after:
        "Regular exposure helps children become familiar with basic language patterns, giving them a foundation before academic work becomes more demanding.",
      noteZh: "已经补出机制与长期意义；下一篇仍需观察是否稳定。",
      noteEn:
        "The mechanism and long-term significance are now explicit; stability still needs another sample.",
    },
    {
      id: "point-comparison",
      state: "watch",
      titleZh: "比较对象完整性",
      titleEn: "Complete comparison targets",
      before: "better than the older",
      after: "more efficiently than older learners",
      noteZh: "本次已修正，但证据只有一次，系统将在陌生题中复测。",
      noteEn:
        "Corrected here, but only one piece of evidence exists; a transfer check is scheduled.",
    },
  ],
  nextTask: {
    id: "transfer-task",
    kind: "transfer",
    eyebrowZh: "下一步已安排",
    eyebrowEn: "Next step scheduled",
    titleZh: "在科技教育题中迁移“压力与课业量”",
    titleEn: "Transfer pressure and workload language to a technology topic",
    descriptionZh: "一项 8 分钟无提示小测，将在周六自动出现。",
    descriptionEn:
      "An eight-minute unassisted check will appear automatically on Saturday.",
    durationMinutes: 8,
    href: "/transfer?cycle=cycle-demo&task=transfer-task",
    actionZh: "查看安排",
    actionEn: "View schedule",
    dueLabelZh: "周六 20:00",
    dueLabelEn: "Saturday at 20:00",
  },
};

const growth: GrowthData = {
  essaysCompleted: 8,
  learningMinutes: 412,
  currentBand: 6.5,
  targetBand: 7,
  independentNonRecurrenceRate: 43,
  weeklyScores: [
    { label: "W1", score: 5.5 },
    { label: "W2", score: 6 },
    { label: "W3", score: 6 },
    { label: "W4", score: 6.5 },
    { label: "W5", score: 6.5 },
  ],
  skills: [
    {
      id: "collocation_perspective",
      labelZh: "自然搭配与英语视角",
      labelEn: "Collocation & English perspective",
      category: "LR",
      state: "retained",
      evidenceCount: 7,
      recurrenceRate: 18,
      nextReviewZh: "周六陌生题复测",
      nextReviewEn: "Transfer check on Saturday",
    },
    {
      id: "complete_comparison",
      labelZh: "比较对象完整",
      labelEn: "Complete comparisons",
      category: "GRA",
      state: "applied",
      evidenceCount: 4,
      recurrenceRate: 33,
      nextReviewZh: "下篇作文自动检查",
      nextReviewEn: "Checked in the next essay",
    },
    {
      id: "causal_chain",
      labelZh: "原因—机制—结果链",
      labelEn: "Cause–mechanism–result chain",
      category: "TR",
      state: "practicing",
      evidenceCount: 3,
      recurrenceRate: 50,
      nextReviewZh: "周四 20:00 短回炉",
      nextReviewEn: "Short review Thursday at 20:00",
    },
    {
      id: "article_control",
      labelZh: "冠词与可数性",
      labelEn: "Articles & countability",
      category: "GRA",
      state: "transferred",
      evidenceCount: 11,
      recurrenceRate: 9,
      nextReviewZh: "两周后混合检测",
      nextReviewEn: "Mixed check in two weeks",
    },
  ],
};

export class MockLearningClient implements LearningClient {
  async getToday(): Promise<TodayData> {
    await delay();
    const enabled = aiEnabled();
    const practiceCompleted =
      readStorage(STORAGE_KEYS.lessonPracticeComplete) === "true";
    const split = readStorage(STORAGE_KEYS.lessonSplit);
    if (split === "SCHEDULED" || split === "ACTIVE") {
      return {
        learnerName: "Simon",
        greetingZh: "晚上好，Simon。今天只做这一件事。",
        greetingEn: "Good evening, Simon. There is only one thing to do today.",
        aiState: enabled ? "connected" : "missing",
        pendingJob: null,
        pendingJobAction: "none",
        blockedJobNotice: null,
        nextTask: {
          id: "continue-split-lesson",
          kind: "lesson",
          eyebrowZh: "剩余课程已持久化",
          eyebrowEn: "The remaining lesson is saved",
          titleZh: "先完成短回炉，再继续专项课",
          titleEn: "Complete the refresher, then continue the lesson",
          descriptionZh:
            "上一段的输入和用时已经保留。重新进入后先做一次不计能力证据的闭卷唤回。",
          descriptionEn:
            "Your prior input and elapsed time are preserved. Resume with a closed-book recall that does not create mastery evidence.",
          durationMinutes: 15,
          href: "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
          actionZh: "继续剩余课程",
          actionEn: "Continue the lesson",
          dueLabelZh: "从短回炉开始",
          dueLabelEn: "Starts with a short refresher",
        },
        navigation: buildLearningDestinations({
          cycleId: "cycle-demo",
          writingAvailable: true,
          feedbackAvailable: true,
          lessonId: "lesson-collocation-perspective",
          rewriteTaskId: "rewrite-primary-language",
          comparisonAvailable: false,
          transferTaskId: "transfer-task",
        }),
        cycleTitle: "儿童是否应在小学开始学习外语",
        timeline: [
          {
            id: "v1",
            labelZh: "首写",
            labelEn: "First attempt",
            state: "done",
            dateLabel: "8月10日",
          },
          {
            id: "feedback",
            labelZh: "批改",
            labelEn: "Feedback",
            state: "done",
            dateLabel: "8月10日",
          },
          {
            id: "lesson",
            labelZh: "专项训练",
            labelEn: "Focused lesson",
            state: "current",
            dateLabel: "待继续",
          },
        ],
        week: {
          focusedMinutes: 126,
          completedActions: 4,
          repeatedErrorReduction: 43,
        },
      };
    }
    return {
      learnerName: "Simon",
      greetingZh: "晚上好，Simon。今天只做这一件事。",
      greetingEn: "Good evening, Simon. There is only one thing to do today.",
      aiState: enabled ? "connected" : "missing",
      pendingJob: null,
      pendingJobAction: "none",
      blockedJobNotice: null,
      nextTask: {
        id: practiceCompleted
          ? "new-cycle-after-practice"
          : "rewrite-primary-language",
        kind: practiceCompleted
          ? "first-attempt"
          : enabled
            ? "rewrite"
            : "first-attempt",
        eyebrowZh: practiceCompleted
          ? "Demo 课程已结束 · 不计能力证据"
          : enabled
            ? "已到最佳重写窗口"
            : "无 AI 也可以完成",
        eyebrowEn: practiceCompleted
          ? "Demo lesson complete · no mastery evidence"
          : enabled
            ? "Your best rewrite window is open"
            : "Available without AI",
        titleZh: practiceCompleted
          ? "开始新一轮 40 分钟首写"
          : enabled
            ? "闭卷重写：小学外语启蒙"
            : "完成一篇 40 分钟首写",
        titleEn: practiceCompleted
          ? "Start a new 40-minute first attempt"
          : enabled
            ? "Closed-book rewrite: early language learning"
            : "Complete a 40-minute first attempt",
        descriptionZh: practiceCompleted
          ? "本次练习没有创建 applied、retained、重写或迁移任务。连接真实评估服务后，从新首写开始建立可验证证据。"
          : enabled
            ? "只显示原题。最后 5 分钟才会出现你的三条抽象自检目标。"
            : "写作、计时和保存仍然可用；AI 恢复后再进行批改。",
        descriptionEn: practiceCompleted
          ? "This practice created no applied or retained state and no rewrite or transfer task. Connect a real evaluator and begin with a new first attempt to build valid evidence."
          : enabled
            ? "Only the prompt is shown. Your three abstract checks appear in the final five minutes."
            : "Writing, timing, and saving still work. Feedback can run when AI returns.",
        durationMinutes: 40,
        href:
          practiceCompleted || !enabled
            ? "/write?cycle=cycle-demo"
            : "/rewrite?cycle=cycle-demo&task=rewrite-primary-language",
        actionZh: practiceCompleted
          ? "开始新首写"
          : enabled
            ? "开始重写"
            : "开始写作",
        actionEn: practiceCompleted
          ? "Start a new attempt"
          : enabled
            ? "Start rewrite"
            : "Start writing",
        dueLabelZh: practiceCompleted
          ? "未创建证据重写"
          : enabled
            ? "今天 20:00 前完成"
            : "随时开始",
        dueLabelEn: practiceCompleted
          ? "No evidence rewrite was created"
          : enabled
            ? "Complete by 20:00 today"
            : "Start whenever you are ready",
      },
      navigation: buildLearningDestinations({
        cycleId: "cycle-demo",
        writingAvailable: true,
        feedbackAvailable: true,
        lessonId: "lesson-collocation-perspective",
        rewriteTaskId: practiceCompleted ? null : "rewrite-primary-language",
        comparisonAvailable: false,
        transferTaskId: practiceCompleted ? null : "transfer-task",
      }),
      cycleTitle: practiceCompleted
        ? "小学外语启蒙 · Demo 练习记录已结束"
        : "儿童是否应在小学开始学习外语",
      timeline: [
        {
          id: "v1",
          labelZh: "首写",
          labelEn: "First attempt",
          state: "done",
          dateLabel: "8月10日",
        },
        {
          id: "feedback",
          labelZh: "批改",
          labelEn: "Feedback",
          state: "done",
          dateLabel: "8月10日",
        },
        {
          id: "lesson",
          labelZh: "专项训练",
          labelEn: "Focused lesson",
          state: "done",
          dateLabel: "8月11日",
        },
        ...(practiceCompleted
          ? []
          : [
              {
                id: "rewrite",
                labelZh: "延迟重写",
                labelEn: "Delayed rewrite",
                state: "current" as const,
                dateLabel: "今天",
              },
              {
                id: "transfer",
                labelZh: "陌生题迁移",
                labelEn: "Transfer",
                state: "upcoming" as const,
                dateLabel: "8月16日",
              },
            ]),
      ],
      week: {
        focusedMinutes: 126,
        completedActions: 4,
        repeatedErrorReduction: 43,
      },
    };
  }

  async getEssayWorkspace(): Promise<EssayWorkspaceData> {
    await delay();
    return {
      activeCount: 2,
      activeLimit: 8,
      essays: [
        {
          id: "cycle-demo",
          prompt: `${writingPrompt.question} ${writingPrompt.instruction}`,
          topic: "education",
          status: "ATTEMPT_1_ACTIVE",
          updatedAt: "2026-08-14T13:00:00.000Z",
          nextAction: {
            kind: "CONTINUE_ATTEMPT_1",
            entityId: "cycle-demo",
            reason: "Resume the saved first draft.",
            dueAt: null,
            overdue: false,
          },
          nextTask: {
            id: "cycle-demo",
            kind: "first-attempt",
            eyebrowZh: "正在写作",
            eyebrowEn: "Writing in progress",
            titleZh: "继续第一篇作文",
            titleEn: "Continue your first essay",
            descriptionZh: "草稿与计时已保留，可以随时继续。",
            descriptionEn:
              "Your draft and timer are saved and ready to resume.",
            durationMinutes: 40,
            href: "/write?cycle=cycle-demo",
            actionZh: "继续写作",
            actionEn: "Continue writing",
            dueLabelZh: "随时继续",
            dueLabelEn: "Resume any time",
          },
          resources: {
            cycleId: "cycle-demo",
            writingAvailable: true,
            feedbackAvailable: true,
            lessonId: "lesson-collocation-perspective",
            rewriteTaskId: "rewrite-primary-language",
            comparisonAvailable: false,
            transferTaskId: "transfer-task",
          },
        },
        {
          id: "cycle-demo-second",
          prompt:
            "Some people think governments should spend more money on public transport than on building new roads. To what extent do you agree or disagree?",
          topic: "urban_transport",
          status: "QUESTION_READY",
          updatedAt: "2026-08-14T12:00:00.000Z",
          nextAction: {
            kind: "START_ATTEMPT_1",
            entityId: "cycle-demo-second",
            reason: "The first timed draft is ready.",
            dueAt: null,
            overdue: false,
          },
          nextTask: {
            id: "cycle-demo-second",
            kind: "first-attempt",
            eyebrowZh: "新作文已准备好",
            eyebrowEn: "New essay ready",
            titleZh: "开始第二篇作文",
            titleEn: "Start your second essay",
            descriptionZh: "这篇作文尚未开始，不会影响其他正在进行的文章。",
            descriptionEn:
              "This essay has not started and does not affect your other work.",
            durationMinutes: 40,
            href: "/write?cycle=cycle-demo-second",
            actionZh: "开始写作",
            actionEn: "Start writing",
            dueLabelZh: "随时开始",
            dueLabelEn: "Ready when you are",
          },
          resources: {
            cycleId: "cycle-demo-second",
            writingAvailable: false,
            feedbackAvailable: false,
            lessonId: null,
            rewriteTaskId: null,
            comparisonAvailable: false,
            transferTaskId: null,
          },
        },
      ],
    };
  }

  async getQuestions(): Promise<QuestionOption[]> {
    await delay();
    return [
      {
        id: "prompt-foreign-language",
        prompt: `${writingPrompt.question} ${writingPrompt.instruction}`,
        type: "advantages_disadvantages",
        topic: "education",
        ieltsTrack: "academic",
        visibility: "public",
      },
      {
        id: "prompt-transfer-technology",
        prompt: `${transferPrompt.question} ${transferPrompt.instruction}`,
        type: "advantages_disadvantages",
        topic: "technology",
        ieltsTrack: "academic",
        visibility: "public",
      },
    ];
  }

  async createCustomQuestion(
    input: CustomQuestionInput,
  ): Promise<QuestionOption> {
    await delay();
    return {
      id: `private-demo-${Date.now()}`,
      ...input,
      visibility: "private",
    };
  }

  async startTrainingCycle(questionId: string): Promise<string> {
    writeStorage(STORAGE_KEYS.selectedQuestion, questionId);
    await delay();
    return "cycle-demo-selected";
  }

  async getAttempt(version: 1 | 2, cycleId: string): Promise<AttemptData> {
    await delay();
    const key = demoDraftStorageKey(version, cycleId);
    return {
      id: demoAttemptId(version, cycleId),
      version,
      prompt: writingPrompt,
      durationSeconds: 40 * 60,
      draft:
        readStorage(key) ??
        (version === 1 && cycleId === "cycle-demo" ? defaultEssay : ""),
      startedAt: "2026-08-13T12:00:00.000Z",
      autosaveKey: key,
      cycleId,
    };
  }

  async saveDraft(attemptId: string, draft: string): Promise<void> {
    const version = attemptId.includes("v2") ? 2 : 1;
    const key = demoDraftStorageKey(version, cycleIdFromDemoAttempt(attemptId));
    writeStorage(key, draft);
  }

  async saveSelfCheckSnapshot(
    attemptId: string,
    draft: string,
    phase: "before" | "after",
  ): Promise<void> {
    await this.saveDraft(attemptId, draft);
    writeStorage(`iwc:rewrite:self-check:${phase}`, draft);
  }

  async submitAttempt(
    attemptId: string,
    draft: string,
    onSubmitted?: () => void,
  ): Promise<AttemptSubmission> {
    await this.saveDraft(attemptId, draft);
    onSubmitted?.();
    await delay(240);
    return {
      feedbackReady: true,
      jobId: "demo-submission-job",
      jobStatus: "SUCCEEDED",
    };
  }

  async getFeedback(cycleId: string): Promise<FeedbackData> {
    await delay();
    const result =
      readStorage(STORAGE_KEYS.lessonGenerationFailure) === "true"
        ? {
            ...feedback,
            lessonId: null,
            lessonGenerationRetry: {
              jobId: "demo-failed-generation-job",
              code: "DEMO_GENERATION_FAILURE",
              safeMessage: "The demo lesson module failed to generate.",
            },
          }
        : feedback;
    mergeLearningDestinations({
      feedback: `/feedback?cycle=${encodeURIComponent(cycleId)}`,
      lesson: result.lessonId
        ? `/lesson?cycle=${encodeURIComponent(cycleId)}&lesson=${encodeURIComponent(result.lessonId)}`
        : null,
      write: `/write?cycle=${encodeURIComponent(cycleId)}`,
    });
    return result;
  }

  async getFocusedTeaching(
    cycleId: string,
    lessonId: string,
  ): Promise<FocusedTeachingData> {
    await delay();
    mergeLearningDestinations({
      feedback: `/feedback?cycle=${encodeURIComponent(cycleId)}`,
      lesson: `/lesson?cycle=${encodeURIComponent(cycleId)}&lesson=${encodeURIComponent(lessonId)}`,
      write: `/write?cycle=${encodeURIComponent(cycleId)}`,
    });
    const fixture =
      lessonId === "lesson-collocation-control"
        ? collocationControlTeachingFixture
        : mechanismChainTeachingFixture;
    return { ...fixture, id: lessonId, cycleId };
  }

  async submitTeachingPracticeAnswer(
    lessonId: string,
    prompt: TeachingPracticePrompt,
    answer: string,
  ): Promise<TeachingPracticeResponseData> {
    await delay(40);
    const key = teachingPracticeResponseKey(lessonId, prompt.id);
    const responses = readTeachingPracticeResponses();
    const existing = responses[key];
    if (existing) return existing;
    if (
      prompt.responseMode === "CHOICE" &&
      !prompt.optionsEn.includes(answer)
    ) {
      throw new LearningClientError("Choose one of the displayed answers.", {
        status: 422,
        code: "TEACHING_PRACTICE_CHOICE_INVALID",
      });
    }
    const response: TeachingPracticeResponseData = {
      id: `demo:${lessonId}:${prompt.id}`,
      promptId: prompt.id,
      submittedAnswer: answer,
      responseMode: prompt.responseMode,
      analysisState:
        prompt.responseMode === "CHOICE" ? "ANALYSIS_READY" : "DEMO_ONLY",
      analysis:
        prompt.responseMode === "CHOICE"
          ? deterministicMockChoice(prompt, answer)
          : mockShortTextAnalysis(),
    };
    const projected = projectTeachingPracticeResponse(response);
    if (!projected) {
      return unavailableTeachingPracticeResponse(response);
    }
    responses[key] = projected;
    writeTeachingPracticeResponses(responses);
    return projected;
  }

  async getTeachingPracticeResponse(
    lessonId: string,
    promptId: string,
    fallback?: TeachingPracticeResponseData,
  ): Promise<TeachingPracticeResponseData | null> {
    await delay(20);
    return (
      readTeachingPracticeResponses()[
        teachingPracticeResponseKey(lessonId, promptId)
      ] ??
      (fallback ? projectTeachingPracticeResponse(fallback) : null) ??
      null
    );
  }

  async retryTeachingPracticeAnalysis(
    response: TeachingPracticeResponseData,
  ): Promise<TeachingPracticeResponseData> {
    await delay(20);
    return (
      Object.values(readTeachingPracticeResponses()).find(
        (candidate) => candidate.id === response.id,
      ) ??
      projectTeachingPracticeResponse(response) ??
      unavailableTeachingPracticeResponse(response)
    );
  }

  async getLesson(_cycleId: string, _lessonId: string): Promise<LessonData> {
    await delay();
    const stored = Number(readStorage(STORAGE_KEYS.lesson) ?? "0");
    const elapsed = Number(readStorage(STORAGE_KEYS.lessonElapsed) ?? "0");
    const rawSplit = readStorage(STORAGE_KEYS.lessonSplit);
    let split = ["NONE", "SCHEDULED", "ACTIVE", "COMPLETED"].includes(
      rawSplit ?? "",
    )
      ? (rawSplit as LessonData["runtime"]["split"])
      : "NONE";
    const rawRefresher = readStorage(STORAGE_KEYS.lessonRefresher);
    let refresher = ["NOT_REQUIRED", "REQUIRED", "COMPLETED"].includes(
      rawRefresher ?? "",
    )
      ? (rawRefresher as LessonData["runtime"]["refresher"])
      : "NOT_REQUIRED";
    if (split === "SCHEDULED") {
      split = "ACTIVE";
      refresher = "REQUIRED";
      writeStorage(STORAGE_KEYS.lessonSplit, split);
      writeStorage(STORAGE_KEYS.lessonRefresher, refresher);
    }
    const segmentLimitSeconds =
      split === "ACTIVE" ? Math.max(3_600, elapsed + 3_600) : 3_600;
    const timeboxExpired = elapsed >= segmentLimitSeconds;
    return {
      ...lesson,
      initialItemIndex: Number.isFinite(stored)
        ? Math.min(stored, lesson.items.length - 1)
        : 0,
      runtime: {
        ...lesson.runtime,
        status: timeboxExpired ? "TIMEBOX_EXPIRED" : "ACTIVE",
        effectiveElapsedSeconds: Number.isFinite(elapsed) ? elapsed : 0,
        segmentLimitSeconds,
        timeboxExpired,
        split,
        refresher,
        observedAtMs: Date.now(),
      },
    };
  }

  async getPracticePaper(
    cycleId: string,
    lessonId: string,
  ): Promise<PracticePaperData> {
    await delay();
    mergeLearningDestinations({
      feedback: `/feedback?cycle=${encodeURIComponent(cycleId)}`,
      lesson: `/lesson?cycle=${encodeURIComponent(cycleId)}&lesson=${encodeURIComponent(lessonId)}`,
      write: `/write?cycle=${encodeURIComponent(cycleId)}`,
    });
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
    const questions = [
      "FOUNDATION",
      "FOUNDATION",
      "REPAIR",
      "REPAIR",
      "GENERATION",
      "GENERATION",
      "INTEGRATION",
      "INTEGRATION",
    ].map((section, index) => ({
      id: `demo-paper-question-${index + 1}`,
      number: index + 1,
      section: section as PracticePaperData["questions"][number]["section"],
      titleZh: `第 ${index + 1} 题`,
      titleEn: `Question ${index + 1}`,
      instructionZh: instructions[index] ?? "按题面要求作答。",
      promptEn: prompts[index] ?? "Write a complete English answer.",
      sourceText:
        index === 0
          ? "Children learn languages at primary school."
          : section === "REPAIR"
            ? (prompts[index] ?? "")
            : "",
      responseMode: (index === 0
        ? "choice"
        : index >= 6
          ? "paragraph"
          : "sentence") as PracticePaperData["questions"][number]["responseMode"],
      options:
        index === 0
          ? [
              {
                key: "A",
                labelEn:
                  "Early exposure builds a foundation, so later study becomes easier.",
              },
              { key: "B", labelEn: "Early exposure is useful." },
              { key: "C", labelEn: "Many schools teach languages." },
            ]
          : [],
      suggestedMinutes: [5, 5, 7, 7, 8, 8, 10, 10][index] ?? 5,
      minimumWords: [1, 20, 8, 8, 25, 25, 80, 80][index] ?? 1,
      maximumWords: [1, 35, 40, 40, 45, 45, 120, 120][index] ?? 60,
      publicCriteria: [
        {
          labelZh: "按题面作答",
          labelEn: "Follow the instruction",
          descriptionZh: instructions[index] ?? "按题面要求作答。",
          descriptionEn: "Follow every requirement in the visible instruction.",
          weight: 100,
        },
      ],
    }));
    const stored = readStorage("iwc:practice-paper-answers");
    const answers = stored
      ? (JSON.parse(stored) as Record<string, string>)
      : {};
    const submittedAt = readStorage("iwc:practice-paper-submitted");
    let startedAt = readStorage("iwc:practice-paper-started");
    if (!startedAt) {
      startedAt = new Date().toISOString();
      writeStorage("iwc:practice-paper-started", startedAt);
    }
    const itemResults = submittedAt
      ? questions.map((question) => {
          const answer = answers[question.id]?.trim() ?? "";
          const meetsStandard =
            question.responseMode === "choice"
              ? answer === "A"
              : countWords(answer) >= Math.min(question.minimumWords, 20);
          return {
            itemId: question.id,
            status: meetsStandard
              ? ("MEETS_STANDARD" as const)
              : ("NEEDS_WORK" as const),
            score: meetsStandard ? 100 : 45,
            feedbackZh: meetsStandard
              ? "答案达到本题交卷前公开的评分点。"
              : "答案尚未完整覆盖题面明确要求，请对照下方评分点修改。",
            strengthsZh: meetsStandard ? ["回答切合题意。"] : [],
            problems: meetsStandard
              ? []
              : [
                  {
                    criterionLabelZh: "题意完成",
                    explanationZh:
                      "当前回答没有完整呈现题面要求的因果关系或必要信息。",
                    evidence: answer.slice(0, 120),
                  },
                ],
            improvedAnswerEn: meetsStandard
              ? ""
              : "Early exposure helps children become familiar with basic language patterns, so they face fewer difficulties when language study becomes more demanding.",
            nextStepZh: meetsStandard
              ? "保持这种清晰度。"
              : "先圈出题面中的动作和信息要求，再重写一个完整答案。",
          };
        })
      : [];
    const result = submittedAt
      ? {
          totalScore:
            itemResults.reduce((sum, item) => sum + item.score, 0) /
            itemResults.length,
          summaryZh: "整卷已完成。下方只展开未达到公开评分点的题目。",
          itemResults,
        }
      : null;
    return {
      id: lessonId,
      cycleId,
      titleZh: "核心问题专项训练卷",
      titleEn: "Focused writing practice paper",
      objectiveZh: "在60分钟内完成整卷，交卷后统一查看不达标题解析。",
      objectiveEn:
        "Complete the full paper in 60 minutes and review missed questions after submission.",
      durationMinutes: 60,
      instructionsZh: [
        "所有题目一次性完成后再交卷。",
        "交卷前不显示答案、提示或单题评价。",
        "题目已经写明全部作答要求，不会在批改时增加条件。",
      ],
      instructionsEn: [
        "Submit all answers together.",
        "No answer or item feedback is shown before submission.",
        "Every requirement is stated in the question before you answer.",
      ],
      questions,
      answers,
      startedAt,
      submittedAt,
      result,
      evaluationPending: false,
    };
  }

  async submitPracticePaper(
    _lessonId: string,
    answers: Record<string, string>,
  ): Promise<void> {
    writeStorage("iwc:practice-paper-answers", JSON.stringify(answers));
    writeStorage("iwc:practice-paper-submitted", new Date().toISOString());
    await delay(160);
  }

  async replaceLegacyLesson(
    _lessonId: string,
  ): Promise<import("./types").LegacyLessonRecoveryResult> {
    await delay(120);
    return { state: "READY", jobId: null };
  }

  async completePracticePaper(_lessonId: string): Promise<void> {
    await delay(80);
    writeStorage(STORAGE_KEYS.lessonPracticeComplete, "true");
  }

  async saveLessonProgress(
    _lessonId: string,
    itemIndex: number,
    response?: import("./types").LessonResponseInput,
  ): Promise<import("./types").LessonEvaluationResult | null> {
    writeStorage(STORAGE_KEYS.lesson, String(itemIndex));
    if (!response) return null;
    await delay(180);
    if (readStorage(STORAGE_KEYS.lessonEvaluationFailure) === "true") {
      throw new LearningClientError(
        "The demo evaluation failed after saving this answer.",
        { status: 503, code: "DEMO_EVALUATION_FAILED", retryable: true },
      );
    }
    return {
      responseId: response.responseId ?? `demo-${response.itemId}`,
      jobId: null,
      outcome: "DEMO_ONLY",
      passed: null,
      firstAttemptPassed: null,
      confidence: null,
      feedbackZh:
        "Mock 仅演示课程交互，不判断英语质量，也不会写入能力掌握证据。",
      feedbackEn:
        "Mock demonstrates the lesson flow only. It does not judge language quality or create mastery evidence.",
      evidence: [],
      dimensionScores: {},
      criterionResults: [],
      acceptedAnswers: [],
      confusionId: null,
      suggestionZh: "连接真实 AI 后可获得规范语言评价。",
      validForEvidence: false,
      demoOnly: true,
      remediationActive: false,
      batchFeedback: [],
    };
  }

  async updateLessonRuntime(
    _lessonId: string,
    update: import("./types").LessonRuntimeUpdate,
  ): Promise<import("./types").LessonRuntimeData> {
    await delay(30);
    if (update.action === "SCHEDULE_SPLIT") {
      writeStorage(STORAGE_KEYS.lessonSplit, "SCHEDULED");
      writeStorage(STORAGE_KEYS.lessonRefresher, "NOT_REQUIRED");
    }
    if (update.action === "COMPLETE_REFRESHER")
      writeStorage(STORAGE_KEYS.lessonRefresher, "COMPLETED");
    const elapsed = Number(readStorage(STORAGE_KEYS.lessonElapsed) ?? "0");
    const split = (readStorage(STORAGE_KEYS.lessonSplit) ??
      "NONE") as import("./types").LessonRuntimeData["split"];
    const refresher = (readStorage(STORAGE_KEYS.lessonRefresher) ??
      "NOT_REQUIRED") as import("./types").LessonRuntimeData["refresher"];
    return {
      ...lesson.runtime,
      revision: update.revision + 1,
      status:
        update.action === "PAUSE"
          ? "PAUSED"
          : update.action === "SCHEDULE_SPLIT"
            ? "TIMEBOX_EXPIRED"
            : "ACTIVE",
      effectiveElapsedSeconds: Number.isFinite(elapsed) ? elapsed : 0,
      timeboxExpired: update.action === "SCHEDULE_SPLIT",
      split,
      refresher,
      serverDraft: update.draft ?? lesson.runtime.serverDraft,
      observedAtMs: Date.now(),
    };
  }

  async retryLessonItem(
    lessonId: string,
    itemId: string,
  ): Promise<import("./types").LessonEvaluationResult> {
    removeStorage(STORAGE_KEYS.lessonEvaluationFailure);
    const result = await this.saveLessonProgress(lessonId, 0, {
      itemId,
      firstAnswer: "",
      finalAnswer: "",
      hintsUsed: 0,
      hintLevel: "NONE",
      referenceAnswerSeen: false,
      elapsedSeconds: 0,
    });
    if (!result) throw new Error("Mock item retry was not created.");
    return result;
  }

  async retryLessonGeneration(_jobId: string): Promise<void> {
    await delay(120);
    removeStorage(STORAGE_KEYS.lessonGenerationFailure);
  }

  async retryAiJob(_jobId: string): Promise<void> {
    await delay(120);
  }

  async skipLesson(_lessonId: string): Promise<string> {
    await delay(30);
    writeStorage(STORAGE_KEYS.lessonPracticeComplete, "true");
    return "rewrite-skipped-prerequisite";
  }

  async completeLesson(_lessonId: string) {
    await delay(80);
    writeStorage(STORAGE_KEYS.lessonPracticeComplete, "true");
    if (readStorage(STORAGE_KEYS.lessonSplit) === "ACTIVE")
      writeStorage(STORAGE_KEYS.lessonSplit, "COMPLETED");
    return {
      completionMode: "PRACTICE_ONLY" as const,
      masteryEvidenceCreated: false,
      rewriteScheduled: false,
      segmentScheduled: false,
    };
  }

  async getRewrite(_taskId: string, cycleId: string) {
    if (readStorage(STORAGE_KEYS.rewriteWindowExpired) === "true") {
      throw new LearningClientError(
        "The delayed rewrite window has expired and must be rescheduled.",
        { status: 409, code: "REWRITE_WINDOW_EXPIRED" },
      );
    }
    const base = await this.getAttempt(2, cycleId);
    return {
      ...base,
      abstractGoals: [
        {
          zh: "检查比较对象是否完整",
          en: "Check that comparison targets are complete",
        },
        {
          zh: "用自然搭配表达学业压力",
          en: "Use a natural collocation for academic pressure",
        },
        {
          zh: "主体段补足机制和长期意义",
          en: "Include the mechanism and long-term significance",
        },
      ],
      unlockLabelZh: "已在最后一次教学暴露 27 小时后解锁",
      unlockLabelEn: "Unlocked 27 hours after your last instructional exposure",
    };
  }

  async getComparison(_cycleId: string): Promise<ComparisonData> {
    await delay();
    return comparison;
  }

  async getTransferTask(
    taskId: string,
    expectedCycleId?: string,
  ): Promise<TransferTaskData> {
    await delay();
    const result = readStorage(STORAGE_KEYS.transferResult)
      ? mockTransferResult()
      : null;
    return {
      id: taskId,
      sourceCycleId: expectedCycleId ?? "cycle-demo",
      status: result ? "COMPLETED" : "READY",
      availableAt: "2026-08-16T12:00:00.000Z",
      expiresAt: "2026-08-18T12:00:00.000Z",
      windowExpired: readStorage(STORAGE_KEYS.transferWindowExpired) === "true",
      targetHintHidden: true,
      question: transferPrompt,
      result,
      pendingJobId: null,
      evaluationError: null,
    };
  }

  async submitTransferResponse(
    taskId: string,
    input: TransferResponseInput,
  ): Promise<TransferSubmission> {
    writeStorage(STORAGE_KEYS.transferAnswer, input.firstAnswer);
    await delay(420);
    writeStorage(STORAGE_KEYS.transferResult, "demo-only");
    return {
      transferTaskId: taskId,
      responseId: "transfer-response-demo",
      firstAnswerSaved: true,
      jobId: "transfer-job-demo",
      jobStatus: "SUCCEEDED",
    };
  }

  async markTransferNoOpportunity(taskId: string): Promise<TransferTaskData> {
    await delay();
    return {
      ...(await this.getTransferTask(taskId)),
      status: "RESCHEDULED",
      availableAt: "2026-08-18T12:00:00.000Z",
      result: {
        outcome: "NO_OPPORTUNITY",
        confidence: null,
        feedbackZh: "未发现自然迁移机会；这不会计为失败。Mock 任务已重新安排。",
        feedbackEn:
          "No natural opportunity was available. This is not a failure; the mock task was rescheduled.",
        evidence: "",
        evidenceStatus: "NO_OPPORTUNITY",
        transferred: false,
        gateMissing: [],
        mockLanguageScoring: true,
      },
    };
  }

  async rescheduleRewrite(_taskId: string): Promise<void> {
    await delay();
    removeStorage(STORAGE_KEYS.rewriteWindowExpired);
  }

  async rescheduleTransfer(_taskId: string): Promise<void> {
    await delay();
    removeStorage(STORAGE_KEYS.transferWindowExpired);
  }

  async getGrowth(): Promise<GrowthData> {
    await delay();
    return growth;
  }

  async getSettings(): Promise<SettingsData> {
    await delay();
    return {
      preferences: getPreferences(),
      ai: aiEnabled() ? connectedAi : missingAi,
      mailState: "ready",
    };
  }

  async updatePreferences(
    preferences: UserPreferences,
  ): Promise<UserPreferences> {
    writeStorage(STORAGE_KEYS.preferences, JSON.stringify(preferences));
    await delay(120);
    return preferences;
  }

  async downloadLearningArchive(): Promise<void> {
    await delay(120);
    if (typeof document === "undefined") return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            format: "iwc-demo-learning-record",
            exportedAt: new Date().toISOString(),
            note: "Deterministic demo data only; no AI secrets are included.",
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ielts-writing-demo-learning-record.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async getCycleExportOptions(): Promise<CycleExportOption[]> {
    throw new LearningClientError(
      "TrainingCycle exchange export is unavailable in the browser-only demo.",
      { status: 409, code: "DEMO_EXCHANGE_UNAVAILABLE" },
    );
  }

  async downloadCycleBundle(_cycleId: string): Promise<void> {
    throw new LearningClientError(
      "TrainingCycle exchange export is unavailable in the browser-only demo.",
      { status: 409, code: "DEMO_EXCHANGE_UNAVAILABLE" },
    );
  }

  async importLearningBundle(_file: File): Promise<CycleBundleImportResult> {
    throw new LearningClientError(
      "CycleBundle import is unavailable in the browser-only demo because it has no durable server database.",
      { status: 409, code: "DEMO_IMPORT_UNAVAILABLE" },
    );
  }

  async getModelRoutes(): Promise<ModelRouteSetting[]> {
    throw new LearningClientError(
      "Model-route administration is unavailable in the browser-only demo.",
      { status: 409, code: "DEMO_ADMIN_UNAVAILABLE" },
    );
  }

  async updateModelRoute(_input: {
    taskKind: AiTaskKind;
    providerConnectionId: string;
    model: string;
  }): Promise<ModelRouteSetting> {
    throw new LearningClientError(
      "Model-route administration is unavailable in the browser-only demo.",
      { status: 409, code: "DEMO_ADMIN_UNAVAILABLE" },
    );
  }

  async deleteLearningData(): Promise<void> {
    for (const key of [
      STORAGE_KEYS.draftV1,
      STORAGE_KEYS.draftV2,
      STORAGE_KEYS.lesson,
      STORAGE_KEYS.lessonPracticeComplete,
      STORAGE_KEYS.transferAnswer,
      STORAGE_KEYS.transferResult,
      STORAGE_KEYS.teachingPracticeResponses,
    ])
      removeStorage(key);
    await delay(120);
  }

  async testConnection(
    input: Partial<BootstrapInput>,
  ): Promise<ConnectionProbe> {
    await delay(900);
    if (!input.model || (input.provider !== "mock" && !input.apiKey)) {
      return {
        status: "failure",
        latencyMs: 0,
        connection: false,
        structuredOutput: false,
        contextWindow: false,
        messageZh: "连接信息不完整，请检查 API Key 和模型。",
        messageEn:
          "Connection details are incomplete. Check the API key and model.",
      };
    }
    const compatibility = input.provider === "compatible";
    return {
      status: compatibility ? "compatibility" : "success",
      latencyMs: compatibility ? 1128 : 842,
      connection: true,
      structuredOutput: !compatibility,
      contextWindow: true,
      messageZh: compatibility
        ? "连接可用。结构化输出将使用兼容提取与重试。"
        : "连接、结构化输出和上下文容量均已通过。",
      messageEn: compatibility
        ? "Connection works. Structured output will use compatibility extraction and retries."
        : "Connection, structured output, and context capacity all passed.",
    };
  }

  async completeBootstrap(_input: BootstrapInput): Promise<void> {
    await delay(280);
    writeStorage(STORAGE_KEYS.ai, "true");
  }

  async configureAiConnection(input: AiConnectionInput): Promise<void> {
    connectedAi.provider = input.provider;
    connectedAi.vendor = input.providerVendor;
    connectedAi.baseUrl = input.baseUrl;
    connectedAi.model = input.model;
    connectedAi.displayName = input.providerVendor;
  }

  async deleteAiConnection(connectionId: string): Promise<void> {
    if (connectionId !== connectedAi.id) {
      throw new Error("The selected demo connection no longer exists.");
    }
    writeStorage(STORAGE_KEYS.ai, "false");
    await delay(120);
  }

  async getSystemStatus(): Promise<SystemStatus> {
    await delay();
    return {
      actorRole: "owner",
      version: "1.0.0",
      deploymentMode: getPreferences().deploymentMode,
      ai: aiEnabled() ? connectedAi : missingAi,
      mailState: "ready",
      databaseState: "healthy",
      migrationsCurrent: true,
      taskExecutorState: "healthy",
      queue: {
        waiting: aiEnabled() ? 2 : 5,
        running: aiEnabled() ? 1 : 0,
        failed: aiEnabled() ? 0 : 3,
      },
      users: { active: 4, invited: 1, publicRegistration: false },
      privacy: {
        adminCanReadEssays: false,
        auditEvents: 18,
        recentAudit: [
          {
            id: "demo-audit-1",
            action: "provider.test",
            targetType: "provider_connection",
            targetId: "demo-provider",
            result: "success",
            occurredAt: "2026-08-12T12:00:00.000Z",
          },
        ],
      },
    };
  }
}

export const mockLearningClient = new MockLearningClient();
