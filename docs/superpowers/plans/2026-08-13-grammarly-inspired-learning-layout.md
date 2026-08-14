# Grammarly-Inspired Learning Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an evidence-linked two-column feedback workbench and a two-column focused-teaching reader with robust mobile fallbacks.

**Architecture:** Add a pure annotation helper that converts exact immutable essay offsets into renderable segments. Keep feedback and teaching data contracts unchanged except for exposing existing issue offsets to the Web client. Compose the two pages from semantic panels and CSS responsive layouts; Playwright verifies interaction and geometry.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, CSS, Vitest, Playwright.

## Global Constraints

- Preserve the GitHub checkpoint `backup-before-grammarly-layout-20260813`.
- Do not copy Grammarly branding or assets.
- Do not change assessment, teaching or paper pedagogy.
- Do not expose backend metadata.
- Treat the submitted essay as immutable.
- Collapse below 1280px into one column; at phone widths default feedback to the Suggestions tab with an Original tab available.

---

### Task 1: Exact feedback annotations

**Files:**

- Create: `apps/web/src/lib/client/feedback-annotations.ts`
- Create: `apps/web/src/lib/client/feedback-annotations.test.ts`
- Modify: `apps/web/src/lib/client/types.ts`
- Modify: `apps/web/src/lib/client/http-service.ts`
- Modify: `apps/web/src/lib/client/mock-service.ts`

**Interfaces:**

- Produces: `buildFeedbackSegments(essay, issues): FeedbackTextSegment[]`.
- Adds: `FeedbackIssue.startOffset: number | null` and `endOffset: number | null`.

- [x] Write tests for exact offsets, historical unique-text fallback, ambiguous text, invalid ranges and overlap rejection.
- [x] Run the focused Vitest file and confirm failure because the helper does not exist.
- [x] Implement the smallest pure segment builder and expose persisted offsets through both clients.
- [x] Run the focused and Web client tests to green.

### Task 2: Feedback workbench

**Files:**

- Modify: `apps/web/src/app/feedback/page.tsx`
- Create: `apps/web/src/app/feedback/feedback.module.css`
- Modify: `tests/e2e/lesson.spec.ts`

**Interfaces:**

- Consumes: `buildFeedbackSegments` and offset-bearing `FeedbackIssue`.
- Produces: `data-feedback-workbench`, `data-essay-pane`, `data-suggestion-panel`, `data-issue-highlight`, and `data-issue-card` interaction surfaces.

- [x] Add Playwright expectations for desktop column geometry, exact highlight count, card-to-source and source-to-card synchronisation, keyboard activation and absence of backend vocabulary.
- [x] Run the focused Chromium test and confirm it fails on the old vertical report.
- [x] Recompose the report into a sticky document pane and progressive-disclosure suggestion feed without removing downstream report sections.
- [x] Add responsive CSS and run Chromium plus mobile tests to green.

### Task 3: Focused-teaching reader

**Files:**

- Modify: `apps/web/src/app/lesson/page.tsx`
- Create: `apps/web/src/app/lesson/page.module.css`
- Modify: `tests/e2e/lesson.spec.ts`

**Interfaces:**

- Produces: `data-teaching-layout`, an accessible `专项教学目录`, and stable section anchors.

- [x] Add Playwright expectations for desktop two-column geometry, six outline links, anchor navigation, mobile one-column geometry and an absent paper timer.
- [x] Run the focused browser test and confirm failure on the old card grid.
- [x] Build the sticky target/outline rail and focused content column using existing teaching data.
- [x] Run Chromium and mobile focused tests to green.

### Task 4: Cross-browser and release verification

**Files:**

- Modify only files implicated by verified failures.

- [x] Run all feedback/teaching/paper Playwright tests in Chromium, Firefox, WebKit and mobile.
- [x] Run Web and workspace unit tests, typecheck and lint.
- [x] Run Web production build and `git diff --check`; Worker/Skill code was unchanged from the backed-up baseline.
- [x] Visually inspect desktop and mobile screenshots, checking density, sticky behaviour, focus and overflow.
- [x] Report the backup tag and the new preview URL; do not push the redesign until explicitly requested.
