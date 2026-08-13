import { describe, expect, it } from "vitest";

import {
  QUESTION_BANK,
  QUESTION_TYPES,
  TOPICS,
  getQuestionById,
  listQuestions,
} from "./questions";

describe("original Task 2 question bank", () => {
  it("uses the locked five-type by eight-topic taxonomy", () => {
    expect(QUESTION_TYPES).toEqual([
      "opinion",
      "discussion",
      "advantages_disadvantages",
      "problems_solutions",
      "two_part",
    ]);
    expect(TOPICS).toEqual([
      "education",
      "technology",
      "environment",
      "health",
      "government",
      "work_economy",
      "society_culture",
      "urban_transport",
    ]);
  });

  it("contains exactly three questions for every type/topic pair", () => {
    expect(QUESTION_BANK).toHaveLength(120);

    for (const topic of TOPICS) {
      for (const type of QUESTION_TYPES) {
        expect(listQuestions({ topic, type })).toHaveLength(3);
      }
    }
  });

  it("uses stable unique identifiers and unique prompts", () => {
    const ids = new Set(QUESTION_BANK.map((question) => question.id));
    const prompts = new Set(
      QUESTION_BANK.map((question) => question.prompt.toLocaleLowerCase("en")),
    );

    expect(ids.size).toBe(QUESTION_BANK.length);
    expect(prompts.size).toBe(QUESTION_BANK.length);
    for (const question of QUESTION_BANK) {
      expect(getQuestionById(question.id)).toEqual(question);
      expect(question.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      );
      expect(question.origin).toBe("iwc_original");
      expect(question.status).toBe("validated");
    }
  });

  it("contains complete open-ended Task 2 instructions", () => {
    for (const question of QUESTION_BANK) {
      const wordCount = question.prompt.split(/\s+/u).length;
      expect(wordCount).toBeGreaterThanOrEqual(22);
      expect(wordCount).toBeLessThanOrEqual(90);
      expect(question.prompt).not.toContain("...");

      switch (question.type) {
        case "opinion":
          expect(question.prompt).toMatch(
            /To what extent do you agree or disagree\?$/u,
          );
          break;
        case "discussion":
          expect(question.prompt).toMatch(
            /Discuss both views and give your own opinion\.$/u,
          );
          break;
        case "advantages_disadvantages":
          expect(question.prompt).toMatch(
            /Do the advantages of this development outweigh the disadvantages\?$/u,
          );
          break;
        case "problems_solutions":
          expect(question.prompt).toMatch(
            /What problems .*what measures could address them\?$/u,
          );
          break;
        case "two_part":
          expect(question.prompt.match(/\?/gu) ?? []).toHaveLength(2);
          break;
      }
    }
  });

  it("returns filtered immutable views without changing the bank", () => {
    const education = listQuestions({ topic: "education" });
    expect(education).toHaveLength(15);
    expect(listQuestions({ type: "opinion" })).toHaveLength(24);
    expect(Object.isFrozen(QUESTION_BANK)).toBe(true);
    expect(Object.isFrozen(education)).toBe(true);
  });
});
