# Annotation Desk v1 verification evidence

## Decision

**Status: VERIFIED_WITH_EXTERNAL_PENDING.**

All repository-controlled release gates are green for the annotation desk
redesign. Real-account read-only traversal and usable content inspection at
actual 200%/400% Chrome zoom remain explicitly external pending; neither is
represented by Demo or viewport proxy evidence.

Evidence labels:

- `VERIFIED`: a fresh command or browser observation completed in this run.
- `EXTERNAL_PENDING`: required authorized external state was unavailable, so no
  result is inferred.
- `INTENTIONAL_SKIP`: the test belongs to a different runtime or input surface;
  its owning suite was run separately.

## Version and environment

| Item                         | Observed value                             |
| ---------------------------- | ------------------------------------------ |
| Branch                       | `codex/frontend-redesign`                  |
| Verified production commit   | `ce4f2f33a08428609cfb0e7bb6d050a32c633ce5` |
| Initial pre-fix audit commit | `d6d351a3de1665486f152da0f72a944436e2d88a` |
| Merge base / rollback commit | `e13e97fee3006f9bd080b060350ba811556c187d` |
| Node                         | `v24.19.0`                                 |
| pnpm                         | `11.16.0`                                  |
| Playwright                   | `1.62.1`                                   |
| Bundled Chromium             | `151.0.7922.34`                            |
| Bundled Firefox              | `153.0`                                    |
| Bundled WebKit               | `26.5`                                     |
| Installed Google Chrome      | `151.0.7922.170`                           |
| Host                         | macOS, Asia/Shanghai                       |

No database, API schema, worker contract, AI prompt, scoring rule, cycle
identity, or learning-state migration was introduced. `e13e97f` remains the
inspected pre-redesign recovery point; rollback was not executed.

## Static, package, and production gates

Every command used `PATH=/opt/homebrew/opt/node@24/bin:$PATH`.

| Command                           | Result   | Fresh evidence                                                                                                                                                     |
| --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm format:check`               | VERIFIED | Exit 0. `.prettierignore` now excludes only the ignored `.learnings/` directory; the four tracked formatting failures were formatted.                              |
| `pnpm lint`                       | VERIFIED | Exit 0, 0 errors. Four existing `react-refresh/only-export-components` warnings remain recorded in `app/layout.tsx`, `page-layout.tsx`, and `locale-provider.tsx`. |
| `pnpm typecheck`                  | VERIFIED | Exit 0 across all workspace packages and `scripts/tsconfig.json`.                                                                                                  |
| `pnpm test`                       | VERIFIED | 551 passed, 56 intentionally skipped; 63 test files passed and 12 files were intentionally skipped.                                                                |
| `pnpm --filter @iwc/web build`    | VERIFIED | Exit 0; Next.js 16.3.0 compiled, typechecked, and generated 44/44 static pages.                                                                                    |
| `pnpm --filter @iwc/worker build` | VERIFIED | Exit 0; both ESM entry points and source maps were generated.                                                                                                      |

Production-mode smoke on port 3214 reached Ready. HTTP results were
`/api/v1/health/live` 200, `/today` 200, and the emitted CSS asset 200. Next
recorded that the canonical deployment uses standalone output; the repository
Dockerfile copies both the standalone tree and `.next/static`.

## Complete browser matrix

Command:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH \
  NEXT_PUBLIC_DEMO_MODE=true pnpm test:e2e
```

Final result: **VERIFIED**, exit 0, 752 tests enumerated, 590 passed, 162
intentional runtime/project skips, 0 failed, 2.4 minutes.

The intentional skips are owned elsewhere in this evidence: non-Demo HTTP
fixtures are run below; touch-only projects do not claim a hardware-keyboard
contract; desktop AppShell locators do not run against the mobile navigation.
No failure was converted into a skip.

Warnings retained rather than hidden:

- Node reported that `NO_COLOR` is ignored while `FORCE_COLOR` is set.
- Next development mode reported the existing missing
  `data-scroll-behavior="smooth"` advisory during some route transitions.
- WebKit/mobile occasionally reported a hydrated `<details open>` mismatch
  after tests intentionally opened the mobile menu. The corresponding mobile
  menu, navigation, keyboard, layout, and axe assertions all passed.

## Non-Demo HTTP state matrix

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

