# Annotation Desk Final Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five residual final-review findings without changing any IELTS learning behavior, API, persistence, route identity, or state machine.

**Architecture:** First make typography roles and weights a single executable token contract. Then correct the remaining presentation semantics and bilingual copy in narrowly scoped page/component changes. Finish with fresh database, browser, accessibility, build, and independent whole-range review evidence.

**Tech Stack:** Next.js 16.3, React 19, TypeScript, CSS Modules, Vitest, Playwright, axe-core, pnpm, PostgreSQL 17.

**Spec:** `docs/superpowers/specs/2026-08-22-annotation-writing-desk-redesign.md`

## Global Constraints

- Do not modify database schemas, API shapes, worker tasks, prompts, scoring, learning state machines, route identities, or storage keys.
- Approved UI/Chinese family: Noto Sans SC with weights 400, 500, 650, 700.
- Approved English essay/example family: Source Serif 4 with weights 400 and 600.
- Approved utility/data family: IBM Plex Sans with weights 500 and 600.
- Font family and weight roles must be defined in `tokens.css`; `font-variation-settings` may not bypass role tokens.
- Error red is only for true technical/destructive failure, not neutral comparison or decoration.
- Evidence Green is only for real PASS, retained, or transferred evidence.
- Demo/Mock remains explicitly unscored and neutral.
- All visible auxiliary text remains at least 12px.
- Frozen hooks, ARIA names, URL query identities, autosave/recovery/retry/timer behavior remain unchanged.
- Real-account read-only and actual rendered 200%/400% zoom stay `EXTERNAL_PENDING` unless separately authorized and available.
- Use Node 24 for pnpm commands.

---

### Task 1: Make Typography Tokens the Only Font Authority

**Files:**

- Modify: `apps/web/src/styles/tokens.css`
- Modify: `apps/web/src/styles/foundations.css`
- Modify: `apps/web/src/components/evidence-link.module.css`
- Modify: `apps/web/src/app/compare/compare.module.css`
- Modify: `apps/web/src/app/today/today.module.css`
- Modify: `apps/web/src/app/account/account.module.css`
- Modify: other CSS Modules only where the executable scan finds an unapproved weight/family bypass
- Modify: `apps/web/src/lib/client/style-contract.test.ts`
- Test: `apps/web/src/components/design-system.test.tsx`
- Test: `tests/e2e/redesign-contracts.spec.ts`

**Interfaces:**

- Produces body weight tokens: `--desk-body-weight-regular`, `--desk-body-weight-medium`, `--desk-body-weight-semibold`, `--desk-body-weight-bold`.
- Produces reading weight tokens: `--desk-reading-weight-regular`, `--desk-reading-weight-semibold`.
- Produces utility weight tokens: `--desk-utility-weight-medium`, `--desk-utility-weight-semibold`.
- Existing family tokens remain `--desk-font-body`, `--desk-font-reading`, `--desk-font-utility`.

- [ ] **Step 1: Write failing typography authority tests**

```ts
it("keeps all typography roles in the approved token system", () => {
  const css = readAllWebCss();
  expect(css.usesOf("font-variation-settings")).toEqual([]);
  expect(css.undefinedCustomProperties()).toEqual([]);
  expect(css.fontWeightsOutsideApprovedRoles()).toEqual([]);
  expect(css.fontFamiliesOutsideApprovedRoles()).toEqual([]);
});
```

Add source assertions that `tokens.css` defines every family/weight token and that `foundations.css` consumes rather than defines those roles. Add browser computed assertions: Chinese Account H1 contains Noto Sans SC; English manuscript/example contains Source Serif 4; utility evidence label contains IBM Plex Sans.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @iwc/web test -- src/lib/client/style-contract.test.ts src/components/design-system.test.tsx
PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/redesign-contracts.spec.ts --project=chromium --workers=1 --grep="typography authority"
```

Expected: FAIL on 440/560/620 variation settings, role definitions outside tokens, and the Account serif heading.

- [ ] **Step 3: Define and consume approved role tokens**

```css
:root {
  --desk-font-body: "Noto Sans SC Variable", "PingFang SC", sans-serif;
  --desk-font-reading: "Source Serif 4 Variable", Georgia, serif;
  --desk-font-utility: "IBM Plex Sans Variable", "Segoe UI", sans-serif;
  --desk-body-weight-regular: 400;
  --desk-body-weight-medium: 500;
  --desk-body-weight-semibold: 650;
  --desk-body-weight-bold: 700;
  --desk-reading-weight-regular: 400;
  --desk-reading-weight-semibold: 600;
  --desk-utility-weight-medium: 500;
  --desk-utility-weight-semibold: 600;
}
```

Remove every low-level `font-variation-settings` declaration. Replace raw 440/560/620 and family declarations with the appropriate role token. Restore Account Chinese H1 to body/UI family; English learner content remains reading family.

- [ ] **Step 4: Run focused and package gates**

Run the RED commands again, then Web typecheck, lint, build, and focused Account/Compare/Today responsive + axe tests.

Expected: all pass with no new warnings in changed files.

- [ ] **Step 5: Commit**

```bash
git add -- apps/web/src/styles/tokens.css apps/web/src/styles/foundations.css apps/web/src/components/evidence-link.module.css apps/web/src/app/compare/compare.module.css apps/web/src/app/today/today.module.css apps/web/src/app/account/account.module.css apps/web/src/lib/client/style-contract.test.ts apps/web/src/components/design-system.test.tsx tests/e2e/redesign-contracts.spec.ts
git commit -m "fix: enforce typography role tokens"
```

---

### Task 2: Correct Remaining Presentation Semantics and Bilingual Copy

**Files:**

- Modify: `apps/web/src/app/compare/compare.module.css`
- Modify: `apps/web/src/components/app-shell.module.css`
- Modify: `apps/web/src/app/growth/page.tsx`
- Modify: `apps/web/src/app/lesson/paper/page.tsx`
- Modify: `apps/web/src/components/ui.tsx`
- Modify: `tests/e2e/lesson.spec.ts`
- Modify: `tests/e2e/redesign-contracts.spec.ts`
- Modify: `tests/e2e/accessibility.spec.ts`

**Interfaces:**

- Produces separate canonical Growth level labels and Demo result semantics.
- Preserves existing `DemoNotice` public props while rendering language-specific spans.

- [ ] **Step 1: Write five failing presentation tests**

```ts
test("ordinary comparison and entry decoration never use Error red", async ({
  page,
}) => {
  await page.goto("/compare?cycle=cycle-demo");
  await expectNoErrorToken(page.locator("[data-version-one]"));
  await page.goto("/signin");
  await expectNoErrorToken(page.locator("[data-entry-desk]"));
});

