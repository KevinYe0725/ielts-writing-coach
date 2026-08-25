import Ajv2020, { type AnySchemaObject } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import * as schemas from "./schemas";

const validProposals = {
  opinion: {
    type: "opinion",
    topic: "education",
    track: "academic",
    prompt:
      "Universities should require every student to complete a community project before graduation. Do you agree or disagree?",
    internalRationale:
      "Civic participation is a broad, durable education theme.",
  },
  discussion: {
    type: "discussion",
    topic: "technology",
    track: "academic",
    prompt:
      "Some people believe that governments should regulate social-media platforms strictly, while others argue that companies should set their own rules. Discuss both views and give your own opinion.",
    internalRationale:
      "Platform governance is suitable for balanced argument practice.",
  },
  advantages_disadvantages: {
    type: "advantages_disadvantages",
    topic: "environment",
    track: "academic",
    prompt:
      "Many towns are replacing grass verges with small community food gardens. Do the advantages of this development outweigh the disadvantages?",
    internalRationale:
      "Local food growing creates accessible environmental trade-offs.",
  },
  problems_solutions: {
    type: "problems_solutions",
    topic: "health",
    track: "general_training",
    prompt:
      "Many employees find it difficult to take regular breaks during long working days. What problems does this situation create, and what measures could address them?",
    internalRationale: "Workplace health is a stable, general audience issue.",
  },
  two_part: {
    type: "two_part",
    topic: "urban_transport",
    track: "general_training",
    prompt:
      "Public libraries are beginning to lend bicycles as well as books. Why might communities introduce this service? How could it affect local travel habits?",
    internalRationale:
      "Library bicycle lending offers two clear, non-specialist questions.",
  },
} as const;

const sentence = "A".repeat(40);

async function contract() {
  const loaded = await import("./question-generation").catch(() => undefined);
  expect(loaded).toBeDefined();
  return loaded!;
}

describe("question-bank refill provider schema", () => {
  it("consumes the canonical question-bank taxonomy", async () => {
    const questionBank = await import("@iwc/question-bank").catch(
      () => undefined,
    );
    expect(questionBank).toBeDefined();
    expect(schemas).toHaveProperty("questionGenerationTaxonomy");
    const taxonomy = (schemas as Record<string, unknown>)
      .questionGenerationTaxonomy as {
      types: unknown;
      topics: unknown;
    };
    expect(taxonomy.types).toBe(questionBank?.QUESTION_TYPES);
    expect(taxonomy.topics).toBe(questionBank?.TOPICS);
  });

  it("has a closed, bounded public proposal shape without learner fields", () => {
    expect(schemas).toHaveProperty("questionBankRefillSchema");
    const schema = (schemas as Record<string, unknown>)
      .questionBankRefillSchema as {
      additionalProperties?: boolean;
      properties?: Record<
        string,
        {
          maxItems?: number;
          items?: {
            additionalProperties?: boolean;
            properties?: Record<string, unknown>;
          };
        }
      >;
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties?.proposals?.maxItems).toBe(15);
    expect(schema.properties?.proposals?.items?.additionalProperties).toBe(
      false,
    );
    expect(
      Object.keys(schema.properties?.proposals?.items?.properties ?? {}).sort(),
    ).toEqual(["internalRationale", "prompt", "topic", "track", "type"]);
    expect(JSON.stringify(schema)).not.toMatch(/learner|essay|feedback/i);
  });

  it("enforces the provider payload length boundaries", () => {
    expect(schemas).toHaveProperty("questionBankRefillSchema");
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      (schemas as Record<string, unknown>)
        .questionBankRefillSchema as AnySchemaObject,
    );
    const payload = (prompt: string) => ({
      proposals: [{ ...validProposals.opinion, prompt }],
    });

    expect(validate(payload("x".repeat(39)))).toBe(false);
    expect(validate(payload("x".repeat(40)))).toBe(true);
    expect(validate(payload("x".repeat(900)))).toBe(true);
    expect(validate(payload("x".repeat(901)))).toBe(false);
  });
});