Result: VERIFIED, 37/37 passed. Coverage includes notification read state,
Today mixed review and waiting notice, blind-snapshot failure, canonical first
answer restoration, missing/timeout recovery, pending, unavailable, retry,
late-completion reconciliation, paper pending/results, transfer
PASS/FAIL/NO_OPPORTUNITY/evaluation failure, missing comparison evidence, empty
growth history, and exact `activeCount === activeLimit === 8` behavior.

## Fix-round closure

| Finding                           | Final implementation and evidence                                                                                                                                                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compare 4.46:1 contrast           | `.unlockNote` uses approved Ink. Four-project `/compare` axe passes.                                                                                                                                                                                                 |
| Growth 10.4px / 4.0:1 suffixes    | Supporting suffixes use approved Ink and `max(0.8rem, 12px)`. Computed-size contract and four-project axe pass.                                                                                                                                                      |
| Mobile feedback 4.39:1            | Inactive mobile tab uses approved Ink; four-project feedback axe passes.                                                                                                                                                                                             |
| Lesson wide overflow              | Reading main expands to 1160px; the page becomes container-responsive by 1320px. 1440 keeps the two-column sticky TOC, while 1280 safely uses the collapsed TOC. All six widths have zero document overflow.                                                         |
| False Today topbar context        | Transfer, Account, Admin, and Backup map to their real labels/hrefs; transfer preserves its exact dynamic query identity. Unknown fallback links no longer claim `aria-current`.                                                                                     |
| Locale reload reset               | Locale is a `useSyncExternalStore` preference backed by localStorage and a tab event. SSR keeps the stable Chinese snapshot; hydration restores the saved locale without first overwriting it. SPA navigation and reload remain English after selection.             |
| Settings 390px clipping           | At 460px and below, categories use a discoverable 2×2 grid. At 390 and 320, nav `scrollWidth === clientWidth`, all four labels are complete, and document overflow is zero.                                                                                          |
| WebKit/mobile backup download     | Archive and checksum downloads use appended anchors with a 150ms browser-registration window before revocation/next download. All four projects observe archive first, checksum second, then secret clearing.                                                        |
| 40px Firefox rounding             | Geometry assertion allows the engine-safe 39.5px epsilon while retaining the 40px design rule.                                                                                                                                                                       |
| 1.9 WebKit line-height rounding   | Ratio assertion uses 1.899, covering floating representation without weakening the 1.9 declaration.                                                                                                                                                                  |
| Desktop tests in mobile project   | Only the desktop-control/hardware-keyboard cases are skipped in mobile; dedicated mobile menu/account/Shell coverage remains active.                                                                                                                                 |
| Offscreen skip-link pointer click | AppShell activates the focused skip link with Enter. The dedicated keyboard accessibility tests also pass.                                                                                                                                                           |
| Format gate                       | Four tracked files were formatted and `.learnings/` was narrowly ignored. Full format check exits 0.                                                                                                                                                                 |
| Stale Topbar resource identity    | The active Write, Feedback, Lesson, Rewrite, Compare, and Transfer context link now uses the authoritative current URL. Navigation still uses stored cycle-safe destinations. Old→new Transfer and stale Feedback mutations pass in Chromium, Firefox, and WebKit.   |
| Query-only Topbar reactivity      | A minimal `useSearchParams` observer supplies the current query identity without polling or disabling static output. Same-path Feedback and Compare sidebar Link navigation passes in Chromium, Firefox, and WebKit; touch-only mobile skips the desktop Link cases. |

The full-run convergence also exposed and closed three deterministic harness
issues without changing product semantics: Today essay metadata contrast now
uses Ink/Muted tokens; transfer expiry is installed before the first document
instead of racing a Today navigation; Entry/axe checks wait for route identity,
React handlers, and CSS settlement rather than using fixed sleeps.

Fix round 2 production commit
`89700fae749d01cede391dd67561fe093753bb24` closes the stale-storage review
finding. Before the implementation change, both regressions failed in all
three desktop engines (6/6 failures): Transfer linked the stored
`cycle=old&task=old`, and Feedback linked a stored/merged cycle-only target.
After the change, the focused matrix passed 6/6 and the complete desktop
AppShell file passed 30 tests with 3 intentional Demo/HTTP-boundary skips.
The final repository gates and complete four-project Demo matrix were then
rerun with Node 24.19.0 and remained green at 584 passed, 160 intentional
skips, and 0 failed.

