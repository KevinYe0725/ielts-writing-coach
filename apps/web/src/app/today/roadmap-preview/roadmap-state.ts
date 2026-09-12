export type RoadmapStateName = "done" | "current" | "upcoming";

export interface RoadmapStep {
  readonly id: string;
  readonly state: RoadmapStateName;
}

export interface RoadmapState {
  readonly currentId: string;
  readonly selectedId: string;
  readonly knownIds: readonly string[];
}

export type RoadmapAction =
  | { readonly type: "select"; readonly id: string }
  | { readonly type: "resume" };

export function createRoadmapState(
  steps: readonly RoadmapStep[],
): RoadmapState {
  const current = steps.find((step) => step.state === "current") ?? steps[0];
  if (!current) throw new Error("A course roadmap needs at least one step.");
  return {
    currentId: current.id,
    selectedId: current.id,
    knownIds: steps.map((step) => step.id),
  };
}

export function roadmapReducer(
  state: RoadmapState,
  action: RoadmapAction,
  steps: readonly RoadmapStep[] = [],
): RoadmapState {
  if (action.type === "resume")
    return { ...state, selectedId: state.currentId };
  const knownIds =
    steps.length > 0 ? steps.map((step) => step.id) : state.knownIds;
  if (!knownIds.includes(action.id)) {
    return state;
  }
  return { ...state, selectedId: action.id };
}
