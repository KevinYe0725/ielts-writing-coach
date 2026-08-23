# Annotation Desk v1 current verification evidence

## Decision

**Status: GATES_VERIFIED_SCOPED_RE_REVIEW_PENDING_WITH_EXTERNAL_PENDING.**

All repository-controlled automated gates are green on the code and test tree
at `9b7f0cb8952ab3a5e12f655e51acd42591c945eb`. The controller-owned scoped
re-review is not represented as complete in this file. Two checks remain
outside repository control:

1. read-only traversal with a user-authorized real learner account;
2. usable-content inspection at actual rendered 200% and 400% browser zoom.

Both remain `EXTERNAL_PENDING`. Demo fixtures, HTTP fixtures, viewport reflow,
and static analysis are not presented as substitutes.

This evidence refreshes the review package committed at
`7639225a2b146d9f51da78e0f6e5c0ef1a66a30a`. That package referenced
`708deb18e5ba52c7017bf25d6732dbb04f5dd564` and did not yet cover the rendered
inheritance/UA typography bypass or the full Error-token helper surface.

## Version and environment

| Item                                | Observed value                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| Branch                              | `codex/frontend-redesign`                                                                 |
| Verified code and test HEAD         | `9b7f0cb8952ab3a5e12f655e51acd42591c945eb`                                                |
| Remediation implementation baseline | `4263cc91970ff9c2e60c6ab213dfdc76669cbedd`                                                |
| Final-review findings base          | `7639225a2b146d9f51da78e0f6e5c0ef1a66a30a`                                                |
| Whole-review range base             | `5547b656e30f4a83b0b6617855fc4145e8847a2a`                                                |
| Pre-redesign rollback point         | `e13e97fee3006f9bd080b060350ba811556c187d`                                                |
| Node                                | `v24.19.0` via `PATH=/opt/homebrew/opt/node@24/bin:$PATH`                                 |
| pnpm                                | `11.16.0`                                                                                 |
| Playwright                          | `1.62.1`                                                                                  |
| PostgreSQL                          | `17.6`, local image `postgres:17.6-bookworm`                                              |
| Database isolation                  | `iwc-finalfix-pg17-ab68`, tmpfs data directory, `Mounts=[]`, random loopback port `54991` |
| Database cleanup                    | container removed after the final DB-backed run; no Docker volume command executed        |

No database/API schema, worker task, AI prompt, scoring rule, learning-state
transition, route identity, or persistent storage key changed in the review
remediation. The database used test-only credentials and an isolated temporary
data directory.

## Complete repository gates

All commands below were rerun on `9b7f0cb8952ab3a5e12f655e51acd42591c945eb`
unless a row explicitly describes a production build whose production inputs
are identical at that test-only commit.

| Command                                                                              | Result                                                                                    |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `pnpm format:check`                                                                  | VERIFIED, exit 0                                                                          |
| `pnpm lint`                                                                          | VERIFIED, exit 0; 0 errors and 4 existing `react-refresh/only-export-components` warnings |
| `pnpm typecheck`                                                                     | VERIFIED, exit 0 across all packages and scripts                                          |
| `DATABASE_URL=<isolated-pg17> IWC_TEST_DATABASE_URL=<isolated-pg17> pnpm db:migrate` | VERIFIED, exit 0                                                                          |
| `DATABASE_URL=<isolated-pg17> IWC_TEST_DATABASE_URL=<isolated-pg17> pnpm test`       | VERIFIED, 77 files / 631 tests passed, 0 skipped                                          |
| `pnpm --filter @iwc/web build`                                                       | VERIFIED, compiled and generated 44/44 static pages                                       |
| `pnpm --filter @iwc/worker build`                                                    | VERIFIED, both ESM entry points and source maps generated                                 |
| `git diff --check`                                                                   | VERIFIED, exit 0                                                                          |

The DB-backed package total is 2 email, 8 config, 11 learning-contract, 89 AI,
5 question-bank, 6 DB, 6 exchange, 30 learning-core, 5 auth, 131 Worker, and
338 Web tests.

## Browser matrices

### Complete four-project Demo matrix

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH \
  NEXT_PUBLIC_DEMO_MODE=true \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3220 \
  pnpm exec playwright test --reporter=dot
```

Result: **VERIFIED**, 832 enumerated, 614 passed, 218 intentional skips, 0
failed, about 3.2 minutes. Chromium, Firefox, WebKit, and mobile all ran. The
28 additional passes are the seven new computed typography/Error-helper
contracts across all four projects.

The skip count is ownership-based: Admin/Backup runs in the non-Demo matrix;
HTTP fixture suites run with Demo disabled; touch/mobile projects skip
hardware-keyboard-only contracts. No failing assertion was converted to a
skip.

### Complete non-Demo HTTP matrix

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH \
  NEXT_PUBLIC_DEMO_MODE=false \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3221 \
  pnpm exec playwright test \
  tests/e2e/app-shell.spec.ts \
  tests/e2e/setup-today.spec.ts \
  tests/e2e/writing-rewrite.spec.ts \
  tests/e2e/lesson.spec.ts \
  tests/e2e/redesign-contracts.spec.ts \
  tests/e2e/admin.spec.ts \
  --project=chromium --workers=1 \
  --grep 'HTTP boundary|public HTTP contract|secure administration surfaces' \
  --reporter=line
```

