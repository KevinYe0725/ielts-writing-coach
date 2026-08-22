# Annotation Desk v1 verification evidence

## Decision

**Status: DONE_WITH_CONCERNS; merge and release remain blocked.**

The redesign target was verified at
`711128b3f842916cbb5b7934925a740ba4429fba` on 2026-08-23 in
Asia/Shanghai. Static type, lint, unit, package build, focused keyboard,
reduced-motion, HTTP-state, and most responsive checks passed. The full Demo
browser gate and the formatting gate did not pass. Stable production findings
remain in route context, locale reload, contrast, desktop teaching overflow,
mobile Settings navigation, and WebKit-family backup downloads. No production
file was changed during this verification task.

Evidence labels in this document mean:

- `VERIFIED`: a fresh command or browser observation completed in this run.
- `FAIL`: the named command or requirement was reproduced and did not meet the
  approved criterion.
- `EXTERNAL_PENDING`: the required external state or authorized browser was not
  available; no result is inferred.
- `TEST_CONCERN`: the test itself is mis-scoped, timing-sensitive, or uses an
  over-exact floating-point boundary; it is not product-runtime evidence.

## Version and environment

| Item                         | Observed value                             |
| ---------------------------- | ------------------------------------------ |
| Branch                       | `codex/frontend-redesign`                  |
| Verification target          | `711128b3f842916cbb5b7934925a740ba4429fba` |
| Task base                    | `711128b3f842916cbb5b7934925a740ba4429fba` |
| Merge base / rollback commit | `e13e97fee3006f9bd080b060350ba811556c187d` |
| Node                         | `v24.19.0`                                 |
| pnpm                         | `11.16.0`                                  |
| Playwright                   | `1.62.1`                                   |
| Bundled Chromium             | `151.0.7922.34`                            |
| Bundled Firefox              | `153.0`                                    |
| Bundled WebKit               | `26.5`                                     |
| Installed Google Chrome      | `151.0.7922.170`                           |
| Host                         | macOS, Asia/Shanghai                       |

The branch contains presentation, CSS-module, contract-test, and documentation
changes relative to the merge base. The approved scope does not include a
database, API, worker, prompt, or learning-state migration. Rollback was not
executed; `e13e97f` is the inspected pre-redesign recovery point.

## Static and package gates

All commands used Node 24 through
`PATH=/opt/homebrew/opt/node@24/bin:$PATH`.

| Command                                                   | Result   | Fresh evidence                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm format:check`                                       | **FAIL** | Exit 1. Prettier 3.6.2 reported `.learnings/ERRORS.md`, `apps/web/src/components/design-system.test.tsx`, `apps/web/src/components/layout/page-layout.tsx`, `apps/web/src/styles/foundations.css`, and `packages/ai/src/mock.test.ts`. The `.learnings` file is ignored; the other four are tracked and predate Task 13. |
| `pnpm lint`                                               | VERIFIED | Exit 0, 0 errors, 4 recorded `react-refresh/only-export-components` warnings in `app/layout.tsx`, `page-layout.tsx`, and `locale-provider.tsx`.                                                                                                                                                                          |
| `pnpm typecheck`                                          | VERIFIED | Exit 0 across all workspace packages and `scripts/tsconfig.json`.                                                                                                                                                                                                                                                        |
| `pnpm test`                                               | VERIFIED | 551 passed, 56 skipped; 63 test files passed and 12 files were intentionally skipped.                                                                                                                                                                                                                                    |
| `pnpm --filter @iwc/web build`                            | VERIFIED | Exit 0; Next.js 16.3.0 production build compiled, typechecked, and generated 44/44 static pages.                                                                                                                                                                                                                         |
| `pnpm --filter @iwc/worker build`                         | VERIFIED | Exit 0; `tsup` generated both ESM entry points and source maps.                                                                                                                                                                                                                                                          |
| `NEXT_PUBLIC_DEMO_MODE=true pnpm --filter @iwc/web build` | VERIFIED | Additional production-mode Demo bundle compiled, typechecked, and generated 44/44 pages.                                                                                                                                                                                                                                 |

`next start` on port 3214 reached Ready and
`/api/v1/health/live` returned HTTP 200. Next also warned that the configured
deployment output is standalone. The generated standalone server reached Ready
and returned HTTP 200 for health and `/today`; a bare standalone directory did
not contain copied static assets, as expected outside the Docker packaging
step. `Dockerfile` lines 63–65 are the canonical packaging path and copy both
the standalone tree and `.next/static`.

## Browser suites

### Complete Demo matrix

Command:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH \
  NEXT_PUBLIC_DEMO_MODE=true pnpm test:e2e
```

