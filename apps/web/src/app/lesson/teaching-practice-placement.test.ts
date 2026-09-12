import { describe, expect, it } from "vitest";
import { placeTeachingPractices } from "./teaching-practice-placement";

describe("teaching practice placement", () => {
  it("places each exercise once after its explicit section, retaining order", () => {
    const prompts = [
      { id: "second-section", afterSection: 2 },
      { id: "legacy" },
      { id: "first-section", afterSection: 1 },
      { id: "out-of-range", afterSection: 99 },
      { id: "also-first", afterSection: 1 },
    ];
    const result = placeTeachingPractices(prompts, 2);
    expect(
      result.bySection.map((group) => group.map((prompt) => prompt.id)),
    ).toEqual([["first-section", "also-first"], ["second-section"]]);
    expect(result.trailing.map((prompt) => prompt.id)).toEqual([
      "legacy",
      "out-of-range",
    ]);
    expect(prompts.map((prompt) => prompt.id)).toEqual([
      "second-section",
      "legacy",
      "first-section",
      "out-of-range",
      "also-first",
    ]);
  });

  it("keeps legacy exercises together at the end without inventing a link", () => {
    const prompts = [{ id: "one" }, { id: "two" }];
    expect(placeTeachingPractices(prompts, 3)).toEqual({
      bySection: [[], [], []],
      trailing: prompts,
    });
  });

  it("does not lose exercises with malformed or absent placement", () => {
    const prompts = [0, -1, 1.5, Number.NaN, undefined].map(
      (afterSection, i) => ({ id: String(i), afterSection }),
    );
    expect(placeTeachingPractices(prompts, 2)).toEqual({
      bySection: [[], []],
      trailing: prompts,
    });
    expect(
      placeTeachingPractices([{ id: "one", afterSection: 1 }], 0).trailing,
    ).toHaveLength(1);
  });
});
