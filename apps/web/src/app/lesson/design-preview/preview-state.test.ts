import { describe, expect, it } from "vitest";
import { createPreviewState, previewReducer } from "./preview-state";

describe("teaching design preview state", () => {
  it("preserves the draft and comparison while switching designs", () => {
    let state = createPreviewState("workbench");
    state = previewReducer(state, { type: "draft", value: "My own sentence." });
    state = previewReducer(state, { type: "compare" });
    state = previewReducer(state, { type: "view", value: "focus" });
    expect(state.draft).toBe("My own sentence.");
    expect(state.comparisonOpen).toBe(true);
    expect(state.view).toBe("focus");
  });

  it("allows jumping to writing and back without completing an exercise", () => {
    let state = previewReducer(createPreviewState("focus"), {
      type: "step",
      value: "try",
    });
    expect(state.step).toBe("try");
    expect(state.draft).toBe("");
    state = previewReducer(state, { type: "step", value: "notice" });
    expect(state.step).toBe("notice");
  });

  it("never presents authored sample feedback as a judgment of an edited answer", () => {
    let state = previewReducer(createPreviewState("workbench"), {
      type: "sample",
    });
    state = previewReducer(state, { type: "compare" });
    expect(state.sampleAnswer).toBe(true);
    expect(state.draft).toBe(
      "Flexible schedules improve productivity because they are beneficial to employees.",
    );
    state = previewReducer(state, {
      type: "draft",
      value: "I chose another explanation.",
    });
    expect(state.sampleAnswer).toBe(false);
    expect(state.comparisonOpen).toBe(false);
    state = previewReducer(state, { type: "compare" });
    expect(state.sampleAnswer).toBe(false);
  });

  it("keeps exploration separate from the learner draft", () => {
    let state = previewReducer(createPreviewState("workbench"), {
      type: "draft",
      value: "My draft.",
    });
    state = previewReducer(state, { type: "example", value: "expanded" });
    state = previewReducer(state, { type: "lens", value: "limits" });
    expect(state.draft).toBe("My draft.");
    expect(state.example).toBe("expanded");
    expect(state.lens).toBe("limits");
    state = previewReducer(state, { type: "lens", value: "limits" });
    expect(state.lens).toBeNull();
  });
});
