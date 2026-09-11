# Writing workspace v4 verification

## Scope

Frontend-only redesign from `cd95bd5` in the existing `codex/learning-quality-v2` worktree. Existing local account app on 3201 is not modified or restarted; 3202 is an isolated DEMO preview. No main merge, remote push or deployment is part of this request.

Design: `docs/superpowers/specs/2026-09-12-writing-workspace-design.md`.
Execution plan: `docs/superpowers/plans/2026-09-12-writing-workspace.md`.

## Baseline

- Focused navigation/design/priorities Vitest: 27 passed.
- Expanded client/components baseline: 225 passed, 12 environment-specific skipped tests.
- Chromium accessibility smoke before redesign: 13 passed, including keyboard skip links and writing submit-dialog focus containment/restoration.
- Baseline screenshots in ignored output: `output/playwright/v4-before-feedback.png`, `output/playwright/v4-before-teaching.png`.
- Visual findings: original document starts below the first screen after a large assessment/priority area; article header and body are on different reading axes; persistent product sidebar reduces available content width.
- New document-workspace browser regressions reproduced all three intended failures before page implementation: essay starts at y=1093 on a 1440×1000 viewport; no keyboard resize separator exists; header/body horizontal mismatch is 140px.

## Acceptance boundaries

Preview screenshots and DEMO browser tests are not a real-account AI generation acceptance. This redesign must preserve current client/server contracts; production checks and deployments are separate delivery gates.

## Reuse

Existing Radix, Markdown renderer, icons and CSS Modules remain. Selected additional components have specific jobs (searchable essay switcher, resizable report, small interaction transitions); no editor migration, UI template installation or paid feature integration.

Official sources checked: https://www.radix-ui.com/primitives/docs/overview/introduction ; https://github.com/dip/cmdk ; https://github.com/bvaughn/react-resizable-panels ; https://github.com/motiondivision/motion ; https://ui.shadcn.com/docs/components .

License gate initially failed on the three existing Fontsource packages (OFL-1.1), not on the new MIT dependencies. After checking the installed licenses against the official SIL OFL embedding/redistribution conditions, original license texts were placed in public `/licenses/*.txt`, the third-party notice was expanded, and OFL-1.1 was added to the reviewed expressions. The real license script then passed: 494 package records,14 license expressions. No font binary was modified or relicensed.

## Task 2 — document-first learning surfaces

Task 2 keeps all loaders, mutations, route identities, source annotations, practice state, paper answers and backend contracts unchanged. The presentation now prioritizes the learner's actual document:

- Feedback uses `react-resizable-panels` 4.12.4 `Group` / `Panel` / `Separator` with a named keyboard-operable separator. The source and suggestion panes remain a single DOM/state tree; mobile switches visibility without cloning either pane. Keyboard resizing retains the selected issue and source mark.
- The assessment is a compact score-and-diagnosis row with 2×2 criterion disclosures on 390px. Priority shortcuts are concise category/title/actions; the full transfer rule remains in its issue detail. Decorative/repeated report labels and ordering helper copy were removed.
- At 1440×1000 the original essay begins at y=711.8px (RED baseline y=1093px) with 17px text. The lesson header and prose both begin at x=200px (0px axis delta; RED baseline 140px), and the header remains 760px wide.
- Teaching uses the full post-sidebar reading width, section headings use the approved 24–28px token without duplicate section numbers, and the mobile container-query override no longer forces a 760px header.
- Tutorial contents, feedback panes and paper question rails consume `--workspace-header-height`. The fixed paper submit bar is centered in the shell without a legacy sidebar offset. Mobile question anchors clear both the 112px app header and the sticky question rail.
- Today and My essays remove repeated page-purpose copy, decorative card strokes/icons and internal “training loop” terminology while keeping the next action, current essay, due time, progress, active limit and queued/error states.

### RED / GREEN evidence

- Initial `tests/e2e/document-workspace-v4.spec.ts` Chromium RED: 3 failed / 3 — essay y=1077.17 in the implementer rerun (controller baseline y=1093), no separator, lesson axis delta 140px.
- Final owned browser suites on DEMO 3202, Chromium + mobile projects: 80 passed / 68 skipped (`document-workspace-v4.spec.ts` and complete `lesson.spec.ts`). The skips are the HTTP-boundary group intentionally disabled by the deterministic DEMO fixture.
- App shell / essay workspace suite on DEMO 3202, Chromium + mobile: 23 passed / 5 skipped. Presentation-dependent sidebar/eyebrow assertions were migrated to the top-header and readable page-title contracts.
- Paper layout regressions: focused input plus desktop sticky rail 4 passed; mobile question anchors 2 passed after increasing the scroll clearance from 204px to the tokenized 216px.
- Independent controller source interaction check: 8 passed across Chromium + mobile (one-to-one issue/source mapping, multiline annotations, keyboard activation, mobile pane switching).
- CSS token/style contract: 19 passed. Web TypeScript: passed. Web ESLint: 0 errors, 4 existing Fast Refresh export warnings outside Task 2 files. Targeted Prettier check passed after formatting the migrated app-shell test.
- Build, non-DEMO HTTP boundary coverage, full Vitest and license audit are intentionally left to the controller's final combined gate; Task 2 did not run a second build or touch the real 3201 app.

### Visual review

Isolated preview: `http://127.0.0.1:3202` with `NEXT_PUBLIC_DEMO_MODE=true`.

- Desktop: `output/playwright/v4-after-feedback.png`, `v4-after-teaching.png`, `v4-after-today.png`.
- Mobile 390×844: `output/playwright/v4-after-feedback-mobile.png`, `v4-after-teaching-mobile.png`.

Reviewed against the baseline for content visibility, resolved spacing tokens, 16px-or-larger core diagnosis text, Chinese UI typography, lesson line length, divider affordance, sticky offsets and horizontal overflow. These screenshots are ignored local QA artifacts, not real-account acceptance evidence.