Result: **VERIFIED**, 51/51 passed, 0 skipped. It covers notifications, Today
query states, blind-snapshot failure, the exact eight-essay limit, teaching
restore/retry states, Paper pending/results, Transfer result states, Growth,
Compare, dynamic quote language, and the Admin/RBAC/backup fixture matrix.

### Admin/Backup four-project matrix

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH \
  NEXT_PUBLIC_DEMO_MODE=false \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3222 \
  pnpm exec playwright test tests/e2e/admin.spec.ts \
  --grep 'secure administration surfaces' --reporter=dot
```

Result: **VERIFIED**, 48/48 passed across Chromium, Firefox, WebKit, and
mobile. Recovery-link, SMTP, archive, and checksum responses were Playwright
HTTP fixtures; no real side effect occurred.

### Focused rendered typography, Error-token, and accessibility contracts

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH \
  NEXT_PUBLIC_DEMO_MODE=true \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3223 \
  pnpm exec playwright test tests/e2e/redesign-contracts.spec.ts \
  --grep 'Paper English option labels|Lesson Markdown maps|Error-token helper rejects|keeps every visible explicit English evidence descendant' \
  --reporter=line

PATH=/opt/homebrew/opt/node@24/bin:$PATH \
  NEXT_PUBLIC_DEMO_MODE=true \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3223 \
  pnpm exec playwright test tests/e2e/accessibility.spec.ts --reporter=dot

PATH=/opt/homebrew/opt/node@24/bin:$PATH \
  pnpm exec vitest run apps/web/src/lib/client/style-contract.test.ts
```

Results: **VERIFIED**, 28/28 four-project computed typography/Error-token
contracts; 49 accessibility/axe/keyboard passes plus 3 intentional mobile
hardware-keyboard skips; 20/20 static typography/token contracts. The complete
832-test Demo matrix independently covers the remaining responsive, focus,
language, and presentation contracts on the same code/test HEAD.

The retained non-failing logs are the existing `NO_COLOR`/`FORCE_COLOR`
warning, Next smooth-scroll advisory, and the known mobile `<details open>`
hydration advisory after navigation tests intentionally open the menu.

## Fresh-gate test assertion defects

The earlier `708deb1` complete Demo run exposed a WebKit pre-hydration locale
click. Later complete runs exposed the same readiness class in newly added
presentation contracts and an Account font scan whose execution context
changed during navigation. Production behavior reproduced correctly in
isolated runs.

Commit `708deb1` changes tests only:

- waits for route-specific client-ready anchors before the first interaction;
- chooses the desktop or mobile locale switch from the executable 960px
  breakpoint instead of a transient `:visible` match;
- retries computed-style and font assertions across CSS/navigation readiness
  without lowering any threshold.

Focused proof was 10/10 WebKit locale repetitions, 48/48 affected contracts
across all four projects with three repetitions, and 10/10 WebKit Account font
repetitions. The subsequent 804-test matrix was the historical green result at
that commit; the current complete matrix is the 832-test result above.

## Screenshot evidence

Twelve exact-viewport PNGs were last refreshed for the earlier
`708deb18e5ba52c7017bf25d6732dbb04f5dd564` production-mode Demo build under
`output/playwright/annotation-desk-review-remediation/`:

- Compare, Growth, Paper, Account, Entry, and Shell at 1440x900;
- the same six surfaces at 390x844.

Automated capture metrics were 12/12 `fonts=loaded`, `overflow=0`,
`pageErrors=[]`, and no more than one visible primary button. Account used a
read-only synthetic `get-session` fixture; it is not real-account evidence.
Manual inspection found no wrong shell, development toolbar, horizontal
clipping, decorative Error red, or missing Demo/non-evaluation notice.

They are retained as historical viewport evidence and are not claimed as a
fresh screenshot package for `9b7f0cb`. The final fix changes rendered font
roles on Paper, Lesson, and Transfer; current evidence for those changes is the
four-project computed-style matrix above. The screenshots never prove actual
rendered browser zoom.

## Remaining boundaries

- `SCOPED_RE_REVIEW_PENDING` — controller-owned review of
  `7639225a2b146d9f51da78e0f6e5c0ef1a66a30a..9b7f0cb8952ab3a5e12f655e51acd42591c945eb`;
  the whole remediation history remains
  `5547b656e30f4a83b0b6617855fc4145e8847a2a..9b7f0cb8952ab3a5e12f655e51acd42591c945eb`.
- `EXTERNAL_PENDING` — read-only traversal with a user-authorized real learner
  account. No credentials were requested, entered, stored, or transmitted.
- `EXTERNAL_PENDING` — actual rendered 200%/400% content inspection in an
  authorized browser session. Viewport resizing is not used as a proxy.
