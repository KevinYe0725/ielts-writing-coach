import { describe, expect, it } from "vitest";

import { SKILL_IDS } from "@iwc/learning-contracts";

import {
  focusedRecoveryLessonFor,
  sourceOwnedFocusedRecoveryPackage,
} from "./focused-recovery-package";
import { validateFocusedLearningPackage } from "./learning";

describe("source-owned focused recovery packages", () => {
  it.each(SKILL_IDS)(
    "builds one validated 60-minute package for %s",
    (skillId) => {
      const lesson = focusedRecoveryLessonFor(skillId);
      const value = sourceOwnedFocusedRecoveryPackage(skillId);

      expect(value.teachingModule.coreAbilityZh).toBe(lesson.coreAbilityZh);
      expect(value.paper.objectiveZh).toContain(lesson.coreAbilityZh);
      expect(value.paper.items).toHaveLength(8);
      expect(
        value.paper.items.reduce(
          (minutes, item) => minutes + item.suggestedMinutes,
          0,
        ),
      ).toBe(60);
      expect(
        validateFocusedLearningPackage(value, "A preserved first draft."),
      ).toBe(true);
    },
  );

  it("keeps the tutorial reference writing separate from the later paper answers", () => {
    const value = sourceOwnedFocusedRecoveryPackage("mechanism_chain");
    const article = JSON.stringify(value.teachingModule);
    const paperAnswers = value.paper.items.flatMap((item) => [
      ...item.acceptedAnswers,
      ...item.options.map((option) => option.labelEn),
    ]);

    expect(
      paperAnswers.some((answer) =>
        answer.split(/\s+/).filter(Boolean).length >= 8
          ? article.includes(answer)
          : false,
      ),
    ).toBe(false);
  });
});
