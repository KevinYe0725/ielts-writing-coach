import {
  decideLessonAdaptivePath,
  effectiveLessonElapsedSeconds,
  evaluateAppliedGate,
  lessonSegmentLimitSeconds,
  lessonTimeboxExpired,
  type LessonRuntimeAdaptiveState,
  type LessonRuntimeState as CoreLessonRuntimeState,
  type RuntimeEvaluation,
  type RuntimeLessonItem,
} from "@iwc/learning-core";
import {
  isContract,
  isSkillId,
  type SkillEvidenceEvent,
} from "@iwc/learning-contracts";

import type {
  evaluation,
  exerciseAttempt,
  exerciseItem,
  lessonPlan,
} from "@iwc/db";

export interface LessonDraftState {
  readonly itemId: string;
  readonly answer: string;
  readonly firstAnswer: string;
  readonly responseId?: string;
  readonly attempts: number;
  readonly hintLevel: number;
  readonly revealed: boolean;
  readonly updatedAt: string;
}

export interface PersistedLessonRuntimeState extends CoreLessonRuntimeState {
  readonly split: "NONE" | "SCHEDULED" | "ACTIVE" | "COMPLETED";
  readonly refresher: "NOT_REQUIRED" | "REQUIRED" | "COMPLETED";
  readonly adaptive?: LessonRuntimeAdaptiveState;
  readonly draft?: LessonDraftState;
  readonly refresherAnswer?: string;
  readonly interruptions?: LessonInterruption[];
  readonly autoSplit?: LessonAutoSplitState;
  readonly refresherPlan?: LessonRefresherPlan;
  readonly completionMode?:
    | "EVIDENCE_APPLIED"
    | "PRACTICE_ONLY"
    | "TIMEBOX_TRIMMED";
  readonly semanticBranch?: string;
  readonly semanticBranchSourceItemId?: string;
}

export type LessonInterruptionKind =
  | "BROWSER"
  | "NETWORK"
  | "TIMER"
  | "USER_ABNORMAL";

export interface LessonInterruption {
  readonly at: string;
  readonly kind: LessonInterruptionKind;
}

export interface LessonAutoSplitModule {
  itemIds: string[];
  expectedMinutes: number;
}

export interface LessonAutoSplitState {
  triggeredAt: string;
  maxSegmentSeconds: 1500;
  modules: LessonAutoSplitModule[];
  currentModuleIndex: number;
}

export interface LessonRefresherPlan {
  readonly kind: "RULE_CONTRAST" | "SCAFFOLD_FADE" | "TIMED_PARAGRAPH";
  readonly durationMinutes: number;
  readonly sourceItemId?: string;
}

const INTERRUPTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
export const AUTO_SPLIT_MAX_SECONDS = 25 * 60;

/** Runtime helpers intentionally depend only on legacy clock fields. */
export type LessonPlanRow = Omit<
  typeof lessonPlan.$inferSelect,
  | "practiceFormat"
  | "paperContent"
  | "paperAnswers"
  | "paperResult"
  | "paperSubmittedAt"
  | "paperEvaluationJobId"
> &
  Partial<
    Pick<
      typeof lessonPlan.$inferSelect,
      | "practiceFormat"
      | "paperContent"
      | "paperAnswers"
      | "paperResult"
      | "paperSubmittedAt"
      | "paperEvaluationJobId"
    >
  >;
export type ExerciseItemRow = typeof exerciseItem.$inferSelect;
export type ExerciseAttemptRow = typeof exerciseAttempt.$inferSelect;
export type EvaluationRow = typeof evaluation.$inferSelect;

/**
 * One exercise keeps the independent first answer and one learner revision.
 * Further practice must use a fresh item so repetition cannot masquerade as
 * transfer and a learner can never be trapped retrying one prompt forever.
 */
export const MAX_EXERCISE_RESPONSE_VERSIONS = 2;

export interface AttemptWithEvaluations extends ExerciseAttemptRow {
  readonly evaluations: readonly EvaluationRow[];
}

