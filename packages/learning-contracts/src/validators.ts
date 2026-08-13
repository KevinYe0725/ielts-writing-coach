import Ajv2020, {
  type AnySchemaObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";

import assessmentSchema from "../schemas/assessment.schema.json" with { type: "json" };
import aiAssessmentJudgmentSchema from "../schemas/ai-assessment-judgment.schema.json" with { type: "json" };
import aiIssueJudgmentSchema from "../schemas/ai-issue-judgment.schema.json" with { type: "json" };
import commonSchema from "../schemas/common.schema.json" with { type: "json" };
import cycleBundleSchema from "../schemas/cycle-bundle.schema.json" with { type: "json" };
import exerciseItemSchema from "../schemas/exercise-item.schema.json" with { type: "json" };
import exerciseResponseSchema from "../schemas/exercise-response.schema.json" with { type: "json" };
import issueEvidenceSchema from "../schemas/issue-evidence.schema.json" with { type: "json" };
import learningProfileExchangeSchema from "../schemas/learning-profile-exchange.schema.json" with { type: "json" };
import lessonPlanSchema from "../schemas/lesson-plan.schema.json" with { type: "json" };
import rewritePacketSchema from "../schemas/rewrite-packet.schema.json" with { type: "json" };
import skillDefinitionSchema from "../schemas/skill-definition.schema.json" with { type: "json" };
import skillEvidenceEventSchema from "../schemas/skill-evidence-event.schema.json" with { type: "json" };
import trainingCycleSchema from "../schemas/training-cycle.schema.json" with { type: "json" };
import type {
  AssessmentContract,
  AiAssessmentJudgment,
  AiIssueJudgment,
  ContractValidationIssue,
  ContractValidationResult,
  CycleBundle,
  ExerciseItem,
  ExerciseResponseContract,
  IssueEvidence,
  LearningProfileExchange,
  LessonPlan,
  RewritePacket,
  SkillDefinition,
  SkillEvidenceEvent,
  TrainingCycle,
} from "./types";

export const CONTRACT_SCHEMAS = Object.freeze({
  common: commonSchema,
  cycleBundle: cycleBundleSchema,
  aiAssessmentJudgment: aiAssessmentJudgmentSchema,
  aiIssueJudgment: aiIssueJudgmentSchema,
  skillDefinition: skillDefinitionSchema,
  assessment: assessmentSchema,
  exerciseItem: exerciseItemSchema,
  exerciseResponse: exerciseResponseSchema,
  issueEvidence: issueEvidenceSchema,
  skillEvidenceEvent: skillEvidenceEventSchema,
  lessonPlan: lessonPlanSchema,
  trainingCycle: trainingCycleSchema,
  rewritePacket: rewritePacketSchema,
  learningProfileExchange: learningProfileExchangeSchema,
});

export type ContractSchemaName = Exclude<
  keyof typeof CONTRACT_SCHEMAS,
  "common"
>;

interface ContractTypeMap {
  readonly cycleBundle: CycleBundle;
  readonly aiAssessmentJudgment: AiAssessmentJudgment;
  readonly aiIssueJudgment: AiIssueJudgment;
  readonly skillDefinition: SkillDefinition;
  readonly assessment: AssessmentContract;
  readonly exerciseItem: ExerciseItem;
  readonly exerciseResponse: ExerciseResponseContract;
  readonly issueEvidence: IssueEvidence;
  readonly skillEvidenceEvent: SkillEvidenceEvent;
  readonly lessonPlan: LessonPlan;
  readonly trainingCycle: TrainingCycle;
  readonly rewritePacket: RewritePacket;
  readonly learningProfileExchange: LearningProfileExchange;
}

const schemaIds: Readonly<Record<ContractSchemaName, string>> = {
  cycleBundle:
    "https://ielts-writing-coach.dev/schemas/cycle-bundle.schema.json",
  aiAssessmentJudgment:
    "https://ielts-writing-coach.dev/schemas/ai-assessment-judgment.schema.json",
  aiIssueJudgment:
    "https://ielts-writing-coach.dev/schemas/ai-issue-judgment.schema.json",
  skillDefinition:
    "https://ielts-writing-coach.dev/schemas/skill-definition.schema.json",
  assessment: "https://ielts-writing-coach.dev/schemas/assessment.schema.json",
  exerciseItem:
    "https://ielts-writing-coach.dev/schemas/exercise-item.schema.json",
  exerciseResponse:
    "https://ielts-writing-coach.dev/schemas/exercise-response.schema.json",
  issueEvidence:
    "https://ielts-writing-coach.dev/schemas/issue-evidence.schema.json",
  skillEvidenceEvent:
    "https://ielts-writing-coach.dev/schemas/skill-evidence-event.schema.json",
  lessonPlan: "https://ielts-writing-coach.dev/schemas/lesson-plan.schema.json",
  trainingCycle:
    "https://ielts-writing-coach.dev/schemas/training-cycle.schema.json",
  rewritePacket:
    "https://ielts-writing-coach.dev/schemas/rewrite-packet.schema.json",
  learningProfileExchange:
    "https://ielts-writing-coach.dev/schemas/learning-profile-exchange.schema.json",
};

const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of Object.values(CONTRACT_SCHEMAS)) {
  ajv.addSchema(schema as AnySchemaObject);
}

