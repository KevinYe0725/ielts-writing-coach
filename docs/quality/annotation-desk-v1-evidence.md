# Annotation Desk v1 final-fix verification evidence

## Decision

**Status: VERIFIED_WITH_EXTERNAL_PENDING.**

All repository-controlled findings and release gates for the annotation writing
desk final-fix wave are verified. Two checks remain outside repository control:

1. read-only traversal with a user-authorized real learner account;
2. usable-content inspection at actual rendered 200% and 400% browser zoom.

Both remain `EXTERNAL_PENDING`. Demo, HTTP fixtures, viewport reflow, and static
analysis are not presented as substitutes.

Evidence labels:

- `VERIFIED`: a fresh command or browser observation completed on the final
  code ancestry recorded below.
- `INTENTIONAL_SKIP`: a test belongs to the opposite runtime surface or to a
  hardware-keyboard-only project; its owning matrix is executed separately.
- `EXTERNAL_PENDING`: required authorized external state was unavailable.

## Version and environment

| Item                                  | Observed value                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Branch                                | `codex/frontend-redesign`                                                                                         |
| Final verified production-code commit | `83ac08b39509b8e54ccd868facdafd20f5acfd1e`                                                                        |
| Final-review fix base                 | `16293c30e49e3e3226c27830a1a1265160b8c14f`                                                                        |
| Pre-redesign rollback point           | `e13e97fee3006f9bd080b060350ba811556c187d`                                                                        |
| Gate Node                             | `v24.19.0` via `PATH=/opt/homebrew/opt/node@24/bin:$PATH`                                                         |
| pnpm                                  | `11.16.0`                                                                                                         |
| Playwright                            | `1.62.1`                                                                                                          |
| PostgreSQL                            | `17.6`, local image `postgres:17.6-bookworm`                                                                      |
| Database isolation                    | named container `iwc-finalfix-pg17-ab68`, tmpfs data directory, zero Docker volumes, random loopback port `58971` |

No database/API schema, worker task, AI prompt, scoring rule, learning-state
transition, route identity, or persistent storage key was changed. The database
container used only test credentials and an isolated temporary data directory.
No real recovery link, SMTP delivery, backup download, restore, account
submission, or destructive data action was executed.

## Final-review finding closure

| Finding                                                     | RED evidence                                                                                                                                                                                                          | GREEN implementation and evidence                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical 1 — Demo Mock honesty                              | Three Chromium browser tests failed because Compare, Growth, and Paper had no prominent fictional/unscored notice and still exposed score/mastery presentation.                                                       | `3f87fd8`: shared bilingual `Fictional demo data / Not a language evaluation` notice; Compare scores and verified states become unavailable; Growth has no Demo score trend or awarded retained/transferred state; Mock Paper produces `NOT_SCORABLE`, never `MEETS_STANDARD` or 100/45. Focused result: 3/3 passed.      |
| Critical 2 — dual-track tokens                              | Seven executable style-contract assertions failed on `--desk-space-5`, `--ink-muted`, `--muted`, raw legacy colors, Violet, non-token typography, unapproved spacing/radii/shadows, and unnamed layout constants.     | `cdc3ad8`: `tokens.css` is the complete color/type/weight/spacing/radius/shadow/layout source; legacy globals are aliases only; raw presentation palettes and Violet are absent; all custom-property uses resolve. Final Web unit result: 44 files / 331 tests passed in the DB-backed full run.                          |
| Important 1 — visible text below 12px                       | Computed audit found Shell text at 10.56–11.68px and Today dates at 10.56px.                                                                                                                                          | Shared visible text/control enumerator covers Shell, Today, Compare, Growth, Paper, Feedback, Entry, Settings, Account, Admin, Lesson, and Transfer at desktop and 390px; it requires non-empty coverage and waits for computed CSS without lowering the 12px threshold. The full Demo matrix and Admin HTTP matrix pass. |
| Important 2 — evidence/error colors                         | Focused tests failed with Transfer FAIL as `error`/red, protocol start as `verified`/green, Today first-draft submission green, Growth time/positive score movement green, and Paper submission/instant result green. | `167ea7a`: FAIL is revision Amber; protocol start is active Blue; submission, time, operational success, and ordinary score movement use Ink/Blue; green remains for verified evidence such as real PASS/retained/transferred. Demo 2/2 and HTTP 4/4 focused tests passed.                                                |
| Important 3 — Admin production seam and skipped DB evidence | A direct `MockLearningClient` test rejected with `FORBIDDEN` after localStorage wrote `iwc.demo.admin-status-fixture`, proving production behavior was mutable from browser storage.                                  | `1c5d9e1`: the key/parser/branches are removed; the behavior test passes; Admin role/status/migration/backup matrices use non-Demo HTTP fixtures; PostgreSQL route/security/provider/backup gates ran with 0 focused skips.                                                                                               |
| Minor 1 — dynamic Markdown language                         | HTTP teaching with one English and one Chinese quote showed the Chinese `<blockquote lang="en">`.                                                                                                                     | `7526064`: the renderer marks a quote `en` only when every letter is Latin; otherwise it inherits document language. Focused HTTP result: 1/1 passed.                                                                                                                                                                     |
| Minor 2 — tracked SDD report                                | `git ls-files --error-unmatch .../task-5-report.md` succeeded.                                                                                                                                                        | `77694a9`: the file was removed from the Git index; the local file still exists and `git check-ignore -v` resolves it through `.superpowers/sdd/`.                                                                                                                                                                        |