Fix round 3 production commit
`ce4f2f33a08428609cfb0e7bb6d050a32c633ce5` hardens query-only route
reactivity. The review risk was not reproduced as a user-visible failure on
the old Next 16 implementation: both real same-path Feedback and Compare Link
navigations already passed because the AppShell parent rerender caused the
no-op external-store snapshot to be read again. This is recorded as
characterization, not a fabricated RED result.

The no-op subscription was still not a reliable response contract for a
Topbar that explicitly depends on `cycle`, `lesson`, and `task`. A minimal
Suspense-contained observer now derives the identity from canonical
`useSearchParams`, returns no UI, and updates the single Topbar outside the
boundary. This preserves 44/44 static generation and avoids duplicate
interactive controls during hydration. The complete desktop AppShell suite
passed 36 tests with 3 intentional Demo/HTTP-boundary skips; the full
four-project matrix passed 590 with 162 intentional skips and 0 failures out
of 752.

## Functional freeze matrix

| Surface                       | Status   | Evidence                                                                                                                                                                                                                                |
| ----------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global Shell                  | VERIFIED | Language switch plus reload persistence, cycle-safe sidebar storage, query-reactive authoritative Topbar identity, notifications, account Escape focus, logout clearing, mobile menu, skip link, and truthful fixed-route context pass. |
| `/`, `/signin`                | VERIFIED | Anonymous root, personal registration, shared invitation restriction, safe local `next`, and unsafe redirect rejection pass.                                                                                                            |
| `/join`, `/recover`, `/setup` | VERIFIED | Token/error query clearing, no token storage, invalid/missing states, setup flow, and provider recovery pass.                                                                                                                           |
| `/today`                      | VERIFIED | Every next action, exactly one primary CTA, new essay, mixed review, waiting notice, and AI queued/failed/blocked states pass.                                                                                                          |
| `/essays`                     | VERIFIED | Multiple independent hrefs, public/custom questions, Academic/General controls, and the exact 8/8 limit pass.                                                                                                                           |
| `/write`                      | VERIFIED | Autosave, IndexedDB conflict, recovery, timer, modal, keyboard shortcuts, and duplicate submission lock pass.                                                                                                                           |
| `/feedback`                   | VERIFIED | Optional lesson identity, complete report, retry states, bidirectional issue linking, keyboard activation, mobile tabs, and model lock pass.                                                                                            |
| `/lesson`                     | VERIFIED | Dynamic Markdown, restore, timeout, every analysis state, unlimited retry, responsive TOC, and paper entry pass.                                                                                                                        |
| `/lesson/paper`               | VERIFIED | Eight identities, draft restore, source links, timeout lock, empty answers, pending and result groups, navigation, and unobscured input pass.                                                                                           |
| `/rewrite`                    | VERIFIED | Prerequisite, locked/expired/reschedule, blind V2, 35/5 boundary, snapshot failure, and compare destination pass.                                                                                                                       |
| `/compare`                    | VERIFIED | Four deltas, recurrence normalization, insufficient evidence, retained gate, model unlock, and exact next href pass.                                                                                                                    |
| `/transfer`                   | VERIFIED | Eight-minute protocol, immutable first answer, processing, all outcomes, evaluation failure, expiry, no opportunity, and reschedule pass.                                                                                               |
| `/growth`                     | VERIFIED | All five levels, valid green semantics, neutral empty history, and readable metrics pass.                                                                                                                                               |
| `/settings`                   | VERIFIED | Learning, reminder, AI, model routing, data controls, failure recovery, and 2×2 mobile category navigation pass.                                                                                                                        |
| `/account`                    | VERIFIED | Session redirect, identity, password validation, menu behavior, and logout clearing pass in fixtures.                                                                                                                                   |
| `/admin`, `/admin/backup`     | VERIFIED | RBAC, honest health, recovery link, SMTP, audit, Owner-only backup, validation, failure states, ordered dual download, and secret clearing pass.                                                                                        |

Demo/Mock outcomes are never presented as real language-scoring evidence.

## Responsive and visual evidence

There are 54 exact-dimension screenshots under `output/playwright/task-13/`:
nine surfaces at 1440×900, 1280×800, 1024×768, 768×1024, 390×844, and
320×720. Filenames follow
`output/playwright/task-13/<surface>-<width>x<height>.png`.

