# Annotation Desk v1 current verification evidence

## Decision

**Status: GATES_VERIFIED_SCOPED_RE_REVIEW_PENDING_WITH_EXTERNAL_PENDING.**

All repository-controlled automated gates are green on the code and test tree
at `7c464ce42a04c4dc136dd13a507b35c7802c1160`. The controller-owned scoped
re-review is not represented as complete in this file. Two checks remain
outside repository control:

1. read-only traversal with a user-authorized real learner account;
2. usable-content inspection at actual rendered 200% and 400% browser zoom.

Both remain `EXTERNAL_PENDING`. Demo fixtures, HTTP fixtures, viewport reflow,
and static analysis are not presented as substitutes.

This evidence refreshes the rendered-fix record committed at
`219a076`. That record referenced
`9b7f0cb8952ab3a5e12f655e51acd42591c945eb` and did not yet cover the
Feedback-to-Lesson page-lifecycle race or the learner-visible `AI` label that
the original skeleton-only vocabulary scan missed.

## Version and environment

| Item                                | Observed value                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| Branch                              | `codex/frontend-redesign`                                                                 |
| Verified code and test HEAD         | `7c464ce42a04c4dc136dd13a507b35c7802c1160`                                                |
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

Format, lint, typecheck, focused browser gates, Web unit tests, and the complete
four-project Demo matrix were rerun on
`7c464ce42a04c4dc136dd13a507b35c7802c1160`. PostgreSQL, complete workspace
tests, and production builds remain the green `9b7f0cb` evidence below; the
follow-up changes one rendered label and one E2E lifecycle only.

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
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3234 \
  pnpm exec playwright test --reporter=dot