function requiredValidator<T>(schemaId: string): ValidateFunction<T> {
  const validator = ajv.getSchema<T>(schemaId);
  if (validator === undefined) {
    throw new Error(`Learning contract schema was not registered: ${schemaId}`);
  }
  return validator;
}

const validators: {
  readonly [K in ContractSchemaName]: ValidateFunction<ContractTypeMap[K]>;
} = {
  cycleBundle: requiredValidator<CycleBundle>(schemaIds.cycleBundle),
  aiAssessmentJudgment: requiredValidator<AiAssessmentJudgment>(
    schemaIds.aiAssessmentJudgment,
  ),
  aiIssueJudgment: requiredValidator<AiIssueJudgment>(
    schemaIds.aiIssueJudgment,
  ),
  skillDefinition: requiredValidator<SkillDefinition>(
    schemaIds.skillDefinition,
  ),
  assessment: requiredValidator<AssessmentContract>(schemaIds.assessment),
  exerciseItem: requiredValidator<ExerciseItem>(schemaIds.exerciseItem),
  exerciseResponse: requiredValidator<ExerciseResponseContract>(
    schemaIds.exerciseResponse,
  ),
  issueEvidence: requiredValidator<IssueEvidence>(schemaIds.issueEvidence),
  skillEvidenceEvent: requiredValidator<SkillEvidenceEvent>(
    schemaIds.skillEvidenceEvent,
  ),
  lessonPlan: requiredValidator<LessonPlan>(schemaIds.lessonPlan),
  trainingCycle: requiredValidator<TrainingCycle>(schemaIds.trainingCycle),
  rewritePacket: requiredValidator<RewritePacket>(schemaIds.rewritePacket),
  learningProfileExchange: requiredValidator<LearningProfileExchange>(
    schemaIds.learningProfileExchange,
  ),
};

export function validateContract<K extends ContractSchemaName>(
  schemaName: K,
  value: unknown,
): ContractValidationResult {
  const validator = validators[schemaName] as ValidateFunction<unknown>;
  const valid = validator(value);
  const issues: ContractValidationIssue[] = (validator.errors ?? []).map(
    (error) => ({
      instancePath: error.instancePath,
      keyword: error.keyword,
      message: error.message ?? "Contract validation failed",
    }),
  );
  return { valid, issues };
}

export function isContract<K extends ContractSchemaName>(
  schemaName: K,
  value: unknown,
): value is ContractTypeMap[K] {
  return validators[schemaName](value);
}

