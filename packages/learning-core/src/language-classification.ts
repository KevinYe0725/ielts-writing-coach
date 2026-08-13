import type { SkillId } from "@iwc/learning-contracts";

export interface LanguageIssueClassification {
  readonly matchedText: string;
  readonly skillId: SkillId;
  readonly category: "NATURALNESS_AND_PERSPECTIVE";
  readonly hardGrammarError: false;
  readonly grammarNote: string;
  readonly naturalnessNote: string;
  readonly alternatives: readonly string[];
}

/**
 * Deterministic safeguard for the motivating regression case. This does not try
 * to replace AI language judgment; it prevents a known false grammar rule from
 * entering the learning record.
 */
export function classifyMuchSlighterPressure(
  text: string,
): LanguageIssueClassification | null {
  const match =
    /\bmuch\s+slighter\s+pressure\b/i.exec(text) ??
    /\bpressure\b[^.!?]{0,120}\bmuch\s+slighter\b/i.exec(text);
  if (match === null) {
    return null;
  }
  return {
    matchedText: match[0],
    skillId: "collocation_perspective",
    category: "NATURALNESS_AND_PERSPECTIVE",
    hardGrammarError: false,
    grammarNote:
      "Much can correctly intensify the comparative adjective slighter; there is no general 'much + comparative' grammar error.",
    naturalnessNote:
      "The phrase is understandable, but English more naturally frames academic load as having, facing, or being under less pressure.",
    alternatives: [
      "Primary-school pupils face much less academic pressure.",
      "The academic pressure in primary school is considerably lower.",
      "Primary-school courses place far less pressure on children.",
    ],
  };
}