```

Result: **VERIFIED**, 832 enumerated, 614 passed, 218 intentional skips, 0
failed, about 2.9 minutes. Chromium, Firefox, WebKit, and mobile all ran. The
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

### Rendered vocabulary and page-lifecycle remediation

The controller's complete matrix at `a4bb564` recorded 613 passes, 218
intentional skips, and one WebKit failure: the second `page.goto(lessonUrl)` in
the Feedback/Lesson vocabulary test was interrupted by a late navigation to
the first Feedback URL.

Investigation showed that the old negative assertion completed against each
route's skeleton without waiting for either real surface. A WebKit single-
worker repeat passed 10/10, while its trace confirmed both vocabulary scans ran
before `[data-feedback-workbench]` or `article[data-teaching-article]` was
ready. An immediate ready-state regression then failed deterministically on
Feedback. Once the scan waited for the real workbench, it exposed the existing
learner-visible label `AI 优化段`, which correctly matched the protected
backend-vocabulary pattern.

Commit `7c464ce`:

- gives Feedback and Lesson separate Playwright pages, so a cold first-page
  hydration/reload cannot interrupt the second route;
- waits for each route's real ready selector before scanning the complete
  learner-visible `main`;
- changes `AI 优化段` to the learner-facing `参考改写` without changing the
  English `Polished revision` label or any data/API behavior.

Fresh GREEN evidence is 20/20 targeted passes (10 WebKit and 10 mobile), 32
Web test files / 280 passed with 12 files / 57 DB-gated tests intentionally
skipped in that non-DB run, and the complete 832-test result above.

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
fresh screenshot package for `7c464ce`. Their SHA-256 values remain unchanged:
Feedback is not one of the 12 package surfaces, and none of those six captured
routes changed in `7c464ce`. Current rendered Feedback evidence is the focused
and complete browser matrix above. The screenshots never prove actual rendered
browser zoom.

## Remaining boundaries

- `SCOPED_RE_REVIEW_PENDING` — controller-owned review of
  `7639225a2b146d9f51da78e0f6e5c0ef1a66a30a..7c464ce42a04c4dc136dd13a507b35c7802c1160`;
  the whole remediation history remains
  `5547b656e30f4a83b0b6617855fc4145e8847a2a..7c464ce42a04c4dc136dd13a507b35c7802c1160`.
- `EXTERNAL_PENDING` — read-only traversal with a user-authorized real learner
  account. No credentials were requested, entered, stored, or transmitted.
- `EXTERNAL_PENDING` — actual rendered 200%/400% content inspection in an
  authorized browser session. Viewport resizing is not used as a proxy.

## 2026-08-25 adaptive question-supply release addendum

**Status: REPOSITORY_GATES_VERIFIED_WITH_REAL_PROVIDER_EXTERNAL_PENDING.**

Fix Round 1 closed the four review findings against the Task 10 candidate:

- batch failure codes now use the producer-owned closed set
  `AI_UNAVAILABLE | QUESTION_VALIDATION_REJECTED`; unknown uppercase,
  lowercase, and credential-shaped values project as `null`;
- the full-backup test reconstructs the encrypted search envelope from the
  authenticated database dump, decrypts the inner secret archive, and proves
  recovery only with the archived master key plus exact owner/connection AAD;
- learning-data deletion transactionally removes the learner's recommendation
  and cooldown history while retaining the shared generation batch/question;
- the complete Admin DTO, client projection, and rendered audit rows omit raw
  target IDs while retaining event, resource class, result, and time context.

This addendum verifies the adaptive recommendation and shared question-supply
work based on `a9c2fbada3a9a8e735dd513a42c73aa3cb933b87` plus the Task 10
release-gate diff. It does not replace the external real-account and rendered
zoom boundaries above.

### Privacy, backup, and administration

- Learner-wide JSON, Markdown, and ZIP exports exclude search connections,
  encrypted keys, research sources, refill batches, recommendation history,
  ranking scores, and generated-question `source`/`attribution` labels.
- The fully encrypted instance archive preserves the encrypted
  `search_connection` database row. The test proves neither its ID nor its
  encrypted-key sentinel is visible in archive bytes, a wrong passphrase leaves
  no output, and an authenticated decrypt exposes a PostgreSQL dump from which
  `pg_restore` can recover the row.
- `/api/v1/admin/status` returns only aggregate eligible and
  READY/PENDING/UNAVAILABLE counts plus the latest batch's mode, status,
  accepted/rejected counts, and validated safe failure code. Test fixtures place
  user IDs, prompts, snippets, URLs, provider responses, and encryption fields
  beside those values and prove the question-supply projection omits them.
- `/admin` reuses the existing operation card, status rows, and badges for one
  compact bilingual Question supply block. The non-Demo four-project matrix
  covers its sensitive-field absence, desktop/mobile overflow, text floor, and
  Axe checks.
- Compose bootstrap writes no setup-token value to process output. Operators
  retrieve it interactively from the protected secret volume; no Brave search
  key is configured through an environment variable or printed in logs.

### Fresh release evidence

| Gate                               | Result                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| Isolated PostgreSQL 17.6 migration | VERIFIED, exit 0 on tmpfs `iwc-question-supply-final-pg17`                             |
| Exact DB-backed `pnpm test`        | VERIFIED, 91 files / 850 passed / 0 skipped / 0 failed                                 |
| Format                             | VERIFIED, all matched files use Prettier style                                         |
| Lint                               | VERIFIED, 0 errors / 4 existing Fast Refresh warnings                                  |
| Typecheck                          | VERIFIED, all packages and scripts                                                     |
| Web production build               | VERIFIED, compiled and generated 48/48 pages                                           |
| Worker production build            | VERIFIED, two ESM entry points and source maps                                         |
| Compose operation regressions      | VERIFIED, 2 files / 13 passed / 0 skipped / 0 failed                                   |
| Demo browser matrix                | VERIFIED, 908 enumerated / 658 passed / 250 intentional skips / 0 failed               |
| Non-Demo HTTP matrix               | VERIFIED, 208 enumerated / 135 passed / 73 intentional skips / 0 failed                |
| Fix Round 1 Admin matrix           | VERIFIED, 52/52 passed across Chromium, Firefox, WebKit, and mobile                    |
| Whitespace                         | VERIFIED, `git diff --check` exit 0                                                    |
| Real Brave connection and refill   | `EXTERNAL_PENDING`; no credential requested, read, stored, synthesized, or transmitted |

The 250 Demo skips belong to non-Demo HTTP/Admin contracts and
hardware-keyboard or mode-specific coverage. The 73 non-Demo skips include the
inverse Demo-only recommendation/setup flows and 24 browser-only Demo
presentation checks; the latter passed in the complete Demo matrix, while the
non-Demo owner-safe search test independently scans mounted desktop and mobile
Settings with Axe. No failing assertion was converted to a general skip.

The final-remediation first Demo run had one load-sensitive mobile sign-in
overflow failure; the unchanged check passed three focused repeats and the
complete two-worker rerun. The first final-remediation non-Demo run had four
expected stale write-only-key assertions; the exact matrix passed after the
oracle required immediate Save from ephemeral component state. No failing
assertion was converted to a general skip.
