# Annotation Writing Desk Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing IELTS Writing Coach presentation layer as the “批注写作桌” while preserving every route identity, state transition, recovery path, storage key, API call, accessibility contract, and learner-visible capability.

**Architecture:** Keep all page loaders, client services, state machines, and persistence code intact. Introduce one token/foundation layer, four explicit page layouts, a reusable EvidenceLink visual primitive, and page-scoped CSS Modules; migrate one complete learner surface at a time while preserving legacy classes and `data-*` hooks until the final compatibility cleanup.

**Tech Stack:** Next.js 16.3, React 19, TypeScript, CSS Modules, Tailwind import compatibility, Lucide React, Vitest, Playwright, axe-core, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-22-annotation-writing-desk-redesign.md`

## Global Constraints

- Do not modify database schemas, API response shapes, AI prompts, worker tasks, grading logic, learning-core state machines, or route identity semantics.
- Preserve `cycle`, `lesson`, and `task` query parameters and the optional `lesson` parameter on feedback links.
- Preserve `/signin?next=`, one-time token consumption, `/today?new-essay=1`, `/today?notice=feedback-waiting-ai`, and `/today?mixed-review=1` behavior.
- Preserve all localStorage, sessionStorage, IndexedDB, cookie, and browser-history keys and semantics.
- Preserve the frozen DOM hooks listed in the spec; the first redesign release may add hooks but must not remove them.
- Preserve exactly one primary Today action and every waiting, failed, blocked, expired, retry, no-opportunity, and replacement state.
- Use the approved base colors: Ink `#172033`, Paper `#FCFBF8`, Canvas `#EEF1F5`, Annotation Blue `#1D56A0`, Evidence Green `#2F6D5A`, Revision Amber `#7C531B`, Error `#B4474C`.
- Evidence Green is reserved for back-end-supported standard, retained, or transferred evidence; saved drafts use Ink or Annotation Blue.
- Body and auxiliary learner-facing text must be at least 12px and meet WCAG 2.2 AA contrast.
- No page-specific raw color, radius, shadow, or type scale may be added when a design token already expresses the role.
- Preserve Chinese/English UI switching without translating IELTS prompts or learner writing.
- Work only on `codex/frontend-redesign`; keep the known-good `e13e97f` code state as the rollback base.
- Use Node 24 for every pnpm command: `PATH=/opt/homebrew/opt/node@24/bin:$PATH`.

---

## File Structure

### Foundations and shared presentation

- Create `apps/web/src/styles/tokens.css`: approved colors, typography variables, spacing, radii, shadows, z-indexes, and layout widths.
- Create `apps/web/src/styles/foundations.css`: font imports, reset, base typography, focus, selection, reduced-motion, and shared form rules.
- Create `apps/web/src/components/layout/page-layout.tsx`: `EntryLayout`, `FocusLayout`, `ReadingLayout`, and `WorkspaceLayout` wrappers with stable `data-page-layout` values.
- Create `apps/web/src/components/layout/page-layout.module.css`: only layout widths, gutters, and responsive behavior.
- Create `apps/web/src/components/evidence-link.tsx`: visual relationship primitive with five states and non-color text semantics.
- Create `apps/web/src/components/evidence-link.module.css`: shared line, endpoint, mobile rail, and reduced-motion styles.
- Modify `apps/web/src/app/layout.tsx`: load foundations before the legacy compatibility stylesheet.
- Modify `apps/web/src/components/ui.tsx`: keep public exports while routing Button, Card/Surface, Badge/Status, PageHeader, and ActionLink into approved tokens.

### Shell

- Modify `apps/web/src/components/app-shell.tsx`: preserve navigation logic and storage while adopting the approved shell composition.
- Create `apps/web/src/components/app-shell.module.css`: desktop sidebar, collapsed state, context topbar, mobile header/menu, account area.
- Modify `apps/web/src/components/account-menu.tsx` and `notification-center.tsx`: presentation only; preserve behavior and accessible names.

### Page-scoped styles

- Create `apps/web/src/app/today/today.module.css`.
- Continue using and refine `apps/web/src/components/essay-workspace.module.css`.
- Create `apps/web/src/components/writing-room.module.css`.
- Continue using and refine `apps/web/src/app/feedback/feedback.module.css`.
- Continue using and refine `apps/web/src/app/lesson/page.module.css`.
- Create `apps/web/src/app/lesson/paper/paper.module.css`.
- Create `apps/web/src/app/compare/compare.module.css`.
- Create `apps/web/src/app/transfer/transfer.module.css`.
- Create `apps/web/src/app/growth/growth.module.css`.
- Create `apps/web/src/app/settings/settings.module.css`.
- Continue using and refine `apps/web/src/app/account/account.module.css`.
- Create `apps/web/src/app/entry.module.css` for signin/join/recover/setup.
- Create `apps/web/src/app/admin/admin.module.css` and `apps/web/src/app/admin/backup/backup.module.css`.

### Tests and artifacts

- Create `tests/e2e/redesign-contracts.spec.ts`: route-layout, Shell, responsive, no-overflow, single-primary-action, frozen-hook, and page-state matrix.
- Create `apps/web/src/components/design-system.test.tsx`: server-rendered semantic tests for layouts and EvidenceLink.
- Extend existing `tests/e2e/app-shell.spec.ts`, `lesson.spec.ts`, `writing-rewrite.spec.ts`, `account.spec.ts`, `setup-today.spec.ts`, and `accessibility.spec.ts` rather than replacing them.
- Store review screenshots under `output/playwright/annotation-desk/`; never commit temporary trace archives.

