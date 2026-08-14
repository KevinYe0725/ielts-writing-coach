# Feedback Annotations and Collapsible Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair multi-line feedback annotations and add a persistent desktop sidebar toggle that expands the learning workspace.

**Architecture:** Source evidence remains an exact immutable text segment, but its interactive surface becomes a focusable inline mark with explicit keyboard handling and annotation-kind styling. AppShell owns one local desktop preference, projects it through data attributes, and CSS removes the sidebar from layout while widening the main content. Container queries let dense learning pages respond to the content space actually available.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, CSS Modules, Vitest, Playwright.

## Global Constraints

- Do not mutate Version 1 text or loosen exact-offset validation.
- Do not expose backend fields in learner UI.
- Keep mobile navigation behaviour unchanged at 960px and below.
- Preserve the remote backup tag `backup-before-grammarly-layout-20260813`.
- Keep the redesign local until the user asks to publish it.

---

### Task 1: Multi-line source annotations

**Files:**

- Modify: `apps/web/src/app/feedback/page.tsx`
- Modify: `apps/web/src/app/feedback/feedback.module.css`
- Modify: `tests/e2e/lesson.spec.ts`

**Interfaces:**

- Produces: focusable `[data-issue-highlight]` inline marks with `data-annotation-kind`, `aria-pressed`, click, Enter and Space activation.

- [ ] Add a browser regression asserting the long development annotation has multiple client rectangles, contains no button, keeps the same rectangles before/after activation and remains keyboard-operable.
- [ ] Run the focused Chromium test and confirm it fails because the current mark contains an inline-block button.
- [ ] Replace the nested button with one focusable inline mark and implement keyboard activation.
- [ ] Replace border drawing with kind-specific multi-line text decoration.
- [ ] Run Chromium, Firefox, WebKit and mobile annotation tests to green.

### Task 2: Persistent desktop sidebar toggle

**Files:**

- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/app/globals.css`
- Create: `tests/e2e/app-shell.spec.ts`

**Interfaces:**

- Produces: `#primary-sidebar`, `[data-app-shell]`, `[data-sidebar-state]` and `[data-sidebar-toggle]`.
- Persists: localStorage key `iwc:sidebar-collapsed:v1` with value `true` only when collapsed.

- [ ] Add browser regressions for default expanded state, hide/show, focus retention, width growth, reload/route persistence and unaffected mobile navigation.
- [ ] Run the focused Chromium test and confirm it fails because no toggle exists.
- [ ] Add AppShell state initialization, safe local persistence and Topbar toggle semantics.
- [ ] Add CSS that removes the hidden sidebar, widens main content to 1320px and hides the desktop toggle at mobile widths.
- [ ] Run Chromium, Firefox, WebKit and mobile shell tests to green.

### Task 3: Content-aware split layouts and AI span precision

**Files:**

- Modify: `apps/web/src/app/feedback/feedback.module.css`
- Modify: `apps/web/src/app/lesson/page.module.css`
- Modify: the existing IELTS assessment prompt registry location identified in `apps/worker/src/tasks/ai.ts`
- Modify: focused prompt/contract tests beside the assessment generator.

**Interfaces:**

- Consumes: widened `.main-content` container.
- Produces: split layouts based on actual page container width and assessment instructions requesting minimum exact actionable spans.

- [ ] Add a layout regression proving a hidden sidebar produces a readable two-column workbench without horizontal overflow.
- [ ] Add a prompt regression requiring minimum exact spans and context-span treatment for missing development.
- [ ] Run both tests and confirm their expected failures.
- [ ] Add container-query layout rules and the minimal prompt instruction.
- [ ] Run Web and Worker focused tests to green.

### Task 4: Release verification

**Files:**

- Modify only files implicated by verified failures.

- [ ] Run full workspace unit tests, typecheck and lint.
- [ ] Run feedback, teaching and app-shell Playwright coverage in Chromium, Firefox, WebKit and mobile.
- [ ] Run the Web and Worker production builds.
- [ ] Visually inspect desktop expanded/collapsed and 390px feedback views.
- [ ] Run targeted Prettier and `git diff --check`.
