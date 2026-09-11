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