export interface LessonRuntimeSnapshot {
  readonly status: string;
  readonly startedAt: Date | null;
  readonly effectiveElapsedSeconds: number;
  readonly productiveSeconds: number;
  readonly segmentLimitSeconds: number;
  readonly timeboxExpired: boolean;
  readonly revision: number;
  readonly state: PersistedLessonRuntimeState;
}

/**
 * A lesson may open its formal rewrite only from this cycle's canonical
 * evidence. The learner's aggregate skill state can already be applied from
 * an older cycle and therefore is not a valid completion gate by itself.
 */
export function lessonEvidenceApplied(
  coreSkillId: string,
  payloads: readonly Record<string, unknown>[],
): boolean {
  if (!isSkillId(coreSkillId)) return false;
  const evidence = payloads
    .map((payload) => payload.canonicalEvidence)
    .filter((candidate): candidate is SkillEvidenceEvent =>
      isContract("skillEvidenceEvent", candidate),
    );
  return evaluateAppliedGate(coreSkillId, evidence).passed;
}

export interface LessonProgressDecision {
  readonly adaptive: LessonRuntimeAdaptiveState;
  readonly activeItemIds: readonly string[];
  readonly completedItemIds: readonly string[];
  readonly nextItemId: string | null;
  readonly remediationActive: boolean;
  readonly coreAnswered: boolean;
  readonly allActiveAnswered: boolean;
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeLessonRuntimeState(
  value: unknown,
): PersistedLessonRuntimeState {
  const candidate = object(value);
  const rawAdaptive = object(candidate.adaptive);
  const activatedFlexItemIds = Array.isArray(rawAdaptive.activatedFlexItemIds)
    ? rawAdaptive.activatedFlexItemIds.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const skippedItemIds = Array.isArray(rawAdaptive.skippedItemIds)
    ? rawAdaptive.skippedItemIds.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const adaptive =
    candidate.adaptive === undefined
      ? undefined
      : {
          remediationDepth:
            rawAdaptive.remediationDepth === 1 &&
            activatedFlexItemIds.length > 0
              ? 1
              : 0,
          activatedFlexItemIds: activatedFlexItemIds.slice(0, 2),
          skippedItemIds,
          ...(typeof rawAdaptive.triggerAfterItemId === "string"
            ? { triggerAfterItemId: rawAdaptive.triggerAfterItemId }
            : {}),
        };
  const rawDraft = object(candidate.draft);
  const draft =
    typeof rawDraft.itemId === "string" &&
    typeof rawDraft.answer === "string" &&
    typeof rawDraft.firstAnswer === "string" &&
    typeof rawDraft.updatedAt === "string"
      ? {
          itemId: rawDraft.itemId,
          answer: rawDraft.answer,
          firstAnswer: rawDraft.firstAnswer,
          ...(typeof rawDraft.responseId === "string"
            ? { responseId: rawDraft.responseId }
            : {}),
          attempts:
            typeof rawDraft.attempts === "number"
              ? Math.max(0, Math.min(10, Math.floor(rawDraft.attempts)))
              : 0,
          hintLevel:
            typeof rawDraft.hintLevel === "number"
              ? Math.max(0, Math.min(10, Math.floor(rawDraft.hintLevel)))
              : 0,
          revealed: rawDraft.revealed === true,
          updatedAt: rawDraft.updatedAt,
        }
      : undefined;
  const split = ["NONE", "SCHEDULED", "ACTIVE", "COMPLETED"].includes(
    String(candidate.split),
  )
    ? (candidate.split as PersistedLessonRuntimeState["split"])
    : "NONE";
  const refresher = ["NOT_REQUIRED", "REQUIRED", "COMPLETED"].includes(
    String(candidate.refresher),
  )
    ? (candidate.refresher as PersistedLessonRuntimeState["refresher"])
    : "NOT_REQUIRED";
  const interruptions = Array.isArray(candidate.interruptions)
    ? candidate.interruptions
        .map((entry) => object(entry))
        .filter(
          (entry) =>
            typeof entry.at === "string" &&
            Number.isFinite(Date.parse(entry.at)) &&
            ["BROWSER", "NETWORK", "TIMER", "USER_ABNORMAL"].includes(
              String(entry.kind),
            ),
        )
        .map((entry) => ({
          at: String(entry.at),
          kind: entry.kind as LessonInterruptionKind,
        }))
        .slice(-20)
    : [];
  const rawAutoSplit = object(candidate.autoSplit);
  const modules = Array.isArray(rawAutoSplit.modules)
    ? rawAutoSplit.modules
        .map((entry) => object(entry))
        .map((entry) => ({
          itemIds: Array.isArray(entry.itemIds)
            ? entry.itemIds.filter(
                (itemId): itemId is string => typeof itemId === "string",
              )
            : [],
          expectedMinutes:
            typeof entry.expectedMinutes === "number"
              ? Math.max(1, Math.min(25, Math.round(entry.expectedMinutes)))
              : 25,
        }))
        .filter((entry) => entry.itemIds.length > 0)
    : [];
  const autoSplit =
    typeof rawAutoSplit.triggeredAt === "string" && modules.length > 0
      ? {
          triggeredAt: rawAutoSplit.triggeredAt,
          maxSegmentSeconds: AUTO_SPLIT_MAX_SECONDS as 1500,
          modules,
          currentModuleIndex: Math.max(
            0,
            Math.min(
              modules.length - 1,
              typeof rawAutoSplit.currentModuleIndex === "number"
                ? Math.floor(rawAutoSplit.currentModuleIndex)
                : 0,
            ),
          ),
        }
      : undefined;
  const rawRefresherPlan = object(candidate.refresherPlan);
  const refresherKind = String(rawRefresherPlan.kind);
  const refresherPlan = [
    "RULE_CONTRAST",
    "SCAFFOLD_FADE",
    "TIMED_PARAGRAPH",
  ].includes(refresherKind)
    ? {
        kind: refresherKind as LessonRefresherPlan["kind"],
        durationMinutes:
          refresherKind === "RULE_CONTRAST"
            ? 10
            : refresherKind === "SCAFFOLD_FADE"
              ? 15
              : 20,
        ...(typeof rawRefresherPlan.sourceItemId === "string"
          ? { sourceItemId: rawRefresherPlan.sourceItemId }
          : {}),
      }
    : undefined;
  const normalized = {
    ...candidate,
    split,
    refresher,
    interruptions,
    ...(autoSplit ? { autoSplit } : {}),
    ...(refresherPlan ? { refresherPlan } : {}),
    ...(typeof candidate.segmentDurationSeconds === "number"
      ? {
          segmentDurationSeconds: Math.max(
            60,
            Math.min(3600, Math.floor(candidate.segmentDurationSeconds)),
          ),
        }
      : {}),
    ...(adaptive ? { adaptive } : {}),
    ...(draft ? { draft } : {}),
  };
  if (!adaptive) delete normalized.adaptive;
  if (!draft) delete normalized.draft;
  if (!autoSplit) delete normalized.autoSplit;
  if (!refresherPlan) delete normalized.refresherPlan;
  return normalized as PersistedLessonRuntimeState;
}

export function refresherPlanForItem(
  item: ExerciseItemRow | undefined,
): LessonRefresherPlan {
  if (!item) return { kind: "RULE_CONTRAST", durationMinutes: 10 };
  const canonical = object(item.evaluationContract.canonicalItem);
  const opportunity = String(canonical.evidenceOpportunity ?? "PRETEST");
  const paragraphLike = [
    "PARAGRAPH_WRITING",
    "MICRO_PARAGRAPH",
    "INTEGRATED_APPLICATION",
    "PARAGRAPH_SELF_CHECK",
    "SELF_CHECK",
  ].includes(item.itemType);
  if (
    paragraphLike ||
    ["INTEGRATED_APPLICATION", "SELF_CHECK", "EXIT_TEST"].includes(opportunity)
  ) {
    return {
      kind: "TIMED_PARAGRAPH",
      durationMinutes: 20,
      sourceItemId: item.id,
    };
  }
  if (opportunity === "INDEPENDENT_GENERATION") {
    return {
      kind: "SCAFFOLD_FADE",
      durationMinutes: 15,
      sourceItemId: item.id,
    };
  }
  return {
    kind: "RULE_CONTRAST",
    durationMinutes: 10,
    sourceItemId: item.id,
  };
}

export function buildAutoSplitModules(
  items: readonly ExerciseItemRow[],
  completedItemIds: readonly string[],
  skippedItemIds: readonly string[] = [],
): LessonAutoSplitModule[] {
  const completed = new Set(completedItemIds);
  const skipped = new Set(skippedItemIds);
  const remaining = items
    .filter((item) => runtimeItem(item).path === "CORE")
    .filter((item) => !completed.has(item.id) && !skipped.has(item.id))
    .sort((left, right) => left.ordinal - right.ordinal);
  const modules: Array<{ itemIds: string[]; expectedMinutes: number }> = [];
  for (const item of remaining) {
    const minutes = Math.max(1, Math.min(25, item.expectedMinutes));
    const current = modules.at(-1);
    if (!current || current.expectedMinutes + minutes > 25) {
      modules.push({ itemIds: [item.id], expectedMinutes: minutes });
    } else {
      current.itemIds.push(item.id);
      current.expectedMinutes += minutes;
    }
  }
  return modules;
}

export function recordAbnormalInterruption(input: {
  readonly plan: LessonPlanRow;
  readonly kind: LessonInterruptionKind;
  readonly modules: readonly LessonAutoSplitModule[];
  readonly now?: Date;
}): Partial<LessonPlanRow> {
  const now = input.now ?? new Date();
  const snapshot = lessonRuntimeSnapshot(input.plan, now);
  const previous = snapshot.state.interruptions ?? [];
  const interruptions = [
    ...previous.filter((entry) => {
      const age = now.getTime() - Date.parse(entry.at);
      return age >= 0 && age <= INTERRUPTION_WINDOW_MS;
    }),
    { at: now.toISOString(), kind: input.kind },
  ];
  const shouldSplit =
    interruptions.length >= 2 &&
    input.modules.length > 0 &&
    snapshot.state.autoSplit === undefined;
  return {
    ...pauseLessonRuntime(input.plan, now),
    runtimeState: {
      ...snapshot.state,
      interruptions,
      ...(shouldSplit
        ? {
            split: "SCHEDULED" as const,
            refresher: "NOT_REQUIRED" as const,
            segmentStartedElapsedSeconds: snapshot.effectiveElapsedSeconds,
            segmentDurationSeconds: AUTO_SPLIT_MAX_SECONDS,
            autoSplit: {
              triggeredAt: now.toISOString(),
              maxSegmentSeconds: AUTO_SPLIT_MAX_SECONDS as 1500,
              modules: input.modules.map((module) => ({
                itemIds: [...module.itemIds],
                expectedMinutes: module.expectedMinutes,
              })),
              currentModuleIndex: 0,
            },
          }
        : {}),
    },
  };
}

export function currentAutoSplitItemIds(
  state: PersistedLessonRuntimeState,
): readonly string[] | null {
  if (!state.autoSplit || state.split === "COMPLETED") return null;
  return (
    state.autoSplit.modules[state.autoSplit.currentModuleIndex]?.itemIds ?? null
  );
}

export function runtimeItem(item: ExerciseItemRow): RuntimeLessonItem {
  const contract = object(item.evaluationContract);
  const canonical = object(contract.canonicalItem);
  const rawPath = String(contract.path ?? "CORE");
  const path = ["CORE", "FLEX", "OPTIONAL"].includes(rawPath)
    ? (rawPath as RuntimeLessonItem["path"])
    : "CORE";
  const group = canonical.independentGroupId;
  return {
    id: item.id,
    ordinal: item.ordinal,
    path,
    evidenceOpportunity: String(canonical.evidenceOpportunity ?? "OTHER"),
    ...(typeof group === "string" ? { independentGroupId: group } : {}),
  };
}

export function lessonRuntimeSnapshot(
  plan: LessonPlanRow,
  now = new Date(),
): LessonRuntimeSnapshot {
  const state = normalizeLessonRuntimeState(plan.runtimeState);
  const effectiveElapsedSeconds = effectiveLessonElapsedSeconds({
    elapsedSeconds: plan.elapsedSeconds,
    activeStartedAt:
      plan.runtimeStatus === "ACTIVE" ? plan.activeStartedAt : null,
    now,
  });
  const segmentLimitSeconds = lessonSegmentLimitSeconds(state);
  return {
    status:
      plan.runtimeStatus === "ACTIVE" &&
      plan.activeStartedAt === null &&
      plan.pausedAt !== null
        ? "PAUSED"
        : plan.runtimeStatus,
    startedAt: plan.startedAt,
    effectiveElapsedSeconds,
    productiveSeconds: plan.productiveSeconds,
    segmentLimitSeconds,
    timeboxExpired:
      plan.runtimeStatus === "TIMEBOX_EXPIRED" ||
      effectiveElapsedSeconds >= segmentLimitSeconds,
    revision: plan.runtimeRevision,
    state,
  };
}

export function startLessonRuntime(
  plan: LessonPlanRow,
  now = new Date(),
): Partial<LessonPlanRow> {
  const snapshot = lessonRuntimeSnapshot(plan, now);
  if (
    (plan.runtimeStatus === "ACTIVE" && plan.activeStartedAt !== null) ||
    plan.runtimeStatus === "CORE_COMPLETED"
  )
    return {};
  if (
    plan.runtimeStatus === "TIMEBOX_EXPIRED" &&
    snapshot.state.split !== "SCHEDULED"
  )
    return {};
  const continuation =
    plan.runtimeStatus === "TIMEBOX_EXPIRED" ||
    snapshot.state.split === "SCHEDULED";
  return {
    runtimeStatus: "ACTIVE",
    startedAt: plan.startedAt ?? now,
    activeStartedAt: now,
    pausedAt: null,
    runtimeRevision: plan.runtimeRevision + 1,
    runtimeState: {
      ...snapshot.state,
      ...(continuation
        ? {
            split: "ACTIVE" as const,
            refresher: snapshot.state.refresher,
            segmentStartedElapsedSeconds: plan.elapsedSeconds,
          }
        : {}),
    },
  };
}

export function pauseLessonRuntime(
  plan: LessonPlanRow,
  now = new Date(),
): Partial<LessonPlanRow> {
  if (plan.runtimeStatus !== "ACTIVE") return {};
  const snapshot = lessonRuntimeSnapshot(plan, now);
  return {
    // ACTIVE is the canonical lesson lifecycle state; pausedAt and the absent
    // activeStartedAt persist the resumable sub-state without inventing a new
    // top-level contract status.
    runtimeStatus: "ACTIVE",
    elapsedSeconds: snapshot.effectiveElapsedSeconds,
    activeStartedAt: null,
    pausedAt: now,
    runtimeRevision: plan.runtimeRevision + 1,
  };
}

export function expireLessonRuntime(
  plan: LessonPlanRow,
  now = new Date(),
  refresherPlan?: LessonRefresherPlan,
): Partial<LessonPlanRow> {
  const state = normalizeLessonRuntimeState(plan.runtimeState);
  if (
    plan.runtimeStatus !== "ACTIVE" ||
    !lessonTimeboxExpired({
      elapsedSeconds: plan.elapsedSeconds,
      activeStartedAt: plan.activeStartedAt,
      now,
      state,
    })
  )
    return {};
  const limit = lessonSegmentLimitSeconds(state);
  return {
    runtimeStatus: "TIMEBOX_EXPIRED",
    elapsedSeconds: limit,
    activeStartedAt: null,
    timeboxExpiredAt: plan.timeboxExpiredAt ?? now,
    runtimeRevision: plan.runtimeRevision + 1,
    runtimeState: {
      ...state,
      split: "SCHEDULED",
      refresher: "REQUIRED",
      ...(refresherPlan ? { refresherPlan } : {}),
    },
  };
}

export function advanceAutoSplitModule(
  plan: LessonPlanRow,
  now = new Date(),
): Partial<LessonPlanRow> | null {
  const snapshot = lessonRuntimeSnapshot(plan, now);
  const autoSplit = snapshot.state.autoSplit;
  if (!autoSplit) return null;
  const nextIndex = autoSplit.currentModuleIndex + 1;
  if (nextIndex >= autoSplit.modules.length) return null;
  return {
    runtimeStatus: "ACTIVE",
    activeStartedAt: null,
    pausedAt: now,
    elapsedSeconds: snapshot.effectiveElapsedSeconds,
    runtimeRevision: plan.runtimeRevision + 1,
    runtimeState: {
      ...snapshot.state,
      split: "SCHEDULED",
      refresher: "NOT_REQUIRED",
      segmentStartedElapsedSeconds: snapshot.effectiveElapsedSeconds,
      segmentDurationSeconds: AUTO_SPLIT_MAX_SECONDS,
      autoSplit: { ...autoSplit, currentModuleIndex: nextIndex },
    },
  };
}

function latestEvaluation(
  attempt: AttemptWithEvaluations | undefined,
): EvaluationRow | undefined {
  return attempt?.evaluations
    .filter(
      (candidate) =>
        candidate.responseAttemptId === attempt.finalAttemptEventId,
    )
    .slice()
    .sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.id.localeCompare(a.id),
    )[0];
}