describe("generated question quality gate", () => {
  it("exports the canonical prompt normalization and hash contract", async () => {
    const { normalizeQuestionPrompt, questionPromptHash } = await contract();
    const raw = "  Public LIBRARIES lend bicycles—how can this help?  ";
    const normalized = "public libraries lend bicycles how can this help";

    expect(normalizeQuestionPrompt(raw)).toBe(normalized);
    expect(questionPromptHash(raw)).toBe(questionPromptHash(normalized));
    expect(questionPromptHash(raw)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("accepts one structurally suitable proposal for every Task 2 type", async () => {
    const { validateGeneratedQuestionBatch } = await contract();
    const result = validateGeneratedQuestionBatch({
      proposals: Object.values(validProposals),
      existingQuestions: [],
      researchSources: [],
      targetMix: Object.values(validProposals).map((proposal) => ({
        questionType: proposal.type,
        topic: proposal.topic,
        count: 1,
      })),
    });

    expect(result.accepted).toEqual(Object.values(validProposals));
    expect(result.rejected).toEqual([]);
  });

  it("rejects a schema-valid proposal outside the approved target mix", async () => {
    const { validateGeneratedQuestionBatch } = await contract();
    const proposal = validProposals.discussion;

    const result = validateGeneratedQuestionBatch({
      proposals: [proposal],
      existingQuestions: [],
      researchSources: [],
      targetMix: [{ questionType: "opinion", topic: "education", count: 1 }],
    });

    expect(result).toEqual({
      accepted: [],
      pendingSemanticReview: [],
      rejected: [{ proposal, reason: "TARGET_MIX_PAIR_UNAPPROVED" }],
    });
  });

  it("rejects later valid proposals after an approved pair reaches its count", async () => {
    const { validateGeneratedQuestionBatch } = await contract();
    const first = validProposals.opinion;
    const second = {
      ...first,
      prompt:
        "Public colleges should guarantee every learner a funded placement with a local charity before graduation. Do you agree or disagree?",
    };
    const third = {
      ...first,
      prompt:
        "Schools should make participation in neighbourhood decision-making a compulsory part of the final year. Do you agree or disagree?",
    };

    const result = validateGeneratedQuestionBatch({
      proposals: [first, second, third],
      existingQuestions: [],
      researchSources: [],
      targetMix: [{ questionType: "opinion", topic: "education", count: 1 }],
    });

    expect(result.accepted).toEqual([first]);
    expect(result.pendingSemanticReview).toEqual([]);
    expect(result.rejected).toEqual([
      { proposal: second, reason: "TARGET_MIX_COUNT_EXCEEDED" },
      { proposal: third, reason: "TARGET_MIX_COUNT_EXCEEDED" },
    ]);
  });

  it("does not let deterministically rejected candidates consume pair quota", async () => {
    const { validateGeneratedQuestionBatch } = await contract();
    const schemaInvalid = {
      ...validProposals.opinion,
      internalRationale: undefined,
    };
    const leakage = {
      ...validProposals.opinion,
      internalRationale: "A model answer would make this prompt easy to reuse.",
    };
    const valid = {
      ...validProposals.opinion,
      prompt:
        "Universities should reserve places in local volunteering programmes for final-year students. Do you agree or disagree?",
    };

    const result = validateGeneratedQuestionBatch({
      proposals: [schemaInvalid, leakage, valid],
      existingQuestions: [],
      researchSources: [],
      targetMix: [{ questionType: "opinion", topic: "education", count: 1 }],
    });

    expect(result.accepted).toEqual([valid]);
    expect(result.rejected).toEqual([
      { proposal: schemaInvalid, reason: "SCHEMA_INVALID" },
      { proposal: leakage, reason: "PROMPT_LEAKAGE" },
    ]);
  });

  it.each([
    ["is not an array", null],
    ["is empty", []],
    [
      "uses unsupported taxonomy",
      [{ questionType: "letter", topic: "education", count: 1 }],
    ],
    [
      "uses a zero count",
      [{ questionType: "opinion", topic: "education", count: 0 }],
    ],
    [
      "uses a fractional count",
      [{ questionType: "opinion", topic: "education", count: 1.5 }],
    ],
    [
      "uses a count above the batch cap",
      [{ questionType: "opinion", topic: "education", count: 16 }],
    ],
    [
      "duplicates a type-topic pair",
      [
        { questionType: "opinion", topic: "education", count: 1 },
        { questionType: "opinion", topic: "education", count: 1 },
      ],
    ],
    [
      "has a total above the batch cap",
      [
        { questionType: "opinion", topic: "education", count: 8 },
        { questionType: "discussion", topic: "technology", count: 8 },
      ],
    ],
    [
      "contains non-canonical fields",
      [
        {
          questionType: "opinion",
          topic: "education",
          count: 1,
          learnerId: "private",
        },
      ],
    ],
  ])(
    "fails closed when the internal target mix %s",
    async (_label, targetMix) => {
      const { validateGeneratedQuestionBatch } = await contract();

      const result = validateGeneratedQuestionBatch({
        proposals: [validProposals.opinion],
        existingQuestions: [],
        researchSources: [],
        targetMix,
      });

      expect(result).toEqual({
        accepted: [],
        pendingSemanticReview: [],
        rejected: [
          {
            proposal: validProposals.opinion,
            reason: "TARGET_MIX_INVALID",
          },
        ],
      });
    },
  );

  it("keeps target quota and original semantic indexes consistent across both passes", async () => {
    const { validateGeneratedQuestionBatch } = await contract();
    const first = validProposals.opinion;
    const later = {
      ...first,
      prompt:
        "Public colleges should arrange neighbourhood placements for students who want practical civic experience. Do you agree or disagree?",
    };
    const input = {
      proposals: [first, later],
      existingQuestions: [
        {
          ...first,
          prompt:
            "Universities should include organised public service in degree programmes. Do you agree or disagree?",
        },
      ],
      researchSources: [],
      targetMix: [{ questionType: "opinion", topic: "education", count: 1 }],
    } as const;

    const firstPass = validateGeneratedQuestionBatch(input);
    expect(firstPass.pendingSemanticReview).toEqual([first]);
    expect(firstPass.rejected).toEqual([
      { proposal: later, reason: "TARGET_MIX_COUNT_EXCEEDED" },
    ]);

    const finalPass = validateGeneratedQuestionBatch({
      ...input,
      semanticJudgments: {
        0: {
          duplicate: false,
          confidence: 0.95,
          rationale: "The requested policy and civic setting are distinct.",
        },
      },
    });
    expect(finalPass.accepted).toEqual([first]);
    expect(finalPass.pendingSemanticReview).toEqual([]);
    expect(finalPass.rejected).toEqual([
      { proposal: later, reason: "TARGET_MIX_COUNT_EXCEEDED" },
    ]);
  });

  it("releases pair quota when the earlier semantic candidate is rejected", async () => {
    const { validateGeneratedQuestionBatch } = await contract();
    const first = validProposals.opinion;
    const later = {
      ...first,
      prompt:
        "Public colleges should arrange neighbourhood placements for learners seeking practical civic experience. Do you agree or disagree?",
    };
    const result = validateGeneratedQuestionBatch({
      proposals: [first, later],
      existingQuestions: [
        {
          ...first,
          prompt:
            "Universities should include organised public service in degree programmes. Do you agree or disagree?",
        },
      ],
      researchSources: [],
      targetMix: [{ questionType: "opinion", topic: "education", count: 1 }],
      semanticJudgments: {
        0: {
          duplicate: true,
          confidence: 0.95,
          rationale: "The first proposal duplicates the existing task.",
        },
      },
    });

    expect(result.accepted).toEqual([]);
    expect(result.pendingSemanticReview).toEqual([later]);
    expect(result.rejected).toEqual([
      { proposal: first, reason: "SEMANTIC_DUPLICATE" },
    ]);
  });

  it("enforces the fifteen-proposal cap at the exported validation boundary", async () => {
    const { validateGeneratedQuestionBatch } = await contract();
    const proposals = Array.from({ length: 16 }, (_, index) => ({
      ...validProposals.opinion,
      prompt: `Local universities should fund community project option ${index} before graduation. Do you agree or disagree?`,
    }));

    const withinLimit = validateGeneratedQuestionBatch({
      proposals: proposals.slice(0, 15),
      existingQuestions: [],
      researchSources: [],
      targetMix: [{ questionType: "opinion", topic: "education", count: 15 }],
    });
    expect(withinLimit.accepted).toHaveLength(1);
    expect(withinLimit.pendingSemanticReview).toHaveLength(14);
    expect(withinLimit.rejected).toEqual([]);

    const oversized = validateGeneratedQuestionBatch({
      proposals,
      existingQuestions: [],
      researchSources: [],
      targetMix: [{ questionType: "opinion", topic: "education", count: 15 }],
    });
    expect(oversized.accepted).toEqual([]);
    expect(oversized.pendingSemanticReview).toEqual([]);
    expect(oversized.rejected).toHaveLength(16);
    expect(
      oversized.rejected.every(({ reason }) => reason === "BATCH_TOO_LARGE"),
    ).toBe(true);
  });

  it.each([
    ["unsupported taxonomy", { ...validProposals.opinion, type: "letter" }],
    [
      "malformed type surface",
      { ...validProposals.opinion, prompt: `${sentence} Explain both views.` },
    ],
    [
      "answer or rubric leakage",
      {
        ...validProposals.opinion,
        prompt: `${sentence} Do you agree or disagree? Include a model answer and band rubric.`,
      },
    ],
    [
      "URL or citation leakage",
      {
        ...validProposals.opinion,
        prompt: `${sentence} Do you agree or disagree? Cite https://example.test before writing.`,
      },
    ],
    [
      "specialist current-fact dependency",
      {
        ...validProposals.opinion,
        prompt: `${sentence} In 2026, should the current national carbon target be changed? Do you agree or disagree?`,
      },
    ],
  ])("rejects %s", async (_name, proposal) => {
    const { validateGeneratedQuestionBatch } = await contract();
    const result = validateGeneratedQuestionBatch({
      proposals: [proposal],
      existingQuestions: [],
      researchSources: [],
      targetMix: [{ questionType: "opinion", topic: "education", count: 1 }],
    });

    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
  });

  it.each([
    [
      "opinion instructions embedded inside another question",
      {
        ...validProposals.opinion,
        prompt:
          "Universities should require every student to complete a community project before graduation. Why do you agree or disagree?",
      },
    ],
    [
      "discussion instructions framed as advice",
      {
        ...validProposals.discussion,
        prompt:
          "Some people support strict regulation while others prefer company rules. You should discuss both views and give your own opinion.",
      },
    ],
    [
      "advantages instructions without the required development question",
      {
        ...validProposals.advantages_disadvantages,
        prompt:
          "Many towns are replacing grass verges with community gardens. Should the advantages outweigh the disadvantages?",
      },
    ],
    [
      "problems instructions with an altered task stem",
      {
        ...validProposals.problems_solutions,
        prompt:
          "Many employees struggle to take breaks during long working days. What problems can this situation create, and what measures could address them?",
      },
    ],
    [
      "two-part instructions with an empty second question",
      {
        ...validProposals.two_part,
        prompt:
          "Public libraries are beginning to lend bicycles as well as books. Why might communities introduce this service? ?",
      },
    ],
  ])("rejects malformed %s", async (_name, proposal) => {
    const { validateGeneratedQuestionBatch } = await contract();
    const result = validateGeneratedQuestionBatch({
      proposals: [proposal],
      existingQuestions: [],
      researchSources: [],
      targetMix: [
        {
          questionType:
            (proposal.type as string) === "letter" ? "opinion" : proposal.type,
          topic: proposal.topic,
          count: 1,
        },
      ],
    });

    expect(result.rejected).toEqual([
      { proposal, reason: "TASK2_SURFACE_INVALID" },
    ]);
  });

  it("rejects an exact normalized hash duplicate", async () => {
    const { validateGeneratedQuestionBatch } = await contract();
    const result = validateGeneratedQuestionBatch({
      proposals: [validProposals.opinion],
      existingQuestions: [
        {
          ...validProposals.opinion,
          prompt: `  ${validProposals.opinion.prompt.toUpperCase()}  `,
        },
      ],
      researchSources: [],
      targetMix: [{ questionType: "opinion", topic: "education", count: 1 }],
    });

    expect(result.accepted).toEqual([]);
    expect(result.rejected[0]?.reason).toBe("EXACT_DUPLICATE");
  });

  it("rejects an exact normalized duplicate within the proposed batch", async () => {
    const { validateGeneratedQuestionBatch } = await contract();
    const result = validateGeneratedQuestionBatch({
      proposals: [
        validProposals.opinion,
        {
          ...validProposals.opinion,
          prompt: validProposals.opinion.prompt.toUpperCase(),
        },
      ],
      existingQuestions: [],
      researchSources: [],
      targetMix: [{ questionType: "opinion", topic: "education", count: 2 }],
    });

    expect(result.accepted).toEqual([validProposals.opinion]);
    expect(result.rejected[0]?.reason).toBe("EXACT_DUPLICATE");
  });

  it("rejects a five-gram near duplicate of an earlier accepted proposal", async () => {
    const { validateGeneratedQuestionBatch } = await contract();
    const first = validProposals.discussion;
    const nearDuplicate = {
      ...first,
      prompt: first.prompt.replace("strictly", "carefully"),
    };
    const result = validateGeneratedQuestionBatch({
      proposals: [first, nearDuplicate],
      existingQuestions: [],
      researchSources: [],
      targetMix: [
        { questionType: "discussion", topic: "technology", count: 2 },
      ],
    });

    expect(result.accepted).toEqual([first]);
    expect(result.rejected).toEqual([
      { proposal: nearDuplicate, reason: "FIVE_GRAM_DUPLICATE" },
    ]);
  });

  it("rejects a semantic duplicate of an earlier same-batch proposal by proposal index", async () => {
    const { validateGeneratedQuestionBatch } = await contract();
    const first = validProposals.opinion;
    const semanticDuplicate = {
      ...first,
      prompt:
        "Public universities should require students to complete local service before receiving a degree. Do you agree or disagree?",
    };
    const result = validateGeneratedQuestionBatch({
      proposals: [first, semanticDuplicate],
      existingQuestions: [],
      researchSources: [],
      targetMix: [{ questionType: "opinion", topic: "education", count: 2 }],
      semanticJudgments: {
        1: {
          duplicate: true,
          confidence: 0.9,
          rationale: "The task asks for the same civic-service argument.",
        },
      },
    });

    expect(result.accepted).toEqual([first]);
    expect(result.rejected).toEqual([
      { proposal: semanticDuplicate, reason: "SEMANTIC_DUPLICATE" },
    ]);
  });

  it("holds a same-batch semantic candidate pending when its judgment is absent", async () => {
    const { validateGeneratedQuestionBatch } = await contract();
    const first = validProposals.opinion;
    const candidate = {
      ...first,
      prompt:
        "Every university student should undertake a short community placement before graduation. Do you agree or disagree?",
    };
    const result = validateGeneratedQuestionBatch({
      proposals: [first, candidate],
      existingQuestions: [],
      researchSources: [],
      targetMix: [{ questionType: "opinion", topic: "education", count: 2 }],
    });

    expect(result.accepted).toEqual([first]);
    expect(result.pendingSemanticReview).toEqual([candidate]);
    expect(result.rejected).toEqual([]);
  });

  it("rejects a near duplicate of an earlier pending same-batch proposal", async () => {
    const { validateGeneratedQuestionBatch } = await contract();
    const first = validProposals.opinion;
    const pending = {
      ...first,
      topic: "work_economy",
      prompt:
        "Employees should be able to choose remote work for most of the week when their duties permit it. Do you agree or disagree?",
    };
    const nearPending = {
      ...pending,
      prompt: pending.prompt.replace("remote work", "flexible remote work"),
    };
    const result = validateGeneratedQuestionBatch({
      proposals: [first, pending, nearPending],
      existingQuestions: [],
      researchSources: [],
      targetMix: [
        { questionType: "opinion", topic: "education", count: 1 },
        { questionType: "opinion", topic: "work_economy", count: 2 },
      ],
    });

    expect(result.accepted).toEqual([first]);
    expect(result.pendingSemanticReview).toEqual([pending]);
    expect(result.rejected).toEqual([
      { proposal: nearPending, reason: "FIVE_GRAM_DUPLICATE" },
    ]);
  });

  it("enforces one through six sentences after schema validation", async () => {
    const { validateGeneratedQuestionBatch } = await contract();
    const sevenSentences = `${"A useful local policy deserves careful discussion. ".repeat(6)}Should every town fund a repair centre? Do you agree or disagree?`;
    for (const prompt of ["", sevenSentences]) {
      const result = validateGeneratedQuestionBatch({
        proposals: [{ ...validProposals.opinion, prompt }],
        existingQuestions: [],
        researchSources: [],
        targetMix: [{ questionType: "opinion", topic: "education", count: 1 }],
      });
      expect(result.accepted).toEqual([]);
      expect(result.rejected).toHaveLength(1);
    }
  });

  it("rejects a copied twelve-token research span", async () => {
    const { validateGeneratedQuestionBatch } = await contract();
    const copied =
      "neighbourhood repair events help residents share practical skills and reduce household waste";
    const result = validateGeneratedQuestionBatch({
      proposals: [
        {
          ...validProposals.advantages_disadvantages,
          prompt: `Some towns support projects where ${copied}. Do the advantages of this development outweigh the disadvantages?`,
        },
      ],
      targetMix: [
        {
          questionType: "advantages_disadvantages",
          topic: "environment",
          count: 1,
        },
      ],
      existingQuestions: [],
      researchSources: [
        {
          url: "https://example.test/repair",
          title: "Repair events",
          snippet: `Local reports show that ${copied} across several districts.`,
        },
      ],
    });

    expect(result.accepted).toEqual([]);
    expect(result.rejected[0]?.reason).toBe("COPIED_RESEARCH_SPAN");
  });

  it.each([
    [
      "rationale answer or URL leakage",
      {
        ...validProposals.opinion,
        internalRationale:
          "Use the model answer at https://example.test before generating this prompt.",
      },
      [],
      "PROMPT_LEAKAGE",
    ],
    [
      "rationale specialist current-fact dependency",
      {
        ...validProposals.opinion,
        internalRationale:
          "The current national carbon policy makes this topic timely.",
      },
      [],
      "CURRENT_FACT_DEPENDENCY",
    ],
    [
      "rationale copied research span",
      {
        ...validProposals.opinion,
        internalRationale:
          "neighbourhood repair events help residents share practical skills and reduce household waste in local areas",
      },
      [
        {
          url: "https://example.test/repair",
          title: "Repair events",
          snippet:
            "Local reports show that neighbourhood repair events help residents share practical skills and reduce household waste in several districts.",
        },
      ],
      "COPIED_RESEARCH_SPAN",
    ],
  ])("rejects %s", async (_name, proposal, researchSources, reason) => {
    const { validateGeneratedQuestionBatch } = await contract();
    const result = validateGeneratedQuestionBatch({
      proposals: [proposal],
      existingQuestions: [],
      researchSources,
      targetMix: [{ questionType: "opinion", topic: "education", count: 1 }],
    });

    expect(result.rejected).toEqual([{ proposal, reason }]);
  });

  it("uses the documented five-gram Jaccard cut-off before semantic review", async () => {
    const { normalizedWordFiveGramJaccard, validateGeneratedQuestionBatch } =
      await contract();
    const words = Array.from({ length: 55 }, (_, index) => `token${index}`);
    const atThreshold = words.slice(0, 15).join(" ");
    const longerAtThreshold = words.slice(0, 24).join(" ");
    const nearDuplicateWords = words.slice(0, 19).join(" ");
    const belowThreshold = words.slice(0, 32).join(" ");
    const longerBelowThreshold = words.slice(0, 55).join(" ");

    expect(normalizedWordFiveGramJaccard(atThreshold, longerAtThreshold)).toBe(
      0.55,
    );
    expect(
      normalizedWordFiveGramJaccard(belowThreshold, longerBelowThreshold),
    ).toBeCloseTo(0.549, 3);

    const twoPartPrompt = (questionWords: string) =>
      `Why do ${questionWords}? How does it change local travel?`;
    const candidate = {
      ...validProposals.two_part,
      prompt: twoPartPrompt(atThreshold),
    };
    const atThresholdResult = validateGeneratedQuestionBatch({
      proposals: [candidate],
      existingQuestions: [
        { ...candidate, prompt: twoPartPrompt(nearDuplicateWords) },
      ],
      researchSources: [],
      targetMix: [
        { questionType: "two_part", topic: "urban_transport", count: 1 },
      ],
    });
    expect(
      normalizedWordFiveGramJaccard(
        candidate.prompt,
        twoPartPrompt(nearDuplicateWords),
      ),
    ).toBeGreaterThanOrEqual(0.55);
    expect(atThresholdResult.rejected[0]?.reason).toBe("FIVE_GRAM_DUPLICATE");

    const belowThresholdCandidate = {
      ...validProposals.two_part,
      prompt: twoPartPrompt(belowThreshold),
    };
    const belowThresholdResult = validateGeneratedQuestionBatch({
      proposals: [belowThresholdCandidate],
      existingQuestions: [
        {
          ...belowThresholdCandidate,
          prompt: twoPartPrompt(longerBelowThreshold),
        },
      ],
      researchSources: [],
      targetMix: [
        { questionType: "two_part", topic: "urban_transport", count: 1 },
      ],
    });
    expect(belowThresholdResult.rejected).toEqual([]);
    expect(belowThresholdResult.pendingSemanticReview).toEqual([
      belowThresholdCandidate,
    ]);
  });

  it("rejects schema-invalid and low-confidence semantic duplicate judgments", async () => {
    const { validateGeneratedQuestionBatch } = await contract();
    for (const semanticJudgment of [
      { duplicate: false, confidence: "certain", rationale: "bad schema" },
      { duplicate: false, confidence: 0.79, rationale: "not enough certainty" },
    ]) {
      const result = validateGeneratedQuestionBatch({
        proposals: [validProposals.discussion],
        existingQuestions: [
          {
            ...validProposals.discussion,
            prompt:
              "Some people believe that organisations should make their own rules, while others think public authorities should regulate them. Discuss both views and give your own opinion.",
          },
        ],
        researchSources: [],
        targetMix: [
          { questionType: "discussion", topic: "technology", count: 1 },
        ],
        semanticJudgments: { 0: semanticJudgment },
      });
      expect(result.accepted).toEqual([]);
      expect(result.rejected).toHaveLength(1);
    }
  });
});