Two final-gate issues were also closed without weakening requirements:

- `1bf5021`: Compare 12px Version labels use approved Ink after axe measured
  4.37:1 on Blue-soft; focused axe then passed in all four projects.
- `83ac08b`: after waiting for the real essay workspace, Today exposed three
  visual primary actions; essay-card links now keep their exact hrefs but use
  secondary weight. The strengthened test moved from 3 to exactly 1.

## Static, package, and production gates

Every command below used Node 24 on the final code ancestry.

| Command                                                                        | Result                                                                                             |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                                                            | VERIFIED, exit 0                                                                                   |
| `pnpm lint`                                                                    | VERIFIED, exit 0; 0 errors and the same 4 recorded `react-refresh/only-export-components` warnings |
| `pnpm typecheck`                                                               | VERIFIED, exit 0 across all packages and scripts                                                   |
| `DATABASE_URL=<isolated-pg17> IWC_TEST_DATABASE_URL=<isolated-pg17> pnpm test` | VERIFIED, 77 files / 624 tests passed, 0 skipped                                                   |
| `pnpm --filter @iwc/web build`                                                 | VERIFIED, compiled and generated 44/44 static pages                                                |
| `pnpm --filter @iwc/worker build`                                              | VERIFIED, both ESM entry points and source maps generated                                          |
| `git diff --check` and `git diff --cached --check`                             | VERIFIED, exit 0                                                                                   |

The DB-backed package total is the sum of 2 email, 8 config, 11 learning
contracts, 89 AI, 5 question-bank, 6 DB, 6 exchange, 30 learning-core, 5 auth,
131 Worker, and 331 Web tests.

## Complete Demo browser matrix

Command:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH \
  NEXT_PUBLIC_DEMO_MODE=true pnpm test:e2e
```

Final result: **VERIFIED**, exit 0, 776 tests enumerated, 558 passed, 218
intentional skips, 0 failed, about 2.5 minutes.

The skip count is expected ownership, not hidden failure:

- Admin/Backup now runs only in the non-Demo HTTP matrix;
- public HTTP boundary suites run below with `NEXT_PUBLIC_DEMO_MODE=false`;
- touch/mobile projects skip hardware-keyboard-only or desktop-shell cases;
- no failing assertion was converted to a skip.

Warnings retained rather than suppressed: Node reported `NO_COLOR` versus
`FORCE_COLOR`; Next development mode reported the existing smooth-scroll
advisory; WebKit/mobile occasionally emitted the known `<details open>`
hydration advisory after tests intentionally opened mobile navigation.

## Complete non-Demo HTTP matrix

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
  tests/e2e/admin.spec.ts \
  --project=chromium --workers=1 \
  --grep 'HTTP boundary|public HTTP contract|secure administration surfaces'
```

