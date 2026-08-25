import { describe, expectTypeOf, it } from "vitest";

import type {
  StructuredGenerationContractContext,
  StructuredGenerationRequest,
} from "./types";

describe("structured generation request types", () => {
  it("accepts only the closed provider-neutral question refill context", () => {
    const context = {
      kind: "question_bank_refill_v1",
      targetMix: [
        { questionType: "opinion", topic: "education", count: 2 },
        { questionType: "two_part", topic: "health", count: 1 },
      ],
    } as const satisfies StructuredGenerationContractContext;
    const request = {
      model: "model",
      input: "input",
      schemaName: "schema",
      schema: {},
      contractContext: context,
      validate: (value: unknown): value is { ok: boolean } =>
        typeof value === "object" && value !== null,
    } satisfies StructuredGenerationRequest<{ ok: boolean }>;

    expectTypeOf(
      request.contractContext,
    ).toMatchTypeOf<StructuredGenerationContractContext>();

    const privateContext: StructuredGenerationContractContext = {
      kind: "question_bank_refill_v1",
      targetMix: [{ questionType: "opinion", topic: "education", count: 1 }],
      // @ts-expect-error learner identifiers are not part of this closed contract.
      learnerId: "must-not-fit-the-provider-contract",
    };
    expectTypeOf(
      privateContext,
    ).toMatchTypeOf<StructuredGenerationContractContext>();
  });
});
