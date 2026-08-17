import {
  SKILL_IDS,
  TEACHING_PRACTICE_COMPARISON_CODES,
  TEACHING_PRACTICE_IMPROVEMENT_CODES,
  TEACHING_PRACTICE_STRENGTH_CODES,
} from "@iwc/learning-contracts";

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
  required: [
    "overallBand",
    "overallSummaryZh",
    "overallSummaryEn",
    "strengthZh",
    "strengthEn",
    "paragraphFeedback",
    "criteria",
  ],
  properties: {
    overallBand: { ...band, default: 6 },
    overallSummaryZh: { type: "string", minLength: 1 },
    overallSummaryEn: { type: "string", minLength: 1 },
    strengthZh: { type: "string", minLength: 1 },
    strengthEn: { type: "string", minLength: 1 },
    paragraphFeedback: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "paragraphIndex",
          "excerpt",
          "roleZh",
          "roleEn",
          "diagnosisZh",
          "diagnosisEn",
          "actionZh",
          "actionEn",
          "revisionZh",
          "revisionEn",
        ],
        properties: {
          paragraphIndex: { type: "integer", minimum: 1 },
          excerpt: { type: "string", minLength: 1 },
          roleZh: { type: "string", minLength: 1 },
          roleEn: { type: "string", minLength: 1 },
          diagnosisZh: { type: "string", minLength: 1 },
          diagnosisEn: { type: "string", minLength: 1 },
          actionZh: { type: "string", minLength: 1 },
          actionEn: { type: "string", minLength: 1 },
          revisionZh: {
            type: "string",
            minLength: 1,
            description:
              "A polished revision of this exact paragraph that fixes the diagnosed issues while keeping the learner's meaning and voice. Never adds new ideas.",
          },
          revisionEn: {
            type: "string",
            minLength: 1,
            description:
              "A polished revision of this exact paragraph that fixes the diagnosed issues while keeping the learner's meaning and voice. Never adds new ideas.",
          },
        },
      },
    },
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
    "issueType",
    "correctedVersion",
    "explanationZh",
    "knowledgePointZh",
    "transferRuleZh",
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
    issueType: {
      type: "string",
      enum: [
        "GRAMMAR",
        "SPELLING",
        "WORD_FORM",
        "COLLOCATION",
        "NATURALNESS",
        "LOGIC",
        "COHESION",
        "TASK_RESPONSE",
        "OPTIONAL_POLISH",
      ],
      default: "COLLOCATION",
    },
    correctedVersion: { type: "string", minLength: 1 },
    explanationZh: { type: "string", minLength: 1 },
    knowledgePointZh: { type: "string", minLength: 1 },
    transferRuleZh: { type: "string", minLength: 1 },
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
    issues: { type: "array", minItems: 1, maxItems: 40, items: issue },
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

const paperCriterion = {
  type: "object",
  additionalProperties: false,
  required: ["labelZh", "labelEn", "descriptionZh", "descriptionEn", "weight"],
  properties: {
    labelZh: { type: "string", minLength: 2, maxLength: 20 },
    labelEn: { type: "string", minLength: 2, maxLength: 60 },
    descriptionZh: { type: "string", minLength: 8, maxLength: 300 },
    descriptionEn: { type: "string", minLength: 8, maxLength: 420 },
    weight: { type: "integer", minimum: 1, maximum: 100 },
  },
} as const;

