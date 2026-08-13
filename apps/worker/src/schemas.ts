import { SKILL_IDS } from "@iwc/learning-contracts";

const band = {
  type: "number",
  minimum: 0,
  maximum: 9,
  multipleOf: 0.5,
} as const;
const confidence = { type: "number", minimum: 0, maximum: 1 } as const;
const criterion = {
  type: "object",
  additionalProperties: false,
  required: ["band", "confidence", "rationale"],
  properties: {
    band: { ...band, default: 6 },
    confidence: { ...confidence, default: 0.85 },
    rationale: {
      type: "string",
      minLength: 1,
      default: "Evidence-based criterion rationale.",
    },
  },
} as const;

export const assessmentJudgmentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["overallBand", "criteria"],
  properties: {
    overallBand: { ...band, default: 6 },
    criteria: {
      type: "object",
      additionalProperties: false,
      required: ["TR", "CC", "LR", "GRA"],
      properties: {
        TR: criterion,
        CC: criterion,
        LR: criterion,
        GRA: criterion,
      },
    },
  },
} as const;

const issue = {
  type: "object",
  additionalProperties: false,
  required: [
    "skillId",
    "startOffset",
    "endOffset",
    "excerpt",
    "diagnosis",
    "severity",
    "confidence",
  ],
  properties: {
    skillId: {
      type: "string",
      enum: [...SKILL_IDS],
      default: "collocation_perspective",
    },
    startOffset: { type: "integer", minimum: 0, default: 0 },
    endOffset: { type: "integer", minimum: 1, default: 1 },
    excerpt: { type: "string", minLength: 1, default: "A" },
    diagnosis: {
      type: "string",
      minLength: 1,
      default: "This feature should be reviewed in context.",
    },
    severity: {
      type: "string",
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "MEDIUM",
    },
    confidence: { ...confidence, default: 0.85 },
  },
} as const;

export const issueBatchSchema = {
  type: "object",
  additionalProperties: false,
  required: ["issues"],
  properties: {
    issues: { type: "array", minItems: 1, maxItems: 12, items: issue },
  },
} as const;

export const lessonContentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["titleZh", "objectiveZh", "stages"],
  properties: {
    titleZh: { type: "string", minLength: 1, default: "本轮专项训练" },
    objectiveZh: {
      type: "string",
      minLength: 1,
      default: "在新语境中独立、自然地运用目标能力。",
    },
    stages: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "titleZh",
          "instructionZh",
          "promptEn",
          "minutes",
          "responseMode",
          "sourceText",
          "options",
          "acceptedAnswers",
          "mappingPairs",
          "slotLabels",
          "validOrders",
          "branchPromptA",
          "branchPromptB",
          "branchPromptC",
          "rubricCriteria",
        ],
        properties: {
          titleZh: { type: "string", minLength: 1, default: "主动输出" },
          instructionZh: {
            type: "string",
            minLength: 1,
            default: "先独立作答，再查看反馈。",
          },
          promptEn: {
            type: "string",
            minLength: 1,
            default:
              "Write one original sentence that demonstrates the target skill.",
          },
          minutes: { type: "integer", minimum: 6, maximum: 12, default: 8 },
          responseMode: {
            type: "string",
            enum: ["short_text", "sentence", "paragraph", "outline"],
            default: "sentence",
          },
          sourceText: {
            type: "string",
            minLength: 1,
            default: "The learner sentence containing the target issue.",
          },
          options: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "labelZh", "labelEn", "confusionZh"],
              properties: {
                id: { type: "string", minLength: 1, default: "choice_a" },
                labelZh: { type: "string", minLength: 1, default: "选项" },
                labelEn: { type: "string", minLength: 1, default: "Option" },
                confusionZh: {
                  type: "string",
                  minLength: 1,
                  default: "需要重新区分目标规则。",
                },
              },
            },
          },
          acceptedAnswers: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string", minLength: 1, default: "choice_a" },
          },
          mappingPairs: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["left", "right"],
              properties: {
                left: { type: "string", minLength: 1, default: "meaning" },
                right: {
                  type: "string",
                  minLength: 1,
                  default: "English chunk",
                },
              },
            },
          },
          slotLabels: {
            type: "array",
            minItems: 2,
            maxItems: 5,
            items: { type: "string", minLength: 1, default: "slot" },
          },
          validOrders: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: {
              type: "string",
              minLength: 1,
              default: "complete accepted response",
            },
          },
          branchPromptA: {
            type: "string",
            minLength: 1,
            default: "Write for meaning branch A.",
          },
          branchPromptB: {
            type: "string",
            minLength: 1,
            default: "Write for meaning branch B.",
          },
          branchPromptC: {
            type: "string",
            minLength: 1,
            default: "Write for meaning branch C.",
          },
          rubricCriteria: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: {
              type: "string",
              minLength: 1,
              default:
                "The target is accurate, natural, and meaning-preserving.",
            },
          },
        },
      },
    },
  },
} as const;

