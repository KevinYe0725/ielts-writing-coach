import { learningRouteHref } from "./learning-route";

export interface LearningNavigationResources {
  cycleId: string | null;
  writingAvailable: boolean;
  feedbackAvailable: boolean;
  lessonId: string | null;
  rewriteTaskId: string | null;
  comparisonAvailable: boolean;
  transferTaskId: string | null;
}

export interface LearningDestinations {
  today: string;
  write: string | null;
  feedback: string | null;
  lesson: string | null;
  rewrite: string | null;
  compare: string | null;
  growth: string;
  transfer: string | null;
  settings: string;
}

export function buildLearningDestinations(
  resources: LearningNavigationResources,
): LearningDestinations {
  const cycleId = resources.cycleId;
  return {
    today: "/today",
    write:
      cycleId && resources.writingAvailable
        ? learningRouteHref("/write", { cycleId })
        : null,
    feedback:
      cycleId && resources.feedbackAvailable
        ? learningRouteHref("/feedback", { cycleId })
        : null,
    lesson:
      cycleId && resources.lessonId
        ? learningRouteHref("/lesson", {
            cycleId,
            lessonId: resources.lessonId,
          })
        : null,
    rewrite:
      cycleId && resources.rewriteTaskId
        ? learningRouteHref("/rewrite", {
            cycleId,
            taskId: resources.rewriteTaskId,
          })
        : null,
    compare:
      cycleId && resources.comparisonAvailable
        ? learningRouteHref("/compare", { cycleId })
        : null,
    growth: "/growth",
    transfer:
      cycleId && resources.transferTaskId
        ? learningRouteHref("/transfer", {
            cycleId,
            taskId: resources.transferTaskId,
          })
        : null,
    settings: "/settings",
  };
}

const NAVIGATION_STORAGE_KEY = "iwc:learning-navigation:v1";

export function readLearningDestinations(): LearningDestinations {
  if (typeof window === "undefined")
    return buildLearningDestinations({
      cycleId: null,
      writingAvailable: false,
      feedbackAvailable: false,
      lessonId: null,
      rewriteTaskId: null,
      comparisonAvailable: false,
      transferTaskId: null,
    });
  try {
    const value: unknown = JSON.parse(
      window.sessionStorage.getItem(NAVIGATION_STORAGE_KEY) ?? "null",
    );
    if (!value || typeof value !== "object") throw new Error("missing");
    return {
      ...buildLearningDestinations({
        cycleId: null,
        writingAvailable: false,
        feedbackAvailable: false,
        lessonId: null,
        rewriteTaskId: null,
        comparisonAvailable: false,
        transferTaskId: null,
      }),
      ...(value as Partial<LearningDestinations>),
    };
  } catch {
    return buildLearningDestinations({
      cycleId: null,
      writingAvailable: false,
      feedbackAvailable: false,
      lessonId: null,
      rewriteTaskId: null,
      comparisonAvailable: false,
      transferTaskId: null,
    });
  }
}

export function saveLearningDestinations(
  destinations: LearningDestinations,
): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    NAVIGATION_STORAGE_KEY,
    JSON.stringify(destinations),
  );
  window.dispatchEvent(new Event("iwc:learning-navigation"));
}

export function mergeLearningDestinations(
  update: Partial<LearningDestinations>,
): LearningDestinations {
  const next = { ...readLearningDestinations(), ...update };
  saveLearningDestinations(next);
  return next;
}