const practicePaperProperties = {
  titleZh: { type: "string", minLength: 4, maxLength: 50 },
  titleEn: { type: "string", minLength: 4, maxLength: 90 },
  objectiveZh: { type: "string", minLength: 12, maxLength: 160 },
  objectiveEn: { type: "string", minLength: 12, maxLength: 220 },
  instructionsZh: {
    type: "array",
    minItems: 3,
    maxItems: 5,
    items: { type: "string", minLength: 4, maxLength: 100 },
  },
  instructionsEn: {
    type: "array",
    minItems: 3,
    maxItems: 5,
    items: { type: "string", minLength: 4, maxLength: 140 },
  },
  items: {
    type: "array",
    minItems: 8,
    maxItems: 8,
    items: {
      type: "object",
      additionalProperties: false,
      required: [
        "section",
        "titleZh",
        "titleEn",
        "instructionZh",
        "promptEn",
        "sourceText",
        "responseMode",
        "options",
        "acceptedAnswers",
        "answerExplanationZh",
        "suggestedMinutes",
        "minimumWords",
        "maximumWords",
        "publicCriteria",
      ],
      properties: {
        section: {
          type: "string",
          enum: ["FOUNDATION", "REPAIR", "GENERATION", "INTEGRATION"],
        },
        titleZh: { type: "string", minLength: 2, maxLength: 30 },
        titleEn: { type: "string", minLength: 2, maxLength: 100 },
        instructionZh: { type: "string", minLength: 8, maxLength: 500 },
        promptEn: { type: "string", minLength: 4, maxLength: 900 },
        sourceText: { type: "string", maxLength: 800 },
        responseMode: {
          type: "string",
          enum: ["choice", "short_text", "sentence", "paragraph"],
        },
        options: {
          type: "array",
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["key", "labelEn"],
            properties: {
              key: { type: "string", minLength: 1, maxLength: 20 },
              labelEn: { type: "string", minLength: 1, maxLength: 240 },
            },
          },
        },
        acceptedAnswers: {
          type: "array",
          maxItems: 4,
          items: { type: "string", minLength: 1, maxLength: 20 },
        },
        answerExplanationZh: { type: "string", minLength: 8, maxLength: 400 },
        suggestedMinutes: { type: "integer", minimum: 4, maximum: 15 },
        minimumWords: { type: "integer", minimum: 0, maximum: 150 },
        maximumWords: { type: "integer", minimum: 0, maximum: 150 },
        publicCriteria: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: paperCriterion,
        },
      },
    },
  },
} as const;

const practicePaperRequired = [
  "titleZh",
  "titleEn",
  "objectiveZh",
  "objectiveEn",
  "instructionsZh",
  "instructionsEn",
  "items",
] as const;

export const practicePaperContentSchema = {
  type: "object",
  additionalProperties: false,
  required: practicePaperRequired,
  properties: practicePaperProperties,
} as const;

/**
 * Content-only contract for one paper question. The surrounding slot
 * (section, responseMode, suggestedMinutes, minimumWords, maximumWords) is
 * decided by the worker, so the provider only authors the learner-facing
 * content and the grading metadata.
 */
export const practicePaperItemContentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "titleZh",
    "titleEn",
    "instructionZh",
    "promptEn",
    "sourceText",
    "options",
    "acceptedAnswers",
    "answerExplanationZh",
    "publicCriteria",
  ],
  properties: {
    titleZh: { type: "string", minLength: 2, maxLength: 30 },
    titleEn: { type: "string", minLength: 2, maxLength: 100 },
    instructionZh: { type: "string", minLength: 8, maxLength: 500 },
    promptEn: { type: "string", minLength: 4, maxLength: 900 },
    sourceText: { type: "string", maxLength: 800 },
    options: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "labelEn"],
        properties: {
          key: { type: "string", minLength: 1, maxLength: 20 },
          labelEn: { type: "string", minLength: 1, maxLength: 240 },
        },
      },
    },
    acceptedAnswers: {
      type: "array",
      maxItems: 4,
      items: { type: "string", minLength: 1, maxLength: 20 },
    },
    answerExplanationZh: { type: "string", minLength: 8, maxLength: 400 },
    publicCriteria: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: paperCriterion,
    },
  },
} as const;

const teachingPracticePromptSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "instructionZh",
    "instructionEn",
    "promptEn",
    "responseMode",
    "context",
    "optionsEn",
    "referenceAnswerEn",
    "referenceReasoningZh",
    "referenceReasoningEn",
  ],
  properties: {
    id: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    },
    instructionZh: { type: "string", minLength: 6, maxLength: 300 },
    instructionEn: { type: "string", minLength: 6, maxLength: 420 },
    promptEn: { type: "string", minLength: 8, maxLength: 700 },
    responseMode: {
      type: "string",
      enum: ["CHOICE", "SHORT_TEXT"],
    },
    context: {
      type: "string",
      enum: ["SAME_TOPIC", "UNSEEN_TOPIC"],
    },
    optionsEn: {
      type: "array",
      maxItems: 4,
      items: { type: "string", minLength: 1, maxLength: 300 },
    },
    referenceAnswerEn: {
      type: "string",
      minLength: 2,
      maxLength: 900,
    },
    referenceReasoningZh: {
      type: "string",
      minLength: 6,
      maxLength: 500,
    },
    referenceReasoningEn: {
      type: "string",
      minLength: 6,
      maxLength: 700,
    },
  },
} as const;

