export const LESSON_SESSION_LIMIT_SECONDS = 60 * 60;
export const MAX_REMEDIATION_DEPTH = 1;
export const MAX_REMEDIATION_ITEMS = 2;

export interface LessonRuntimeAdaptiveState {
  readonly remediationDepth: number;
  readonly activatedFlexItemIds: string[];
  readonly skippedItemIds: string[];
  readonly triggerAfterItemId?: string;
}

export interface LessonRuntimeState {
  readonly adaptive?: LessonRuntimeAdaptiveState;
  readonly segmentStartedElapsedSeconds?: number;
  /** A split continuation is capped independently from the 60-minute lesson. */
  readonly segmentDurationSeconds?: number;
  readonly split?: "NONE" | "SCHEDULED" | "ACTIVE" | "COMPLETED";
  readonly refresher?: "NOT_REQUIRED" | "REQUIRED" | "COMPLETED";
  readonly [key: string]: unknown;
}

export interface RuntimeLessonItem {
  readonly id: string;
  readonly ordinal: number;
  readonly path: "CORE" | "FLEX" | "OPTIONAL";
  readonly evidenceOpportunity: string;
  readonly independentGroupId?: string;
}

export interface RuntimeEvaluation {
  readonly itemId: string;
  readonly passed: boolean;
  readonly firstAttemptPassed: boolean;
  readonly demoOnly: boolean;
  readonly neutral?: boolean;
  readonly supplementRequired?: boolean;
  readonly createdAt: Date;
}

export interface RuntimeResponse {
  readonly itemId: string;
  readonly hasEvaluation: boolean;
  readonly latestPassed: boolean | null;
  readonly demoOnly: boolean;
}

export interface LessonAdaptiveDecision {
  readonly adaptive: LessonRuntimeAdaptiveState;
  readonly activeItemIds: readonly string[];
  readonly remediationActive: boolean;
}

function byOrdinal(a: RuntimeLessonItem, b: RuntimeLessonItem): number {
  return a.ordinal - b.ordinal || a.id.localeCompare(b.id);
}

function distinct<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/**
 * Branching is deterministic and bounded. Two consecutive genuine evaluator
 * failures activate exactly one remedial layer containing at most two FLEX
 * items. Mock output is never allowed to choose a learner's branch.
 *
 * Two independent first-attempt successes may remove redundant OTHER items,
 * but every declared evidence opportunity remains on the active path.
 */
