# Annotation Desk v1 current verification evidence

## Decision

**Status: GATES_VERIFIED_REVIEW_PENDING_WITH_EXTERNAL_PENDING.**

All repository-controlled automated gates are green on the code and test tree
at `708deb18e5ba52c7017bf25d6732dbb04f5dd564`. The independent whole-range
review is controller-owned and is not represented as complete in this file.
Two checks remain outside repository control:

1. read-only traversal with a user-authorized real learner account;
2. usable-content inspection at actual rendered 200% and 400% browser zoom.

Both remain `EXTERNAL_PENDING`. Demo fixtures, HTTP fixtures, viewport reflow,
and static analysis are not presented as substitutes.

This evidence supersedes the earlier final-fix snapshot committed at
`5547b656e30f4a83b0b6617855fc4145e8847a2a`, including its older
`83ac08b39509b8e54ccd868facdafd20f5acfd1e` verified-code reference and its
unqualified “all findings closed” conclusion.

## Version and environment

| Item                                | Observed value                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| Branch                              | `codex/frontend-redesign`                                                                     |
| Verified code and test HEAD         | `708deb18e5ba52c7017bf25d6732dbb04f5dd564`                                                    |
| Remediation implementation baseline | `4263cc91970ff9c2e60c6ab213dfdc76669cbedd`                                                    |
| Whole-review range base             | `5547b656e30f4a83b0b6617855fc4145e8847a2a`                                                    |
| Pre-redesign rollback point         | `e13e97fee3006f9bd080b060350ba811556c187d`                                                    |
| Node                                | `v24.19.0` via `PATH=/opt/homebrew/opt/node@24/bin:$PATH`                                     |
| pnpm                                | `11.16.0`                                                                                     |
| Playwright                          | `1.62.1`                                                                                      |
| PostgreSQL                          | `17.6`, local image `postgres:17.6-bookworm`                                                  |
| Database isolation                  | `iwc-remediation3-pg17-ab68`, tmpfs data directory, `Mounts=[]`, random loopback port `50506` |
| Database cleanup                    | container removed after the final DB-backed run; no Docker volume command executed            |

No database/API schema, worker task, AI prompt, scoring rule, learning-state
transition, route identity, or persistent storage key changed in the review
remediation. The database used test-only credentials and an isolated temporary
data directory.

## Complete repository gates

All commands below were rerun on `708deb18e5ba52c7017bf25d6732dbb04f5dd564`
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

Result: **VERIFIED**, 804 enumerated, 586 passed, 218 intentional skips, 0
failed, about 2.7 minutes. Chromium, Firefox, WebKit, and mobile all ran.

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

### Affected keyboard, axe, font, and responsive contracts

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH \
  NEXT_PUBLIC_DEMO_MODE=true \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3223 \
  pnpm exec playwright test \
  tests/e2e/accessibility.spec.ts \
  tests/e2e/account.spec.ts \
  tests/e2e/lesson.spec.ts \
  tests/e2e/redesign-contracts.spec.ts \
  --grep 'axe|accessible|auxiliary text|type scale|typography|font|overflow|responsive|keyboard|focus|skip link|Demo language stays explicit' \
  --reporter=dot
```

Result: **VERIFIED**, 284 enumerated, 272 passed, 12 intentional
hardware/project skips, 0 failed. This independently exercises keyboard and
focus behavior, serious/critical axe checks, explicit language semantics,
font roles and minimum sizes, computed presentation contracts, and viewport
overflow/reflow.

The retained non-failing logs are the existing `NO_COLOR`/`FORCE_COLOR`
warning, Next smooth-scroll advisory, and the known mobile `<details open>`
hydration advisory after navigation tests intentionally open the menu.

## Fresh-gate test assertion defects

The first complete Demo run exposed a WebKit pre-hydration locale click. Later
complete runs exposed the same readiness class in newly added presentation
contracts and an Account font scan whose execution context changed during
navigation. Production behavior reproduced correctly in isolated runs.

Commit `708deb1` changes tests only:

- waits for route-specific client-ready anchors before the first interaction;
- chooses the desktop or mobile locale switch from the executable 960px
  breakpoint instead of a transient `:visible` match;
- retries computed-style and font assertions across CSS/navigation readiness
  without lowering any threshold.

Focused proof was 10/10 WebKit locale repetitions, 48/48 affected contracts
across all four projects with three repetitions, and 10/10 WebKit Account font
repetitions. The subsequent complete 804-test matrix is the green result above.

## Screenshot evidence

Twelve exact-viewport PNGs were refreshed from a production-mode Demo build
under `output/playwright/annotation-desk-review-remediation/`:

- Compare, Growth, Paper, Account, Entry, and Shell at 1440x900;
- the same six surfaces at 390x844.

Automated capture metrics were 12/12 `fonts=loaded`, `overflow=0`,
`pageErrors=[]`, and no more than one visible primary button. Account used a
read-only synthetic `get-session` fixture; it is not real-account evidence.
Manual inspection found no wrong shell, development toolbar, horizontal
clipping, decorative Error red, or missing Demo/non-evaluation notice.

These screenshots prove exact viewport rendering and responsive reflow only.
They are not actual rendered browser-zoom evidence.

## Remaining boundaries

- `INDEPENDENT_REVIEW_PENDING` — controller-owned review of
  `5547b656e30f4a83b0b6617855fc4145e8847a2a..708deb18e5ba52c7017bf25d6732dbb04f5dd564`.
- `EXTERNAL_PENDING` — read-only traversal with a user-authorized real learner
  account. No credentials were requested, entered, stored, or transmitted.
- `EXTERNAL_PENDING` — actual rendered 200%/400% content inspection in an
  authorized browser session. Viewport resizing is not used as a proxy.
