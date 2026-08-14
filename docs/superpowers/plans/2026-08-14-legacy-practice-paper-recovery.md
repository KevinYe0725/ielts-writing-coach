# Legacy Practice-Paper Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade historical focused-training records into current teaching and complete-paper records without data loss, including records that lack newer diagnosis fields.

**Architecture:** Resolve the recovery target skill from the current cycle or the old lesson, queue exactly one recovery request, and make no destructive route-time change. The worker validates a full package before atomically updating the existing lesson and saving a private legacy snapshot. Learners can retry or return to feedback at every terminal state.

**Tech Stack:** Next.js 16, TypeScript, Drizzle/PostgreSQL 17, Graphile Worker, Vitest, Playwright.

## Global Constraints

- Work on `main`: the user explicitly authorized the production branch.
- Preserve historical lesson content, answers, evaluations, and jobs.
- A missing diagnosis produces only a generic skill recovery, never a fabricated personal diagnosis.
- Learners never see backend terminology and always retain retry plus feedback navigation.
- Use Node.js 24.14+ and synchronize every migration with its Drizzle metadata and schema descriptor.
- Every behavior begins as a failing test.

---

### Task 1: Add a private legacy snapshot

**Files:** `packages/db/src/schema.ts`, `packages/db/drizzle/0012_legacy_practice_recovery.sql`, `packages/db/drizzle/meta/_journal.json`, generated 0012 metadata snapshot, `packages/db/src/schema-version.ts`, `packages/db/src/schema.test.ts`.

**Interface:** Add `lessonPlan.legacyMigrationSnapshot`, a nullable private JSON value containing the legacy practice format, content, answers, result, submission time, runtime state, capture time, and migration version.

- [ ] **Step 1: Write the failing schema test.** Assert that `lessonPlan.legacyMigrationSnapshot` exists, `DATABASE_SCHEMA_VERSION` is `0012_legacy_practice_recovery`, and migration count is 13.
- [ ] **Step 2: Verify RED.** Run `pnpm --filter @iwc/db test -- schema.test.ts`; it must fail because the field and 0012 descriptor do not exist.
- [ ] **Step 3: Implement the forward-only column.** Add the nullable Drizzle JSON column; create `ALTER TABLE "lesson_plan" ADD COLUMN "legacy_migration_snapshot" jsonb;`; update generated journal/snapshot/descriptor with exact values.
- [ ] **Step 4: Verify GREEN.** Run `pnpm --filter @iwc/db test -- schema.test.ts && pnpm --filter @iwc/db migrate`; both must pass on a clean database.
- [ ] **Step 5: Commit.** Stage the schema, migration metadata, descriptor, and test; commit `feat: preserve legacy practice snapshots`.

### Task 2: Queue recovery without deleting old records

**Files:** `apps/web/src/app/api/v1/lessons/[id]/replace/route.ts`, `apps/web/src/app/api/v1/lessons/[id]/teaching/route.test.ts`.

**Interface:** `POST /lessons/:id/replace` resolves `skillId` as `cycle.coreSkillId ?? plan.coreSkillId`; it queues one `exercise_generation` job with `{ lessonPlanId, migrationMode: "LEGACY_RECOVERY", cycleId, skillId, attemptId?, assessmentId? }` and returns 202. A valid current package remains 200.

- [ ] **Step 1: Write failing tests.** Create a legacy plan with `coreSkillId: "mechanism_chain"`, a cycle with `coreSkillId: null`, and no assessment. Assert 202, a job reference containing the legacy plan ID and recovery mode, and zero calls to `transaction.delete`. Add active-job reuse, idempotent replay, and unknown-skill no-mutation cases.
- [ ] **Step 2: Verify RED.** Run `pnpm --filter @iwc/web test -- 'teaching/route.test.ts'`; it must fail with diagnosis-required or request-time deletion.
- [ ] **Step 3: Implement minimal safe route logic.** Validate the resolved skill, reuse a queued/waiting recovery job for the same plan, and enqueue with a stable `practice-paper:<planId>:legacy-recovery` key. Remove deletion of the plan, objectives, and historical jobs. Do not change cycle status before worker success.
- [ ] **Step 4: Verify GREEN.** Re-run the route test; all historical cases must return recoverable responses and preserve old rows.
- [ ] **Step 5: Commit.** Stage changed route/tests; commit `fix: recover legacy practice papers safely`.

### Task 3: Convert the existing lesson only after package validation

**Files:** `apps/worker/src/tasks/ai.ts`, `apps/worker/src/tasks/ai.lesson-generation.test.ts`, and `apps/worker/src/schemas.ts` only if protected-reference typing requires it.

**Interface:** For `migrationMode: "LEGACY_RECOVERY"`, the worker writes a current package to the existing plan ID and writes one snapshot only after `validateFocusedLearningPackage` succeeds. Missing assessment uses `MIGRATED_LEGACY_FALLBACK`; any adapter/validation failure writes no lesson or cycle state.

