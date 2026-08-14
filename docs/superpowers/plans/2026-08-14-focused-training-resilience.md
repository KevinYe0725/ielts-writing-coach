# Focused Training Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically recover every incomplete focused-teaching record into a valid teaching article and timed paper without overwriting learning history or trapping the learner at an error page.

**Architecture:** A client recovery controller turns the current incomplete-package response into an automatic, bounded recovery request and poll. The server remains the concurrency boundary: it returns a valid package unchanged, reuses one active recovery, derives a safe skill when historic diagnosis is incomplete, and limits new infrastructure recovery attempts. The Worker keeps strict validation and substitutes a skill-matched source-owned package whenever an AI generation request fails or is malformed.

**Tech Stack:** Next.js 16, TypeScript, Vitest, Playwright, Drizzle/PostgreSQL, Graphile Worker, existing `@iwc/ai` structured generation contracts.

## Global Constraints

- Preserve prior essays, feedback, paper answers, paper results, and completed evaluations exactly.
- Do not expose provider, model, job, schema, legacy, retry, internal IDs, or raw error codes in learner-facing copy.
- Never mark a malformed teaching/paper package ready.
- A valid existing adaptive package is always a no-op.
- One active recovery job per lesson; a terminal infrastructure recovery may be re-enqueued only after 15 minutes.
- A preparation view changes to a safe continuation view after 20 seconds; it never blocks feedback or writing.
- All new behavior is test-first and the release gate includes a real Railway-account browser run.

---

### Task 1: Define validated source-owned packages for all supported skills

**Files:**

- Create: `apps/worker/src/focused-recovery-package.ts`
- Create: `apps/worker/src/focused-recovery-package.test.ts`
- Modify: `apps/worker/src/tasks/ai.ts:1173-1307`
- Modify: `apps/worker/src/tasks/ai.lesson-generation.test.ts`

**Interfaces:**

- Produces `sourceOwnedFocusedRecoveryPackage(skillId: SkillId): FocusedLearningPackage` and `focusedRecoveryLessonFor(skillId: SkillId): FocusedRecoveryLesson`.
- Consumes `SKILL_IDS`, `FocusedLearningPackage`, and `validateFocusedLearningPackage`.
- Worker uses this helper only after model failure or validation rejection; its output still passes the same package validator before persistence.

- [ ] **Step 1: Write the failing package-factory test**

```ts
it.each(SKILL_IDS)("returns a valid recovery package for %s", (skillId) => {
  const value = sourceOwnedFocusedRecoveryPackage(skillId);
  expect(value.teachingModule.blueprint.coreAbilityZh).toBe(
    focusedRecoveryLessonFor(skillId).coreAbilityZh,
  );
  expect(
    validateFocusedLearningPackage(value, "A preserved first draft."),
  ).toBe(true);
  expect(value.paper.items).toHaveLength(8);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @iwc/worker test -- focused-recovery-package.test.ts`

Expected: FAIL because `sourceOwnedFocusedRecoveryPackage` does not exist.

- [ ] **Step 3: Implement the bounded source-owned package factory**

```ts
export function sourceOwnedFocusedRecoveryPackage(
  skillId: SkillId,
): FocusedLearningPackage {
  const lesson = RECOVERY_LESSONS[skillId];
  return buildFocusedPackage({
    lesson,
    practiceContexts: lesson.practiceContexts,
  });
}
```

Use a complete owned `RECOVERY_LESSONS` record keyed by every `SkillId`. Each record supplies bilingual ability wording, a weak/strong contrast, a decision rule, a guided task, an unseen-topic task, and distinct paper contexts. The builder creates 3 sections, 7 blocks, and 8 paper items totalling 60 minutes. It does not depend on model output or the learner’s original wording.

- [ ] **Step 4: Replace the mechanism-only Worker fallback**

```ts
const deterministicRecoveryPackage =
  (): GenerationResult<FocusedLearningPackage> => ({
    value: sourceOwnedFocusedRecoveryPackage(canonicalSkillId),
    model: "source-owned-recovery-v1",
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  });
```

Use it for adapter failure or invalid structured package. Validate the returned package before persistence.

- [ ] **Step 5: Run focused tests and Worker typecheck**

Run: `pnpm --filter @iwc/worker test -- focused-recovery-package.test.ts ai.lesson-generation.test.ts && pnpm --filter @iwc/worker typecheck`