export function assertContract<K extends ContractSchemaName>(
  schemaName: K,
  value: unknown,
): asserts value is ContractTypeMap[K] {
  const result = validateContract(schemaName, value);
  if (!result.valid) {
    const details = result.issues
      .map((issue) => `${issue.instancePath || "/"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid ${schemaName} contract: ${details}`);
  }
}

export function validateAiAssessmentJudgment(
  value: unknown,
): ContractValidationResult {
  return validateContract("aiAssessmentJudgment", value);
}

/**
 * Validates semantic AI issue output against the immutable essay snapshot.
 * Offsets are zero-based UTF-16 indices and endOffset is exclusive.
 */
export function validateAiIssueJudgment(
  value: unknown,
  essaySnapshot?: string,
): ContractValidationResult {
  const schemaResult = validateContract("aiIssueJudgment", value);
  if (!schemaResult.valid) {
    return schemaResult;
  }
  const judgment = value as AiIssueJudgment;
  const issues: ContractValidationIssue[] = [];
  if (judgment.endOffset <= judgment.startOffset) {
    issues.push({
      instancePath: "/endOffset",
      keyword: "offsetOrder",
      message: "endOffset must be greater than startOffset",
    });
  }
  if (essaySnapshot !== undefined) {
    if (judgment.endOffset > essaySnapshot.length) {
      issues.push({
        instancePath: "/endOffset",
        keyword: "offsetRange",
        message: "endOffset exceeds the immutable essay snapshot",
      });
    } else if (
      essaySnapshot.slice(judgment.startOffset, judgment.endOffset) !==
      judgment.excerpt
    ) {
      issues.push({
        instancePath: "/excerpt",
        keyword: "excerptMatch",
        message:
          "excerpt must exactly match the immutable essay snapshot at the supplied offsets",
      });
    }
  }
  return { valid: issues.length === 0, issues };
}

function concreteCycleBundleEntities(
  bundle: CycleBundle,
): ReadonlyMap<string, string> {
  const entities = new Map<string, string>();
  const add = (id: string, kind: string): void => {
    const existing = entities.get(id);
    if (existing !== undefined && existing !== kind) {
      entities.set(id, `COLLISION:${existing}:${kind}`);
      return;
    }
    entities.set(id, kind);
  };

  add(bundle.cycle.id, "CYCLE");
  add(bundle.cycle.question.id, "QUESTION");
  bundle.attempts.forEach((attempt) => add(attempt.id, "ESSAY_ATTEMPT"));
  if (bundle.assessment !== null) {
    add(bundle.assessment.id, "ASSESSMENT");
  }
  bundle.issueEvidence.forEach((issue) => add(issue.id, "ISSUE_EVIDENCE"));
  bundle.objectives.forEach((objective) => add(objective.id, "OBJECTIVE"));
  if (bundle.lesson.plan !== null) {
    add(bundle.lesson.plan.id, "LESSON_PLAN");
    bundle.lesson.plan.blocks.forEach((block) => {
      add(block.id, "LESSON_BLOCK");
      block.items.forEach((item) => add(item.id, "EXERCISE_ITEM"));
    });
  }
  bundle.lesson.responses.forEach((response) => {
    add(response.id, "EXERCISE_RESPONSE");
    response.attempts.forEach((attempt) => add(attempt.id, "EXERCISE_ATTEMPT"));
    response.evaluations.forEach((evaluation) =>
      add(evaluation.id, "EXERCISE_EVALUATION"),
    );
  });
  bundle.evidence.forEach((event) => add(event.id, "SKILL_EVIDENCE"));
  add(bundle.dueTasks.rewrite.id, "REWRITE_TASK");
  bundle.dueTasks.transfers.forEach((task) => add(task.id, "TRANSFER_TASK"));
  add(bundle.dueTasks.mixedReview.id, "MIXED_REVIEW_TASK");
  bundle.conflicts.forEach((conflict) => add(conflict.id, "CONFLICT"));
  return entities;
}

