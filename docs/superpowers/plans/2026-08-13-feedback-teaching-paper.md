# Feedback → Teaching → Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a detailed evidence-linked correction report, a focused teaching module, and a same-target timed practice paper.

**Architecture:** Extend the existing JSONB lesson payload with a validated teaching module generated alongside the paper. Keep the immutable essay and issue offsets as the source of truth, add richer diagnosis fields through backward-compatible JSON, and split teaching and timed paper into distinct routes.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Drizzle/PostgreSQL JSONB, existing AI provider adapters and structured outputs, Vitest, Playwright.

## Global Constraints

- IELTS bands remain cautious AI estimates, never official grades.
- Every correction is grounded in exact Version 1 evidence.
- Teaching and paper share one core skill and one success description.
- Opening teaching must not start the timed paper.
- No complete model essay is revealed before Version 2.
- No backend IDs, prompt fields, schemas, jobs, or confidence gates appear in learner-facing copy.

---

### Task 1: Learning package contracts

**Files:**

- Modify: `apps/worker/src/learning.ts`
- Modify: `apps/worker/src/schemas.ts`
- Test: `apps/worker/src/practice-paper.test.ts`

**Interfaces:**

- Produces: `FocusedTeachingModule`, `FocusedLearningPackage`, `validateFocusedLearningPackage()`.
- Consumes: the current eight-question `PracticePaperContent` contract.

- [ ] Add failing tests for a complete teaching module, target mismatch, missing worked-example reasoning, and invalid expression-bank entries.
- [ ] Run the worker test and confirm it fails because the package validator does not exist.
- [ ] Add the minimal types, schema, and deterministic validator.
- [ ] Run the worker test and confirm it passes.

### Task 2: AI generation and richer diagnosis

**Files:**

- Modify: `packages/ai/src/pedagogy-knowledge.ts`
- Modify: `packages/ai/src/prompts.ts`
- Modify: `packages/ai/src/mock.ts`
- Modify: `apps/worker/src/tasks/ai.ts`
- Modify: `apps/worker/src/schemas.ts`
- Test: `packages/ai/src/pedagogy-knowledge.test.ts`
- Test: `packages/ai/src/mock.test.ts`

**Interfaces:**

- Produces: one stored learning package containing `teachingModule` and `paper`.
- Produces: structured issue diagnosis fields inside the existing diagnosis JSONB.

- [ ] Add failing tests requiring detailed correction fields and a teaching-before-testing prompt contract.
- [ ] Confirm failures identify missing prompt/schema behavior.
- [ ] Extend structured generation, deterministic Mock output, persistence mapping, and versions.
- [ ] Run AI and worker tests to green.

### Task 3: Detailed feedback model and page

**Files:**

- Modify: `apps/web/src/lib/client/types.ts`
- Modify: `apps/web/src/lib/client/http-service.ts`
- Modify: `apps/web/src/lib/client/mock-service.ts`
- Modify: `apps/web/src/app/feedback/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/lib/client/http-service.test.ts`

**Interfaces:**

- Produces: `FeedbackData.prompt`, `FeedbackData.originalEssay`, paragraph notes, small leaks, and richer issue corrections.

- [ ] Add failing protocol tests for original essay, exact correction fields, and safe legacy fallbacks.
- [ ] Confirm the tests fail on the current compact feedback model.
- [ ] Extend mapping and render original-text, paragraph, sentence, and foundational-error sections.
- [ ] Run Web unit tests to green.

### Task 4: Focused teaching page and separate paper route

**Files:**

- Create: `apps/web/src/app/api/v1/lessons/[id]/teaching/route.ts`
- Create: `apps/web/src/app/lesson/paper/page.tsx`
- Modify: `apps/web/src/app/lesson/page.tsx`
- Modify: `apps/web/src/lib/client/types.ts`
- Modify: `apps/web/src/lib/client/http-service.ts`
- Modify: `apps/web/src/lib/client/mock-service.ts`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/lib/client/http-service.test.ts`

**Interfaces:**

- Produces: `getFocusedTeaching(cycleId, lessonId)` and a teaching page that never calls lesson start.
- Consumes: `getPracticePaper()` only from `/lesson/paper`.

- [ ] Add failing tests proving teaching does not call `/start` and returns the saved teaching package.
- [ ] Confirm failures on the missing teaching client/API.
- [ ] Implement the teaching endpoint, model, page, fallback content, and move the existing paper UI to `/lesson/paper`.
- [ ] Run Web tests to green.

### Task 5: Navigation and browser acceptance

**Files:**

- Modify: `apps/web/src/lib/client/learning-navigation.ts`
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/app/feedback/page.tsx`
- Modify: `tests/e2e/lesson.spec.ts`
- Test: `apps/web/src/lib/client/learning-navigation.test.ts`

**Interfaces:**

- Produces: report → teaching → paper routes with stable cycle and lesson IDs.

- [ ] Add failing navigation and browser tests for three-stage routing and timer isolation.
- [ ] Confirm the current direct-to-paper flow fails those assertions.
- [ ] Update destination labels, links, report CTA, teaching CTA, and paper back-links.
- [ ] Run unit and Chromium tests to green.

### Task 6: Final verification and knowledge maintenance

**Files:**

- Modify: `docs/knowledge-base/feedback-and-revision.md`
- Modify: `docs/knowledge-base/practice-paper-design.md`
- Modify: `.agents/skills/coach-ielts-writing/SKILL.md`
- Modify: `.agents/skills/coach-ielts-writing/references/lesson-design.md`

**Interfaces:**

- Documents the canonical three-stage flow for Web and Skill users.

- [ ] Update the knowledge base and Skill to include the focused teaching stage.
- [ ] Run typecheck, lint, unit/integration tests, production builds, and the four-browser lesson suite.
- [ ] Inspect report, teaching, and paper in a real browser at desktop and mobile widths.
- [ ] Record the final verified behavior without claiming official IELTS calibration.