After the fix round, screenshots for Today, Feedback, Lesson, Compare, Growth,
and Settings were refreshed. Automated capture metrics show:

- document overflow is 0 for every refreshed route/viewport pair;
- Lesson is 0 at all six widths, including the former +14/+31px cases;
- Settings nav is 358/358 at 390 and 288/288 at 320;
- `document.fonts.status === "loaded"` for every refreshed capture;
- each surface has zero or one visible primary button;
- final Today captures wait for the essay workspace, contain one next-task
  card, and are not loading-state captures.

Manual review confirms the 1440 Lesson retains the right-hand sticky TOC, 1280
uses the complete collapsed TOC without cropping, the mobile Settings grid
shows all four full labels, and Growth suffixes remain visually neutral rather
than borrowing verified-green semantics.

## Keyboard, motion, zoom, and axe

Focused Chromium keyboard result: 11/11 passed. It covers Shell and Setup skip
links, writing modal containment/restoration, sidebar state, account Escape
focus, feedback evidence links, teaching TOC focus, paper navigation/draft
preservation, and writing save/submit shortcuts. Additional keyboard traversal
confirmed Settings categories, Backup passphrase/confirmation, and the account
menu are reachable and correctly restore focus.

Reduced-motion inspection on nine core routes matched
`prefers-reduced-motion: reduce` and found zero visible transitions or
animations longer than 1ms and zero infinite iterations.

Fresh axe coverage passes on all core cross-browser routes, Entry/Account/
Settings at both audited sizes, and Admin/Backup at both audited sizes. The
previous Compare, Growth, Feedback, Today serious contrast findings are closed.

Google Chrome's real zoom UI was exercised at 200% and 400%, then reset to 100%
and the verification tab was closed. The current local target displayed a blank
content area in that user Chrome even at 100%, against both dev and production
servers, although URL, title, HTML, assets, and readiness were available.
Therefore actual zoom content readability remains `EXTERNAL_PENDING`. The 768,
390, and 320 screenshots are reflow evidence only and are not mislabeled as
browser zoom.

## Real learner account

**EXTERNAL_PENDING.** No currently authorized authenticated browser for this
verification target was available. No credentials were requested, entered,
stored, or transmitted. No real submission, recovery link, SMTP test, backup,
or destructive action was performed. Fixture coverage proves mutation paths
without claiming real-account results.

## Controller rulings preserved

1. Task 1 uses Playwright `test.fail()` only around not-yet-implemented redesign
   identity/layout assertions; Tasks 2–3 remove those markers when attributes
   land. Final review ensures no marker hides a missing assertion.
2. Task 12 inventories all live global selectors before applying the ceiling.
   The ceiling is the audited required count plus at most 10% compatibility
   headroom and remains no higher than 1,400; otherwise stop rather than delete
   live styles.
3. Task 13 real-account verification is read-only unless the user gives
   action-time permission for a specific submission or destructive action.
   Mutation paths are proved through Demo/HTTP fixtures.
4. The minimal `vitest.config.ts` expansion from `**/*.test.ts` to
   `**/*.test.{ts,tsx}` is allowed because the required TSX test was otherwise
   not collected.
5. `FocusedTeachingData` remains dynamic `sections[].markdown` plus top-level
   `practicePrompts`, with no fabricated block-kind field. Additive `MARKDOWN`
   and existing `PRACTICE` hooks use mutation-sensitive content/count tests.
6. Reading PageLayout/AppShell geometry does not apply Source Serif to the
   whole subtree; page modules opt English evidence into Source Serif.
7. Mock and `NO_OPPORTUNITY` remain neutral. Only real PASS, retained, or
   transferred evidence uses Evidence Green.
8. SDD task reports remain in the gitignored workspace and are not product
   commits.
9. The exact root `.gitignore` entry `.superpowers/sdd/` remains durable.
10. Backup surfaces use approved Paper/Canvas and spacing tokens rather than raw
    `#fff` or unapproved spacing.

## Remaining external evidence

Repository-controlled release checks are complete. The only remaining evidence
is external:

1. read-only traversal in a user-authorized real learner account;
2. actual 200%/400% content inspection in a Chrome/browser session that renders
   the target.

The independent full-branch review is handed back to the controller; Task 13
did not derive a reviewer subagent because its brief expressly prohibited
subagents.