/** Adds cross-record rules that JSON Schema cannot express. */
export function validateCycleBundle(bundle: unknown): ContractValidationResult {
  const schemaResult = validateContract("cycleBundle", bundle);
  if (!schemaResult.valid) {
    return schemaResult;
  }
  const value = bundle as CycleBundle;
  const issues: ContractValidationIssue[] = [];
  const entityMap = concreteCycleBundleEntities(value);
  const appendOnlyIds = new Set(value.manifest.appendOnlyEntityIds);

  if (value.manifest.cycleId !== value.cycle.id) {
    issues.push({
      instancePath: "/manifest/cycleId",
      keyword: "crossReference",
      message: "manifest.cycleId must equal cycle.id",
    });
  }
  if (
    (value.manifest.revision === 1 && value.manifest.parentRevision !== null) ||
    (value.manifest.parentRevision !== null &&
      value.manifest.parentRevision >= value.manifest.revision)
  ) {
    issues.push({
      instancePath: "/manifest/parentRevision",
      keyword: "revisionOrder",
      message:
        "parentRevision must be null for revision 1 and otherwise lower than revision",
    });
  }
  for (const [id, kind] of entityMap) {
    if (kind.startsWith("COLLISION:")) {
      issues.push({
        instancePath: "/manifest/appendOnlyEntityIds",
        keyword: "uniqueEntityId",
        message: `Entity ID ${id} is reused across entity types (${kind}).`,
      });
    }
    if (!appendOnlyIds.has(id)) {
      issues.push({
        instancePath: "/manifest/appendOnlyEntityIds",
        keyword: "appendOnlyCoverage",
        message: `Concrete ${kind} ID ${id} is missing from the append-only manifest.`,
      });
    }
  }
  if (
    value.assessment !== null &&
    !value.attempts.some(
      (attempt) => attempt.id === value.assessment?.attemptId,
    )
  ) {
    issues.push({
      instancePath: "/assessment/attemptId",
      keyword: "crossReference",
      message: "Assessment must reference an attempt included in the bundle.",
    });
  }
  const issueEvidenceIds = new Set(
    value.issueEvidence.map((issue) => issue.id),
  );
  if (value.assessment !== null) {
    for (const issueId of value.assessment.issueEvidenceIds) {
      if (!issueEvidenceIds.has(issueId)) {
        issues.push({
          instancePath: "/assessment/issueEvidenceIds",
          keyword: "crossReference",
          message: `Assessment references missing issue evidence ${issueId}.`,
        });
      }
    }
  }
  for (const issue of value.issueEvidence) {
    if (
      !value.attempts.some((attempt) => attempt.id === issue.essayAttemptId)
    ) {
      issues.push({
        instancePath: "/issueEvidence",
        keyword: "crossReference",
        message: `Issue evidence ${issue.id} references an attempt outside the bundle.`,
      });
    }
  }
  for (const objective of value.objectives) {
    if (objective.trainingCycleId !== value.cycle.id) {
      issues.push({
        instancePath: "/objectives",
        keyword: "crossReference",
        message: `Objective ${objective.id} references another cycle.`,
      });
    }
  }
  if (
    value.lesson.plan !== null &&
    value.lesson.plan.trainingCycleId !== value.cycle.id
  ) {
    issues.push({
      instancePath: "/lesson/plan/trainingCycleId",
      keyword: "crossReference",
      message: "Lesson plan references another cycle.",
    });
  }
  for (const response of value.lesson.responses) {
    const responseAttemptIds = new Set(
      response.attempts.map((attempt) => attempt.id),
    );
    if (!responseAttemptIds.has(response.firstAttemptId)) {
      issues.push({
        instancePath: "/lesson/responses",
        keyword: "crossReference",
        message: `Response ${response.id} points to a missing first attempt.`,
      });
    }
    if (!responseAttemptIds.has(response.finalAttemptId)) {
      issues.push({
        instancePath: "/lesson/responses",
        keyword: "crossReference",
        message: `Response ${response.id} points to a missing final attempt.`,
      });
    }
    for (const evaluation of response.evaluations) {
      if (!responseAttemptIds.has(evaluation.attemptId)) {
        issues.push({
          instancePath: "/lesson/responses",
          keyword: "crossReference",
          message: `Evaluation ${evaluation.id} points to a missing response attempt.`,
        });
      }
    }
    if (
      response.currentEvaluationId !== undefined &&
      !response.evaluations.some(
        (evaluation) => evaluation.id === response.currentEvaluationId,
      )
    ) {
      issues.push({
        instancePath: "/lesson/responses",
        keyword: "crossReference",
        message: `Response ${response.id} points to a missing current evaluation.`,
      });
    }
  }
  return { valid: issues.length === 0, issues };
}

