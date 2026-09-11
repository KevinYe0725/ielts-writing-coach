# Task 2 report — document-first learning surfaces

## Outcome

Implemented the feedback report, focused teaching article, Today surface, essay list and practice-paper sticky offsets on top of Task 1 commit `92cdcae`. No server, data contract, AI prompt, authentication, persistence, package, shell, deployment or real app process was changed.

The final 1440×1000 feedback document begins at y=711.8px with 17px source text, compared with the controller RED baseline y=1093px. The focused teaching header and article body now share x=200px with a 0px axis delta, compared with the 140px RED offset.

## Implementation

### Feedback report

- Replaced the static desktop grid with the installed `react-resizable-panels` 4.12.4 `Group`, `Panel` and `Separator` API.
- Added a visible, named separator (`调整原文与修改建议宽度` / `Resize report columns`) with mouse and keyboard affordance. Default widths are 58% source / 42% suggestions; minimums are 420px / 340px. Widths are intentionally not persisted.
- Kept one source pane and one suggestion pane in the DOM. The mobile tab control toggles the same panels instead of rendering duplicate desktop/mobile content, so issue selection and highlight state have one owner.
- Preserved the immutable essay, task prompt, paragraph disclosures, one-to-one issue/source mapping, filtering, source location, expanded issue state, full correction/explanation/knowledge/transfer content, score disclaimer, retry states and next-step routes.
- Compressed the page header, score summary and criterion disclosures. Mobile retains score plus diagnosis side-by-side and criterion rows in a 2×2 grid; core diagnosis text is 16px rather than a utility-label size.
- Removed duplicate eyebrow copy, the static ordering helper, redundant priority transfer-rule preview and repeated source/suggestion eyebrows. The complete transfer rule remains in each issue detail.
- Switched structural Chinese feedback headings from the reading serif to the UI body face; English source/evidence remains Source Serif.
- Corrected the top “进入专项教学” arrow to point forward without changing the identity-bearing href.

### Focused teaching

- Removed legacy sidebar width subtraction; the reading surface is now `min(1040px, 100%)`.
- Left-aligned the 760px lesson header to the same article axis as the 760px prose column.
- Removed duplicate decorative section numbers from article headings and used the approved `--desk-type-section-title` token (24–28px).
- Reduced heading-area and section spacing while keeping all substantive teaching Markdown, adaptive section shape, practice answers, analysis/retry state, contents navigation, paper CTA and feedback route.
- Fixed a narrow-screen overflow discovered by the retained browser test: the `max-width: 999px` container override preserved the 760px header width even when its article was narrower. Setting the header width to 100% inside that container makes 1024, 768 and 390px layouts fit without cloning content.
- Bound practice/section scroll margins and desktop TOC stickiness to `--workspace-header-height`.

### Practice paper

- Bound desktop/mobile question-rail sticky offsets and question scroll margins to `--workspace-header-height` (72px desktop, 112px mobile from Task 1).
- Removed the fixed submit bar's legacy sidebar x-offset and centered it in the current shell.
- A retained mobile target test initially measured question 8 at about 2px behind the sticky rail. Geometry showed header 112px, rail y=120–206.14px and target y=203.56px with a 204px scroll margin. The final tokenized 216px margin clears the rail and requested 8px gap.

### Today and essay list

- Removed the repeated Today eyebrow/description, decorative action accent, “这一步对应的作文” helper label, compact-list “继续写作” eyebrow, full-list eyebrow/description, decorative card strokes and redundant next-step icons.
- Renamed internal-sounding “本篇训练闭环” to “本篇进度” / “Essay progress”.
- Preserved greeting, current essay prompt, next action, due time, duration, deadlines, progress timeline, active limit, continue URLs, queued/blocked/error status and all handlers.

## Tests first: RED → GREEN

The root-authored `tests/e2e/document-workspace-v4.spec.ts` was run before production changes:

- 3 failed / 3 on Chromium.
- Original essay top: 1077.17px in this rerun (controller capture: 1093px), expected under 880px.
- Named resize separator: absent.
- Lesson header/body axis delta: 140px, expected at most 2px.

The same suite is now 8 passed across Chromium + mobile. It also asserts that keyboard resize preserves both the expanded issue and selected source mark, that mobile has one source/suggestion DOM tree, and that mobile diagnosis text is at least 16px. The 16px check was observed RED at 14px before its final CSS change.

The retained narrow-article and mobile-paper tests supplied additional real RED cases before their source fixes; their assertions were kept unchanged.

## Verification

All commands used Node 24 from `/opt/homebrew/opt/node@24/bin` and the isolated DEMO preview at `http://127.0.0.1:3202`.

| Check | Result |
|---|---|
| `document-workspace-v4.spec.ts` + complete `lesson.spec.ts`, Chromium + mobile, 2 workers | 80 passed, 68 skipped |
| `app-shell.spec.ts`, Chromium + mobile, 2 workers | 23 passed, 5 skipped |
| Paper focused-input + desktop-rail checks, Chromium + mobile | 4 passed |
| Paper mobile question-anchor check, Chromium + mobile | 2 passed |
| Controller independent source/highlight interaction slice | 8 passed |
| `style-contract.test.ts` | 19 passed |
| `pnpm --filter @iwc/web typecheck` | passed |
| `pnpm --filter @iwc/web lint` | 0 errors; 4 existing Fast Refresh warnings outside Task 2 files |
| Targeted Prettier + `git diff --check` | passed after formatting |

The 68 lesson skips are its HTTP-boundary group, intentionally disabled under deterministic DEMO mode. The five app-shell skips are mobile-inapplicable or HTTP-boundary cases. The controller owns the final non-DEMO HTTP, full Vitest, build and license gates; this agent did not duplicate the controller build or touch ports 3201/3203.

### Visual artifacts reviewed

- Baseline: `output/playwright/v4-before-feedback.png`, `output/playwright/v4-before-teaching.png`.
- Final desktop: `output/playwright/v4-after-feedback.png`, `output/playwright/v4-after-teaching.png`, `output/playwright/v4-after-today.png`.
- Final mobile 390×844: `output/playwright/v4-after-feedback-mobile.png`, `output/playwright/v4-after-teaching-mobile.png`.

These are ignored local DEMO artifacts. They prove layout behavior only, not real-account AI generation.

## Files changed

- `apps/web/src/app/feedback/page.tsx`
- `apps/web/src/app/feedback/feedback.module.css`
- `apps/web/src/app/lesson/teaching-article.tsx`
- `apps/web/src/app/lesson/page.module.css`
- `apps/web/src/app/lesson/paper/paper.module.css`
- `apps/web/src/app/today/page.tsx`
- `apps/web/src/components/essay-workspace.tsx`
- `apps/web/src/components/essay-workspace.module.css`
- `tests/e2e/document-workspace-v4.spec.ts`
- `tests/e2e/lesson.spec.ts`
- `tests/e2e/app-shell.spec.ts`
- `docs/quality/writing-workspace-v4-evidence.md`
- `.superpowers/sdd/2026-09-12-writing-workspace/task-2-report.md`

## Residual boundaries / concerns

- No panel-width persistence was added, as required.
- Validation is DEMO-browser and local static/type verification only until the controller completes the final combined real HTTP/build/license gates.
- The repository requests durable Mind memory, but no `mind` MCP capability was exposed to this delegated agent; no memory write was attempted.
- No push, merge or deployment was performed.

## Review round 1 — responsive and full-load regressions

### Findings reproduced