export const focusedLearningPackageSchema = {
  type: "object",
  additionalProperties: false,
  required: ["teachingModule", "paper"],
  properties: {
    teachingModule: {
      type: "object",
      additionalProperties: false,
      required: [
        "format",
        "titleZh",
        "titleEn",
        "introductionMarkdown",
        "estimatedMinutes",
        "coreAbilityZh",
        "coreAbilityEn",
        "sections",
        "practicePrompts",
      ],
      properties: {
        format: { type: "string", const: "ADAPTIVE_ARTICLE_V1" },
        titleZh: { type: "string", minLength: 6, maxLength: 100 },
        titleEn: { type: "string", minLength: 6, maxLength: 160 },
        introductionMarkdown: {
          type: "string",
          minLength: 40,
          maxLength: 2_000,
          default:
            "Mock introduction with enough length to satisfy validation.",
        },
        estimatedMinutes: { type: "integer", minimum: 15, maximum: 35 },
        coreAbilityZh: { type: "string", minLength: 4, maxLength: 40 },
        coreAbilityEn: { type: "string", minLength: 4, maxLength: 160 },
        sections: {
          type: "array",
          minItems: 2,
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["titleZh", "titleEn", "markdown"],
            properties: {
              titleZh: { type: "string", minLength: 2, maxLength: 60 },
              titleEn: { type: "string", minLength: 2, maxLength: 100 },
              markdown: {
                type: "string",
                minLength: 40,
                maxLength: 6_000,
                default:
                  "Mock section body with enough length to satisfy validation.",
              },
            },
          },
        },
        practicePrompts: {
          type: "array",
          minItems: 3,
          maxItems: 4,
          items: teachingPracticePromptSchema,
        },
      },
    },
    paper: {
      type: "object",
      additionalProperties: false,
      required: practicePaperRequired,
      properties: practicePaperProperties,
    },
  },
} as const;

/** Smaller provider contracts used when a compatible model cannot reliably
 * return the teaching article and eight-question paper in one response. */
export const adaptiveTeachingModuleSchema =
  focusedLearningPackageSchema.properties.teachingModule;

export const timedPracticePaperSchema =
  focusedLearningPackageSchema.properties.paper;

export const practicePaperEvaluationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["totalScore", "summaryZh", "itemResults"],
  properties: {
    totalScore: { type: "number", minimum: 0, maximum: 100 },
    summaryZh: { type: "string", minLength: 12, maxLength: 400 },
    itemResults: {
      type: "array",
      minItems: 8,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "itemId",
          "status",
          "score",
          "feedbackZh",
          "strengthsZh",
          "problems",
          "improvedAnswerEn",
          "nextStepZh",
        ],
        properties: {
          itemId: { type: "string", minLength: 1 },
          status: {
            type: "string",
            enum: ["MEETS_STANDARD", "NEEDS_WORK", "NOT_SCORABLE"],
          },
          score: { type: "number", minimum: 0, maximum: 100 },
          feedbackZh: { type: "string", minLength: 4, maxLength: 300 },
          strengthsZh: {
            type: "array",
            maxItems: 3,
            items: { type: "string", minLength: 2, maxLength: 120 },
          },
          problems: {
            type: "array",
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["criterionLabelZh", "explanationZh", "evidence"],
              properties: {
                criterionLabelZh: {
                  type: "string",
                  minLength: 2,
                  maxLength: 30,
                },
                explanationZh: {
                  type: "string",
                  minLength: 4,
                  maxLength: 240,
                },
                evidence: { type: "string", maxLength: 240 },
              },
            },
          },
          improvedAnswerEn: { type: "string", maxLength: 1000 },
          nextStepZh: { type: "string", minLength: 4, maxLength: 200 },
        },
      },
    },
  },
} as const;

export const teachingPracticeAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "disposition",
    "strengths",
    "comparisons",
    "improvements",
    "confidence",
  ],
  properties: {
    disposition: {
      type: "string",
      enum: ["SUPPORTED", "NO_CLEAR_IMPROVEMENT", "INSUFFICIENT_EVIDENCE"],
    },
    strengths: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "evidence"],
        properties: {
          code: { type: "string", enum: TEACHING_PRACTICE_STRENGTH_CODES },
          evidence: { type: "string", minLength: 1, maxLength: 500 },
        },
      },
    },
    comparisons: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "evidence"],
        properties: {
          code: { type: "string", enum: TEACHING_PRACTICE_COMPARISON_CODES },
          evidence: { type: "string", minLength: 1, maxLength: 500 },
        },
      },
    },
    improvements: {
      type: "array",
      maxItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "evidence"],
        properties: {
          code: { type: "string", enum: TEACHING_PRACTICE_IMPROVEMENT_CODES },
          evidence: { type: "string", minLength: 1, maxLength: 500 },
        },
      },
    },
    confidence,
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
