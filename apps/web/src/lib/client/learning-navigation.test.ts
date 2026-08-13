import { describe, expect, it } from "vitest";

import { buildLearningDestinations } from "./learning-navigation";

describe("learning navigation destinations", () => {
  it("keeps report and paper links attached to the active cycle", () => {
    const destinations = buildLearningDestinations({
      cycleId: "cycle-one",
      writingAvailable: true,
      feedbackAvailable: true,
      lessonId: "lesson-one",
      rewriteTaskId: "rewrite-one",
      comparisonAvailable: true,
      transferTaskId: "transfer-one",
    });

    expect(destinations.write).toBe("/write?cycle=cycle-one");
    expect(destinations.feedback).toBe("/feedback?cycle=cycle-one");
    expect(destinations.lesson).toBe(
      "/lesson?cycle=cycle-one&lesson=lesson-one",
    );
    expect(destinations.rewrite).toBe(
      "/rewrite?cycle=cycle-one&task=rewrite-one",
    );
    expect(destinations.compare).toBe("/compare?cycle=cycle-one");
    expect(destinations.transfer).toBe(
      "/transfer?cycle=cycle-one&task=transfer-one",
    );
  });

  it("leaves stages unavailable when their learning record does not exist", () => {
    const destinations = buildLearningDestinations({
      cycleId: "cycle-one",
      writingAvailable: true,
      feedbackAvailable: false,
      lessonId: null,
      rewriteTaskId: null,
      comparisonAvailable: false,
      transferTaskId: null,
    });

    expect(destinations.write).toBe("/write?cycle=cycle-one");
    expect(destinations.feedback).toBeNull();
    expect(destinations.lesson).toBeNull();
    expect(destinations.rewrite).toBeNull();
    expect(destinations.compare).toBeNull();
    expect(destinations.transfer).toBeNull();
    expect(destinations.growth).toBe("/growth");
  });
});
