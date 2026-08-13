import { describe, expect, it } from "vitest";

import { recordedExerciseDurationSeconds } from "./growth-metrics";

describe("growth duration metrics", () => {
  it("counts the latest elapsed snapshot once across response revisions", () => {
    expect(
      recordedExerciseDurationSeconds([
        {
          contractAttempts: [
            { elapsedSeconds: 30 },
            { elapsedSeconds: 45 },
            { elapsedSeconds: 45 },
          ],
        },
        { contractAttempts: [{ elapsedSeconds: 20 }] },
      ]),
    ).toBe(65);
  });

  it("never subtracts time for a malformed negative snapshot", () => {
    expect(
      recordedExerciseDurationSeconds([
        { contractAttempts: [] },
        { contractAttempts: [{ elapsedSeconds: -10 }] },
      ]),
    ).toBe(0);
  });
});
