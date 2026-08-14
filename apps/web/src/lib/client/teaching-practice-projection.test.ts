import { describe, expect, it } from "vitest";

import { projectTeachingPracticeResponse } from "./teaching-practice-projection";

const submittedAnswer =
  "Protected lanes reduce perceived danger, so more commuters choose bicycles.";

function readyAtoms(analysis: unknown) {
  return {
    id: "response-atoms",
    promptId: "bike-lanes",
    submittedAnswer,
    responseMode: "SHORT_TEXT",
    analysisState: "ANALYSIS_READY",
    analysis,
  };
}

describe("teaching-practice typed analysis browser boundary", () => {
  it("renders first-party copy from strict atoms and exact evidence", () => {
    expect(
      projectTeachingPracticeResponse(
        readyAtoms({
          kind: "PERSONALIZED_ATOMS_V1",
          strengths: [
            {
              code: "EXPLICIT_CAUSAL_LINK",
              evidence: "reduce perceived danger",
            },
          ],
          comparisons: [
            { code: "VALID_ALTERNATIVE_PATH", evidence: "choose bicycles" },
          ],
          improvements: [
            { code: "MAKE_OUTCOME_SPECIFIC", evidence: "choose bicycles" },
          ],
          uncertainty: "NONE",
        }),
      ),
    ).toMatchObject({
      submittedAnswer,
      analysisState: "ANALYSIS_READY",
      analysis: {
        kind: "PERSONALIZED",
        strengths: [
          {
            en: "This wording makes the cause-and-result link explicit.",
            userAnswerEvidence: ["reduce perceived danger"],
          },
        ],
        keyImprovement: {
          title: { en: "Make the outcome more specific" },
          userAnswerEvidence: ["choose bicycles"],
        },
      },
    });
  });

  it("keeps assessment language when it is an exact learner-owned quotation", () => {
    const answer =
      "The paragraph discusses why test scores should not define ability.";
    expect(
      projectTeachingPracticeResponse({
        ...readyAtoms(null),
        submittedAnswer: answer,
        analysis: {
          kind: "PERSONALIZED_ATOMS_V1",
          strengths: [{ code: "DIRECT_RESPONSE", evidence: "test scores" }],
          comparisons: [],
          improvements: [],
          uncertainty: "NONE",
        },
      })?.analysis?.strengths[0]?.userAnswerEvidence,
    ).toEqual(["test scores"]);
  });

  it.each([
    {
      label: "legacy provider prose",
      analysis: {
        kind: "PERSONALIZED",
        summary: { zh: "旧解析", en: "Your answer is excellent." },
        strengths: [],
        comparisonPoints: [],
        nextCheck: { zh: "检查", en: "Check" },
      },
    },
    {
      label: "unknown atom",
      analysis: {
        kind: "PERSONALIZED_ATOMS_V1",
        strengths: [{ code: "BAND_SEVEN", evidence: "choose bicycles" }],
        comparisons: [],
        improvements: [],
        uncertainty: "NONE",
      },
    },
    {
      label: "invented evidence",
      analysis: {
        kind: "PERSONALIZED_ATOMS_V1",
        strengths: [{ code: "DIRECT_RESPONSE", evidence: "invented text" }],
        comparisons: [],
        improvements: [],
        uncertainty: "NONE",
      },
    },
    {
      label: "extra provider prose",
      analysis: {
        kind: "PERSONALIZED_ATOMS_V1",
        strengths: [],
        comparisons: [],
        improvements: [],
        uncertainty: "NONE",
        summaryEn: "The API call worked.",
      },
    },
    {
      label: "evidence-free atoms",
      analysis: {
        kind: "PERSONALIZED_ATOMS_V1",
        strengths: [],
        comparisons: [],
        improvements: [],
        uncertainty: "PARTIAL_EVIDENCE",
      },
    },
  ])(
    "collapses $label to unavailable without losing the answer",
    ({ analysis }) => {
      expect(projectTeachingPracticeResponse(readyAtoms(analysis))).toEqual({
        id: "response-atoms",
        promptId: "bike-lanes",
        submittedAnswer,
        responseMode: "SHORT_TEXT",
        analysisState: "ANALYSIS_UNAVAILABLE",
        analysis: null,
      });
    },
  );
});