test("English Demo keeps all canonical Growth level names", async ({
  page,
}) => {
  await page.goto("/growth");
  await switchToEnglish(page);
  for (const label of [
    "Diagnosed",
    "Practising",
    "Applied",
    "Retained",
    "Transferred",
  ])
    await expect(page.getByText(label, { exact: true })).toBeVisible();
});
```

Add assertions that Demo paper footer says “Submission saved” rather than “Review saved”, and that Demo notice Chinese/English nodes carry `lang="zh-CN"` / `lang="en"`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/lesson.spec.ts tests/e2e/redesign-contracts.spec.ts tests/e2e/accessibility.spec.ts --project=chromium --workers=1 --grep="final review semantics|Demo language"
```

Expected: failures on Error-soft decoration, repeated English “Not evaluated”, paper footer, and unsplit language spans.

- [ ] **Step 3: Implement minimal semantic corrections**

- Version 1 comparison background uses Canvas/Amber-derived neutral color, not Error soft.
- Entry decorative line uses Annotation Blue/Canvas, not Error red.
- Keep canonical `levelPresentation` separate from Demo result state; append “not evaluated” without replacing Diagnosed/Practising/Applied/Retained/Transferred.
- Demo Paper footer uses “交卷记录已保存 / Submission saved”.
- Demo notice renders separate `<span lang="zh-CN">` and `<span lang="en">` nodes.

- [ ] **Step 4: Run focused and accessibility gates**

Run the RED command again, then four-project Compare/Growth/Paper/Entry axe and browser tests, Web unit/type/lint/build.

Expected: all pass; no Error token is used on ordinary decoration.

- [ ] **Step 5: Commit**

```bash
git add -- apps/web/src/app/compare/compare.module.css apps/web/src/components/app-shell.module.css apps/web/src/app/growth/page.tsx apps/web/src/app/lesson/paper/page.tsx apps/web/src/components/ui.tsx tests/e2e/lesson.spec.ts tests/e2e/redesign-contracts.spec.ts tests/e2e/accessibility.spec.ts
git commit -m "fix: close final presentation semantics"
```

---

### Task 3: Re-run Complete Gates and Independent Review

**Files:**

- Modify: `docs/quality/annotation-desk-v1-evidence.md`
- Create: `docs/quality/annotation-desk-review-remediation.md`
- Modify tests only when a fresh gate reveals an assertion defect; production fixes require a failing regression first.

**Interfaces:**

- Consumes Tasks 1–2 commits.
- Produces complete green evidence and an independent whole-range review package.

- [ ] **Step 1: Run full repository and PostgreSQL gates**

Run format, lint, typecheck, full tests with isolated PostgreSQL 17, Web build, Worker build, and `git diff --check`. Remove only the temporary container created for this task; create no Docker volume.

- [ ] **Step 2: Run complete browser matrices**

Run complete four-project Demo E2E, non-Demo HTTP matrix, Admin/Backup four-project matrix, keyboard suite, and affected responsive/axe/font contracts.

- [ ] **Step 3: Refresh visual evidence**

Refresh affected Compare, Growth, Paper, Account, Entry, and Shell screenshots at desktop and 390px. Keep real-account and actual rendered 200%/400% checks `EXTERNAL_PENDING` unless an authorized rendering session exists.

- [ ] **Step 4: Update versioned evidence**

Record exact HEAD, commands, pass/skip counts, PostgreSQL version, screenshots, and the external-pending boundary. Remove superseded “all findings closed” claims that refer to an older commit.

- [ ] **Step 5: Request independent final review**

Generate a diff package from `5547b656e30f4a83b0b6617855fc4145e8847a2a` to the new HEAD. Reviewer must verdict the five residual findings and check the remediation diff for new breakage.

- [ ] **Step 6: Commit evidence**

```bash
git add -- docs/quality/annotation-desk-v1-evidence.md docs/quality/annotation-desk-review-remediation.md
git commit -m "docs: verify final review remediation"
```

---

## Plan Self-Review Results

- All five residual findings map to Tasks 1 or 2.
- Typography tokens and presentation semantics are independent review surfaces.
- Every production change has a named failing test before implementation.
- Task 3 covers static, PostgreSQL, browser, accessibility, visual, and independent-review evidence.
- No API, state-machine, prompt, persistence, or route change is included.
