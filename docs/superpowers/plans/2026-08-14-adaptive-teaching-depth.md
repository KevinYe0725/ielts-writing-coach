# Adaptive teaching depth implementation plan

> **For Codex:** Execute this plan with test-first changes. Keep the paper independent from the article and preserve all learner-facing safety guards.

**Goal:** Generate substantial, diagnosis-led focused teaching articles before the existing timed practice paper.

**Architecture:** Add a source-owned teaching profile catalogue to the AI pedagogy guidance. Strengthen the adaptive-article contract and provider schema so depth is a validation property, then enrich the deterministic mechanism-chain fallback as a visible baseline when a compatible provider cannot satisfy the contract.

**Tech stack:** TypeScript, Vitest, AJV JSON-schema validation, existing Worker/AI packages.

## Task 1: Write contract-level RED tests

**Files:**

- Modify: `apps/worker/src/practice-paper.test.ts`
- Modify: `packages/ai/src/mock.test.ts`

1. Add a learning-package fixture that has only the previous short article shape and assert rejection under the new contract.
2. Assert a valid enriched mechanism article includes all required teaching moves and a transferable active task.
3. Run the focused tests and record the expected failure.

## Task 2: Add the teaching knowledge profiles and prompt guidance

**Files:**

- Create: `packages/ai/src/focused-teaching-knowledge.ts`
- Modify: `packages/ai/src/pedagogy-knowledge.ts`
- Modify: `packages/ai/src/prompts.test.ts`

1. Define an original learner-safe profile for each supported skill.
2. Include the matching profile in focused-learning instructions, with depth expectations and topic variation.
3. Test profile coverage and ensure learner-facing copy contains no implementation terminology.

## Task 3: Enforce depth at the package boundary

**Files:**

- Modify: `apps/worker/src/learning.ts`
- Modify: `apps/worker/src/schemas.ts`
- Modify: `apps/worker/src/practice-paper.test.ts`

1. Update bounds to 3–6 sections, 7–12 blocks, 15–35 minutes.
2. Require explanation, contrast or reasoning, a reusable tool or pitfall treatment, practice with short output and unseen transfer, and a final summary.
3. Run focused Worker tests until green.

## Task 4: Make the deterministic mechanism package a real baseline

**Files:**

- Modify: `packages/ai/src/mock.ts`
- Modify: `packages/ai/src/mock.test.ts`

1. Expand the mechanism-chain tutorial with reasoning, toolkit, pitfalls, two practice stages, and a final self-check.
2. Keep all examples separate from the paper answers.
3. Run AI and Worker focused tests until green.

## Task 5: Verify integration

**Files:** no product changes expected

1. Run formatting, type checks, and focused AI/Worker test suites.
2. Confirm a generated mechanism package validates end-to-end.
3. Commit the cohesive change; deploy only after the same verification is green.
