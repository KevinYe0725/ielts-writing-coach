# Annotation Desk independent review package

## Package status

**READY_FOR_SCOPED_RE_REVIEW.**

This document packages the complete review range, the final unified fix wave,
and fresh gate evidence. It does not self-issue the scoped verdict; the
controller assigns that re-review separately.

| Item                           | Value                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| Whole-range base               | `5547b656e30f4a83b0b6617855fc4145e8847a2a`                                           |
| Scoped re-review base          | `7639225a2b146d9f51da78e0f6e5c0ef1a66a30a`                                           |
| Reviewed code/test HEAD        | `9b7f0cb8952ab3a5e12f655e51acd42591c945eb`                                           |
| Whole range                    | `5547b656e30f4a83b0b6617855fc4145e8847a2a..9b7f0cb8952ab3a5e12f655e51acd42591c945eb` |
| Diff size                      | 32 files changed, 1681 insertions, 374 deletions                                     |
| Automated gate status          | green; see `docs/quality/annotation-desk-v1-evidence.md`                             |
| Real account                   | `EXTERNAL_PENDING`                                                                   |
| Actual rendered 200%/400% zoom | `EXTERNAL_PENDING`                                                                   |

## Commit manifest

```text
03e1482 docs: plan final review remediation
c90524f fix: enforce typography role tokens
2365dd2 fix: harden typography contracts
b4d8757 fix: close typography contract bypasses
4263cc9 fix: close final presentation semantics
708deb1 test: wait for rendered browser state
7639225 docs: verify final review remediation
9b7f0cb fix: close rendered typography review gaps
```

The final code/test commit changes only three CSS modules and the executable
redesign contract. It does not modify an API, route, state machine, prompt,
scoring rule, or persistence key.

## Final scoped re-review findings

| #   | Finding                                                                                   | RED evidence                                                                                                       | GREEN evidence                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Rendered typography could bypass same-rule AST family/weight pairing through inheritance. | Paper option computed Noto Sans SC / 700; injected Lesson English Markdown `strong` computed Source Serif 4 / 700. | Paper option and English emphasis now compute Source Serif 4 / 600; Chinese Markdown `strong` remains Noto Sans SC / 700; four-surface audit passes. |
| 2   | `expectNoErrorToken` inspected only host background color/image despite its broader name. | A real host `color: var(--desk-error)` mutation incorrectly resolved instead of being rejected.                    | Host and `::before`/`::after` text, background, four borders, outline, and shadow are inspected; 27 mutation classes are rejected.                   |

The scoped reviewer should verify both rows against
`7639225a2b146d9f51da78e0f6e5c0ef1a66a30a..9b7f0cb8952ab3a5e12f655e51acd42591c945eb`
and record `PASS` or `FAIL` without treating automated evidence as the verdict.

## Earlier five residual review questions

The independent reviewer must record `PASS` or `FAIL` for each item and cite a
file/test observation. The gate evidence below is supporting evidence, not the
independent verdict.

| #   | Residual question                                                                                                                                                       | Remediation surface                                                                  | Executable evidence                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 1   | Is typography authority singular and role-specific, with body/reading/utility families and legal weights enforced without shorthand, case, comment, or parser bypasses? | `tokens.css`, foundations and modules, `style-contract.test.ts`, design-system tests | 338 Web tests; affected font/typography browser matrix              |
| 2   | Are non-error presentation surfaces free of Error red, specifically Version 1 comparison content and Entry desk decoration?                                             | `compare.module.css`, `app-shell.module.css`                                         | computed token checks; desktop/mobile Compare and Entry screenshots |
| 3   | Does Demo Growth retain all five canonical level names while clearly marking every one not evaluated and awarding no learner evidence?                                  | `growth/page.tsx`                                                                    | bilingual Growth contract, axe matrix, desktop/mobile screenshots   |
| 4   | Is the bilingual Demo/non-evaluation notice explicit to assistive technology in both UI locales without changing the IELTS prompt or learner text language?             | `ui.tsx`, Compare/Growth/Paper/Entry browser tests                                   | four-project bilingual language/axe contract                        |
| 5   | Does Paper truthfully say only that the submission record was saved, rather than claiming that a review was saved before language evaluation?                           | `lesson/paper/page.tsx`                                                              | bilingual post-submit browser test and Paper screenshots            |

The reviewer must also inspect the whole range for new breakage outside these
five questions, especially route identity, learning-state language, Demo/Mock
honesty, font loading, keyboard behavior, responsive reflow, and API/persistence
boundaries.

## Whole-range manifest

The whole range changes 32 files:

```text
M apps/web/package.json
M apps/web/src/app/account/account.module.css
M apps/web/src/app/compare/compare.module.css
M apps/web/src/app/entry.module.css
M apps/web/src/app/feedback/feedback.module.css
M apps/web/src/app/globals.css
M apps/web/src/app/growth/growth.module.css
M apps/web/src/app/growth/page.tsx
M apps/web/src/app/lesson/page.module.css
M apps/web/src/app/lesson/paper/page.tsx
M apps/web/src/app/lesson/paper/paper.module.css
M apps/web/src/app/settings/settings.module.css
M apps/web/src/app/today/today.module.css
M apps/web/src/app/transfer/transfer.module.css
M apps/web/src/components/app-shell.module.css
M apps/web/src/components/design-system.test.tsx
M apps/web/src/components/essay-workspace.module.css
M apps/web/src/components/evidence-link.module.css
M apps/web/src/components/ui.tsx
M apps/web/src/components/writing-room.module.css
M apps/web/src/lib/client/style-contract.test.ts
M apps/web/src/styles/foundations.css
M apps/web/src/styles/tokens.css
A docs/quality/annotation-desk-review-remediation.md
M docs/quality/annotation-desk-v1-evidence.md
A docs/superpowers/plans/2026-08-23-annotation-desk-review-remediation.md
M pnpm-lock.yaml
M tests/e2e/accessibility.spec.ts
M tests/e2e/account.spec.ts
M tests/e2e/app-shell.spec.ts
M tests/e2e/lesson.spec.ts
M tests/e2e/redesign-contracts.spec.ts
```

Recreate the package with:

```bash
git log --oneline --reverse \
  5547b656e30f4a83b0b6617855fc4145e8847a2a..9b7f0cb8952ab3a5e12f655e51acd42591c945eb
git diff --stat \
  5547b656e30f4a83b0b6617855fc4145e8847a2a..9b7f0cb8952ab3a5e12f655e51acd42591c945eb
git diff --name-status \
  5547b656e30f4a83b0b6617855fc4145e8847a2a..9b7f0cb8952ab3a5e12f655e51acd42591c945eb
git diff --check \
  5547b656e30f4a83b0b6617855fc4145e8847a2a..9b7f0cb8952ab3a5e12f655e51acd42591c945eb
git diff --no-ext-diff \
  5547b656e30f4a83b0b6617855fc4145e8847a2a..9b7f0cb8952ab3a5e12f655e51acd42591c945eb
```

## Gate summary

| Gate                                              | Result                                            |
| ------------------------------------------------- | ------------------------------------------------- |
| Format / lint / typecheck                         | pass; lint 0 errors / 4 existing warnings         |
| Isolated PostgreSQL 17 migration + complete tests | 77 files / 631 passed / 0 skipped                 |
| Web / Worker build                                | Web 44/44 pages; Worker two ESM entries and maps  |
| Complete four-project Demo                        | 614 passed / 218 intentional skips / 0 failed     |
| Chromium non-Demo HTTP                            | 51/51 passed                                      |
| Four-project Admin/Backup                         | 48/48 passed                                      |
| Focused computed typography/Error helper          | 28/28 passed                                      |
| Complete accessibility/axe file                   | 49 passed / 3 intentional mobile skips / 0 failed |
| Range whitespace                                  | `git diff --check`, pass                          |

## Visual package

All files are under `output/playwright/annotation-desk-review-remediation/`.

| Surface | 1440x900 SHA-256                                                   | 390x844 SHA-256                                                    |
| ------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Account | `8fda768eba39c1d34b26b7e31d9d137a9d1d9bb2afbe9681d9a889e86083c8ba` | `6bfe4c054193b880a4441ccb2c83489a5b51076ede3a35f90a1844ae2b5e0926` |
| Compare | `c418af56d0d0c08a8b29ba7cc116262747c256e4aeee7695ab49fe26da683002` | `e53b65b23c73ede232a429f7bfc5d840a2069605f3dfe9f97ddeda2739847f0f` |
| Entry   | `14bd499ccaa2d43836ee69f2086f8105da3e30c5fbc00239d9f14da8bc0eb9dd` | `1372b8756f8fc57d6273269a523a06a2c634a579ce8dd7273d76afdc527bd1c9` |
| Growth  | `f25dfd25587cce884501a2b799dccfd29d2c21749d2d63dced6370d0ac02d381` | `3b988c79fabff3031ef36a66643c8326b634cd10b5af3e3075a74e725d637289` |
| Paper   | `da98af2767ae543e114341c931cd6070d59ce40f5bc15018549089bdbef0a08c` | `112c9b4d4b3128d49b5687f009842acd4b434d926e78f500cf151c842d973d5f` |
| Shell   | `e82a6620ca98a5f9d419842d4f8301f17db0da7f87897ad5d8f2c29858cb08e1` | `a603fe950057ff48b961a1bf274d795267b601afa58e0a787703f6f1c7561df1` |

These images were captured at the earlier `708deb1` code/test HEAD and were not
reissued for `9b7f0cb`; they are historical visual evidence, not proof of the
final font-role changes. Capture metrics at that earlier HEAD were 12/12
correct dimensions, `fonts=loaded`, zero document overflow, no page errors,
and at most one visible primary button. Account uses a read-only synthetic
session fixture and must not be mistaken for the pending real-account
traversal.

## Independent verdict record

To be completed by the controller-assigned reviewer:

```text
Reviewer:
Reviewed HEAD:
Final typography finding — PASS/FAIL — evidence:
Final Error-helper finding — PASS/FAIL — evidence:
Earlier residual questions 1–5 — PASS/FAIL — evidence:
New breakage — NONE / list:
External-boundary handling — PASS/FAIL:
Final verdict — APPROVE / REQUEST_CHANGES:
```