---

### Task 1: Lock the Redesign Contract and Baseline

**Files:**

- Create: `tests/e2e/redesign-contracts.spec.ts`
- Modify: `tests/e2e/support.ts`
- Test: `tests/e2e/app-shell.spec.ts`
- Test: `tests/e2e/redesign-contracts.spec.ts`

**Interfaces:**

- Consumes: current Demo routes and frozen selectors from the design spec.
- Produces: `expectNoHorizontalOverflow(page)`, `expectPageLayout(page, variant)`, and a failing contract requiring `data-design-system="annotation-desk-v1"`.

- [ ] **Step 1: Add failing redesign identity and layout tests**

```ts
import { expect, test, type Page } from "@playwright/test";

export async function expectNoHorizontalOverflow(page: Page) {
  const size = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.client);
}

test("declares the annotation desk design system", async ({ page }) => {
  await page.goto("/today");
  await expect(page.locator("[data-app-shell]")).toHaveAttribute(
    "data-design-system",
    "annotation-desk-v1",
  );
  await expect(page.locator("main")).toHaveAttribute(
    "data-page-layout",
    "focus",
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/redesign-contracts.spec.ts --project=chromium --workers=1`

Expected: FAIL because the current Shell has no `data-design-system` and pages have no explicit layout attribute.

- [ ] **Step 3: Add route and frozen-hook coverage without altering production**

```ts
const routeMatrix = [
  ["/today", "focus"],
  ["/essays", "focus"],
  ["/write?cycle=cycle-demo", "workspace"],
  ["/feedback?cycle=cycle-demo", "workspace"],
  ["/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective", "reading"],
  [
    "/lesson/paper?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    "workspace",
  ],
] as const;

for (const [route, layout] of routeMatrix) {
  test(`${route} uses ${layout}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("main")).toHaveAttribute(
      "data-page-layout",
      layout,
    );
  });
}
```

- [ ] **Step 4: Record the legacy visual baseline**

Run the current Demo app and capture 1440×900 and 390×844 screenshots for `/today`, `/write`, `/feedback`, `/lesson`, and `/lesson/paper` into `output/playwright/annotation-desk/baseline/`.

Expected: artifacts exist locally; no product file changes.

- [ ] **Step 5: Commit the contract tests**

```bash
git add -- tests/e2e/redesign-contracts.spec.ts tests/e2e/support.ts
git commit -m "test: lock annotation desk redesign contracts"
```

---

### Task 2: Build Design Foundations, Layouts, and EvidenceLink

**Files:**

- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/foundations.css`
- Create: `apps/web/src/components/layout/page-layout.tsx`
- Create: `apps/web/src/components/layout/page-layout.module.css`
- Create: `apps/web/src/components/evidence-link.tsx`
- Create: `apps/web/src/components/evidence-link.module.css`
- Create: `apps/web/src/components/design-system.test.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/components/ui.tsx`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: `PageLayoutVariant = "entry" | "focus" | "reading" | "workspace"`.
- Produces: `layoutVariantForPathname(pathname: string): PageLayoutVariant`.
- Produces: `PageLayout({ variant, className, children })`.
- Produces: `EvidenceLinkState = "active" | "verified" | "revision" | "unavailable" | "disabled"`.
- Produces: `EvidenceLink({ state, label, children, className })`.

- [ ] **Step 1: Write failing semantic component tests**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EvidenceLink } from "./evidence-link";
import { layoutVariantForPathname, PageLayout } from "./layout/page-layout";