Final result: **VERIFIED**, 51/51 passed, 0 skipped. It covers notifications,
Today query states, blind-snapshot failure, the exact 8/8 essay limit,
teaching response recovery/retry states, Paper pending/results, Transfer
PASS/FAIL/NO_OPPORTUNITY/evaluation failure, empty and populated Growth,
missing Compare evidence, bilingual dynamic quotes, and the entire Admin/RBAC/
backup fixture matrix.

Admin/Backup was also run independently across Chromium, Firefox, WebKit, and
mobile in non-Demo mode: **48/48 passed**. Recovery-link, SMTP, archive, and
checksum responses were Playwright HTTP fixtures; no real side effect occurred.

## Isolated PostgreSQL 17 evidence

The local registry credential helper could not pull `postgres:17` (`-25293`),
so no registry repair or credential change was attempted. Read-only inventory
found the already-local `postgres:17.6-bookworm` image. The final gate used:

- exact name `iwc-finalfix-pg17-ab68`;
- `--tmpfs /var/lib/postgresql/data:rw,noexec,nosuid,size=1g`;
- no volume mounts (`Mounts=[]`);
- random loopback host port `127.0.0.1:58971`;
- successful `pnpm db:migrate` before tests.

Focused command coverage included DB migrations/transactions, API security,
idempotency, provider ownership/projection, real Admin/status route RBAC,
backup-route RBAC, HTTP route contracts, and the test-only encrypted backup
fixture: **7 files / 38 tests passed, 0 skipped**. The complete workspace run
above then exercised every DB-gated package test with 0 skips. The named
container and its tmpfs data are removed before handoff; no user container or
volume is touched.

## Executable design, accessibility, and responsive contracts

The final contracts verify:

- every used CSS custom property is defined;
- base palette values exist only in `tokens.css`;
- derived colors resolve through approved roles;
- old globals are aliases to approved `--desk-*` values;
- no raw legacy palette or Violet semantics remain in shipped CSS;
- typography roles enforce a 12px visible floor and approved weights;
- spacing, radius, shadow, and layout constants follow the approved scales;
- FAIL/active/verified/unavailable tracks resolve to Amber/Blue/Green/muted;
- all audited routes have non-empty visible text/control coverage at desktop
  and 390px;
- axe has no serious or critical issue on the audited Demo and Admin surfaces;
- 1440, 1280, 1024, 768, 390, and 320 widths have zero document overflow;
- keyboard, focus restoration, reduced-motion, writing, Paper, Feedback,
  Lesson, Transfer, Account, and Shell contracts pass inside the full matrix.

## Screenshot evidence

There are 54 refreshed exact-viewport PNGs under
`output/playwright/task-13/`: Today, Write, Feedback, Lesson, Paper, Compare,
Growth, Settings, and Backup at 1440×900, 1280×800, 1024×768, 768×1024,
390×844, and 320×720.

They were captured from a production-mode Demo build after each ready selector,
`document.fonts.ready`, and—for Today—the real essay workspace. Automated
capture metrics are 54/54 `fonts=loaded`, `overflow=0`, and `primaryButtons<=1`.
Manual inspection covered affected desktop/mobile Compare, Growth, Paper,
Today, Settings, and Backup images. The fictional Demo notice is prominent,
retained/transferred are neutral in Demo, Today has one strong CTA, and the
screenshots contain no Next development toolbar.

These viewport screenshots prove responsive reflow only. They are not labeled
as actual browser zoom evidence.

## Preserved functional boundary

The full matrices preserve every specified route/query identity, one-time token
clearing rule, learning-state transition, autosave and IndexedDB flow, timers,
duplicate submission lock, AI local retry, dynamic lesson structure, immutable
first answers, eight-question Paper identity, comparison and transfer hrefs,
notification behavior, locale/sidebar preferences, account actions, Admin
visibility, and backup form/download ordering.

Demo and Mock never claim a learner score or mastery result. Real HTTP PASS,
retained, transferred, and canonical verified evidence keep green semantics;
ordinary completion and operational success remain Ink/Blue.

## Remaining external evidence

1. `EXTERNAL_PENDING` — read-only traversal in a user-authorized real learner
   account. No credentials were requested, entered, stored, or transmitted.
2. `EXTERNAL_PENDING` — actual rendered 200%/400% content inspection in a
   Chrome/browser session that renders the target. Viewport reflow is not used
   as a proxy.

No repository-controlled finding remains open.