function isDemo(evaluation: EvaluationRow | undefined): boolean {
  return evaluation?.versionSnapshot.providerKind === "mock";
}

export function deriveLessonProgress(input: {
  readonly items: readonly ExerciseItemRow[];
  readonly attempts: readonly AttemptWithEvaluations[];
  readonly previous?: LessonRuntimeAdaptiveState;
  readonly unassessedAttemptIds?: readonly string[];
}): LessonProgressDecision {
  const items = input.items.map(runtimeItem);
  const attemptsByItem = new Map(
    input.attempts.map((attempt) => [attempt.exerciseItemId, attempt]),
  );
  const groupTotals = new Map<string, number>();
  const groupSubmitted = new Map<string, number>();
  const groupEvaluated = new Map<string, number>();
  for (const item of items) {
    if (!item.independentGroupId) continue;
    groupTotals.set(
      item.independentGroupId,
      (groupTotals.get(item.independentGroupId) ?? 0) + 1,
    );
    const attempt = attemptsByItem.get(item.id);
    if (attempt) {
      groupSubmitted.set(
        item.independentGroupId,
        (groupSubmitted.get(item.independentGroupId) ?? 0) + 1,
      );
      if (attempt.evaluations.length > 0)
        groupEvaluated.set(
          item.independentGroupId,
          (groupEvaluated.get(item.independentGroupId) ?? 0) + 1,
        );
    }
  }
  const releasedGroups = new Set(
    [...groupTotals.entries()]
      .filter(
        ([groupId, total]) => (groupEvaluated.get(groupId) ?? 0) === total,
      )
      .map(([groupId]) => groupId),
  );
  const evaluations: RuntimeEvaluation[] = input.attempts.flatMap((attempt) =>
    (() => {
      const item = items.find(
        (candidate) => candidate.id === attempt.exerciseItemId,
      );
      if (
        item?.independentGroupId &&
        !releasedGroups.has(item.independentGroupId)
      )
        return [];
      return attempt.evaluations.map((result) => ({
        itemId: attempt.exerciseItemId,
        passed: result.passed,
        firstAttemptPassed: result.feedback.firstAttemptPassed === "true",
        demoOnly: isDemo(result),
        neutral: result.feedback.outcome === "NEUTRAL",
        supplementRequired:
          result.feedback.outcome === "NEUTRAL" &&
          result.versionSnapshot.providerKind !== "deterministic",
        createdAt: result.createdAt,
      }));
    })(),
  );
  const decision = decideLessonAdaptivePath({
    items,
    evaluations,
    ...(input.previous ? { previous: input.previous } : {}),
  });
  const neutralItemIds = evaluations
    .filter((result) => result.supplementRequired && !result.demoOnly)
    .map((result) => result.itemId);
  const exhaustedItemIds = input.attempts
    .filter((attempt) => {
      const latest = latestEvaluation(attempt);
      return Boolean(
        (attempt.contractAttempts?.length ?? 0) >=
          MAX_EXERCISE_RESPONSE_VERSIONS &&
          latest &&
          !latest.passed &&
          !isDemo(latest) &&
          latest.feedback.outcome !== "NEUTRAL",
      );
    })
    .map((attempt) => attempt.exerciseItemId);
  const supportTriggerIds = [...neutralItemIds, ...exhaustedItemIds];
  const supplementalItems =
    supportTriggerIds.length > 0 &&
    decision.adaptive.activatedFlexItemIds.length === 0
      ? items
          .filter((item) => item.path === "FLEX")
          .slice(0, 2)
          .map((item) => item.id)
      : [];
  const adaptive =
    supplementalItems.length > 0
      ? {
          ...decision.adaptive,
          remediationDepth: 1,
          activatedFlexItemIds: supplementalItems,
          ...(supportTriggerIds.at(-1)
            ? { triggerAfterItemId: supportTriggerIds.at(-1)! }
            : {}),
        }
      : decision.adaptive;
  const activeItemIds =
    supplementalItems.length === 0
      ? decision.activeItemIds
      : (() => {
          const triggerId = supportTriggerIds.at(-1);
          const index = decision.activeItemIds.findIndex(
            (id) => id === triggerId,
          );
          const insertion =
            index < 0 ? decision.activeItemIds.length : index + 1;
          return [
            ...decision.activeItemIds.slice(0, insertion),
            ...supplementalItems,
            ...decision.activeItemIds.slice(insertion),
          ];
        })();
  const unassessedAttemptIds = new Set(input.unassessedAttemptIds ?? []);
  const satisfied = (itemId: string): boolean => {
    const attempt = attemptsByItem.get(itemId);
    if (!attempt) return false;
    const latest = latestEvaluation(attempt);
    if (latest !== undefined)
      return (
        latest.passed ||
        isDemo(latest) ||
        latest.feedback.outcome === "NEUTRAL" ||
        ((attempt.contractAttempts?.length ?? 0) >=
          MAX_EXERCISE_RESPONSE_VERSIONS &&
          latest.feedback.outcome !== "NEUTRAL")
      );
    if (unassessedAttemptIds.has(attempt.id)) return true;
    const item = items.find((candidate) => candidate.id === itemId);
    const groupId = item?.independentGroupId;
    // The first blind-group answer is sealed and may advance to the next
    // prompt. Once the group is full, queued evaluation must finish before
    // the cursor can move again. Unconfigured jobs are handled above.
    return Boolean(
      groupId &&
        (groupSubmitted.get(groupId) ?? 0) < (groupTotals.get(groupId) ?? 0),
    );
  };
  const completedItemIds = activeItemIds.filter(satisfied);
  const flexPending = adaptive.activatedFlexItemIds.find(
    (id) => !satisfied(id),
  );
  const firstIncomplete = activeItemIds.find((id) => !satisfied(id));
  const nextItemId = flexPending ?? firstIncomplete ?? null;
  const coreIds = items
    .filter(
      (item) =>
        item.path === "CORE" && !adaptive.skippedItemIds.includes(item.id),
    )
    .map((item) => item.id);
  return {
    adaptive,
    activeItemIds,
    completedItemIds,
    nextItemId,
    remediationActive:
      decision.remediationActive || supplementalItems.length > 0,
    coreAnswered: coreIds.every((id) => attemptsByItem.has(id)),
    allActiveAnswered: activeItemIds.every((id) => attemptsByItem.has(id)),
  };
}