- [ ] **Step 1: Write failing worker tests.** Assert that a recovery job without assessment sends fallback context; an adapter throw invokes no lesson/cycle mutation; successful recovery updates (not inserts) the existing plan, creates one snapshot, and keeps the plan ID.
- [ ] **Step 2: Verify RED.** Run `pnpm --filter @iwc/worker test -- ai.lesson-generation.test.ts`; it must fail because generation currently requires assessment, exits when a plan exists, and inserts a new plan.
- [ ] **Step 3: Implement recovery branch.** Build selected-evidence, assessment-summary, or fallback context; in recovery mode fetch the exact existing plan instead of early-returning for an existing plan. Generate and validate before opening the write transaction. Update the plan, snapshot only if null, repair missing cycle skill, and update cycle readiness only after all persistence succeeds.
- [ ] **Step 4: Verify GREEN.** Re-run worker tests; generic fallback must be truthful and failures must leave legacy records unchanged.
- [ ] **Step 5: Commit.** Stage worker code/tests; commit `feat: convert legacy papers after validated generation`.

### Task 4: Make the recovery state non-blocking in teaching and paper pages

**Files:** `apps/web/src/lib/client/http-service.ts`, `apps/web/src/lib/client/types.ts`, `apps/web/src/app/lesson/page.tsx`, `apps/web/src/app/lesson/paper/page.tsx`, `apps/web/src/lib/client/http-service.test.ts`, `tests/e2e/lesson.spec.ts`.

**Interface:** `replaceLegacyLesson` returns a structured recovery result for queued, blocked, failed, and ready states. Both pages show only learner-facing copy and retain a feedback link carrying the cycle identity.

- [ ] **Step 1: Write failing client/browser tests.** Click “生成新的专项教学和训练卷” for a legacy plan whose generation is unavailable. Assert “原有训练记录已保留”, a feedback-report link, a retry control, and no `job`, `provider`, `schema`, or `diagnosis` text. Assert the paper page never says “删除旧训练”. Add completed-request and active-request-reuse cases.
- [ ] **Step 2: Verify RED.** Run `pnpm --filter @iwc/web test -- http-service.test.ts` and the Chromium `legacy recovery` Playwright subset; the old client must block/throw and the old copy must fail.
- [ ] **Step 3: Implement UI recovery.** Stop waiting destructively for terminal generation outcomes; normalize them to the fixed recovery state. Use “生成新的专项教学和训练卷”, “稍后重试”, and a cycle-preserving feedback link on both pages.
- [ ] **Step 4: Verify GREEN.** Re-run the client and browser subsets; every legacy state must retain a safe next step and normal paper behavior must remain intact.
- [ ] **Step 5: Commit.** Stage client/UI/tests; commit `fix: keep legacy practice recovery non-blocking`.

### Task 5: Validate migration, worker, and browser safety

**Files:** Mark completed checkboxes in this plan only after evidence exists.

- [ ] **Step 1: Run package suites.** Run `pnpm --filter @iwc/db test`, `pnpm --filter @iwc/web test`, and `pnpm --filter @iwc/worker test`; require legacy and current generation coverage to pass.
- [ ] **Step 2: Run static checks.** Run `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`; report any unrelated pre-existing failure rather than hiding it.
- [ ] **Step 3: Run browser regression.** Run `pnpm exec playwright test tests/e2e/lesson.spec.ts --project=chromium`; require normal paper, recovery success, fallback, retry, and feedback navigation.
- [ ] **Step 4: Compare fresh evidence to the approved design.** Confirm no request-time delete, fallback without assessment, active-job dedupe, snapshot-after-validation only, retained old data on failure, and no backend language.
- [ ] **Step 5: Commit the completed plan record.** Stage this plan; commit `test: verify legacy practice recovery`.

## Execution record

- 2026-08-14: Task 1 completed in commit `7c8264c`; an isolated PostgreSQL 17.6 migration run verified the 0012 schema boundary.
- 2026-08-14: Task 2 completed in commit `7421e8b`; the regression fixture reproduces a legacy cycle with neither current skill nor assessment and verifies zero request-time deletes plus active-job reuse.
- 2026-08-14: Task 3 completed in commits `a197eab` and `069dba2`; worker tests cover generic fallback, no-write failure, in-place update, snapshot preservation, and no fabricated personal diagnosis.
- 2026-08-14: Task 4 completed in commit `b1b2225`; the client returns non-blocking recovery states and both legacy pages preserve feedback navigation and remove deletion language.
- 2026-08-14: Task 5 verification: full workspace tests passed (572 tests), full typecheck passed, lint had 0 errors and 3 pre-existing Fast Refresh warnings, global formatting passed, a fresh PostgreSQL 17.6 migration plus DB suite passed, and Chromium lesson regression passed 24 with 22 intentional HTTP-mode skips against the existing local server.
