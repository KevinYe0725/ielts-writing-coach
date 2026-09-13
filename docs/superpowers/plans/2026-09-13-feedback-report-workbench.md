# Feedback Report Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the feedback page into a black-and-white, evidence-first workbench with a quick-fix default mode, a complete-report mode, concrete issue summaries, and reliable source/suggestion navigation.

**Architecture:** Keep the existing `FeedbackData` DTO, annotation anchors, retry paths, and `ResponsiveReport` split-pane component. Add a local `ReportMode` view state and derive a display-only issue collection from the existing priority helper; keep user-visible issue details in the current `FeedbackIssue` fields and do not add a database migration. Scope monochrome variables to `/feedback` through the existing AppShell class so other routes remain unchanged.

**Tech Stack:** Next.js App Router, React state/hooks, CSS Modules, `react-resizable-panels`, Lucide icons, Vitest, Playwright, Axe.

**Spec:** `docs/superpowers/specs/2026-09-13-feedback-report-workbench-design.md`

## Global Constraints

- Do not change IELTS scoring, persistence, API DTOs, database tables, retry semantics, or learning-state transitions.
- Default report mode is `quick`; `full` is opt-in and must use the current issue filter without a new request.
- At most one suggestion detail panel is expanded at a time; clicking the active trigger again collapses it.
- Collapsed suggestions must show the minimum evidence span and a one-line corrected-version preview.
- `knowledgePointZh` is the persisted learner-facing title and must be concrete, actionable, and evidence-linked.
- `/feedback` inherits the existing monochrome shell; no new dependency or raw palette value is allowed.
- Desktop must preserve resizable two-pane behavior; narrow screens must preserve Original/Suggestions tabs and no horizontal overflow.

---

### Task 1: Lock the actionable feedback content contract

**Files:**
- Modify: `packages/ai/src/pedagogy-knowledge.ts` (issue-classification guidance)
- Modify: `packages/ai/src/prompts.ts` (issue-classification prompt version)
- Modify: `apps/web/src/lib/client/mock-service.ts` (deterministic report titles)
- Test: `packages/ai/src/pedagogy-knowledge.test.ts`
- Test: `tests/e2e/feedback-monochrome.spec.ts`

**Interfaces:**
- Consumes: `FeedbackIssue.titleZh`, `evidence`, `correctedVersion`, `knowledgePointZh`.
- Produces: concrete demo titles and a prompt contract requiring observable before-to-after actions.

- [ ] **Step 1: Write the failing contract assertion**

Add a test that reads `pedagogyGuidanceFor("issue_classification")` and expects the phrases `user-facing title`, `knowledgePointZh`, `exact original term`, and `Do not use abstract noun-only labels`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run packages/ai/src/pedagogy-knowledge.test.ts -t "learner-facing issue titles"
```

Expected: FAIL because the current guidance does not contain the concrete-title requirements.

- [ ] **Step 3: Implement the prompt and fixture contract**

Append to the issue-classification pedagogy guidance:

```text
The knowledgePointZh field is also the user-facing title: write it as a concrete action or before-to-after change, include the exact original term or relationship whenever possible, and keep it short enough to scan. Do not use abstract noun-only labels such as comparison structure, grammar problem, or weak argument without naming what the learner should change.
```

Bump the issue-classification prompt version from `1.4.0` to `1.5.0`. Update the deterministic report titles to concrete actions such as `把 “older one” 改成 “adults”` and `补一句“反复接触让语言模式变熟”`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/pedagogy-knowledge.ts packages/ai/src/pedagogy-knowledge.test.ts packages/ai/src/prompts.ts apps/web/src/lib/client/mock-service.ts tests/e2e/feedback-monochrome.spec.ts
git commit -m "feat: require concrete feedback issue titles"
```

### Task 2: Add report modes and one-card collapse behavior

**Files:**
- Modify: `apps/web/src/app/feedback/page.tsx` (mode state, derived issue list, active issue semantics)
- Test: `tests/e2e/feedback-monochrome.spec.ts`

**Interfaces:**
- Consumes: `priorityFeedback(issues, targetIssueId)`, existing `issueFilter`, `activeIssueId`, and `highlightableIds`.
- Produces: `data-feedback-report-mode`, `[data-feedback-mode]` tabs, and a display-only `reportIssues` collection.

- [ ] **Step 1: Write failing browser tests**

Add tests that assert:

