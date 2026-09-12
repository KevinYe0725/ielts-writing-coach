import { describe, expect, it } from "vitest";
import {
  flattenRoadmapUnits,
  roadmapProgress,
  type RoadmapUnit,
} from "./roadmap-map";

const units: readonly RoadmapUnit[] = [
  {
    id: "unit-one",
    titleZh: "看懂一条论证",
    titleEn: "Read an argument",
    nodes: [
      { id: "write", kind: "lesson", state: "completed" },
      { id: "practice", kind: "practice", state: "completed" },
      { id: "checkpoint", kind: "milestone", state: "completed" },
    ],
  },
  {
    id: "unit-two",
    titleZh: "把方法写成句子",
    titleEn: "Build the sentence",
    nodes: [
      { id: "mechanism", kind: "lesson", state: "current" },
      { id: "branch-grammar", kind: "branch", state: "available" },
      { id: "challenge", kind: "milestone", state: "locked" },
    ],
  },
];

describe("Duolingo-style course map model", () => {
  it("preserves unit and node order while exposing unit ownership", () => {
    expect(
      flattenRoadmapUnits(units).map((node) => [node.unitId, node.id]),
    ).toEqual([
      ["unit-one", "write"],
      ["unit-one", "practice"],
      ["unit-one", "checkpoint"],
      ["unit-two", "mechanism"],
      ["unit-two", "branch-grammar"],
      ["unit-two", "challenge"],
    ]);
  });

  it("calculates progress from completed nodes and identifies the current unit", () => {
    expect(roadmapProgress(units)).toEqual({
      completed: 3,
      currentId: "mechanism",
      currentUnitId: "unit-two",
      total: 6,
    });
  });

  it("keeps locked nodes visible for preview without treating them as completed", () => {
    const nodes = flattenRoadmapUnits(units);
    expect(nodes.find((node) => node.id === "challenge")).toMatchObject({
      state: "locked",
      unitId: "unit-two",
    });
    expect(roadmapProgress(units).completed).toBe(3);
  });
});
