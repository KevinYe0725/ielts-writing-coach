# Compatible Focused Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution approved by the user). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a learner's focused teaching article and matching paper reliably with a compatible AI provider, while preserving all prior learning data when either generation fails.

**Architecture:** Keep the existing combined generation for OpenAI and Mock. For compatible providers, first generate a validated adaptive article, then a validated paper built from its private objective, and only persist after the existing full-package validator accepts their combination. The provider preset enables JSON-object response mode for DeepSeek, and structured-validation errors receive a safe, specific classification.

**Tech Stack:** TypeScript, Vitest, AJV 2020, OpenAI-compatible chat-completions API, pnpm workspaces.

## Global Constraints

- Do not read, display, log, export, or change provider secrets.
- Preserve Version 1, assessment, issue evidence, and prior lesson data on every failed generation path.
- Save no partial teaching article or paper.
- Keep all learner-facing copy free of provider, schema, task, or job terminology.
- Test first and capture the failing behavior before implementation.

---

### Task 1: Split compatible focused-package generation atomically

**Files:**

- Modify: `apps/worker/src/tasks/ai.ts:1081-1225`
- Modify: `apps/worker/src/focused-learning.ts:1-40`
- Modify: `apps/worker/src/learning.ts:671-750`
- Modify: `apps/worker/src/schemas.ts:688-790`
- Test: `apps/worker/src/tasks/ai.lesson-generation.test.ts`

**Interfaces:**

- Consumes: `AIProviderAdapter.kind`, `generateStructured`, `focusedLearningPackageSchema`, `validateFocusedLearningPackage`.
- Produces: a complete `FocusedLearningPackage` only after article, paper, and final package validation pass.

- [ ] **Step 1: Write the failing Worker regression tests**

```ts
it("uses separately validated article and paper requests for compatible providers", async () => {
  await generateLesson();
  expect(requests.map(({ schemaName }) => schemaName)).toEqual([
    "iwc_adaptive_teaching_article_v1",
    "iwc_timed_practice_paper_v3",
  ]);
  expect(lessonState.inserted).toContainEqual(
    expect.objectContaining({ table: lessonPlan }),
  );
});

it("does not mutate lesson data when compatible paper generation fails", async () => {
  lessonState.paperFailure = new Error("invalid structured response");
  await generateLesson();
  expect(lessonState.inserted).toEqual([]);
  expect(lessonState.updated).toEqual([]);
});
```

- [ ] **Step 2: Run the targeted Worker test and verify it fails because compatible generation is still a single `iwc_focused_learning_package_v4` call.**

Run: `pnpm --filter @iwc/worker test -- ai.lesson-generation.test.ts`

- [ ] **Step 3: Export independently usable article and paper schemas and validators.**

```ts
export const adaptiveTeachingModuleSchema =
  focusedLearningPackageSchema.properties.teachingModule;
export const timedPracticePaperSchema =
  focusedLearningPackageSchema.properties.paper;

export function validateAdaptiveTeachingModule(
  value: AdaptiveTeachingModule,
  version1Essay?: string,
): boolean {
  /* article-only pedagogy checks */
}
```

- [ ] **Step 4: Implement compatible-only two-step orchestration.**

```ts
if (adapter.kind === "compatible") {
  const teaching =
    await adapter.generateStructured<AdaptiveTeachingModule>(/* article */);
  const paper =
    await adapter.generateStructured<PracticePaperContent>(/* paper */);
  const value = { teachingModule: teaching.value, paper: paper.value };
  if (!validateFocusedLearningPackage(value, version1?.content)) {
    throw invalidStructuredPackage();
  }
  return combineUsage(teaching, paper, value);
}
```

- [ ] **Step 5: Run the targeted Worker regression tests and verify they pass.**

Run: `pnpm --filter @iwc/worker test -- ai.lesson-generation.test.ts`

### Task 2: Use provider-supported JSON mode and classify malformed structured output safely

**Files:**

- Modify: `packages/ai/src/types.ts:1-28`
- Modify: `packages/ai/src/provider-catalog.ts:35-125,400-470`
- Modify: `packages/ai/src/index.ts:15-45`
- Modify: `packages/ai/src/compatible.ts:20-320`
- Test: `packages/ai/src/compatible.test.ts`
- Test: `packages/ai/src/provider-catalog.test.ts`

**Interfaces:**

- Consumes: preset-owned `jsonObjectMode?: boolean`.
- Produces: a JSON-object `response_format` field only for compatible presets that explicitly opt in.

- [ ] **Step 1: Write failing adapter tests.**

```ts
it("uses JSON-object mode for the DeepSeek preset", async () => {
  await adapter.generateStructured(request);
  expect(requestBody).toMatchObject({
    response_format: { type: "json_object" },
  });
});

it("classifies a failed post-repair contract as invalid structured output", async () => {
  const error = await adapter
    .generateStructured(request)
    .catch((value) => value);
  expect(adapter.normalizeError(error).code).toBe("INVALID_RESPONSE");
});
```

- [ ] **Step 2: Run package tests and verify both new assertions fail.**

Run: `pnpm --filter @iwc/ai test -- compatible.test.ts provider-catalog.test.ts`

- [ ] **Step 3: Add the preset-owned JSON-mode capability and forward it only from the DeepSeek preset.**

```ts
interface ProviderCredentials {
  jsonObjectMode?: boolean;
}

// DeepSeek only
jsonObjectMode: true;
```

- [ ] **Step 4: Send JSON-object mode in compatible structured calls and tag validation exhaustion as `INVALID_RESPONSE`.**

```ts
...(this.#jsonObjectMode ? { response_format: { type: "json_object" } } : {}),

throw Object.assign(
  new Error("The compatible provider failed structured validation after one repair attempt."),
  { code: "INVALID_RESPONSE" },
);
```

- [ ] **Step 5: Run the focused AI tests and verify they pass.**

Run: `pnpm --filter @iwc/ai test -- compatible.test.ts provider-catalog.test.ts`

### Task 3: Verify and release the current-account recovery

**Files:**

- Modify: the plan checkbox state only, if necessary.

- [ ] **Step 1: Run the focused Worker and AI suites, then typecheck and format checks.**

Run: `pnpm --filter @iwc/ai test && pnpm --filter @iwc/worker test && pnpm typecheck && pnpm format:check`

- [ ] **Step 2: Commit the isolated change set and push `main`, which triggers the existing Railway deployment.**

```bash
git add packages/ai apps/worker docs/superpowers
git commit -m "fix: split compatible focused generation safely"
git push origin main
```

- [ ] **Step 3: After deployment, use the current account's existing failed generation recovery action once.**

Expected: the original draft and assessment remain unchanged; a valid teaching package and paper are saved only after both generated parts validate.