describe("annotation desk primitives", () => {
  it("exposes stable layout and evidence semantics", () => {
    expect(
      renderToStaticMarkup(<PageLayout variant="workspace">Essay</PageLayout>),
    ).toContain('data-page-layout="workspace"');
    const evidence = renderToStaticMarkup(
      <EvidenceLink label="仍需验证" state="revision">
        Mechanism
      </EvidenceLink>,
    );
    expect(evidence).toContain('data-evidence-state="revision"');
    expect(evidence).toContain("仍需验证");
  });

  it("maps every application route to one layout", () => {
    expect(layoutVariantForPathname("/signin")).toBe("entry");
    expect(layoutVariantForPathname("/today")).toBe("focus");
    expect(layoutVariantForPathname("/lesson")).toBe("reading");
    expect(layoutVariantForPathname("/feedback")).toBe("workspace");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @iwc/web test -- src/components/design-system.test.tsx`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Add locally packaged fonts**

Run:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm add --filter @iwc/web @fontsource-variable/noto-sans-sc @fontsource-variable/source-serif-4 @fontsource-variable/ibm-plex-sans
```

Import only variable WOFF2 files in `foundations.css`; do not load remote fonts at runtime.

- [ ] **Step 4: Implement approved tokens and foundations**

```css
:root {
  --desk-ink: #172033;
  --desk-paper: #fcfbf8;
  --desk-canvas: #eef1f5;
  --desk-blue: #1d56a0;
  --desk-green: #2f6d5a;
  --desk-amber: #7c531b;
  --desk-error: #b4474c;
  --desk-space-1: 4px;
  --desk-space-2: 8px;
  --desk-space-3: 12px;
  --desk-space-4: 16px;
  --desk-space-6: 24px;
  --desk-space-8: 32px;
  --desk-space-12: 48px;
  --desk-radius-sm: 6px;
  --desk-radius-md: 10px;
  --desk-radius-lg: 16px;
}
```

- [ ] **Step 5: Implement layout and EvidenceLink components**

```tsx
export type PageLayoutVariant = "entry" | "focus" | "reading" | "workspace";

export function layoutVariantForPathname(pathname: string): PageLayoutVariant {
  if (
    ["/signin", "/join", "/recover", "/setup"].some((route) =>
      pathname.startsWith(route),
    )
  )
    return "entry";
  if (pathname === "/lesson") return "reading";
  if (pathname === "/growth") return "reading";
  if (
    ["/today", "/essays", "/settings", "/account", "/admin"].some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    )
  )
    return "focus";
  return "workspace";
}

export function PageLayout({
  variant,
  className,
  children,
}: {
  variant: PageLayoutVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(styles.layout, styles[variant], className)}
      data-page-layout={variant}
    >
      {children}
    </div>
  );
}
```

EvidenceLink renders its line as `aria-hidden="true"` and its supplied label as visible text. Disabled state renders no line.

- [ ] **Step 6: Run component and type tests**

Run:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @iwc/web test -- src/components/design-system.test.tsx
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @iwc/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit foundations**

```bash
git add -- apps/web/package.json pnpm-lock.yaml apps/web/src/styles apps/web/src/components/layout apps/web/src/components/evidence-link.tsx apps/web/src/components/evidence-link.module.css apps/web/src/components/design-system.test.tsx apps/web/src/app/layout.tsx apps/web/src/components/ui.tsx
git commit -m "feat: add annotation desk design foundations"
```

---

### Task 3: Redesign AppShell Without Changing Navigation Behavior

**Files:**

- Create: `apps/web/src/components/app-shell.module.css`
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/components/account-menu.tsx`
- Modify: `apps/web/src/components/notification-center.tsx`
- Modify: `tests/e2e/app-shell.spec.ts`
- Modify: `tests/e2e/redesign-contracts.spec.ts`

**Interfaces:**

- Consumes: existing `LearningDestinations`, `saveSidebarPreference`, `LocaleSwitch`, `AccountMenu`, and `NotificationCenter` behavior.
- Consumes: `layoutVariantForPathname(pathname)` from Task 2.
- Produces: `data-design-system="annotation-desk-v1"` on `[data-app-shell]`, `data-page-layout` on `<main>`, and unchanged frozen Shell selectors.

- [ ] **Step 1: Add failing Shell behavior and geometry assertions**

```ts
test("collapsed sidebar remains hidden and expands the workspace", async ({
  page,
}) => {
  await page.goto("/today");
  const before = await page
    .locator("main")
    .evaluate((node) => node.getBoundingClientRect().width);
  await page.locator("[data-sidebar-toggle]").click();
  await expect(page.locator("#primary-sidebar")).toBeHidden();
  const after = await page
    .locator("main")
    .evaluate((node) => node.getBoundingClientRect().width);
  expect(after).toBeGreaterThan(before);
});
```

Add explicit tests for locale persistence, mobile menu, notification unread/mark-read, account menu Escape focus return, logout destination clearing, and skip link.

- [ ] **Step 2: Run Shell tests and verify RED**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/app-shell.spec.ts tests/e2e/redesign-contracts.spec.ts --project=chromium --workers=1`

Expected: redesign identity and new context-topbar assertions FAIL.

- [ ] **Step 3: Implement the new Shell presentation**

Preserve all destination construction and storage functions. Add presentation attributes without renaming frozen classes:

```tsx
<div
  className={cn("app-shell", styles.shell)}
  data-app-shell
  data-design-system="annotation-desk-v1"
  data-sidebar-state={sidebarCollapsed ? "collapsed" : "expanded"}
>
```

Set `data-page-layout={layoutVariantForPathname(pathname)}` on both formal-app and Entry `<main>` elements. PageLayout repeats the same value on its inner layout wrapper so page-scoped CSS remains independent of the Shell.

Expanded sidebar is 232px; collapsed sidebar remains fully hidden. The context topbar uses the active navigation label and current cycle-safe destination, not a new data request.

- [ ] **Step 4: Verify desktop and mobile Shells**

Run:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/app-shell.spec.ts tests/e2e/redesign-contracts.spec.ts --project=chromium --workers=1
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @iwc/web typecheck
```

Expected: PASS with no horizontal overflow at 390px.

- [ ] **Step 5: Commit Shell redesign**

```bash
git add -- apps/web/src/components/app-shell.tsx apps/web/src/components/app-shell.module.css apps/web/src/components/account-menu.tsx apps/web/src/components/notification-center.tsx tests/e2e/app-shell.spec.ts tests/e2e/redesign-contracts.spec.ts
git commit -m "feat: redesign the learning workspace shell"
```

---

### Task 4: Rebuild Today and Multi-Essay Workspace

**Files:**

- Create: `apps/web/src/app/today/today.module.css`
- Modify: `apps/web/src/app/today/page.tsx`
- Modify: `apps/web/src/app/essays/page.tsx`
- Modify: `apps/web/src/components/essay-workspace.tsx`
- Modify: `apps/web/src/components/essay-workspace.module.css`
- Modify: `tests/e2e/setup-today.spec.ts`
- Modify: `tests/e2e/app-shell.spec.ts`
- Modify: `tests/e2e/redesign-contracts.spec.ts`

**Interfaces:**

- Consumes: existing `TodayData`, `nextTask`, `EssayWorkspace`, question bank, retry actions, and navigation persistence.
- Produces: one `.next-task-card`, a quiet evidence summary, unchanged `/today` query behavior, and `PageLayout variant="focus"`.

- [ ] **Step 1: Add failing hierarchy and preservation tests**

```ts
test("Today has one primary action and retains every existing utility", async ({
  page,
}) => {
  await page.goto("/today");
  await expect(page.locator(".next-task-card")).toHaveCount(1);
  await expect(page.getByText("已记录学习时长")).toBeVisible();
  await expect(page.getByText("已提交首稿")).toBeVisible();
  await expect(page.getByText("独立复测未复发")).toBeVisible();
  await expect(page.getByRole("button", { name: "刷新计划" })).toBeVisible();
});
```

Add tests for `new-essay=1`, `mixed-review=1`, feedback waiting notice, two independent essay hrefs, and the eight-essay limit.

- [ ] **Step 2: Run focused tests and verify hierarchy RED**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/setup-today.spec.ts tests/e2e/redesign-contracts.spec.ts --project=chromium --workers=1`

Expected: new design structure assertions FAIL while existing function assertions remain green.

- [ ] **Step 3: Implement the one-action Today composition**

Use `PageLayout variant="focus"`. Keep the exact next task component and handlers. Render the three metrics as one `evidenceSummary` row and keep Refresh after it as a secondary button.

```tsx
<PageLayout variant="focus" className={styles.page}>
  <section className={cn("next-task-card", styles.primaryAction)}>
    {renderNextTask(data.nextTask)}
  </section>
  <EssayWorkspace compact data={data.essayWorkspace} />
  <section className={styles.learningThread}>{renderCycleSteps(data)}</section>
  <section className={styles.evidenceSummary}>{renderMetrics(data)}</section>
</PageLayout>
```

- [ ] **Step 4: Migrate essays presentation without changing hrefs**

Keep each server-provided `nextTask.href` verbatim. Keep public/custom question creation and limit behavior. Use a readable list at narrow widths and two columns only when each card has at least 320px.

- [ ] **Step 5: Run Today, essays, and accessibility checks**

Run:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/setup-today.spec.ts tests/e2e/app-shell.spec.ts tests/e2e/accessibility.spec.ts --project=chromium --workers=1
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @iwc/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Today and essays**

```bash
git add -- apps/web/src/app/today apps/web/src/app/essays/page.tsx apps/web/src/components/essay-workspace.tsx apps/web/src/components/essay-workspace.module.css tests/e2e/setup-today.spec.ts tests/e2e/app-shell.spec.ts tests/e2e/redesign-contracts.spec.ts
git commit -m "feat: turn Today into a focused writing desk"
```

---

### Task 5: Migrate WritingRoom and Delayed Rewrite

**Files:**

- Create: `apps/web/src/components/writing-room.module.css`
- Modify: `apps/web/src/components/writing-room.tsx`
- Modify: `apps/web/src/app/write/page.tsx`
- Modify: `apps/web/src/app/rewrite/page.tsx`
- Modify: `tests/e2e/writing-rewrite.spec.ts`
- Modify: `tests/e2e/redesign-contracts.spec.ts`

**Interfaces:**

- Consumes: the existing WritingRoom props, timer, autosave, IndexedDB fallback, revision conflicts, snapshot seal, and submit actions.
- Produces: workspace layout with 36–40% prompt paper and 60–64% editor, unchanged form controls and dialogs.

- [ ] **Step 1: Add failing workspace geometry and rule-preservation tests**

```ts
test("writing workspace keeps rules visible on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/write?cycle=cycle-demo");
  await expect(page.getByText(/40 分钟/)).toBeVisible();
  await expect(page.getByText(/至少 250 词/)).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute(
    "data-page-layout",
    "workspace",
  );
});
```

Retain existing tests for 650ms autosave, keyboard shortcuts, local/server conflict choices, timer submission, locked versions, and V2 blind snapshot.

- [ ] **Step 2: Run writing tests and verify RED**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/writing-rewrite.spec.ts tests/e2e/redesign-contracts.spec.ts --project=chromium --workers=1`

Expected: new mobile rule and workspace layout assertions FAIL.

- [ ] **Step 3: Move writing styles into the module**

Add both module and frozen legacy classes during migration:

```tsx
<div className={cn("writing-room", styles.room)} data-writing-mode={mode}>
  <aside className={cn("writing-prompt", styles.prompt)}>{prompt}</aside>
  <section className={cn("writing-editor", styles.editor)}>{editor}</section>
</div>
```

Remove negative-margin width calculations only after the Workspace layout provides full-bleed width.

- [ ] **Step 4: Preserve all dialog and recovery behavior**

Do not alter autosave effects, IndexedDB calls, timer calculations, router destinations, `spellCheck={false}`, or confirmation handlers. Visual changes are limited to wrappers, classes, and visible rule placement.

- [ ] **Step 5: Run writing, rewrite, type, and axe checks**

Run:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/writing-rewrite.spec.ts tests/e2e/accessibility.spec.ts --project=chromium --workers=1
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @iwc/web test
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @iwc/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit WritingRoom migration**

```bash
git add -- apps/web/src/components/writing-room.tsx apps/web/src/components/writing-room.module.css apps/web/src/app/write/page.tsx apps/web/src/app/rewrite/page.tsx tests/e2e/writing-rewrite.spec.ts tests/e2e/redesign-contracts.spec.ts
git commit -m "feat: redesign the timed writing workspace"
```

---

### Task 6: Refine the Feedback Annotation Workbench

**Files:**

- Modify: `apps/web/src/app/feedback/page.tsx`
- Modify: `apps/web/src/app/feedback/feedback.module.css`
- Modify: `tests/e2e/lesson.spec.ts`
- Modify: `tests/e2e/redesign-contracts.spec.ts`

**Interfaces:**

- Consumes: existing issue offsets, annotation segmentation, card/mark activation, paragraph feedback, retry objects, optional lesson identity, and locked model essay.
- Produces: EvidenceLink-backed workbench using the same `data-feedback-*`, `data-issue-card`, and `data-issue-highlight` hooks.

- [ ] **Step 1: Add failing evidence-language and width tests**

```ts
test("feedback uses the workspace and preserves optional lesson identity", async ({
  page,
}) => {
  await page.goto(
    "/feedback?cycle=cycle-demo&lesson=lesson-collocation-perspective",
  );
  await expect(page.locator("main")).toHaveAttribute(
    "data-page-layout",
    "workspace",
  );
  await expect(page.locator("[data-feedback-workbench]")).toBeVisible();
  await expect(page.getByRole("link", { name: /专项教学/ })).toHaveAttribute(
    "href",
    /lesson=lesson-collocation-perspective/,
  );
});
```

Retain bidirectional mark/card, keyboard Enter/Space, focus, mobile default suggestion tab, retry, paragraph review, and locked-model tests.

- [ ] **Step 2: Run feedback tests and verify RED**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/lesson.spec.ts tests/e2e/redesign-contracts.spec.ts --project=chromium --workers=1 --grep="feedback|批改|annotation"`

Expected: new layout and EvidenceLink assertions FAIL.

- [ ] **Step 3: Recompose summary, manuscript, and annotation rail**

Use one quiet assessment summary above the workbench. Keep original text immutable. Reuse EvidenceLink only as an `aria-hidden` visual relation; existing interactive mark/card names remain authoritative.

```tsx
<PageLayout variant="workspace" className={styles.page}>
  <AssessmentSummary data={data} />
  <div className={styles.workbench} data-feedback-workbench>
    <section data-essay-pane>{renderEssay()}</section>
    <aside data-suggestion-panel>{renderIssues()}</aside>
  </div>
</PageLayout>
```

- [ ] **Step 4: Reduce nested panels and enforce readable type**

Use 17px/1.9 for English manuscript text, at least 13px for issue metadata, and no more than one border boundary per suggestion. Keep container-query dual-column behavior and mobile tabs.

- [ ] **Step 5: Verify feedback function and accessibility**

Run:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/lesson.spec.ts tests/e2e/accessibility.spec.ts --project=chromium --workers=1 --grep="feedback|批改|annotation|axe"
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @iwc/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit feedback workbench**

```bash
git add -- apps/web/src/app/feedback/page.tsx apps/web/src/app/feedback/feedback.module.css tests/e2e/lesson.spec.ts tests/e2e/redesign-contracts.spec.ts
git commit -m "feat: refine the feedback annotation workbench"
```

---

### Task 7: Align the Adaptive Teaching Article

**Files:**

- Modify: `apps/web/src/app/lesson/page.tsx`
- Modify: `apps/web/src/app/lesson/teaching-article.tsx`
- Modify: `apps/web/src/app/lesson/page.module.css`
- Modify: `tests/e2e/lesson.spec.ts`
- Modify: `tests/e2e/redesign-contracts.spec.ts`

**Interfaces:**

- Consumes: dynamic sections/blocks, TOC state, canonical first-answer restoration, analysis states, retry, local optional rewrite, replacement flow, and paper CTA.
- Produces: Reading layout with unchanged `data-teaching-*` hooks and article semantics.

- [ ] **Step 1: Add failing reading-layout and non-gating tests**

```ts
test("teaching article keeps the paper action available in every analysis state", async ({
  page,
}) => {
  await page.goto(
    "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
  );
  await expect(page.locator("main")).toHaveAttribute(
    "data-page-layout",
    "reading",
  );
  await expect(
    page.getByRole("link", { name: "开始60分钟训练卷" }),
  ).toBeVisible();
});
```

Retain the existing HTTP-mode tests for restoring, pending, unavailable, demo, personalized, retry, timeout, raw answer fidelity, TOC focus, and no backend vocabulary.

- [ ] **Step 2: Run lesson tests and verify RED**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/lesson.spec.ts tests/e2e/redesign-contracts.spec.ts --project=chromium --workers=1 --grep="teaching|教学|article"`

Expected: new layout and evidence-language assertions FAIL.

- [ ] **Step 3: Apply the approved Reading layout**

Keep the dynamic section loop. Do not introduce fixed section names or block counts. Use EvidenceLink only for the lesson-level ability state, not to point at the original essay.

```tsx
<PageLayout variant="reading" className={styles.article}>
  <ArticleHeader data={data} />
  <div className={styles.readingLayout} data-teaching-layout>
    <article data-teaching-content>{sections}</article>
    <nav data-teaching-toc>{contents}</nav>
  </div>
</PageLayout>
```

- [ ] **Step 4: Refine typography and practice stops**

Use 17px/1.82 for long-form prose, Source Serif 4 only for English examples, and minimal boundaries around practice. Preserve every restoring/analysis status and the local rewrite behavior.

- [ ] **Step 5: Verify Demo, HTTP states, mobile TOC, and axe**

Run the existing lesson spec in Demo and HTTP modes for Chromium, then the critical teaching subset across Firefox, WebKit, and mobile.

Expected: every existing teaching state remains green and the page has no horizontal overflow.

- [ ] **Step 6: Commit teaching article alignment**

```bash
git add -- apps/web/src/app/lesson/page.tsx apps/web/src/app/lesson/teaching-article.tsx apps/web/src/app/lesson/page.module.css tests/e2e/lesson.spec.ts tests/e2e/redesign-contracts.spec.ts
git commit -m "feat: align adaptive teaching with the writing desk"
```

---

### Task 8: Turn the Practice Paper Into a Continuous Exam

**Files:**

- Create: `apps/web/src/app/lesson/paper/paper.module.css`
- Modify: `apps/web/src/app/lesson/paper/page.tsx`
- Modify: `tests/e2e/lesson.spec.ts`
- Modify: `tests/e2e/redesign-contracts.spec.ts`

**Interfaces:**

- Consumes: existing eight questions, answer map, localStorage key, timer, submit payload, replacement flow, evaluation pending, and result classifications.
- Produces: continuous paper, accessible question navigation, preserved `.practice-paper-question`, and non-overlapping submit bar.

- [ ] **Step 1: Add failing paper-navigation and preservation tests**

```ts
test("practice paper keeps all utilities and exposes eight question anchors", async ({
  page,
}) => {
  await page.goto(
    "/lesson/paper?cycle=cycle-demo&lesson=lesson-collocation-perspective",
  );
  await expect(page.locator(".practice-paper-question")).toHaveCount(8);
  await expect(page.getByRole("link", { name: "返回专项教学" })).toBeVisible();
  await expect(page.getByRole("link", { name: "查看详细批改" })).toBeVisible();
  await expect(page.locator("[data-paper-question-nav] a")).toHaveCount(8);
});
```

Add a 390px assertion proving the fixed submit bar does not cover the focused question input.

- [ ] **Step 2: Run paper tests and verify RED**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/lesson.spec.ts tests/e2e/redesign-contracts.spec.ts --project=chromium --workers=1 --grep="paper|训练卷"`

Expected: question navigation and non-overlap assertions FAIL.

- [ ] **Step 3: Implement continuous paper and question navigation**

Question navigation anchors scroll to existing question IDs and do not alter answers.

```tsx
<nav aria-label={text("试卷题目", "Paper questions")} data-paper-question-nav>
  {data.questions.map((question, index) => (
    <a href={`#paper-question-${question.id}`} key={question.id}>
      {index + 1}
    </a>
  ))}
</nav>
```

Each question retains `.practice-paper-question`, its field label, word counter, and data identity.

- [ ] **Step 4: Preserve draft, timeout, and result logic**

Do not change the `iwc:practice-paper:<id>` key, timer, answer payload, submit handler, polling, replacement, or analysis rendering. Add bottom safe-area padding equal to the submit bar height.

- [ ] **Step 5: Verify paper states and accessibility**

Run focused paper tests for fresh, restored draft, timeout, pending evaluation, result expansion, mobile geometry, and axe.

Expected: PASS.

- [ ] **Step 6: Commit paper redesign**

```bash
git add -- apps/web/src/app/lesson/paper/page.tsx apps/web/src/app/lesson/paper/paper.module.css tests/e2e/lesson.spec.ts tests/e2e/redesign-contracts.spec.ts
git commit -m "feat: redesign the focused practice paper"
```

---

### Task 9: Reframe Compare, Transfer, and Growth as Evidence Records

**Files:**

- Create: `apps/web/src/app/compare/compare.module.css`
- Create: `apps/web/src/app/transfer/transfer.module.css`
- Create: `apps/web/src/app/growth/growth.module.css`
- Modify: `apps/web/src/app/compare/page.tsx`
- Modify: `apps/web/src/app/transfer/page.tsx`
- Modify: `apps/web/src/app/growth/page.tsx`
- Modify: `tests/e2e/lesson.spec.ts`
- Modify: `tests/e2e/redesign-contracts.spec.ts`

**Interfaces:**

- Consumes: existing comparison metrics, retained gate, model essay, transfer task states, growth levels, and next-task hrefs.
- Produces: evidence-record layouts and a pure `growthEvidenceState(status)` presentation mapping.

- [ ] **Step 1: Write failing five-level growth and transfer-state tests**

```ts
test("growth displays every level without overstating evidence", async ({
  page,
}) => {
  await page.goto("/growth");
  for (const label of ["已诊断", "练习中", "临时通过", "已保持", "已迁移"]) {
    await expect(page.getByText(label)).toBeVisible();
  }
  await expect(page.getByText("临时通过")).toHaveAttribute(
    "data-evidence-state",
    "active",
  );
});
```

Add transfer tests for processing, PASS, FAIL, NO_OPPORTUNITY, evaluation failure, expired, and reschedule. Add comparison tests for missing evidence and unchanged nextTask href.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/lesson.spec.ts tests/e2e/redesign-contracts.spec.ts --project=chromium --workers=1 --grep="compare|transfer|growth|迁移|成长"`

Expected: new evidence-state assertions FAIL.

- [ ] **Step 3: Implement explicit evidence mappings**

```ts
const growthEvidenceState = {
  diagnosed: "unavailable",
  practicing: "revision",
  applied: "active",
  retained: "verified",
  transferred: "verified",
} as const;
```

Do not change the status labels, values, gates, metrics, model-essay lock, task hrefs, or transfer submission logic.

- [ ] **Step 4: Recompose pages as chronological records**

Use Workspace for Compare and Transfer, Reading for Growth. Keep scores and metrics visible but subordinate to evidence, recurrence, and next proof.

- [ ] **Step 5: Verify focused pages and typecheck**

Run focused Playwright, Web tests, and Web typecheck.

Expected: PASS.

- [ ] **Step 6: Commit evidence pages**

```bash
git add -- apps/web/src/app/compare apps/web/src/app/transfer apps/web/src/app/growth tests/e2e/lesson.spec.ts tests/e2e/redesign-contracts.spec.ts
git commit -m "feat: present learning progress as evidence"
```

---

### Task 10: Redesign Entry, Account, and Settings Surfaces

**Files:**

- Create: `apps/web/src/app/entry.module.css`
- Create: `apps/web/src/app/settings/settings.module.css`
- Modify: `apps/web/src/app/signin/page.tsx`
- Modify: `apps/web/src/app/join/page.tsx`
- Modify: `apps/web/src/app/recover/page.tsx`
- Modify: `apps/web/src/app/setup/page.tsx`
- Modify: `apps/web/src/app/settings/page.tsx`
- Modify: `apps/web/src/app/account/page.tsx`
- Modify: `apps/web/src/app/account/account.module.css`
- Modify: `tests/e2e/account.spec.ts`
- Modify: `tests/e2e/setup-today.spec.ts`
- Modify: `tests/e2e/redesign-contracts.spec.ts`

**Interfaces:**

- Consumes: existing authentication, one-time-link, setup wizard, provider configuration, settings tabs, password, and logout behaviors.
- Produces: Entry/Focus layouts with technical configuration visibly separated but not removed.

- [ ] **Step 1: Add failing Entry and advanced-settings layout tests**

```ts
test("entry surfaces use the entry layout without leaking one-time tokens", async ({
  page,
}) => {
  await page.goto("/recover?error=INVALID_TOKEN");
  await expect(page.locator("main")).toHaveAttribute(
    "data-page-layout",
    "entry",
  );
  await expect(page).toHaveURL("/recover");
  await expect(page.getByText("恢复链接无效或已过期。")).toBeVisible();
});
```

Add tests for personal auto-registration copy, shared invite restriction, setup provider failure, settings advanced technical labels, account menu focus return, password rules, and logout.

- [ ] **Step 2: Run entry/account/settings tests and verify RED**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/account.spec.ts tests/e2e/setup-today.spec.ts tests/e2e/redesign-contracts.spec.ts --project=chromium --workers=1`

Expected: layout assertions FAIL.

- [ ] **Step 3: Apply Entry and Focus layouts**

Use one primary action per entry state. Keep every field, label, token hook, provider option, Base URL, model route, data import/export, and delete control. Move technical settings into a visible “高级设置” section without changing values or handlers.

- [ ] **Step 4: Preserve account and provider error recovery**

Do not change auth calls, API payloads, encryption modes, provider testing, deletion scope, password validation, or logout destination clearing. Error text may be visually repositioned but must retain its exact actionable meaning.

- [ ] **Step 5: Verify account, settings, setup, and accessibility**

Run focused tests, Web typecheck, and axe for signin, setup, settings, and account at desktop and 390px.

Expected: PASS.

- [ ] **Step 6: Commit entry and settings redesign**

```bash
git add -- apps/web/src/app/entry.module.css apps/web/src/app/signin/page.tsx apps/web/src/app/join/page.tsx apps/web/src/app/recover/page.tsx apps/web/src/app/setup/page.tsx apps/web/src/app/settings apps/web/src/app/account tests/e2e/account.spec.ts tests/e2e/setup-today.spec.ts tests/e2e/redesign-contracts.spec.ts
git commit -m "feat: redesign account entry and settings"
```

---

### Task 11: Redesign Admin and Backup Without Weakening Safety

**Files:**

- Create: `apps/web/src/app/admin/admin.module.css`
- Create: `apps/web/src/app/admin/backup/backup.module.css`
- Modify: `apps/web/src/app/admin/page.tsx`
- Modify: `apps/web/src/app/admin/backup/page.tsx`
- Create: `tests/e2e/admin.spec.ts`
- Modify: `tests/e2e/redesign-contracts.spec.ts`

**Interfaces:**

- Consumes: current RBAC, health, recovery-link, SMTP test, audit log, backup download, passphrase, confirmation, and clear-after-success behavior.
- Produces: Focus-layout operations surfaces with unchanged security actions.

- [ ] **Step 1: Add failing Admin and backup safety tests**

```ts
test("backup keeps both archive downloads and clears secrets after success", async ({
  page,
}) => {
  await page.goto("/admin/backup");
  await expect(page.getByLabel(/口令/)).toHaveAttribute("minlength", "12");
  await expect(page.getByLabel(/确认/)).toBeVisible();
  await expect(page.getByText(/sha256/i)).toBeVisible();
});
```

Add fixtures for unauthorized, recovery-link generation, SMTP probe, audit expansion, owner-only backup, exact confirmation, failed export, successful archive + checksum download, and passphrase clearing.

- [ ] **Step 2: Run Admin tests and verify RED**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm exec playwright test tests/e2e/admin.spec.ts tests/e2e/redesign-contracts.spec.ts --project=chromium --workers=1`

Expected: layout and test-fixture assertions FAIL before the new test support is complete.

- [ ] **Step 3: Apply Focus operations layouts**

Use the same tokens but compact density. Never render “migrations current” unless returned by the canonical status. Keep destructive and secret-bearing actions isolated and visibly distinct.

- [ ] **Step 4: Preserve security-sensitive behavior**

Do not alter endpoint paths, confirmation strings, passphrase minimum, download order, audit expansion, RBAC checks, or post-success form clearing.

- [ ] **Step 5: Run Admin, route, type, and accessibility tests**

Run the new Admin spec, relevant Web route tests, Web typecheck, and axe.

Expected: PASS.

- [ ] **Step 6: Commit Admin redesign**

```bash
git add -- apps/web/src/app/admin tests/e2e/admin.spec.ts tests/e2e/redesign-contracts.spec.ts
git commit -m "feat: redesign secure administration surfaces"
```

---

### Task 12: Remove Legacy Styling Only After Coverage Proves It Is Unused

**Files:**

- Modify: `apps/web/src/app/globals.css`
- Modify: page and component modules created in Tasks 2–11 when a live selector still depends on global compatibility.
- Create: `apps/web/src/lib/client/style-contract.test.ts`
- Modify: `tests/e2e/redesign-contracts.spec.ts`

**Interfaces:**

- Consumes: all migrated CSS Modules and frozen class hooks.
- Produces: a foundations-only global stylesheet plus an explicit compatibility section for frozen selectors.

- [ ] **Step 1: Add a failing source-level style contract**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("global style ownership", () => {
  it("keeps globals below the approved compatibility ceiling", () => {
    const source = readFileSync("src/app/globals.css", "utf8");
    expect(source.split("\n").length).toBeLessThan(1400);
    expect(source).not.toContain(".old-focused-lesson");
  });
});
```

Before choosing the final ceiling, list every remaining global selector and document which shared component owns it. The ceiling must reflect that explicit list, not an arbitrary mass deletion.

- [ ] **Step 2: Run the style contract and verify RED**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @iwc/web test -- src/lib/client/style-contract.test.ts`

Expected: FAIL because `globals.css` is currently over 5,400 lines.

- [ ] **Step 3: Delete only selectors proven unused**

Use `rg` to map every global class to TSX and tests. Move live page rules to their owning CSS Module. Keep frozen classes attached in TSX even when their visual rules move.

```bash
rg -n 'className=.*next-task-card|practice-paper-question|mobile-header|mobile-menu' apps/web/src tests/e2e
```

- [ ] **Step 4: Verify no visual or function regression after each deletion batch**

Run Web tests, typecheck, the redesign contract, and the affected page spec after each page-family removal. Do not combine unrelated deletion families into one untested batch.

- [ ] **Step 5: Run the style contract and verify GREEN**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @iwc/web test -- src/lib/client/style-contract.test.ts`

Expected: PASS with every frozen hook still present.

- [ ] **Step 6: Commit legacy cleanup**

```bash
git add -- apps/web/src/app/globals.css apps/web/src/lib/client/style-contract.test.ts tests/e2e/redesign-contracts.spec.ts
git commit -m "refactor: remove superseded frontend styles"
```

---

### Task 13: Full Functional, Visual, Accessibility, and Production Verification

**Files:**

- Modify: `tests/e2e/redesign-contracts.spec.ts` only for verified coverage gaps.
- Modify: `docs/superpowers/specs/2026-08-22-annotation-writing-desk-redesign.md` only if actual implementation requires a user-approved spec correction.
- Create: `docs/quality/annotation-desk-v1-evidence.md`.

**Interfaces:**

- Consumes: every completed redesign task and the complete functional freeze matrix.
- Produces: versioned evidence with commands, commit SHA, browser matrix, screenshots, known limitations, and real-account results.

- [ ] **Step 1: Run full static and package gates**

Run:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm format:check
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm lint
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm typecheck
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm test
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @iwc/web build
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @iwc/worker build
```

Expected: all commands exit 0; existing warnings are recorded rather than hidden.

- [ ] **Step 2: Run the complete browser matrix**

Run:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm test:e2e
```

Then run HTTP-mode fixture suites for canonical restore, pending, unavailable, retry, AI blocked/failed, and route identities.

Expected: Chromium, Firefox, WebKit, and mobile projects pass with only intentional environment-gated skips.

- [ ] **Step 3: Capture final responsive evidence**

Capture 1440×900, 1280×800, 1024×768, 768×1024, 390×844, and 320×720 screenshots for the key surfaces. Verify no horizontal overflow, no obscured input, one primary CTA, stable typography, and consistent EvidenceLink states.

- [ ] **Step 4: Perform keyboard, zoom, and reduced-motion review**

Verify keyboard-only Shell, write submit dialog, feedback links, teaching TOC/practice, paper navigation, account menu, settings, and Admin backup. Verify 200% and 400% zoom plus `prefers-reduced-motion`.

- [ ] **Step 5: Verify with the real learner account**

Using the user-authorized authenticated browser, verify login, multiple essays, first write, feedback, teaching, practice paper, rewrite, compare, transfer, growth, notifications, account, settings, and authorized Admin/backup pages. Do not submit destructive actions or transmit credentials during visual verification.

- [ ] **Step 6: Write versioned evidence**

Record exact commit SHA, commands, pass counts, browser versions, screenshot paths, real-account paths exercised, and any external pending evidence in `docs/quality/annotation-desk-v1-evidence.md`.

- [ ] **Step 7: Request final code and visual review**

Use `superpowers:requesting-code-review` for the full branch. Resolve every P0/P1 and visual P2 before merge.

- [ ] **Step 8: Commit final evidence**

```bash
git add -- tests/e2e/redesign-contracts.spec.ts docs/quality/annotation-desk-v1-evidence.md
git commit -m "test: verify annotation desk redesign"
```

---

## Plan Self-Review Results

- Every route and behavior query in the spec maps to a test task.
- Every page maps to Entry, Focus, Reading, or Workspace.
- The first redesign release keeps every frozen hook and accessible name.
- Saved-state and verified-evidence colors are separated in Task 2 and Task 9.
- Feedback optional lesson identity is covered in Task 6.
- Admin/backup security actions are covered explicitly in Task 11.
- Visual review, cross-browser coverage, real-account validation, and rollback evidence are covered in Task 13.
- No database, API, worker, AI prompt, or learning state changes are included.
