import { describe, expect, it } from "vitest";

import { afterQuietHours, withinQuietHours } from "./notifications";

describe("notification quiet hours", () => {
  it("handles quiet hours that cross midnight in the user's timezone", () => {
    const quiet = { start: "22:00", end: "07:00" };
    expect(
      withinQuietHours(
        new Date("2026-08-13T15:00:00.000Z"),
        "Asia/Shanghai",
        quiet,
      ),
    ).toBe(true);
    expect(
      withinQuietHours(
        new Date("2026-08-13T05:00:00.000Z"),
        "Asia/Shanghai",
        quiet,
      ),
    ).toBe(false);
  });

  it("moves delivery to the first permitted minute", () => {
    const result = afterQuietHours(
      new Date("2026-08-13T15:00:00.000Z"),
      "Asia/Shanghai",
      { start: "22:00", end: "07:00" },
    );
    expect(result.toISOString()).toBe("2026-08-13T23:00:00.000Z");
  });
});