Result: **FAIL**, exit 1, 704 tests enumerated, 529 passed, 152 skipped, 23
failed in 3.0 minutes. Skips were environment/project guards; failures were not
hidden or converted to skips.

Stable failures were separated from concurrency noise with fresh single-worker
reruns:

| Finding                                 | Stable rerun                                                                                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/compare` serious axe contrast         | 4/4 projects failed. `.unlockNote`: `#667085` over `#f0f3f6`, ratio 4.46:1, required 4.5:1.                                                                                              |
| `/growth` serious axe contrast          | 4/4 projects failed. Two `small` score suffixes: 10.4px bold `#737f8f` over `#fdfdfe`, ratio 4.0:1, required 4.5:1.                                                                      |
| Mobile `/feedback` serious axe contrast | Mobile rerun failed. Inactive “原文” tab: 13px bold `#667085` over `#eef1f5`, ratio 4.39:1, required 4.5:1.                                                                              |
| Backup archive plus checksum            | WebKit and mobile reruns each received only `ielts-writing-coach.iwc-backup.sha256`; the `.iwc-backup` download was absent after 5 seconds. Chromium and Firefox passed in the full run. |

Five full-run failures passed on single-worker rerun and remain recorded as
concurrency/timing noise rather than product claims: WebKit Today axe, WebKit
language switch, WebKit transfer reschedule, mobile Setup axe, and mobile
transfer reschedule.

The following deterministic failures are `TEST_CONCERN`:

- Firefox measured a 40px paper target as `39.99999237060547px`.
- WebKit/mobile measured the 1.9 feedback line-height ratio as
  `1.8999999411764705`.
- Desktop AppShell tests run unchanged in the mobile project and wait for the
  intentionally hidden desktop locale switch and account trigger.
- The AppShell skip-link test uses pointer `click()` on an offscreen skip link
  in WebKit/mobile. The keyboard-driven accessibility skip-link test passes.

These concerns still keep the required full command red. They must be corrected
without weakening the product assertions before merge.

The Task 13-owned Demo contract file passed 48/48 in Chromium with the
non-Demo 8/8 fixture intentionally skipped.

### Non-Demo HTTP-state suites

Command:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH \
  NEXT_PUBLIC_DEMO_MODE=false \
  pnpm exec playwright test \
  tests/e2e/app-shell.spec.ts \
  tests/e2e/setup-today.spec.ts \
  tests/e2e/writing-rewrite.spec.ts \
  tests/e2e/lesson.spec.ts \
  tests/e2e/redesign-contracts.spec.ts \
  --project=chromium --workers=1 \
  --grep 'HTTP boundary|public HTTP contract'
