import { describe, expect, it } from "vitest";
import {
  createRoadmapState,
  roadmapReducer,
  type RoadmapStep,
} from "./roadmap-state";

const steps: readonly RoadmapStep[] = [
  { id: "first", state: "done" },
  { id: "feedback", state: "done" },
  { id: "lesson", state: "done" },
  { id: "rewrite", state: "current" },
  { id: "transfer", state: "upcoming" },
];

describe("course roadmap interaction", () => {
  it("opens on the current task and preserves a single selected node", () => {
    const state = createRoadmapState(steps);
    expect(state.currentId).toBe("rewrite");
    expect(state.selectedId).toBe("rewrite");
  });

  it("lets learners inspect any stage without changing the current task", () => {
    const state = roadmapReducer(createRoadmapState(steps), {
      type: "select",
      id: "feedback",
    });
    expect(state.selectedId).toBe("feedback");
    expect(state.currentId).toBe("rewrite");
  });

  it("ignores unknown nodes and can return to the current task", () => {
    const initial = createRoadmapState(steps);
    const unchanged = roadmapReducer(initial, {
      type: "select",
      id: "missing",
    });
    expect(unchanged).toBe(initial);
    const resumed = roadmapReducer(
      roadmapReducer(initial, { type: "select", id: "transfer" }),
      { type: "resume" },
    );
    expect(resumed.selectedId).toBe("rewrite");
  });

  it("falls back to the first stage when no step is current", () => {
    expect(createRoadmapState(steps.slice(0, 3)).currentId).toBe("first");
  });
});
