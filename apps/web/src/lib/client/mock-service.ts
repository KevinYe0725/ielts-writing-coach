import type {
  AiConnection,
  AiTaskKind,
  AttemptData,
  AttemptSubmission,
  BootstrapInput,
  ComparisonData,
  ConnectionProbe,
  CustomQuestionInput,
  CycleExportOption,
  CycleBundleImportResult,
  FeedbackData,
  GrowthData,
  LearningClient,
  LessonData,
  ModelRouteSetting,
  QuestionOption,
  SettingsData,
  SystemStatus,
  TodayData,
  TransferResponseInput,
  TransferResult,
  TransferSubmission,
  TransferTaskData,
  UserPreferences,
} from "./types";
import { LearningClientError } from "./errors";

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

const removeStorage = (key: string): void => {
  if (canUseStorage()) window.localStorage.removeItem(key);
};

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
  lessonGenerationRetry: null,
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
        "The pressure from the courses in primary school is much slighter.",
      explanationZh:
        "much slighter 在形式上可以构成比较级，但英语更常让承受压力的人作主语，并搭配 face academic pressure。",
      explanationEn:
        "Although much slighter can form a comparison, English more naturally makes the person experiencing pressure the subject.",
      transferRuleZh:
        "先判断你描述的是人承受压力、课业量，还是课程要求，再选择对应词块。",
      transferRuleEn:
        "First identify whether you mean pressure, workload, or course demands; then choose the matching chunk.",
    },
    {
      id: "issue-comparison",
      priority: 2,
      categoryZh: "比较结构",
      categoryEn: "Comparison structure",
      titleZh: "比较对象必须完整且属于同一类别",
      titleEn: "Make both sides of a comparison complete and parallel",
      evidence:
        "children have a better ability to absorb new knowledge than the older",
      explanationZh:
        "older 在这里是形容词，缺少 people 或 learners，导致比较对象不完整。",
      explanationEn:
        "Older is adjectival here and needs a noun such as people or learners.",
      transferRuleZh: "写 than 后立即检查：A 与 B 是否同类，B 是否写完整。",
      transferRuleEn:
        "After than, check that A and B are parallel and that B is complete.",
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
        "Children can learn languages easily, so it is beneficial for their future.",
      explanationZh:
        "观点方向正确，但需要说明早期接触如何形成基础，以及这个基础为何能降低后期学习成本。",
      explanationEn:
        "The direction is sound, but the mechanism from exposure to a useful foundation is missing.",
      transferRuleZh: "每个主体观点至少回答 Why、How 和 So what。",
      transferRuleEn: "For each body idea, answer Why, How, and So what.",
    },
  ],
  lessonScheduledLabelZh: "专项训练已安排在今天 20:00，预计 45–60 分钟。",
  lessonScheduledLabelEn:
    "Your focused lesson is scheduled for 20:00 today and will take about 45–60 minutes.",
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
    const key = version === 1 ? STORAGE_KEYS.draftV1 : STORAGE_KEYS.draftV2;
    return {
      id: version === 1 ? "attempt-v1" : "attempt-v2",
      version,
      prompt: writingPrompt,
      durationSeconds: 40 * 60,
      draft: readStorage(key) ?? (version === 1 ? defaultEssay : ""),
      startedAt: "2026-08-13T12:00:00.000Z",
      autosaveKey: key,
      cycleId,
    };
  }

  async saveDraft(attemptId: string, draft: string): Promise<void> {
    const key = attemptId.includes("v2")
      ? STORAGE_KEYS.draftV2
      : STORAGE_KEYS.draftV1;
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
  ): Promise<AttemptSubmission> {
    await this.saveDraft(attemptId, draft);
    await delay(240);
    return {
      feedbackReady: true,
      jobId: "demo-submission-job",
      jobStatus: "SUCCEEDED",
    };
  }

  async getFeedback(_cycleId: string): Promise<FeedbackData> {
    await delay();
    return readStorage(STORAGE_KEYS.lessonGenerationFailure) === "true"
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