```

Result: VERIFIED, 37/37 passed. The suite covers notification read state,
Today mixed review and waiting notice, blind-snapshot failure, canonical first
answer restoration, initial restore timeout/missing response, pending,
unavailable, retry after timeout, completed-late retry, paper pending/results,
PASS/FAIL/NO_OPPORTUNITY/failed transfer evaluation, missing compare evidence,
and empty growth history.

Task 13 adds an exact `activeCount === activeLimit === 8` HTTP fixture in
`tests/e2e/redesign-contracts.spec.ts`. It is included in the 37-case result and
proves all eight essays remain visible, the ninth-essay action is absent, and
the completion-first explanation is displayed.

## Functional freeze matrix

| Surface                       | Status                      | Evidence and boundary                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global Shell                  | **FAIL**                    | Sidebar collapse/reload, mobile menu, notification read state, skip link, account-menu Escape focus, logout storage clearing, and locale SPA navigation are covered. Fresh isolated checks show `/transfer`, authenticated `/account`, and `/admin` all fall back to a Today context link with `aria-current="page"`. Locale changes to `en` and stores `en`, but a reload returns both DOM language and `iwc.locale` to `zh-CN`. |
| `/`, `/signin`                | VERIFIED                    | Anonymous root, safe local `next`, unsafe redirect rejection, personal registration, and shared invitation restriction pass.                                                                                                                                                                                                                                                                                                      |
| `/join`, `/recover`, `/setup` | VERIFIED                    | Entry layout/state, token/error query clearing, storage non-persistence, invalid state, and provider failure recovery pass in fixture coverage. No credential was entered.                                                                                                                                                                                                                                                        |
| `/today`                      | VERIFIED                    | Exactly one primary CTA, all existing utilities, new essay, mixed review, waiting notice, and queued/failed/blocked presentation are covered by Demo and HTTP fixtures.                                                                                                                                                                                                                                                           |
| `/essays`                     | VERIFIED                    | Independent server-owned hrefs, public/custom entry, Academic/General controls, multi-essay layout, and the new exact 8/8 boundary pass.                                                                                                                                                                                                                                                                                          |
| `/write`                      | VERIFIED                    | Autosave shortcut, keyboard submit dialog, timer, local draft conflict, submission lock, and cycle identity pass in unit/browser coverage.                                                                                                                                                                                                                                                                                        |
| `/feedback`                   | **FAIL**                    | Report identity with/without lesson, issue linking, keyboard activation, and mobile tab behavior pass. Mobile inactive-tab contrast is 4.39:1 and fails axe.                                                                                                                                                                                                                                                                      |
| `/lesson`                     | **FAIL**                    | Dynamic content, canonical restore, all analysis states, retries, TOC/practice, and paper entry are covered. The page has document overflow of 31px at 1280×800 and 14px at 1440×900.                                                                                                                                                                                                                                             |
| `/lesson/paper`               | VERIFIED_WITH_TEST_CONCERN  | Eight identities, draft retention, navigation, timeout lock, pending/results, and submission review pass. Firefox only fails the over-exact `39.999992 >= 40` assertion.                                                                                                                                                                                                                                                          |
| `/rewrite`                    | VERIFIED                    | Prerequisite/locked/expired, reschedule, blind snapshot failure, 35/5-minute boundary, draft conflict, and compare destination are covered.                                                                                                                                                                                                                                                                                       |
| `/compare`                    | **FAIL**                    | Delta/evidence/retained/next href functions pass, but serious axe contrast is 4.46:1.                                                                                                                                                                                                                                                                                                                                             |
| `/transfer`                   | VERIFIED_WITH_SHELL_FAILURE | Timer, immutable first answer, processing, PASS/FAIL/NO_OPPORTUNITY, failed evaluation, expiry, reschedule, and neutral evidence semantics pass. Shell context is falsely Today/current.                                                                                                                                                                                                                                          |
| `/growth`                     | **FAIL**                    | All five levels and no-invented-trend behavior pass. Two score suffixes fail serious contrast at 4.0:1.                                                                                                                                                                                                                                                                                                                           |
| `/settings`                   | **FAIL**                    | All four categories and technical/data controls remain reachable. At 390px the nav has client width 358px and scroll width 412px; “数据与隐私” ends at x=428.36 beyond the 390px viewport and is visibly clipped to “数据” without an affordance.                                                                                                                                                                                 |
| `/account`                    | VERIFIED_WITH_SHELL_FAILURE | Session redirect, identity, password validation, account menu, and logout behavior pass in fixtures. The topbar falsely marks Today current. Real-account content is external pending.                                                                                                                                                                                                                                            |
| `/admin`, `/admin/backup`     | **FAIL**                    | RBAC, honest health, recovery link, SMTP, audit, Owner-only access, secret validation/clearing, failure state, and Chromium/Firefox dual download pass. WebKit/mobile lose the archive download; both pages also fall back to the false Today/current context.                                                                                                                                                                    |

No Demo/Mock result was used as real language-scoring evidence.

## Responsive and visual evidence

Fifty-four viewport screenshots were captured under
`output/playwright/task-13/`: nine surfaces at each of 1440×900, 1280×800,
1024×768, 768×1024, 390×844, and 320×720.

Surfaces: `today`, `write`, `feedback`, `lesson`, `paper`, `compare`, `growth`,
`settings`, and `backup`. Each file uses
`output/playwright/task-13/<surface>-<width>x<height>.png`; `sips` verified all
pixel dimensions match the requested viewport exactly.

Automated geometry accompanying the screenshots found:

- `document.fonts.status === "loaded"` on all 54 captures.
- zero horizontal overflow on 52/54 route/viewport pairs.
- `/lesson` overflow of 14px at 1440×900 and 31px at 1280×800. At 1280,
  the 984px reading layout starts at x=327.1875 and ends at x=1311.1875.
- zero overflow on `/lesson` at 1024, 768, 390, and 320.
- every audited surface has zero or one visible `.button-primary`; Today,
  write, feedback, paper, lesson, compare, and settings have one, while Growth
  and Backup have zero in their inspected state.
- final Today screenshots wait for the compact essay workspace and contain one
  `.next-task-card`; none is a loading-state capture.

Representative visual inspection confirmed the quiet paper/canvas hierarchy,
single blue primary action, responsive manuscript/paper layouts, and readable
EvidenceLink records. It also confirmed the lesson desktop crop and Settings
tab clipping described above. Screenshot images are local QA artifacts and are
ignored by Git; this document is the versioned index.

## Keyboard, motion, zoom, and axe

### Keyboard

A focused Chromium single-worker run passed 11/11:

- Today and Setup skip links;
- writing save/submit and modal focus containment/restoration;
- sidebar collapse with stored state;
- account-menu Escape focus restoration and logout destination clearing;
- feedback evidence-link activation;
- teaching mobile TOC focus;
- practice-paper navigation and draft preservation.

Additional keyboard-only inspection found:

- Settings: 14 Tabs reach “AI 服务”; Enter activates the category and its
  heading.
- Backup: after data is visible, Tabs 12 and 13 reach the passphrase and exact
  confirmation inputs in order.
- Account menu: Tab reaches the signed-in fixture trigger, Enter opens it, and
  Escape restores trigger focus.

No destructive or credential-bearing action was submitted.

### Reduced motion

`prefers-reduced-motion: reduce` matched on nine core routes. Computed style
inspection found zero visible elements with a transition or animation longer
than 1ms and zero infinite animation iterations.

### Zoom

Google Chrome's real browser zoom control was exercised and its UI reported
200% and 400%; it was then reset to 100% and the verification tab was closed.
However, the current branch rendered a blank content area in that user Chrome
at 100%, 200%, and 400%, both against `next dev` and the production bundle's
`next start`. URL, title, server requests, readiness, and HTML responses were
present, while the web content was absent from both the screenshot and AX tree.
Therefore content readability/operability at actual 200% and 400% is
**EXTERNAL_PENDING**, not passed. The 768, 390, and 320 CSS-pixel captures
remain reflow evidence only and are not mislabeled as browser zoom.

### Axe

Fresh axe results close the Task 10 exploratory question: the `/compare` and
`/growth` findings are current, serious WCAG 2 AA color-contrast violations in
all four projects. Mobile `/feedback` adds one serious contrast violation.
Entry, account, settings, Admin, and Backup scoped axe checks otherwise pass in
their focused runs.

## Real learner account

**EXTERNAL_PENDING.** No currently authorized authenticated browser for this
verification target was available. The Chrome window began at a New Tab and no
credentials were requested, entered, stored, or transmitted. An intercepted
test-only session was used only to exercise account/Shell semantics.

Consequently, login, existing multiple essays, first write, feedback, teaching,
paper, rewrite, compare, transfer, growth, notifications, account, Settings,
and authorized Admin/Backup were not claimed against a real learner account.
Mutation paths remain covered by Demo/HTTP fixtures under the read-only
controller ruling.

## Controller rulings preserved

The following rulings are carried into this final evidence without changing
their meaning:

1. Task 1 uses Playwright `test.fail()` only around not-yet-implemented redesign
   identity/layout assertions; Tasks 2–3 remove those expected-failure markers
   when the attributes land. Final review must ensure no marker hides a missing
   assertion.
2. Task 12 inventories every remaining live global selector before applying
   the line ceiling. The final ceiling is the audited required count plus at
   most 10% compatibility headroom and remains no higher than 1,400; if that is
   impossible, stop rather than delete live styles.
3. Task 13 real-account verification is read-only unless the user gives
   action-time permission for a specific submission or destructive action.
   Mutation paths are proved through Demo/HTTP fixtures.
4. The minimal root `vitest.config.ts` include expansion from `**/*.test.ts` to
   `**/*.test.{ts,tsx}` is allowed because the required TSX component test was
   otherwise not collected.
5. The authoritative `FocusedTeachingData` contract is dynamic
   `sections[].markdown` plus top-level `practicePrompts`, with no block-kind
   field. Keep that client/API contract, use additive `MARKDOWN` plus existing
   `PRACTICE` hooks, and use mutation-sensitive dynamic content/count tests
   instead of fabricating stale block kinds.
6. Remove the whole-subtree Source Serif coupling from both Reading PageLayout
   and AppShell; Reading pages inherit the body/UI font and page modules opt
   English evidence into Source Serif.
7. Mock and `NO_OPPORTUNITY` must remain neutral. Only real PASS, retained, or
   transferred evidence may use Evidence Green.
8. Task reports live in the gitignored SDD workspace and are not product
   commits; the local report/ledger remains available to the controller.
9. Keep the exact root `.gitignore` entry `.superpowers/sdd/` so generated SDD
   scratch cannot be force-added accidentally.
10. Raw `#fff` and unapproved 10px spacing on the backup control-boundary fix
    path must use Paper/Canvas and approved spacing tokens.

## Review and release boundary

The `requesting-code-review` workflow requires a reviewer subagent, but Task 13
explicitly prohibits deriving subagents. No independent final reviewer was
spawned. Controller review is therefore pending and must inspect the full
`e13e97f..HEAD` branch plus this evidence.

Release/merge stays blocked until at least:

1. all stable production findings above are fixed and reproduced tests pass;
2. the full Demo 4-project command exits 0 with only intentional skips;
3. `pnpm format:check` exits 0;
4. actual 200%/400% content inspection is completed in a browser that renders
   the target;
5. the real-account read-only matrix is completed in an authorized session or
   explicitly accepted as external pending by the release owner.
