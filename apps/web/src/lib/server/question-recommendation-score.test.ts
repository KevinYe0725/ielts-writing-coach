import { describe, expect, it } from "vitest";

import {
  exposureCutoff,
  rankQuestionCandidates,
  selectTopBucket,
} from "./question-recommendation-score";

const candidate = (
  id: string,
  type: "discussion" | "opinion" = "discussion",
  topic: "health" | "education" = "health",
) => ({
  id,
  type,
  topic,
});

describe("question recommendation scoring", () => {
  it("gives an unseen type and topic the full score", () => {
    expect(
      rankQuestionCandidates({
        candidates: [candidate("q1")],
        priorCycles: [],
        recentCycles: [],
      })[0]?.score,
    ).toBe(100);
  });

  it("reduces type and topic coverage independently", () => {
    const ranked = rankQuestionCandidates({
      candidates: [candidate("q1")],
      priorCycles: [candidate("old-type", "discussion", "education")],
      recentCycles: [],
    });
    expect(ranked[0]?.score).toBe(80);

    const topicOnly = rankQuestionCandidates({
      candidates: [candidate("q1")],
      priorCycles: [candidate("old-topic", "opinion", "health")],
      recentCycles: [],
    });
    expect(topicOnly[0]?.score).toBe(82.5);
  });

  it("removes recent type and topic diversity points", () => {
    const ranked = rankQuestionCandidates({
      candidates: [candidate("q1")],
      priorCycles: [],
      recentCycles: [candidate("recent", "discussion", "health")],
    });
    expect(ranked[0]?.score).toBe(75);
  });

  it("restores topic-diversity points for a due review candidate on a different topic", () => {
    const ranked = rankQuestionCandidates({
      candidates: [candidate("q1", "discussion", "education")],
      priorCycles: [],
      recentCycles: [candidate("recent", "discussion", "education")],
      dueSourceTopic: "health",
    });

    expect(ranked[0]?.score).toBe(85);
  });

  it("keeps a due review candidate on the source topic under the ordinary recent-topic rule", () => {
    const ranked = rankQuestionCandidates({
      candidates: [candidate("q1", "discussion", "health")],
      priorCycles: [],
      recentCycles: [candidate("recent", "discussion", "health")],
      dueSourceTopic: "health",
    });

    expect(ranked[0]?.score).toBe(75);
  });

  it("uses every recent cycle supplied by the caller", () => {
    const ranked = rankQuestionCandidates({
      candidates: [candidate("q1")],
      priorCycles: [],
      recentCycles: [
        candidate("first", "discussion", "health"),
        candidate("second", "opinion", "education"),
        candidate("third", "opinion", "education"),
        candidate("fourth", "opinion", "education"),
      ],
    });
    expect(ranked[0]?.score).toBe(75);
  });

  it("permanently excludes questions already used in prior cycles", () => {
    const ranked = rankQuestionCandidates({
      candidates: [
        candidate("used"),
        candidate("fresh", "opinion", "education"),
      ],
      priorCycles: [candidate("used")],
      recentCycles: [],
    });
    expect(ranked.map(({ id }) => id)).toEqual(["fresh"]);
  });

  it("excludes private candidates", () => {
    const ranked = rankQuestionCandidates({
      candidates: [
        { ...candidate("private"), visibility: "private" as const },
        candidate("public", "opinion", "education"),
      ],
      priorCycles: [],
      recentCycles: [],
    });
    expect(ranked.map(({ id }) => id)).toEqual(["public"]);
  });

  it("calculates the exact 72-hour exposure cutoff", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    expect(exposureCutoff(now)).toEqual(new Date("2026-08-22T12:00:00.000Z"));
  });

  it("keeps only candidates within five points of the best score", () => {
    const ranked = [
      { ...candidate("best"), score: 100 },
      { ...candidate("edge"), score: 95 },
      { ...candidate("outside"), score: 94.99 },
    ];
    expect(selectTopBucket(ranked, () => 1)?.id).toBe("edge");
  });

  it("sorts ties by stable question ID before choosing", () => {
    const ranked = [
      { ...candidate("b"), score: 90 },
      { ...candidate("a"), score: 90 },
    ];
    expect(
      selectTopBucket(ranked, (upperExclusive) => upperExclusive - 1)?.id,
    ).toBe("b");
  });
});
