import { describe, expect, it } from "vitest";

import {
  projectTeachingPracticeAnalysisAtoms,
  renderTeachingPracticeAnalysisAtoms,
} from "./teaching-practice-analysis-atoms";

const answer =
  "Protected lanes reduce perceived danger, so more commuters choose bicycles.";

describe("typed teaching-practice analysis atoms", () => {
  it.each([
    [
      "CHECK_SUBJECT_VERB_AGREEMENT",
      "The number of students are increasing.",
      "are",
      "主语",
      "The number of students is increasing.",
    ],
    [
      "CHECK_VERB_FORM",
      "Schools should to teach financial literacy.",
      "should to teach",
      "动词",
      "Schools should teach financial literacy.",
    ],
    [
      "MATCH_COLLOCATION",
      "This policy can make benefits for residents.",
      "make benefits",
      "搭配",
      "This policy can bring benefits to residents.",
    ],
    [
      "CLARIFY_REFERENCE",
      "Schools and parents should cooperate. They need more funding.",
      "They",
      "指代",
      "Schools and parents should cooperate. Schools need more funding.",
    ],
  ])(
    "renders actionable %s teaching without replacing the learner answer",
    (code, learnerAnswer, evidence, concept, exampleAfter) => {
      const atoms = projectTeachingPracticeAnalysisAtoms(
        {
          kind: "PERSONALIZED_ATOMS_V1",
          strengths: [],
          comparisons: [],
          improvements: [{ code, evidence }],
          uncertainty: "NONE",
        },
        learnerAnswer,
      );
      expect(atoms).not.toBeNull();
      const result = renderTeachingPracticeAnalysisAtoms(atoms!);
      expect(result.keyImprovement?.explanation.zh).toContain(concept);
      expect(result.keyImprovement?.userAnswerEvidence).toEqual([evidence]);
      expect(result.keyImprovement).toHaveProperty(
        "example.after",
        exampleAfter,
      );
      expect(result.nextCheck.zh.length).toBeGreaterThan(10);
    },
  );

  it("still rejects fabricated evidence for a new grammar diagnosis", () => {
    expect(
      projectTeachingPracticeAnalysisAtoms(
        {
          kind: "PERSONALIZED_ATOMS_V1",
          strengths: [],
          comparisons: [],
          improvements: [
            {
              code: "CHECK_SUBJECT_VERB_AGREEMENT",
              evidence: "invented error",
            },
          ],
          uncertainty: "NONE",
        },
        "The number of students is increasing.",
      ),
    ).toBeNull();
  });

  it("renders only first-party copy around exact learner evidence", () => {
    const atoms = projectTeachingPracticeAnalysisAtoms(
      {
        kind: "PERSONALIZED_ATOMS_V1",
        strengths: [
          { code: "EXPLICIT_CAUSAL_LINK", evidence: "reduce perceived danger" },
        ],
        comparisons: [
          { code: "VALID_ALTERNATIVE_PATH", evidence: "choose bicycles" },
        ],
        improvements: [
          { code: "MAKE_OUTCOME_SPECIFIC", evidence: "choose bicycles" },
        ],
        uncertainty: "NONE",
      },
      answer,
    );

    expect(atoms).not.toBeNull();
    expect(renderTeachingPracticeAnalysisAtoms(atoms!)).toEqual({
      kind: "PERSONALIZED",
      summary: {
        zh: "从你原句中的证据看，这次有一个最值得集中修改的点。",
        en: "The quoted wording supports one focused point to revise.",
      },
      strengths: [
        {
          zh: "这句话明确呈现了原因与结果之间的联系。",
          en: "This wording makes the cause-and-result link explicit.",
          userAnswerEvidence: ["reduce perceived danger"],
        },
      ],
      comparisonPoints: [
        {
          aspect: { zh: "论证路径", en: "Reasoning path" },
          referenceFeature: {
            zh: "参考答案展示的是一种可行路径，而不是唯一写法。",
            en: "The reference answer shows one possible route, not the only valid wording.",
          },
          learnerDifference: {
            zh: "你的原句采用了另一条同样可以成立的表达路径。",
            en: "Your wording uses a different route that can still be valid.",
          },
          userAnswerEvidence: ["choose bicycles"],
        },
      ],
      keyImprovement: {
        title: { zh: "把结果写得更具体", en: "Make the outcome more specific" },
        explanation: {
          zh: "把最终发生的行为或变化说清楚，避免只写笼统结果。",
          en: "Name the final behaviour or change instead of leaving the outcome general.",
        },
        whyItMatters: {
          zh: "具体结果能让读者确认这条论证链最终说明了什么。",
          en: "A specific outcome lets the reader see what the reasoning ultimately demonstrates.",
        },
        userAnswerEvidence: ["choose bicycles"],
      },
      nextCheck: {
        zh: "下次检查：结果是否写出了具体行为或变化？",
        en: "Next time, check whether the outcome names a concrete behaviour or change.",
      },
    });
  });

  it("rejects provider prose, unknown atoms, invented spans, and extra fields", () => {
    for (const candidate of [
      {
        kind: "PERSONALIZED",
        summary: { en: "Provider prose" },
      },
      {
        kind: "PERSONALIZED_ATOMS_V1",
        strengths: [{ code: "BAND_SEVEN", evidence: "choose bicycles" }],
        comparisons: [],
        improvements: [],
        uncertainty: "NONE",
      },
      {
        kind: "PERSONALIZED_ATOMS_V1",
        strengths: [
          { code: "DIRECT_RESPONSE", evidence: "invented learner wording" },
        ],
        comparisons: [],
        improvements: [],
        uncertainty: "NONE",
      },
      {
        kind: "PERSONALIZED_ATOMS_V1",
        strengths: [],
        comparisons: [],
        improvements: [],
        uncertainty: "NONE",
        summary: "free prose must never cross the boundary",
      },
      {
        kind: "PERSONALIZED_ATOMS_V1",
        strengths: [],
        comparisons: [],
        improvements: [],
        uncertainty: "PARTIAL_EVIDENCE",
      },
      {
        kind: "PERSONALIZED_ATOMS_V1",
        strengths: [{ code: "DIRECT_RESPONSE", evidence: " " }],
        comparisons: [],
        improvements: [],
        uncertainty: "NONE",
      },
    ]) {
      expect(
        projectTeachingPracticeAnalysisAtoms(candidate, answer),
      ).toBeNull();
    }
  });

  it("keeps assessment wording only as an exact learner-owned quotation", () => {
    const learnerAnswer =
      "The essay discusses why test scores should not define a child's ability.";
    const atoms = projectTeachingPracticeAnalysisAtoms(
      {
        kind: "PERSONALIZED_ATOMS_V1",
        strengths: [{ code: "DIRECT_RESPONSE", evidence: "test scores" }],
        comparisons: [],
        improvements: [],
        uncertainty: "NONE",
      },
      learnerAnswer,
    );

    expect(
      renderTeachingPracticeAnalysisAtoms(atoms!).strengths[0],
    ).toMatchObject({ userAnswerEvidence: ["test scores"] });
  });
});
