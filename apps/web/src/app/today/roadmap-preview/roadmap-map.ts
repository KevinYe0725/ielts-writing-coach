export type RoadmapNodeKind = "lesson" | "practice" | "branch" | "milestone";
export type RoadmapNodeState = "completed" | "current" | "available" | "locked";

export interface RoadmapMapNode {
  readonly id: string;
  readonly kind: RoadmapNodeKind;
  readonly state: RoadmapNodeState;
  readonly unitId: string;
}

export interface RoadmapUnit {
  readonly id: string;
  readonly titleZh: string;
  readonly titleEn: string;
  readonly nodes: readonly Omit<RoadmapMapNode, "unitId">[];
}

export interface RoadmapProgress {
  readonly completed: number;
  readonly currentId: string;
  readonly currentUnitId: string;
  readonly total: number;
}

export function flattenRoadmapUnits(
  units: readonly RoadmapUnit[],
): readonly RoadmapMapNode[] {
  return units.flatMap((unit) =>
    unit.nodes.map((node) => ({ ...node, unitId: unit.id })),
  );
}

export function roadmapProgress(
  units: readonly RoadmapUnit[],
): RoadmapProgress {
  const nodes = flattenRoadmapUnits(units);
  const current = nodes.find((node) => node.state === "current") ?? nodes[0];
  if (!current) throw new Error("A course map needs at least one node.");
  return {
    completed: nodes.filter((node) => node.state === "completed").length,
    currentId: current.id,
    currentUnitId: current.unitId,
    total: nodes.length,
  };
}
