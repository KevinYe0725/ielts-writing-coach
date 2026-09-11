import { describe, expect, it } from "vitest";

import { buildLearningDestinations } from "./learning-navigation";
import { workspaceDestinations } from "./workspace-navigation";

const cachedA = buildLearningDestinations({
  cycleId: "A",
  writingAvailable: true,
  feedbackAvailable: true,
  lessonId: "lesson-A",
  rewriteTaskId: "rewrite-A",
  comparisonAvailable: true,
  transferTaskId: "transfer-A",
});

describe("workspace destinations", () => {
  it("never offers another essay's cached resources from a current essay", () => {
    const links = workspaceDestinations("/feedback?cycle=B", cachedA);
    expect(links.feedback).toBe("/feedback?cycle=B");
    expect(links.write).toBeNull();
    expect(links.lesson).toBeNull();
    expect(links.rewrite).toBeNull();
    expect(links.compare).toBeNull();
    expect(links.transfer).toBeNull();
  });

  it.each([
    ["write", "/write?cycle=B&draft=two"],
    ["feedback", "/feedback?cycle=B&lesson=lesson-B&issue=4"],
    ["lesson", "/lesson/paper?cycle=B&lesson=lesson-B&attempt=2"],
    ["rewrite", "/rewrite?cycle=B&task=rewrite-B&resume=1"],
    ["compare", "/compare?cycle=B&view=details"],
    ["transfer", "/transfer?cycle=B&task=transfer-B"],
  ] as const)("keeps the complete current %s URL", (key, href) => {
    expect(workspaceDestinations(href, cachedA)[key]).toBe(href);
  });

  it("preserves known destinations for the current cycle", () => {
    const links = workspaceDestinations("/feedback?cycle=A&issue=2", cachedA);
    expect(links.lesson).toBe("/lesson?cycle=A&lesson=lesson-A");
    expect(links.rewrite).toBe("/rewrite?cycle=A&task=rewrite-A");
    expect(links.compare).toBe("/compare?cycle=A");
    expect(links.transfer).toBe("/transfer?cycle=A&task=transfer-A");
  });

  it("keeps Today, Essays, Growth and Settings reachable without resources", () => {
    const links = workspaceDestinations("/today", null);
    expect(links.today).toBe("/today");
    expect(links.essays).toBe("/essays");
    expect(links.growth).toBe("/growth");
    expect(links.settings).toBe("/settings");
    expect(links.feedback).toBeNull();
    expect(links.lesson).toBeNull();
    expect(links.rewrite).toBeNull();
  });

  it("does not invent lesson or task IDs from the current cycle", () => {
    const links = workspaceDestinations("/feedback?cycle=B", {
      ...cachedA,
      lesson: "/lesson?cycle=B",
      rewrite: "/rewrite?cycle=B",
      transfer: "/transfer?cycle=B",
    });
    expect(links.lesson).toBeNull();
    expect(links.rewrite).toBeNull();
    expect(links.transfer).toBeNull();
  });

  it("rejects malformed, external, and mismatched cached routes", () => {
    const links = workspaceDestinations("/feedback?cycle=A", {
      ...cachedA,
      today: "https://example.com",
      write: "//example.com/write?cycle=A",
      lesson: "/lesson?cycle=B&lesson=lesson-B",
      rewrite: "/feedback?cycle=A&task=task-A",
      compare: 12 as unknown as string,
      settings: "/settings?private=1",
    });
    expect(links.today).toBe("/today");
    expect(links.settings).toBe("/settings");
    expect(links.write).toBeNull();
    expect(links.lesson).toBeNull();
    expect(links.rewrite).toBeNull();
    expect(links.compare).toBeNull();
  });

  it("keeps a consistent recent essay available from a global page", () => {
    const links = workspaceDestinations("/today", {
      ...cachedA,
      rewrite: "/rewrite?cycle=B&task=rewrite-B",
    });
    expect(links.feedback).toBe("/feedback?cycle=A");
    expect(links.lesson).toBe("/lesson?cycle=A&lesson=lesson-A");
    expect(links.rewrite).toBeNull();
  });

  it("does not leak cached links before a resource URL has an identity", () => {
    const links = workspaceDestinations("/feedback", cachedA);
    expect(links.feedback).toBe("/feedback");
    expect(links.lesson).toBeNull();
    expect(links.rewrite).toBeNull();
  });

  it.each(["/today", "/essays", "/growth", "/settings"])(
    "identifies the essay used by cached navigation on %s",
    (href) => {
      const links = workspaceDestinations(href, cachedA);
      expect(links.cycleId).toBe("A");
      expect(links.feedback).toBe("/feedback?cycle=A");
    },
  );

  it("identifies the current URL cycle instead of a different cached cycle", () => {
    expect(workspaceDestinations("/feedback?cycle=B", cachedA).cycleId).toBe(
      "B",
    );
    expect(workspaceDestinations("/growth", null).cycleId).toBeNull();
  });

  it("skips an invalid cached pathname when choosing a global-page essay", () => {
    const links = workspaceDestinations("/growth", {
      ...cachedA,
      write: "/settings?cycle=B",
    });
    expect(links.feedback).toBe("/feedback?cycle=A");
    expect(links.lesson).toBe("/lesson?cycle=A&lesson=lesson-A");
    expect(links.cycleId).toBe("A");
    expect(links.write).toBeNull();
  });

  it("skips a missing resource ID when choosing a global-page essay", () => {
    const links = workspaceDestinations("/settings", {
      ...cachedA,
      write: null,
      feedback: null,
      lesson: "/lesson?cycle=B",
    });
    expect(links.rewrite).toBe("/rewrite?cycle=A&task=rewrite-A");
    expect(links.cycleId).toBe("A");
    expect(links.lesson).toBeNull();
  });
});
