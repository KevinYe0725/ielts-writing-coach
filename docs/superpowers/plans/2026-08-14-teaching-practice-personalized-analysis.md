# Tutorial Practice Personalized Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add recoverable, evidence-based analysis of tutorial practice answers without ever gating the timed practice paper or changing mastery state.

**Architecture:** A dedicated `teaching_practice_response` resource stores one immutable submitted answer per tutorial prompt and a projected analysis result. Choice prompts are analysed deterministically; short-text prompts enqueue a new `teaching_practice_analysis` AI task that reuses provider routing and durable jobs but has no connection to formal exercise attempts, skill evidence, or cycle transitions. The client shows the submitted answer and static reference immediately, then hydrates optional personalized analysis through the existing job wait/poll infrastructure.

**Tech Stack:** TypeScript 7 strict, Next.js 16 App Router, React 19, PostgreSQL 17, Drizzle ORM, Graphile Worker, OpenAI-compatible structured output, Vitest, Playwright.

## Global Constraints

- Personalized analysis is optional teaching feedback, never a score or completion gate.
- The timed-paper link remains enabled before submission and during every analysis status.
- Analysis success, failure, timeout, low confidence, missing AI configuration, and Mock mode cannot mutate TrainingCycle, Lesson, Rewrite, Transfer, or UserSkillState.
- No SkillEvidenceEvent may be created from tutorial-practice analysis.
- Reference answers are “one possible answer,” never the sole accepted wording.
- Retries re-analyse the immutable submitted answer; they do not create another answer version and have no learner-facing attempt limit.
- AIJob contains protected IDs only; learner answers and reference material remain in protected database rows.
- Learner-facing responses never expose task, model, route, schema, confidence-gate, retry-count, or provider internals.
- Mock mode demonstrates structure and never claims to judge real English quality.

---

### Task 1: Dedicated data resource and non-blocking server contract

**Files:**

- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/drizzle/0011_teaching_practice_analysis.sql`
- Create/Modify: `packages/db/drizzle/meta/0011_snapshot.json`
- Modify: `packages/db/drizzle/meta/_journal.json`
- Create: `apps/web/src/lib/server/teaching-practice-analysis.ts`
- Create: `apps/web/src/lib/server/teaching-practice-analysis.test.ts`

**Interfaces:**

- Produces `teachingPracticeResponse` with stable UUID, `lessonPlanId`, `userId`, `promptId`, immutable `submittedAnswer`, `responseMode`, `status`, nullable `aiJobId`, nullable projected `analysis`, timestamps, and unique `(lesson_plan_id,user_id,prompt_id)`.
- Produces `findTeachingPrompt(paperContent, promptId)` that returns the exact canonical tutorial prompt or `null`.
- Produces `projectTeachingPracticeAnalysis(value)` that allowlists the learner-facing result.
- Produces a deterministic choice analysis that never invokes AI.

- [ ] Write a failing real-PostgreSQL test proving duplicate submission returns the same response and cannot overwrite `submittedAnswer`.
- [ ] Write failing pure tests proving prompt lookup cannot read timed-paper items and projected analysis drops unknown/internal fields.
- [ ] Run the focused tests and verify the missing schema/table/helper behavior fails for the intended reason.
- [ ] Add the Drizzle table, migration, relations/exports, strict prompt lookup, projection, and deterministic choice analysis.
- [ ] Re-run focused DB/server tests and typecheck to green.
- [ ] Commit Task 1 files with message `Add isolated tutorial practice responses`.

### Task 2: Versioned AI task and append-only analysis worker

**Files:**

- Modify: `packages/ai/src/prompts.ts`
- Modify: `packages/ai/src/pedagogy-knowledge.ts`
- Modify: `packages/ai/src/pedagogy-knowledge.test.ts`
- Modify: `packages/ai/src/mock.ts`
- Modify: `packages/ai/src/mock.test.ts`
- Modify: `apps/worker/src/schemas.ts`
- Modify: `apps/worker/src/tasks/ai.ts`
- Create: `apps/worker/src/tasks/ai.teaching-practice-analysis.test.ts`

**Interfaces:**

- Adds `teaching_practice_analysis` to `AITaskKind` and `PROMPT_REGISTRY`.
- Produces `TeachingPracticeAnalysisJudgment` with bilingual summary, at most two bilingual strengths, one key gap, why it matters, `improvedAnswerEn`, one bilingual next check, exact `userAnswerEvidence`, `confidence`, and optional uncertainty text.
- Worker consumes only `protectedReference.teachingPracticeResponseId`, reads the response and canonical tutorial prompt, verifies evidence spans against the immutable answer, and updates only `teachingPracticeResponse`.

- [ ] Add failing prompt/schema tests for alternative valid wording, no fabricated weakness, one highest-value change, exact answer evidence, and explicit uncertainty.
- [ ] Add failing Worker tests proving success persists projected analysis and creates no SkillEvidenceEvent or state update.
- [ ] Add failing Worker tests for low confidence and Mock mode: both become learner-safe non-gating results, never mastery evidence.
- [ ] Run focused AI/Worker tests and confirm failures come from the missing task/schema/handler.
- [ ] Implement the task registry, knowledge guidance, strict schema, Mock demonstration result, Worker handler, exact-evidence filtering, and idempotent result persistence.
- [ ] Re-run AI/Worker tests, lint, and typecheck to green.
- [ ] Commit Task 2 files with message `Analyze tutorial practice answers asynchronously`.

### Task 3: Authenticated idempotent API and retry semantics

**Files:**

- Create: `apps/web/src/app/api/v1/lessons/[id]/teaching-practice/[promptId]/responses/route.ts`
- Create: `apps/web/src/app/api/v1/lessons/[id]/teaching-practice/[promptId]/responses/route.test.ts`
- Create: `apps/web/src/app/api/v1/teaching-practice-responses/[id]/retry/route.ts`
- Modify: `apps/web/src/lib/server/jobs.ts`
- Modify: `apps/web/src/app/api/v1/model-routes/route.ts`
- Modify: `apps/web/src/lib/client/types.ts`
- Modify: `apps/web/src/lib/client/http-service.ts`
- Modify: `apps/web/src/lib/client/http-service.test.ts`
- Modify: `apps/web/src/lib/client/mock-service.ts`

**Interfaces:**

- `POST .../responses` accepts strict bounded `{answer:string}` with `Idempotency-Key`, verifies ownership and tutorial prompt identity, locks or creates one response, returns `200` for deterministic choice or `202` with optional learner-safe analysis state for short text.
- `GET .../responses` restores the immutable submitted answer and current projected analysis without exposing AI internals.
- `POST .../retry` reuses the same response and queues a fresh analysis only when appropriate; it has no manual-attempt counter and never blocks the paper.
- Adds `submitTeachingPracticeAnswer`, `getTeachingPracticeResponse`, and `retryTeachingPracticeAnalysis` to `LearningClient`.

- [ ] Write failing route tests for ownership, bounded input, idempotent immutable answers, deterministic choice, missing AI, queued AI, safe GET projection, and unlimited same-answer analysis retry semantics.
- [ ] Write failing client tests proving job failures return a recoverable analysis state rather than throwing away the static answer/reference experience.
- [ ] Run focused route/client tests and verify the expected missing-endpoint failures.
- [ ] Implement strict routes using existing security/idempotency helpers; enqueue the dedicated task by protected response ID only.
- [ ] Add the new task to advanced model routing while preserving fallback defaults.
- [ ] Implement Http and Mock clients; Mock short-text response must be labeled demonstration-only.
- [ ] Re-run route/client tests, Web typecheck, and lint to green.
- [ ] Commit Task 3 files with message `Expose non-blocking tutorial answer analysis`.

### Task 4: Article interaction and every-status non-gating browser proof

**Files:**

- Modify: `apps/web/src/app/lesson/teaching-article.tsx`
- Modify: `apps/web/src/app/lesson/page.module.css`
- Modify: `tests/e2e/lesson.spec.ts`

**Interfaces:**

- `PracticePrompt` submits one immutable answer, immediately reveals “your answer,” “one possible answer,” and reference reasoning, then independently renders loading/success/unavailable/demo analysis.
- Optional rewrite state never overwrites the submitted answer.
- The primary paper `ActionLink` remains independent of every practice-analysis state.

- [ ] Add failing Chromium tests that submit a short-text answer and immediately see both answers before AI analysis completes.
- [ ] Add a table-driven failing browser test for loading, failed, blocked/unconfigured, low-confidence, Mock/demo, and success; in every row assert the paper link remains enabled and navigable.
- [ ] Add failing tests for personalized strengths/gap/improved answer, optional rewrite, refresh recovery, no scores/pass-fail/backend vocabulary, and 390px single-column order.
- [ ] Run the focused tests and confirm they fail on the current static reveal behavior.
- [ ] Implement submitted-answer snapshots, asynchronous analysis state, safe retry, optional rewrite, and article-style result presentation.
- [ ] Keep reveal/reference available synchronously and keep the paper action outside all analysis branches.
- [ ] Run Chromium, Firefox, WebKit, mobile, and axe-focused tests to green.
- [ ] Commit Task 4 files with message `Teach from the learner's tutorial answer`.

### Task 5: Full verification and release-quality review

**Files:**

- Modify only files implicated by verified failures.

- [ ] Run all migrations against an isolated PostgreSQL 17 database and verify rollback-free upgrade from migration 0010.
- [ ] Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` with Node 24.
- [ ] Run Web and Worker production builds.
- [ ] Run focused tutorial-analysis and sidebar Playwright flows across Chromium, Firefox, WebKit, and mobile.
- [ ] Perform a direct data audit proving zero SkillEvidenceEvent/UserSkillState/TrainingCycle changes after success, failure, retry, low confidence, and Mock cases.
- [ ] Inspect 1440px and 390px layouts, loading and unavailable copy, keyboard focus, and no internal vocabulary.
- [ ] Request an independent spec/code review and remediate all P0/P1/P2 findings.
- [ ] Leave the local preview running and open the tutorial URL for user acceptance; do not push until the user approves.