1. `Panel.className` in react-resizable-panels 4.12.4 is applied to an inner wrapper. The committed mobile CSS hid that inner wrapper but left the package's outer 58/42 flex panels in place. The new geometry regression failed at 390px with the visible suggestions 163px narrower than the workbench. The previous 761–939px range also had no safe fallback for the 420px + 340px panel minimums and separator.
2. The focused-target ordering rationale had been removed with the permanent helper banner even though it was unique learner guidance.
3. Full-suite presentation assertions still expected the old off-white editor literal and removed feedback eyebrows.
4. The mobile sign-in page had 26px of empty vertical overflow at 390×844 because the entry main retained 32px top / 80px bottom desktop padding.
5. Under the 534-test load, one mobile switcher click happened before hydration installed the trigger handler; the DOM showed the button but no dialog.

### Fixes

- Added `responsive-report.tsx`. At ≥940px it renders the installed resizable group with panel minimums; below 940px it renders a normal container around the same two child nodes. There is no duplicated source or suggestion JSX. Selection/filter/mobile pane state stays in `FeedbackPage`, so it survives wrapper remounts when the media query changes.
- Moved narrow pane switching CSS to the same 939px boundary and removed all attempts to override the package's inner panel sizing with `!important`.
- Restored the exact ordering/focus explanation in a closed-by-default disclosure inside the focused target's expanded issue detail.
- Added a computed-background helper that resolves `--desk-paper`, and migrated eyebrow assertions to trust/model badge floors plus diagnosis/source/suggestion heading floors.
- Added a mobile-only `.entryMain` padding rule (24px top, 48px bottom). The content remains fully visible and scrollable if it genuinely exceeds the viewport.
- Added an SSR-safe `useSyncExternalStore` hydration readiness snapshot to `EssaySwitcher`. Its native trigger is disabled before interactivity and enabled immediately after hydration; the test now waits for that meaningful readiness boundary rather than sleeping or retrying clicks.

### TDD and verification

- Responsive RED: suggestion/workbench width delta 163px at 390px. GREEN: width delta ≤2px at 390/768/820/900, no overflow at every requested width, and valid ≥420/340px panels plus separator at 1024px. Selected issue/source mark survives the responsive transitions.
- Guidance RED: optional disclosure text absent. GREEN: rationale opens and its original guidance is visible.
- Entry RED: 26px vertical overflow in both browser profiles. GREEN: the unchanged three-viewport assertion passes in Chromium + mobile (2/2).
- Switcher readiness: the original full-load error context showed no dialog after a pre-hydration click. With native disabled readiness, the complete flow passed 20/20 repeated Chromium/mobile runs.
- Feedback/document/navigation slice: 46 passed across Chromium + mobile.
- Final serial focused checks: document workspace 12 passed; entry overflow 2 passed; migrated visual contracts 6 passed; style contract 19 passed.
- Visual review completed at feedback 900px fallback, feedback 1024px resizable, and sign-in 390×844.

No package, server, backend, build, deployment, push or merge operation was performed in round 1. Controller owns the final combined full-suite and production-build gates.

## Review round 2 — breakpoint interaction alignment

Re-review confirmed the round 1 findings were fixed, then identified one interaction mismatch: the wrapper and CSS entered single-pane mode below 940px, but `activateFromHighlight` changed to the suggestions pane only below 760px.

TDD evidence:

- Added an explicit 768px/900px flow that first selects the source tab, then activates a source mark, and requires the source to hide while the matching expanded suggestion becomes visible.
- RED reproduced at 768px: the suggestion remained hidden after source activation.
- Added `report-layout.ts` as the single JavaScript contract for `RESIZABLE_REPORT_MIN_WIDTH_PX`, the resizable query and its complementary single-pane query.
- `ResponsiveReport` and `FeedbackPage` now consume those shared queries; no copied JavaScript threshold remains.
- GREEN: the new regression passed 2/2 across Chromium + mobile; the complete document-workspace suite passed 14/14 across both projects.

No other implementation or polish was added in round 2. No full suite, build, push, merge or deployment was run.