export const evaluationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "passed",
    "firstAttemptPassed",
    "confidence",
    "feedbackZh",
    "evidenceEn",
    "dimensionScores",
    "criterionResults",
    "userAnswerEvidence",
    "mostImportantSuggestionZh",
    "naturalOpportunity",
    "coreErrorRecurred",
  ],
  properties: {
    passed: { type: "boolean", default: false },
    firstAttemptPassed: { type: "boolean", default: false },
    confidence: { ...confidence, default: 0.8 },
    feedbackZh: {
      type: "string",
      minLength: 1,
      default: "请根据目标再修改一次。",
    },
    evidenceEn: {
      type: "string",
      minLength: 1,
      default: "The response needs more independent evidence.",
    },
    dimensionScores: {
      type: "object",
      additionalProperties: false,
      required: ["targetCorrectness", "meaningPreservation", "naturalness"],
      properties: {
        targetCorrectness: { ...confidence, default: 0.5 },
        meaningPreservation: { ...confidence, default: 0.5 },
        naturalness: { ...confidence, default: 0.5 },
      },
    },
    criterionResults: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "score", "userAnswerEvidence"],
        properties: {
          id: { type: "string", minLength: 1, default: "target" },
          score: { ...confidence, default: 0.5 },
          userAnswerEvidence: {
            type: "array",
            minItems: 1,
            items: {
              type: "string",
              minLength: 1,
              default: "No qualifying first-attempt span was found.",
            },
          },
        },
      },
    },
    userAnswerEvidence: {
      type: "array",
      minItems: 1,
      items: {
        type: "string",
        minLength: 1,
        default: "No qualifying first-attempt span was found.",
      },
    },
    mostImportantSuggestionZh: {
      type: "string",
      minLength: 1,
      default: "先修正最影响目标能力的一处。",
    },
    naturalOpportunity: { type: "boolean", default: true },
    coreErrorRecurred: { type: "boolean", default: true },
  },
} as const;

export const comparisonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "targetApplied",
    "naturalOpportunity",
    "confidence",
    "improvementsZh",
    "regressionsZh",
    "evidenceV2",
    "coreIssueSpansV1",
    "coreIssueSpansV2",
    "modelEssay",
  ],
  properties: {
    targetApplied: { type: "boolean", default: false },
    naturalOpportunity: { type: "boolean", default: true },
    confidence: { ...confidence, default: 0.8 },
    improvementsZh: {
      type: "array",
      items: { type: "string" },
      default: ["Version 2 completed the delayed rewrite."],
    },
    regressionsZh: { type: "array", items: { type: "string" }, default: [] },
    evidenceV2: { type: "string", default: "" },
    coreIssueSpansV1: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["startOffset", "endOffset", "excerpt"],
        properties: {
          startOffset: { type: "integer", minimum: 0 },
          endOffset: { type: "integer", minimum: 1 },
          excerpt: { type: "string", minLength: 1 },
        },
      },
      default: [],
    },
    coreIssueSpansV2: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["startOffset", "endOffset", "excerpt"],
        properties: {
          startOffset: { type: "integer", minimum: 0 },
          endOffset: { type: "integer", minimum: 1 },
          excerpt: { type: "string", minLength: 1 },
        },
      },
      default: [],
    },
    modelEssay: {
      type: "string",
      minLength: 1,
      default:
        "A task-specific reference essay is unavailable in this deterministic response.",
    },
  },
} as const;

export const transferEvaluationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "targetApplied",
    "naturalOpportunity",
    "confidence",
    "feedbackZh",
    "feedbackEn",
    "evidenceEn",
    "dimensionScores",
    "userAnswerEvidence",
    "mostImportantSuggestionZh",
  ],
  properties: {
    targetApplied: { type: "boolean", default: false },
    naturalOpportunity: { type: "boolean", default: true },
    confidence: { ...confidence, default: 0.8 },
    feedbackZh: {
      type: "string",
      minLength: 1,
      default: "本次迁移证据尚不足。",
    },
    feedbackEn: {
      type: "string",
      minLength: 1,
      default: "This transfer attempt does not yet provide enough evidence.",
    },
    evidenceEn: {
      type: "string",
      default: "",
    },
    dimensionScores: {
      type: "object",
      additionalProperties: false,
      required: ["targetCorrectness", "meaningPreservation", "naturalness"],
      properties: {
        targetCorrectness: { ...confidence, default: 0.5 },
        meaningPreservation: { ...confidence, default: 0.5 },
        naturalness: { ...confidence, default: 0.5 },
      },
    },
    userAnswerEvidence: {
      type: "array",
      items: { type: "string" },
      default: [],
    },
    mostImportantSuggestionZh: {
      type: "string",
      minLength: 1,
      default: "继续在陌生话题中独立运用这一能力。",
    },
  },
} as const;