/** Validates a direct round-trip update without permitting ID deletion or type reuse. */
export function validateCycleBundleAppendOnly(
  previous: unknown,
  next: unknown,
): ContractValidationResult {
  const previousResult = validateCycleBundle(previous);
  const nextResult = validateCycleBundle(next);
  if (!previousResult.valid || !nextResult.valid) {
    return {
      valid: false,
      issues: [...previousResult.issues, ...nextResult.issues],
    };
  }
  const before = previous as CycleBundle;
  const after = next as CycleBundle;
  const issues: ContractValidationIssue[] = [];
  const same = (left: unknown, right: unknown): boolean => {
    if (Object.is(left, right)) return true;
    if (Array.isArray(left) && Array.isArray(right)) {
      return (
        left.length === right.length &&
        left.every((value, index) => same(value, right[index]))
      );
    }
    if (
      left !== null &&
      right !== null &&
      typeof left === "object" &&
      typeof right === "object"
    ) {
      const leftEntries = Object.entries(left as Record<string, unknown>).sort(
        ([leftKey], [rightKey]) => leftKey.localeCompare(rightKey),
      );
      const rightEntries = Object.entries(
        right as Record<string, unknown>,
      ).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
      return (
        leftEntries.length === rightEntries.length &&
        leftEntries.every(
          ([key, value], index) =>
            key === rightEntries[index]?.[0] &&
            same(value, rightEntries[index]?.[1]),
        )
      );
    }
    return false;
  };
  const requireExistingExact = <T extends { readonly id: string }>(
    beforeValues: readonly T[],
    afterValues: readonly T[],
    path: string,
  ) => {
    const nextById = new Map(afterValues.map((value) => [value.id, value]));
    for (const value of beforeValues) {
      if (!same(value, nextById.get(value.id))) {
        issues.push({
          instancePath: `${path}/${value.id}`,
          keyword: "immutableEntity",
          message: `Existing entity ${value.id} changed or disappeared.`,
        });
      }
    }
  };
  if (before.cycle.id !== after.cycle.id) {
    issues.push({
      instancePath: "/cycle/id",
      keyword: "immutable",
      message: "A round-trip update cannot change cycle.id.",
    });
  }
  if (after.manifest.revision !== before.manifest.revision + 1) {
    issues.push({
      instancePath: "/manifest/revision",
      keyword: "revisionOrder",
      message: "A direct successor must increase revision by exactly one.",
    });
  }
  if (after.manifest.parentRevision !== before.manifest.revision) {
    issues.push({
      instancePath: "/manifest/parentRevision",
      keyword: "revisionParent",
      message: "A direct successor must name the local revision as its parent.",
    });
  }
  if (!same(before.cycle.question, after.cycle.question)) {
    issues.push({
      instancePath: "/cycle/question",
      keyword: "immutable",
      message: "Question ID, prompt, and instructions are immutable.",
    });
  }
  if (
    new Date(before.cycle.createdAt).getTime() !==
    new Date(after.cycle.createdAt).getTime()
  ) {
    issues.push({
      instancePath: "/cycle/createdAt",
      keyword: "immutable",
      message: "cycle.createdAt is immutable.",
    });
  }
  const afterIds = new Set(after.manifest.appendOnlyEntityIds);
  for (const id of before.manifest.appendOnlyEntityIds) {
    if (!afterIds.has(id)) {
      issues.push({
        instancePath: "/manifest/appendOnlyEntityIds",
        keyword: "appendOnly",
        message: `Existing entity ID ${id} was removed.`,
      });
    }
  }
  const beforeEntities = concreteCycleBundleEntities(before);
  const afterEntities = concreteCycleBundleEntities(after);
  for (const [id, kind] of beforeEntities) {
    const nextKind = afterEntities.get(id);
    if (nextKind === undefined) {
      issues.push({
        instancePath: "/",
        keyword: "appendOnly",
        message: `Existing ${kind} entity ${id} was removed from the bundle.`,
      });
    } else if (nextKind !== kind) {
      issues.push({
        instancePath: "/",
        keyword: "immutableEntityType",
        message: `Entity ID ${id} changed type from ${kind} to ${nextKind}.`,
      });
    }
  }
  requireExistingExact(before.attempts, after.attempts, "/attempts");
  requireExistingExact(
    before.issueEvidence,
    after.issueEvidence,
    "/issueEvidence",
  );
  requireExistingExact(before.objectives, after.objectives, "/objectives");
  requireExistingExact(before.evidence, after.evidence, "/evidence");
  requireExistingExact(before.conflicts, after.conflicts, "/conflicts");
  if (
    before.assessment !== null &&
    !same(before.assessment, after.assessment)
  ) {
    issues.push({
      instancePath: "/assessment",
      keyword: "immutableEntity",
      message: "An existing assessment cannot be replaced.",
    });
  }
  if (
    before.lesson.plan !== null &&
    !same(before.lesson.plan, after.lesson.plan)
  ) {
    issues.push({
      instancePath: "/lesson/plan",
      keyword: "immutableEntity",
      message: "An existing lesson plan cannot be replaced.",
    });
  }
  const nextResponses = new Map(
    after.lesson.responses.map((response) => [response.id, response]),
  );
  for (const response of before.lesson.responses) {
    const next = nextResponses.get(response.id);
    if (
      !next ||
      response.schemaVersion !== next.schemaVersion ||
      response.exerciseItemId !== next.exerciseItemId ||
      response.firstAttemptId !== next.firstAttemptId
    ) {
      issues.push({
        instancePath: `/lesson/responses/${response.id}`,
        keyword: "immutableEntity",
        message: `Response ${response.id} changed identity or disappeared.`,
      });
      continue;
    }
    requireExistingExact(
      response.attempts,
      next.attempts,
      `/lesson/responses/${response.id}/attempts`,
    );
    requireExistingExact(
      response.evaluations,
      next.evaluations,
      `/lesson/responses/${response.id}/evaluations`,
    );
  }
  if (before.dueTasks.rewrite.id !== after.dueTasks.rewrite.id) {
    issues.push({
      instancePath: "/dueTasks/rewrite/id",
      keyword: "immutable",
      message: "Rewrite task identity is immutable.",
    });
  }
  const nextTransfers = new Map(
    after.dueTasks.transfers.map((task) => [task.id, task]),
  );
  for (const task of before.dueTasks.transfers) {
    if (nextTransfers.get(task.id)?.objectiveId !== task.objectiveId) {
      issues.push({
        instancePath: `/dueTasks/transfers/${task.id}`,
        keyword: "immutable",
        message: `Transfer task ${task.id} changed objective or disappeared.`,
      });
    }
  }
  if (before.dueTasks.mixedReview.id !== after.dueTasks.mixedReview.id) {
    issues.push({
      instancePath: "/dueTasks/mixedReview/id",
      keyword: "immutable",
      message: "Mixed-review task identity is immutable.",
    });
  }
  return { valid: issues.length === 0, issues };
}
