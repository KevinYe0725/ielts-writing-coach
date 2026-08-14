import { describe, expect, it } from "vitest";

import { publicTeachingPracticeResponse } from "./teaching-practice-response-api";
import { projectTeachingPracticeResponse } from "../client/teaching-practice-projection";

const oldAnalysis = {
  kind: "PERSONALIZED_ATOMS_V1",
  strengths: [{ code: "DIRECT_RESPONSE", evidence: "immutable first answer" }],
  comparisons: [],
  improvements: [],
  uncertainty: "NONE",
};

const response = {
  id: "response-old-analysis",
  promptId: "workplace-link",
  submittedAnswer: "The immutable first answer.",
  responseMode: "SHORT_TEXT" as const,
  status: "ANALYSIS_READY" as const,
  analysis: oldAnalysis,
};

describe("public tutorial-response projection", () => {
  it.each([
    "Your response receives a passing grade.",
    "Your score is excellent.",
    "The API call worked.",
    "This answer is around Band Seven.",
  ])("never puts prohibited persisted copy on the public wire: %s", (copy) => {
    expect(
      publicTeachingPracticeResponse({
        ...response,
        analysis: {
          kind: "PERSONALIZED",
          summary: { zh: "旧解析。", en: copy },
          strengths: [],
          comparisonPoints: [],
          nextCheck: { zh: "旧检查项。", en: "An old next check." },
        },
      }),
    ).toMatchObject({
      analysisState: "ANALYSIS_UNAVAILABLE",
      analysis: null,
    });
  });

  it.each([
    { linkedJobStatus: "QUEUED" as const, state: "ANALYSIS_PENDING" },
    {
      linkedJobStatus: "WAITING_FOR_CONSENT" as const,
      state: "ANALYSIS_UNAVAILABLE",
    },
    { linkedJobStatus: "FAILED" as const, state: "ANALYSIS_UNAVAILABLE" },
  ])(
    "never serializes stale analysis while the linked job is $linkedJobStatus",
    ({ linkedJobStatus, state }) => {
      expect(
        publicTeachingPracticeResponse(response, linkedJobStatus),
      ).toMatchObject({ analysisState: state, analysis: null });
    },
  );

  it("never serializes stale analysis from an unavailable legacy row", () => {
    expect(
      publicTeachingPracticeResponse({
        ...response,
        status: "ANALYSIS_UNAVAILABLE",
      }),
    ).toMatchObject({
      analysisState: "ANALYSIS_UNAVAILABLE",
      analysis: null,
    });
  });

  it("downgrades a ready row whose typed analysis has no supported evidence", () => {
    expect(
      publicTeachingPracticeResponse({
        ...response,
        analysis: {
          kind: "PERSONALIZED_ATOMS_V1",
          strengths: [],
          comparisons: [],
          improvements: [],
          uncertainty: "PARTIAL_EVIDENCE",
        },
      }),
    ).toMatchObject({
      analysisState: "ANALYSIS_UNAVAILABLE",
      analysis: null,
    });
  });

  it.each(["REFERENCE_READY", "ANALYSIS_PENDING"] as const)(
    "never serializes stale analysis from a legacy %s row",
    (status) => {
      expect(
        publicTeachingPracticeResponse({ ...response, status }),
      ).toMatchObject({
        analysisState:
          status === "REFERENCE_READY"
            ? "REFERENCE_READY"
            : "ANALYSIS_UNAVAILABLE",
        analysis: null,
      });
    },
  );

  it("keeps ready analysis and composes queued output as pending for the browser", () => {
    expect(publicTeachingPracticeResponse(response)).toMatchObject({
      analysisState: "ANALYSIS_READY",
      analysis: oldAnalysis,
    });
    expect(
      projectTeachingPracticeResponse(
        publicTeachingPracticeResponse(response, "QUEUED"),
      ),
    ).toMatchObject({
      analysisState: "ANALYSIS_PENDING",
      analysis: null,
    });
  });
});
