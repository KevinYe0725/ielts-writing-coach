# Writing Knowledge and Practice UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a source-backed teaching knowledge base, connect it to AI prompts, repair learning navigation, expose the source report from the paper, and simplify each practice question.

**Architecture:** Markdown files preserve the auditable research synthesis; a small TypeScript module supplies versioned task-specific runtime guidance. Today returns available resource identities, a pure navigation builder maps them to URLs, and the lesson page uses the existing cycle identity to open feedback while keeping its local answer journal.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Playwright, PostgreSQL/Drizzle, provider-agnostic structured AI adapters.

## Global Constraints

- IELTS scores remain cautious AI estimates, never official results.
- Official IELTS sources outrank research synthesis and teaching examples.
- No learner-facing backend terms, IDs, prompt metadata, model jobs, routes, schemas, confidence gates, or criterion weights.
- No hidden marking requirement may be absent from the visible question instruction.
- Preserve current uncommitted user work and `docs/prd/`.

---

### Task 1: Source-backed knowledge base

**Files:**

- Create: `docs/knowledge-base/README.md`
- Create: `docs/knowledge-base/source-register.md`
- Create: `docs/knowledge-base/scoring-and-diagnosis.md`
- Create: `docs/knowledge-base/feedback-and-revision.md`
- Create: `docs/knowledge-base/practice-paper-design.md`
- Create: `docs/knowledge-base/diagnostic-casebook.md`

- [ ] Record source authority, applicable claim, limits, and product consequence.
- [ ] Convert research into report, question, and evaluation rules.
- [ ] Add original diagnostic cases covering grammar, collocation, information perspective, logic, and cohesion.

### Task 2: Runtime pedagogy projection

**Files:**

- Create: `packages/ai/src/pedagogy-knowledge.ts`
- Create: `packages/ai/src/pedagogy-knowledge.test.ts`
- Modify: `packages/ai/src/prompts.ts`
- Modify: `packages/ai/src/index.ts`

- [ ] Write a failing test that each AI task receives only its relevant guidance and that learner-facing guidance forbids hidden requirements and internal language.
- [ ] Implement typed task guidance and compose it into the Prompt Registry.
- [ ] Run `pnpm --filter @iwc/ai test` and typecheck.

### Task 3: Clear-question validation

**Files:**

- Modify: `apps/worker/src/practice-paper.test.ts`
- Modify: `apps/worker/src/learning.ts`
- Modify: `apps/worker/src/tasks/ai.ts`

- [ ] Write failing cases for vague instructions and criteria that add content absent from the instruction.
- [ ] Add deterministic clarity validation.
- [ ] Update generation language so internal criteria mirror the visible instruction.
- [ ] Run worker tests and typecheck.

### Task 4: Learning navigation

**Files:**

- Create: `apps/web/src/lib/client/learning-navigation.ts`
- Create: `apps/web/src/lib/client/learning-navigation.test.ts`
- Modify: `apps/web/src/app/api/v1/today/route.ts`
- Modify: `apps/web/src/lib/client/types.ts`
- Modify: `apps/web/src/lib/client/http-service.ts`
- Modify: `apps/web/src/lib/client/mock-service.ts`
- Modify: `apps/web/src/components/app-shell.tsx`

- [ ] Write a failing pure test showing report and paper links keep cycle/resource IDs instead of becoming `/today`.
- [ ] Expose available cycle resources in Today.
- [ ] Build exact destinations and render them in desktop/mobile navigation.
- [ ] Run Web unit tests and typecheck.

### Task 5: Report access and simplified paper

**Files:**

- Modify: `apps/web/src/app/lesson/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/lib/client/mock-service.ts`

- [ ] Add a browser test that opens the source report and returns to an intact answer draft.
- [ ] Add a browser test that no pre-submission question shows “评分要点” and that instructions state the full required output.
- [ ] Add the report action, remove the rubric block, reduce repeated copy, and simplify missed-answer analysis.
- [ ] Run Chromium, Firefox, WebKit, and mobile lesson/navigation checks.

### Task 6: Release verification

- [ ] Run targeted tests after every task.
- [ ] Run full `pnpm typecheck`, `pnpm lint`, `pnpm test`, Web build, and Worker build.
- [ ] Inspect the final diff and run `git diff --check`.
- [ ] Verify the real local URL with Playwright and report any remaining external or pre-existing blocker honestly.
