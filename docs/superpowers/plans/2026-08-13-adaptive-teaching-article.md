# Adaptive Teaching Article Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a constrained AI-generated IELTS teaching article whose structure adapts to one learner micro-skill and render it as a high-quality long-form reading experience.

**Architecture:** The Worker generates an internal blueprint and a learner-facing article from a bounded discriminated block vocabulary, then a deterministic validator enforces teaching value, transfer, scope, and Version 1 non-leakage. The Web receives only the adaptive article, renders its dynamic sections through one generic article renderer, and derives a responsive table of contents from real section data.

**Tech Stack:** TypeScript 7 strict, Next.js 16 App Router, React 19, CSS Modules, OpenAI-compatible structured output schemas, Vitest, Playwright.

## Global Constraints

- Do not locate, highlight, or quote the learner's Version 1 essay on the teaching page.
- Keep the timed eight-question paper contract and route identity unchanged.
- Use 2–5 dynamic sections and 4–8 bounded article blocks.
- Require explanation, demonstration, active output, unseen transfer, and a final self-check through deterministic validation.
- Do not expose IDs, schemas, prompts, models, jobs, confidence gates, or other implementation vocabulary.
- Preserve the existing remote backup tag `backup-before-grammarly-layout-20260813`.
- Do not push this prototype until the user approves the visual result.

---

### Task 1: Adaptive teaching contract and quality validator

**Files:**

- Modify: `apps/worker/src/learning.ts`
- Modify: `apps/worker/src/schemas.ts`
- Modify: `apps/worker/src/practice-paper.test.ts`

**Interfaces:**

- Produces: `AdaptiveTeachingModule`, `TeachingBlueprint`, `TeachingSection`, and the seven discriminated `TeachingBlock` shapes.
- Produces: `validateFocusedLearningPackage(value, version1Essay?)` with block-count, required-outcome, final-summary, unique-anchor, selected-kind, and long-quote checks.

- [ ] Write failing validator tests for two structurally different valid tutorials.
- [ ] Write failing tests for absent explanation, no demonstration, recognition-only practice, no unseen transfer, duplicate anchors, mismatched selected kinds, non-final summary, more than eight blocks, and a 12-word Version 1 quotation.
- [ ] Run `pnpm --filter @iwc/worker test -- practice-paper.test.ts` and confirm the new cases fail on the legacy fixed module.
- [ ] Replace the fixed module types and schema with `ADAPTIVE_ARTICLE_V1` blueprint, section, and block unions.
- [ ] Implement the deterministic validator and non-overlap helper without changing the paper validator.
- [ ] Run Worker typecheck and focused tests to green.

### Task 2: Adaptive generation prompt and persistence

**Files:**

- Modify: `packages/ai/src/pedagogy-knowledge.ts`
- Modify: `packages/ai/src/pedagogy-knowledge.test.ts`
- Modify: `packages/ai/src/prompts.ts`
- Modify: `apps/worker/src/tasks/ai.ts`
- Modify: `apps/web/src/app/api/v1/lessons/[id]/teaching/route.ts`
- Modify: `apps/web/src/app/api/v1/lessons/[id]/replace/route.ts`

**Interfaces:**

- Consumes: `AdaptiveTeachingModule` and `validateFocusedLearningPackage` from Task 1.
- Produces: persisted `teachingModule.format === "ADAPTIVE_ARTICLE_V1"`; teaching route returns only a valid adaptive article and legacy modules return replacement-required.

- [ ] Add failing prompt tests for blueprint-first planning, one micro-skill scope, new examples instead of Version 1 quotation, difficulty-specific strategy, optional blocks, and required unseen transfer.
- [ ] Run AI tests and confirm the legacy fixed-template prompt fails.
- [ ] Update prompt registry version and generation instructions; remove required knowledge-card, expression-bank, worked-example, and fixed-two-check wording.
- [ ] Pass Version 1 into the validator so a long exact quotation rejects the structured output.
- [ ] Persist the new module unchanged beside the existing paper and keep stable server-generated paper item IDs.
- [ ] Reject legacy modules at the teaching route and allow the existing replacement flow to regenerate them.
- [ ] Run AI, Worker, and Web route tests and typechecks to green.

### Task 3: Client contract and two adaptive fixtures

**Files:**

- Modify: `apps/web/src/lib/client/types.ts`
- Modify: `apps/web/src/lib/client/http-service.test.ts`
- Modify: `apps/web/src/lib/client/mock-service.ts`

**Interfaces:**

- Produces: discriminated `TeachingBlock` client union and `FocusedTeachingData` adaptive-article shape.
- Produces: one mechanism-chain demo containing explanation, contrast, reasoning, practice, and summary; tests include a second structurally different vocabulary-control fixture.

- [ ] Update the HTTP client test first with the adaptive article payload and assert no `/start` request occurs.
- [ ] Run the client test and confirm TypeScript/test failure against the fixed interface.
- [ ] Add the client block types and adaptive `FocusedTeachingData` contract.
- [ ] Replace demo fixed fields with a dynamic section list using newly generated examples and no Version 1 text.
- [ ] Add a second fixture in renderer tests whose section count and block kinds differ.
- [ ] Run Web client tests and typecheck to green.

### Task 4: Generic article renderer and responsive contents

**Files:**

- Create: `apps/web/src/app/lesson/teaching-article.tsx`
- Modify: `apps/web/src/app/lesson/page.tsx`
- Replace: `apps/web/src/app/lesson/page.module.css`
- Modify: `tests/e2e/lesson.spec.ts`

**Interfaces:**

- Consumes: `FocusedTeachingData` and the block union from Task 3.
- Produces: `[data-teaching-article]`, `[data-teaching-section]`, `[data-teaching-toc]`, `[data-teaching-toc-toggle]`, and block-specific semantic selectors.

- [ ] Add failing browser checks for one article landmark, no nested main, no fixed section names, data-driven section order, 680–760px prose width, readable type, right sticky contents, current-section state, collapsed mobile contents, no original essay wording, and no horizontal overflow.
- [ ] Run focused Chromium tests and confirm failure on the fixed card page.
- [ ] Build `TeachingArticle` with one switch over the bounded block union; keep practice answer/reveal state inside the renderer.
- [ ] Reduce the route page to loading/replacement/routing responsibilities and render the article component.
- [ ] Replace card-grid CSS with one continuous article canvas, dynamic right contents, restrained semantic callouts, and a single high-weight final action area.
- [ ] Use an IntersectionObserver to set `aria-current="location"`; clicking a contents item must update the same state immediately and retain keyboard focus.
- [ ] Run Chromium, Firefox, WebKit, and mobile focused tests to green.

### Task 5: Full verification and user preview

**Files:**

- Modify only files implicated by verified failures.

- [ ] Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- [ ] Run focused-teaching and app-shell Playwright coverage across Chromium, Firefox, WebKit, and mobile.
- [ ] Run Web and Worker production builds.
- [ ] Visually inspect 1440px and 1280px with the product sidebar expanded and collapsed, plus 768px and 390px.
- [ ] Verify first-section position, article line width, TOC height, current location, quick-check reveal, route identity, and absence of backend vocabulary.
- [ ] Open the local tutorial URL for the user without pushing the prototype.
