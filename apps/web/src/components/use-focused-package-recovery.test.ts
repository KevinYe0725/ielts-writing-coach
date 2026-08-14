import { describe, expect, it, vi } from "vitest";

import { LearningClientError } from "@/lib/client";

import {
  isFocusedPackageRecoveryRequired,
  runFocusedPackageRecovery,
} from "./use-focused-package-recovery";

describe("focused package recovery", () => {
  it.each([
    "FOCUSED_TEACHING_REPLACEMENT_REQUIRED",
    "PRACTICE_PAPER_REPLACEMENT_REQUIRED",
  ])("recognises %s as a recoverable earlier training", (code) => {
    expect(
      isFocusedPackageRecoveryRequired(
        new LearningClientError("not ready", { code, status: 409 }),
      ),
    ).toBe(true);
  });

  it("does not start recovery for an unrelated problem", () => {
    expect(
      isFocusedPackageRecoveryRequired(
        new LearningClientError("not found", {
          code: "LEARNING_ROUTE_IDENTITY_REQUIRED",
          status: 400,
        }),
      ),
    ).toBe(false);
  });

  it("starts recovery automatically and refreshes when the package is ready", async () => {
    const replace = vi.fn(async () => ({
      state: "READY" as const,
      jobId: null,
    }));
    const refresh = vi.fn();

    await expect(
      runFocusedPackageRecovery({
        lessonId: "lesson-legacy",
        replace,
        refresh,
      }),
    ).resolves.toBe("PREPARING");

    expect(replace).toHaveBeenCalledWith("lesson-legacy");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the learner in a safe continuation when preparation cannot start", async () => {
    const replace = vi.fn(async () => {
      throw new Error("provider is unavailable");
    });

    await expect(
      runFocusedPackageRecovery({
        lessonId: "lesson-legacy",
        replace,
        refresh: vi.fn(),
      }),
    ).resolves.toBe("CONTINUING_SAFELY");
  });
});
