import { describe, expect, it } from "vitest";

import { learningRouteHref, singleRouteParam } from "./learning-route";

describe("learning route identity", () => {
  it("encodes cycle and resource ids into a stable reloadable URL", () => {
    expect(
      learningRouteHref("/rewrite", {
        cycleId: "cycle/with spaces",
        taskId: "task?with=query",
      }),
    ).toBe("/rewrite?cycle=cycle%2Fwith+spaces&task=task%3Fwith%3Dquery");
  });

  it("rejects missing, empty, and ambiguous route identities", () => {
    expect(singleRouteParam({}, "cycle")).toBeNull();
    expect(singleRouteParam({ cycle: "  " }, "cycle")).toBeNull();
    expect(singleRouteParam({ cycle: ["one", "two"] }, "cycle")).toBeNull();
    expect(singleRouteParam({ cycle: " cycle-one " }, "cycle")).toBe(
      "cycle-one",
    );
  });
});
