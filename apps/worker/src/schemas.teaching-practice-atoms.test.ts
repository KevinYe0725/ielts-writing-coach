import Ajv2020, { type AnySchemaObject } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import { teachingPracticeAnalysisSchema } from "./schemas";

const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
  teachingPracticeAnalysisSchema as AnySchemaObject,
);

describe("teaching-practice typed analysis schema", () => {
  it("accepts only disposition, bounded atoms, exact-span candidates and confidence", () => {
    expect(
      validate({
        disposition: "SUPPORTED",
        strengths: [
          { code: "EXPLICIT_CAUSAL_LINK", evidence: "because demand rises" },
        ],
        comparisons: [
          { code: "VALID_ALTERNATIVE_PATH", evidence: "daily journeys" },
        ],
        improvements: [
          { code: "MAKE_OUTCOME_SPECIFIC", evidence: "daily journeys" },
        ],
        confidence: 0.91,
      }),
    ).toBe(true);
  });

  it("has no provider-authored prose surface other than evidence quotations", () => {
    const base = {
      disposition: "SUPPORTED",
      strengths: [],
      comparisons: [],
      improvements: [],
      confidence: 0.9,
    };
    for (const extra of [
      { summaryEn: "Your answer is excellent." },
      { nextCheckZh: "模型调用成功。" },
      { improvedAnswerEn: "A provider-authored rewrite." },
      { uncertaintyEn: "The API request failed." },
    ]) {
      expect(validate({ ...base, ...extra })).toBe(false);
    }
  });

  it("rejects unknown atom codes and arbitrary atom copy", () => {
    expect(
      validate({
        disposition: "SUPPORTED",
        strengths: [
          {
            code: "BAND_SEVEN",
            evidence: "daily journeys",
            feedback: "Provider prose",
          },
        ],
        comparisons: [],
        improvements: [],
        confidence: 0.9,
      }),
    ).toBe(false);
  });
});