Expected: PASS; every supported skill has safe fallback content and invalid provider results do not fail the learning flow.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/focused-recovery-package.ts apps/worker/src/focused-recovery-package.test.ts apps/worker/src/tasks/ai.ts apps/worker/src/tasks/ai.lesson-generation.test.ts
git commit -m "feat: add focused training content fallback"
```

### Task 2: Make server recovery idempotent, diagnostic-safe, and self-healing

**Files:**

- Modify: `apps/web/src/app/api/v1/lessons/[id]/replace/route.ts`
- Create: `apps/web/src/app/api/v1/lessons/[id]/replace/route.test.ts`
- Modify: `apps/web/src/lib/client/types.ts`
- Modify: `apps/web/src/lib/client/http-service.ts`
- Modify: `apps/web/src/lib/client/http-service.test.ts`

**Interfaces:**

- Produces `LegacyLessonRecoveryResult` with only `READY`, `PREPARING`, or `CONTINUING_SAFELY` for client consumption.
- Consumes the lesson row, cycle core skill, preserved assessment issues, and active/recent generation jobs.
- Uses `deriveRecoverySkill(...): SkillId` even when `coreSkillId` is absent.

- [ ] **Step 1: Write failing route tests**

```ts
it("derives the most severe valid issue skill when the old cycle has no core skill", async () => {
  routeState.cycle = replacementCycle({
    coreSkillId: null,
    issues: [{ skillId: "cohesion_progression", severity: 4 }],
  });
  await replaceTeaching(legacyRequest(), routeParams());
  expect(routeState.queuedInput).toMatchObject({
    protectedReference: { skillId: "cohesion_progression" },
  });
});

it("uses task response when the old diagnosis is absent", async () => {
  routeState.cycle = replacementCycle({ coreSkillId: null, issues: [] });
  await replaceTeaching(legacyRequest(), routeParams());
  expect(routeState.queuedInput).toMatchObject({
    protectedReference: { skillId: "task_response" },
  });
});
```

- [ ] **Step 2: Run the route tests to verify they fail**

Run: `pnpm --filter @iwc/web test -- 'app/api/v1/lessons/[id]/replace/route.test.ts'`

Expected: FAIL because the route rejects a missing `coreSkillId` and has no conservative fallback selection.

- [ ] **Step 3: Implement explicit recovery selection and the 15-minute guard**

```ts
function deriveRecoverySkill(
  cycle: RecoveryCycle,
  plan: LessonPlanRow,
): SkillId {
  return (
    validSkill(cycle.coreSkillId) ??
    validSkill(plan.coreSkillId) ??
    highestSeveritySkill(cycle.writingAttempts) ??
    "task_response"
  );
}
```

Lock the lesson before inspecting or enqueueing. Reuse a `QUEUED`, `RUNNING`, or `WAITING_FOR_CONSENT` job. If the most recent failed recovery ended less than 15 minutes ago, return `CONTINUING_SAFELY` without enqueuing. A valid `TIMED_PAPER_V2` package remains a 200 no-op.

- [ ] **Step 4: Map client recovery outcomes without internal terms**

```ts
export type LegacyLessonRecoveryResult =
  | { state: "READY"; jobId: string | null }
  | { state: "PREPARING"; jobId: string | null }
  | { state: "CONTINUING_SAFELY"; jobId: null };
```

Map all non-ready, non-active outcomes to `CONTINUING_SAFELY`; do not surface a raw error string.

- [ ] **Step 5: Run focused Web tests and typecheck**

Run: `pnpm --filter @iwc/web test -- 'app/api/v1/lessons/[id]/replace/route.test.ts' http-service.test.ts && pnpm --filter @iwc/web typecheck`

Expected: PASS; repeated recovery is one job, old diagnoses always select a skill, ready packages stay unchanged, and client copies remain learner-facing.

- [ ] **Step 6: Commit**

```bash
git add 'apps/web/src/app/api/v1/lessons/[id]/replace/route.ts' 'apps/web/src/app/api/v1/lessons/[id]/replace/route.test.ts' apps/web/src/lib/client/types.ts apps/web/src/lib/client/http-service.ts apps/web/src/lib/client/http-service.test.ts
git commit -m "feat: make focused recovery self-healing"
```

### Task 3: Replace manual recovery pages with automatic preparation and safe continuation

**Files:**

- Create: `apps/web/src/lib/client/focused-recovery.ts`
- Create: `apps/web/src/lib/client/focused-recovery.test.ts`
- Modify: `apps/web/src/app/lesson/page.tsx`
- Modify: `apps/web/src/app/lesson/paper/page.tsx`
- Modify: `apps/web/src/app/lesson/page.module.css`
- Modify: `tests/e2e/lesson.spec.ts`

**Interfaces:**

- Produces `beginFocusedRecovery({ lessonId, load, recover, clock })` with phase `LOADING | PREPARING | CONTINUING_SAFELY | READY`.
- Consumes `LearningClient.getFocusedTeaching` or `getPracticePaper` and `replaceLegacyLesson`.
- Both pages render the same preparing and safe-continuation state; only their successful body differs.

- [ ] **Step 1: Write failing recovery-controller tests**

```ts
it("automatically starts recovery when the loader reports an incomplete package", async () => {
  const recover = vi
    .fn()
    .mockResolvedValue({ state: "PREPARING", jobId: "job-1" });
  const result = await beginFocusedRecovery({
    load: missingTeaching,
    recover,
    clock,
  });
  expect(recover).toHaveBeenCalledOnce();
  expect(result.phase).toBe("PREPARING");
});