export function decideLessonAdaptivePath(input: {
  readonly items: readonly RuntimeLessonItem[];
  readonly evaluations: readonly RuntimeEvaluation[];
  readonly previous?: LessonRuntimeAdaptiveState;
}): LessonAdaptiveDecision {
  const core = input.items
    .filter((item) => item.path === "CORE")
    .sort(byOrdinal);
  const flex = input.items
    .filter((item) => item.path === "FLEX")
    .sort(byOrdinal);
  const genuine = input.evaluations
    .filter((evaluation) => !evaluation.demoOnly && !evaluation.neutral)
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.itemId.localeCompare(b.itemId),
    );
  const previous = input.previous ?? {
    remediationDepth: 0,
    activatedFlexItemIds: [],
    skippedItemIds: [],
  };
  const previousActivated = previous.activatedFlexItemIds
    .filter((id) => flex.some((item) => item.id === id))
    .slice(0, MAX_REMEDIATION_ITEMS);
  const previousSkipped = previous.skippedItemIds.filter((id) =>
    core.some((item) => item.id === id && item.evidenceOpportunity === "OTHER"),
  );
  const lastTwo = genuine.slice(-2);
  const shouldActivate =
    previous.remediationDepth === 0 &&
    lastTwo.length === 2 &&
    new Set(lastTwo.map((evaluation) => evaluation.itemId)).size === 2 &&
    lastTwo.every((evaluation) => !evaluation.passed);
  const activatedFlexItemIds = shouldActivate
    ? flex.slice(0, MAX_REMEDIATION_ITEMS).map((item) => item.id)
    : previousActivated;
  const lastTwoIndependent = genuine
    .filter((evaluation) =>
      input.items.some(
        (item) =>
          item.id === evaluation.itemId &&
          item.evidenceOpportunity === "INDEPENDENT_GENERATION",
      ),
    )
    .slice(-2);
  const consecutiveIndependentSuccesses =
    lastTwoIndependent.length === 2 &&
    new Set(lastTwoIndependent.map((evaluation) => evaluation.itemId)).size ===
      2 &&
    lastTwoIndependent.every(
      (evaluation) => evaluation.passed && evaluation.firstAttemptPassed,
    );
  const newlySkipped = consecutiveIndependentSuccesses
    ? core
        .filter((item) => item.evidenceOpportunity === "OTHER")
        .map((item) => item.id)
    : [];
  const skippedItemIds = distinct([...previousSkipped, ...newlySkipped]);
  const triggerAfterItemId =
    previous.triggerAfterItemId ??
    (shouldActivate ? lastTwo.at(-1)?.itemId : undefined);
  const adaptive: LessonRuntimeAdaptiveState = {
    remediationDepth:
      activatedFlexItemIds.length > 0 ? MAX_REMEDIATION_DEPTH : 0,
    activatedFlexItemIds,
    skippedItemIds,
    ...(triggerAfterItemId ? { triggerAfterItemId } : {}),
  };
  const activeCore = core.filter((item) => !skippedItemIds.includes(item.id));
  const remedial = flex.filter((item) =>
    activatedFlexItemIds.includes(item.id),
  );
  if (remedial.length === 0) {
    return {
      adaptive,
      activeItemIds: activeCore.map((item) => item.id),
      remediationActive: false,
    };
  }
  const triggerIndex = activeCore.findIndex(
    (item) => item.id === triggerAfterItemId,
  );
  const insertionIndex =
    triggerIndex < 0 ? activeCore.length : triggerIndex + 1;
  return {
    adaptive,
    activeItemIds: [
      ...activeCore.slice(0, insertionIndex).map((item) => item.id),
      ...remedial.map((item) => item.id),
      ...activeCore.slice(insertionIndex).map((item) => item.id),
    ],
    remediationActive: true,
  };
}

export function effectiveLessonElapsedSeconds(input: {
  readonly elapsedSeconds: number;
  readonly activeStartedAt: Date | null;
  readonly now: Date;
}): number {
  const activeSeconds = input.activeStartedAt
    ? Math.max(
        0,
        Math.floor(
          (input.now.getTime() - input.activeStartedAt.getTime()) / 1_000,
        ),
      )
    : 0;
  return Math.max(0, input.elapsedSeconds) + activeSeconds;
}

export function lessonSegmentLimitSeconds(state: LessonRuntimeState): number {
  const duration = Math.max(
    60,
    Math.min(
      LESSON_SESSION_LIMIT_SECONDS,
      state.segmentDurationSeconds ?? LESSON_SESSION_LIMIT_SECONDS,
    ),
  );
  return Math.max(0, state.segmentStartedElapsedSeconds ?? 0) + duration;
}

export function lessonTimeboxExpired(input: {
  readonly elapsedSeconds: number;
  readonly activeStartedAt: Date | null;
  readonly now: Date;
  readonly state: LessonRuntimeState;
}): boolean {
  return (
    effectiveLessonElapsedSeconds(input) >=
    lessonSegmentLimitSeconds(input.state)
  );
}

/** Each retry reports cumulative item time, so only the positive delta counts. */
export function productiveSecondsDelta(
  reportedSeconds: number,
  priorReportedSeconds: readonly number[],
): number {
  const priorMaximum = Math.max(0, ...priorReportedSeconds);
  const bounded = Math.max(
    0,
    Math.min(LESSON_SESSION_LIMIT_SECONDS, reportedSeconds),
  );
  // A lower counter means the browser/item timer restarted after reload; that
  // segment is new productive time rather than a negative retry delta.
  return bounded >= priorMaximum ? bounded - priorMaximum : bounded;
}