```ts
await expect(page.locator("[data-feedback-report]")).toHaveAttribute(
  "data-feedback-report-mode",
  "quick",
);
await report.getByRole("tab", { name: "完整报告" }).click();
await expect(report).toHaveAttribute("data-feedback-report-mode", "full");
```

Add a second test that opens the first suggestion, clicks the same trigger again, and expects its `[data-feedback-issue-details]` element to be hidden with `aria-expanded="false"`.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
NEXT_PUBLIC_DEMO_MODE=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3202 pnpm exec playwright test tests/e2e/feedback-monochrome.spec.ts --project=chromium --workers=1 --reporter=line
```

Expected: FAIL because the report mode marker and collapse toggle are absent or inactive.

- [ ] **Step 3: Implement the state derivation**

Use the following state shape:

```ts
type ReportMode = "quick" | "full";
const [reportMode, setReportMode] = useState<ReportMode>("quick");
const reportIssues =
  reportMode === "full"
    ? visibleIssues
    : visibleIssues.filter((issue) => priorityIds.has(issue.id));
```

Fall back to `visibleIssues.slice(0, 3)` when a filter has no priority issue. Use a three-state `activeIssueId` (`undefined` = initial first priority, `null` = explicitly collapsed, `string` = open issue). When a source highlight is hidden in quick mode, switch to `full` before opening it.

- [ ] **Step 4: Implement the mode tabs and toggle**

Render a `role="tablist"` with `快速修改` and `完整报告`, set `aria-selected`, and add `data-feedback-report` plus `data-feedback-report-mode` to the report wrapper. In `activateSuggestion`, return `null` when the clicked issue is already selected; otherwise select that issue.

- [ ] **Step 5: Run the focused tests and verify they pass**

Run the command from Step 2. Expected: all focused feedback tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/feedback/page.tsx tests/e2e/feedback-monochrome.spec.ts
git commit -m "feat: add quick and full feedback report modes"
```

### Task 3: Make collapsed suggestions self-explanatory

**Files:**
- Modify: `apps/web/src/app/feedback/page.tsx` (evidence label and corrected preview)
- Modify: `apps/web/src/app/feedback/feedback.module.css` (preview typography and mode tabs)
- Test: `tests/e2e/feedback-monochrome.spec.ts`
- Test: `tests/e2e/redesign-contracts.spec.ts` (evidence label)

**Interfaces:**
- Consumes: `issue.evidence` and `issue.correctedVersion`.
- Produces: `[data-feedback-correction-preview]` and a visible `原句 → 改法` summary inside every issue trigger.

- [ ] **Step 1: Write the failing preview assertion**

Assert that the first issue card contains a visible `[data-feedback-correction-preview]` element and that its evidence label is `原句`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
NEXT_PUBLIC_DEMO_MODE=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3202 pnpm exec playwright test tests/e2e/feedback-monochrome.spec.ts tests/e2e/redesign-contracts.spec.ts -g "feedback|monochrome" --project=chromium --workers=1 --reporter=line
```

Expected: FAIL because the trigger does not yet expose the corrected-version preview in a stable selector.

- [ ] **Step 3: Add the preview markup**

Keep the existing `EvidenceLink` for source semantics, change its visible label to `原句`, and append:

```tsx
<span className={styles.correctionPreview} data-feedback-correction-preview>
  <ArrowRight aria-hidden="true" size={14} />
  <span lang="en">{issue.correctedVersion}</span>
</span>
```

Keep the existing screen-reader-only evidence text and issue details unchanged.

- [ ] **Step 4: Style the preview and mode tabs**

Use the existing desk tokens only. The preview uses reading typography at `var(--desk-type-label)`, one-line clamp, black text, and a small arrow. Mode tabs use a pill group with the active tab in `var(--desk-ink)` on `var(--desk-paper)`.

- [ ] **Step 5: Run the focused tests and verify they pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/feedback/page.tsx apps/web/src/app/feedback/feedback.module.css tests/e2e/feedback-monochrome.spec.ts tests/e2e/redesign-contracts.spec.ts
git commit -m "refine: make feedback cards actionable"
```

### Task 4: Keep the monochrome workbench responsive and accessible

**Files:**
- Modify: `apps/web/src/components/app-shell.tsx` (scope `monochromeShell` to `/feedback`)
- Modify: `apps/web/src/app/feedback/feedback.module.css` (gray-scale hierarchy and responsive mode controls)
- Test: `tests/e2e/feedback-monochrome.spec.ts`
- Test: `tests/e2e/accessibility.spec.ts` (feedback route axe coverage if route matrix changes)

