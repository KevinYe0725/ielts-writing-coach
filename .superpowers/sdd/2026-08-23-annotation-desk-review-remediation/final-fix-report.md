# Remediation final unified fix report

Date: 2026-08-23

## Status

**READY_FOR_SCOPED_RE_REVIEW.**

The two findings in `final-review-findings.md` are implemented and protected
by rendered-browser regressions on code/test commit
`9b7f0cb8952ab3a5e12f655e51acd42591c945eb`.

| Item                            | Value                                                                  |
| ------------------------------- | ---------------------------------------------------------------------- |
| Branch                          | `codex/frontend-redesign`                                              |
| FIX_BASE / scoped range base    | `7639225a2b146d9f51da78e0f6e5c0ef1a66a30a`                             |
| Verified code/test commit       | `9b7f0cb8952ab3a5e12f655e51acd42591c945eb`                             |
| Scope                           | CSS typography roles and executable browser-test helper/contracts only |
| API/state/route/storage changes | none                                                                   |

This report does not self-approve the scoped re-review.

## Finding closure

### Important — rendered typography inheritance and UA bypass

RED was observed in Chromium before production edits:

- Paper English option text computed
  `"Noto Sans SC Variable", "PingFang SC", sans-serif / 700`;
- a real `strong` inserted under the rendered English Lesson Markdown quote
  computed `"Source Serif 4 Variable", Georgia, serif / 700`;
- the four-surface audit additionally found the Transfer question's nested
  `strong` at Source Serif 4 / 700.

Minimal GREEN:

- Paper option labels explicitly use
  `--desk-font-reading / --desk-reading-weight-semibold`;
- English Lesson Markdown `strong` and `b` descendants explicitly use
  reading-semibold 600, while the rendered Chinese `核心判断` strong remains
  Noto Sans SC / 700;
- Transfer English blockquote emphasis explicitly uses reading-semibold 600;
- a real computed-style audit covers visible explicit English evidence in
  Paper, Lesson, Feedback, and Transfer and permits only Source Serif 4 at
  400/600.

### Minor — Error-token helper coverage

RED was observed when a real host
`color: var(--desk-error)` mutation incorrectly resolved instead of being
rejected by `expectNoErrorToken`.

GREEN expands the helper to inspect the host, `::before`, and `::after` for:

- text color;
- background color and background image;
- top, right, bottom, and left border colors;
- outline color;
- box shadow.

The mutation contract independently injects 27 computed CSS cases, verifies a
safe control, and requires every Error-token mutation to reject. Existing
Compare and Entry production semantics were not changed.

## Verification

All formal commands used Node `v24.19.0` through
`PATH=/opt/homebrew/opt/node@24/bin:$PATH`.

| Gate                                           | Result                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Static typography/token contract               | 1 file / 20 tests passed                                                                              |
| Four-project focused typography/Error mutation | 28/28 passed                                                                                          |
| Complete four-project accessibility/axe file   | 49 passed / 3 intentional mobile hardware-keyboard skips                                              |
| Web tests                                      | exit 0; 280 passed / 57 conditional skips without DB; DB-backed full run reports 338 Web tests passed |
| Web typecheck                                  | exit 0                                                                                                |
| Web lint                                       | exit 0; 0 errors / 4 existing Fast Refresh warnings                                                   |
| Web production build                           | exit 0; 44/44 static pages generated                                                                  |
| Root lint                                      | exit 0; same 4 existing warnings                                                                      |
| Root typecheck                                 | exit 0 across packages and scripts                                                                    |
| Worker build                                   | exit 0; two ESM entries and source maps                                                               |
| Isolated PostgreSQL 17.6 migration             | exit 0                                                                                                |
| DB-backed complete repository tests            | 77 files / 631 passed / 0 skipped                                                                     |
| Complete four-project Demo                     | 832 enumerated / 614 passed / 218 intentional skips / 0 failed                                        |
| Chromium non-Demo HTTP                         | 51/51 passed                                                                                          |
| Four-project Admin/Backup                      | 48/48 passed                                                                                          |
| Repository formatting                          | `pnpm format:check`, exit 0                                                                           |
| Whitespace                                     | `git diff --check`, exit 0                                                                            |

The PostgreSQL run used exact container `iwc-finalfix-pg17-ab68`, image
`postgres:17.6-bookworm`, random loopback port `54991`, `Mounts=[]`, and
a tmpfs data directory. The exact container was removed after the test; no
Docker volume command ran.

## Test-readiness note

An early cross-project rerun was discarded after an intentionally interrupted
Playwright process left its own port-3201 dev server alive. The exact
processes were identified and stopped. The clean rerun also replaced a
detachable React element handle with a current-document query and moved the
Error-helper mutation fixture to a self-contained computed-CSS page. No
threshold, family, weight, color property, browser project, or assertion was
removed; the final four-project focused run is 28/28.

## Remaining boundaries and concerns

- `EXTERNAL_PENDING`: read-only traversal using a user-authorized real learner
  account; no credential was requested or used.
- `EXTERNAL_PENDING`: usable-content inspection at actual rendered 200% and
  400% browser zoom; viewport tests are not presented as a substitute.
- The prior 12-image screenshot package was created at `708deb1` and was not
  refreshed for this font-role fix. Current proof for the changed typography
  is the four-project computed-style matrix.
- Retained non-failing logs are the existing `NO_COLOR/FORCE_COLOR` warning,
  Next smooth-scroll advisory, four Fast Refresh lint warnings, and the known
  mobile `<details open>` hydration advisory.

No repository-controlled gate remains open. The only next action is the
controller-owned scoped re-review of
`7639225a2b146d9f51da78e0f6e5c0ef1a66a30a..9b7f0cb8952ab3a5e12f655e51acd42591c945eb`.