it("changes to safe continuation after twenty seconds", async () => {
  const result = await waitForFocusedRecovery(
    preparingRecovery,
    fakeClock.advanceBy(20_000),
  );
  expect(result).toMatchObject({ phase: "CONTINUING_SAFELY" });
});
```

- [ ] **Step 2: Run the controller test to verify it fails**

Run: `pnpm --filter @iwc/web test -- focused-recovery.test.ts`

Expected: FAIL because automatic recovery and the 20-second continuation transition do not exist.

- [ ] **Step 3: Implement the recovery controller and shared learner copy**

```ts
if (isRecoveryRequired(error)) {
  const recovery = await recover(lessonId);
  return recovery.state === "READY"
    ? reload()
    : { phase: "PREPARING", startedAt: clock.now() };
}
```

Poll the page loader while preparing. At 20 seconds return `CONTINUING_SAFELY`, preserve query identity, and show feedback and writing links. A later mount starts the same idempotent check. Remove manual generate/check/retry buttons and copy containing internal failure terms.

- [ ] **Step 4: Write and run browser RED tests**

```ts
test("automatically recovers an old focused lesson and opens its paper", async ({
  page,
}) => {
  await page.goto("/lesson?cycle=cycle-legacy&lesson=lesson-legacy");
  await expect(page.getByText("正在为你准备专项教学")).toBeVisible();
  await expect(page.getByRole("button", { name: /生成|检查/ })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "开始60分钟训练卷" }),
  ).toBeVisible();
});
```

Add equivalent paper-entry, refresh-in-preparation, safe-continuation, no-internal-copy, and ready-package-no-regeneration cases.

- [ ] **Step 5: Implement the page integration and make browser cases pass**

Run: `pnpm test:e2e -- --project=chromium --grep='automatically recovers|safe continuation|focused recovery'`

Expected: PASS; no manual recovery control appears and either route remains useful during a slow recovery.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/client/focused-recovery.ts apps/web/src/lib/client/focused-recovery.test.ts apps/web/src/app/lesson/page.tsx apps/web/src/app/lesson/paper/page.tsx apps/web/src/app/lesson/page.module.css tests/e2e/lesson.spec.ts
git commit -m "feat: automatically recover focused learning pages"
```

### Task 4: Verify migration safety, workspace quality, and Railway behavior

**Files:**

- Modify: `docs/quality/v1-quality-evidence.md`
- Modify: `apps/web/src/lib/server/lesson-recovery-route.test.ts`
- Modify: `tests/e2e/lesson.spec.ts`

**Interfaces:**

- No new runtime interface.
- Confirms `legacyMigrationSnapshot`, existing `paperAnswers`, and ready packages retain their prior values across recovery paths.

- [ ] **Step 1: Add the failing PostgreSQL preservation test**

```ts
it("preserves earlier answers and the evaluation snapshot while recovery becomes ready", async () => {
  const before = await readLegacyLesson(lessonId);
  await runLegacyRecoveryJob(jobId);
  const after = await readLegacyLesson(lessonId);
  expect(after.legacyMigrationSnapshot).toMatchObject({
    paperAnswers: before.paperAnswers,
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement only the missing preservation guard**

Run: `IWC_TEST_DATABASE_URL="$IWC_TEST_DATABASE_URL" pnpm --filter @iwc/web test -- lesson-recovery-route.test.ts`

Expected: the final run passes without changing existing ready packages.

- [ ] **Step 3: Run release-quality checks**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm --filter @iwc/web build && pnpm --filter @iwc/worker build`

Expected: all commands exit 0; lint allows only the repository’s documented Fast Refresh warnings if still present.

- [ ] **Step 4: Deploy and test the real Railway account**

Use the existing authenticated Chrome session. Open the earlier lesson, verify automatic preparation without a recovery control where a migration is required, wait for the teaching article, open the 60-minute paper, reload teaching, and confirm it remains ready. Keep completed answers untouched.

- [ ] **Step 5: Update evidence and commit**

```bash
git add docs/quality/v1-quality-evidence.md apps/web/src/lib/server/lesson-recovery-route.test.ts tests/e2e/lesson.spec.ts
git commit -m "test: verify resilient focused learning recovery"
```