**Interfaces:**
- Consumes: `ResponsiveReport`, existing `[data-essay-pane]`, `[data-suggestion-panel]`, and mobile switcher.
- Produces: black-and-white shell for feedback, no horizontal overflow, keyboard-visible tabs and issue triggers.

- [ ] **Step 1: Write failing shell and responsive assertions**

Assert the feedback shell resolves to `rgb(247, 247, 247)` / `rgb(17, 17, 17)`, both panes resolve to white, and the report has no horizontal overflow at `390×844`.

- [ ] **Step 2: Run focused browser and axe tests**

Run:

```bash
NEXT_PUBLIC_DEMO_MODE=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3202 pnpm exec playwright test tests/e2e/feedback-monochrome.spec.ts tests/e2e/accessibility.spec.ts --project=chromium --workers=2 --reporter=dot
```

Expected: FAIL only if `/feedback` is not yet included in the monochrome shell or a responsive selector is missing.

- [ ] **Step 3: Scope the existing shell variables**

Set `feedbackPage = pathname === "/feedback"` in `AppShell` and include it in the existing `monochromeShell` condition. Do not change the shell class for other routes.

- [ ] **Step 4: Keep mode controls within the suggestion pane**

Place mode tabs above the issue filters, allow the control row to wrap or scroll within the pane, and keep the existing mobile Original/Suggestions tab behavior. Do not change the `react-resizable-panels` IDs or default sizes.

- [ ] **Step 5: Run focused browser and axe tests again**

Run the command from Step 2. Expected: PASS with no axe violations and no horizontal overflow.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/app-shell.tsx apps/web/src/app/feedback/feedback.module.css tests/e2e/feedback-monochrome.spec.ts tests/e2e/accessibility.spec.ts
git commit -m "refine: keep feedback workbench accessible"
```

### Task 5: Full verification and delivery checkpoint

**Files:**
- Verify: all files changed by Tasks 1–4
- Test: `packages/ai/src/pedagogy-knowledge.test.ts`
- Test: `tests/e2e/feedback-monochrome.spec.ts`
- Test: `tests/e2e/redesign-contracts.spec.ts`
- Test: `tests/e2e/app-shell.spec.ts`

**Interfaces:**
- Consumes: all public report routes and existing demo fixtures.
- Produces: a clean, committed worktree with verified local preview at `http://127.0.0.1:3202/feedback?cycle=cycle-demo`.

- [ ] **Step 1: Format and inspect the diff**

```bash
pnpm exec prettier --write apps/web/src/app/feedback/page.tsx apps/web/src/app/feedback/feedback.module.css apps/web/src/components/app-shell.tsx packages/ai/src/pedagogy-knowledge.ts packages/ai/src/prompts.ts tests/e2e/feedback-monochrome.spec.ts tests/e2e/redesign-contracts.spec.ts
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 2: Run unit, type, and lint checks**

```bash
pnpm exec vitest run --maxWorkers=4
pnpm --filter @iwc/web typecheck
pnpm --filter @iwc/web lint
```

Expected: all unit tests pass; typecheck exits 0; lint has 0 errors (existing Fast Refresh warnings may remain).

- [ ] **Step 3: Run the report browser matrix**

```bash
NEXT_PUBLIC_DEMO_MODE=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3202 pnpm exec playwright test tests/e2e/feedback-monochrome.spec.ts tests/e2e/redesign-contracts.spec.ts tests/e2e/app-shell.spec.ts --project=chromium --project=mobile --workers=2 --reporter=dot
```

Expected: all applicable tests pass on desktop and mobile; skipped tests are explicitly environment-scoped.

- [ ] **Step 4: Build the production web app**

```bash
NEXT_PUBLIC_DEMO_MODE=true pnpm --filter @iwc/web build
```

Expected: Next.js build succeeds and the existing route set remains present.

- [ ] **Step 5: Perform manual browser QA**

Open `http://127.0.0.1:3202/feedback?cycle=cycle-demo` and verify: quick mode opens first priority, same-card click collapses, full mode shows all issues, source highlights and suggestion cards remain linked, and mobile tabs do not overflow.

- [ ] **Step 6: Commit the verification checkpoint**

```bash
git status --short
git log -1 --oneline
```

The worktree must be clean. Do not push, merge, or deploy without a separate authorization.
