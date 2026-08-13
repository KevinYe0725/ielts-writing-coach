# v1 accessibility release-gate review

Review date: 2026-08-13 (Asia/Shanghai)  
Checkout: current working tree, demo-mode Web application  
Verdict: **NOT MET — do not claim WCAG 2.2 AA conformance or a completed accessibility release gate yet.**

## Executive result

The product defects found during this review were fixed in the current checkout
and their focused browser checks now pass. The remaining blockers are evidence
gaps, not a known failure in the final tested UI:

1. No real screen reader was operated through the critical flows. The macOS
   Accessibility API reported `AXIsProcessTrusted() == false`; the attempted
   `System Events` inspection could not proceed and was interrupted. Enabling
   Accessibility/Automation access is a user-controlled system action and
   cannot be bypassed truthfully by the test runner.
2. Browser-chrome zoom at actual 200% and 400% was not executed. Reflow passed
   at the equivalent 640 and 320 CSS-pixel viewport widths, but that proxy is
   not recorded as actual browser zoom.
3. Headed keyboard and visual review was performed in installed Google Chrome,
   while Firefox and WebKit were covered by Playwright automation. There was no
   manual run in installed Edge, Firefox, or Safari, and no physical iOS or
   Android device run.
4. Live-region markup and updates were inspected, but their spoken output,
   interruption behavior, and reading order were not verified with real
   assistive technology.

This means the requested “axe + keyboard/focus + screen-reader critical-flow”
gate is still **FAIL**, even though the reproducible automated subset is green.

## Environment

| Item                          | Reviewed environment                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| Host                          | macOS 26.5.2 (25F84), arm64                                                            |
| Application                   | Next.js 16.3 development server, `NEXT_PUBLIC_DEMO_MODE=true`, `http://127.0.0.1:3217` |
| Runtime used for final reruns | Node 24.19.0, pnpm 11.16.0                                                             |
| Browser automation            | Playwright 1.62.1                                                                      |
| Headed manual browser         | Installed Google Chrome 151.0.7922.109                                                 |
| Automated desktop engines     | Chromium 151.0.7922.34, Firefox 153.0, WebKit/Safari profile 26.5                      |
| Automated mobile target       | Playwright iPhone 14 WebKit emulation, 390 × 664 CSS pixels                            |
| Interface/content             | Simplified Chinese UI, deterministic demo learning data                                |

The iPhone target is emulation, not a physical iPhone. Playwright WebKit is not
the same evidence as manually operating the installed Safari application.

## Evidence types — kept separate

| Evidence type                 | What was actually done                                                                                              | Result                                                                    | What it cannot prove                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| axe automation                | WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags on six stable routes in four targets (24 scans)                               | 0 violations                                                              | Complete WCAG conformance; axe returned manual-review `incomplete` contrast cases |
| Repository Playwright suite   | Nine routes plus skip-link and writing/lesson dialog focus checks in Chromium, Firefox, WebKit and mobile emulation | 45 passed, 3 intentional mobile hardware-keyboard skips                   | Manual use of each supported browser or a real device                             |
| CDP accessibility tree        | Full Chrome AX tree for setup, Today, write, lesson, rewrite and settings after the async demo UI settled           | One `main` per route; no unnamed interactive controls                     | How VoiceOver/NVDA will announce or navigate the UI                               |
| Headed keyboard/manual visual | Installed Chrome, keyboard-only flow and visual inspection                                                          | Tested cases passed after fixes                                           | Firefox/Safari/Edge manual behavior or screen-reader speech                       |
| Reflow proxy                  | 640 and 320 CSS-pixel viewports, five key routes                                                                    | No document-level horizontal overflow                                     | Actual browser-chrome zoom behavior at 200%/400%                                  |
| Reduced-motion automation     | `prefers-reduced-motion: reduce` emulation plus computed-style inspection                                           | Media query matched; no visible non-trivial transition/animation remained | Real OS preference behavior in every supported browser                            |
| Actual assistive technology   | macOS permission probe only                                                                                         | **Not executed**                                                          | Screen-reader gate remains open                                                   |

## Automated results

### Stable audit script

`tests/accessibility-review/run-review.mjs` waits for the visible route heading
and the demo UI's async data before scanning. This avoids falsely scanning the
loading shell. It covers:

- `/setup`, `/today`, `/write`, `/lesson`, `/rewrite`, `/settings`;
- Chromium, Firefox, WebKit and iPhone 14 WebKit emulation;
- document language, one `main`, one `h1`, one skip link, duplicate IDs,
  visible button names and form labels;
- axe WCAG-tagged rules;
- Chrome CDP accessibility trees;
- setup skip-link focus and writing, lesson and settings modal focus contracts
  in all three desktop engines;
- 640/320 CSS-pixel reflow; and
- reduced-motion computed styles.

Final Node 24 run:

```text
24 route/target scans
0 axe violations
12/12 desktop keyboard-focus contracts passed
0 semantic or reflow blockers
reduced-motion media matched; 0 visible non-trivial motions
exit 0
```

The script intentionally reports axe `incomplete` results rather than treating
them as violations or silently discarding them.

### Repository accessibility suite

The final single-worker run was stable:

```text
45 passed
3 skipped (mobile project has no hardware-keyboard contract)
0 failed
```

An earlier fully parallel run produced 43 passes, 3 skips and 2 Firefox
timeouts while its `beforeEach` navigated to `/api/v1/health/live`; neither
timeout reached a product route. The same cases passed in the final
single-worker run. This is recorded as development-server load sensitivity,
not hidden as a product accessibility failure.

### Names, roles, landmarks, and status markup

- Every stable route had exactly one primary landmark and one `h1` after the
  lesson's nested `main` was removed.
- The Chrome CDP tree contained no unnamed link, button, textbox, combobox,
  checkbox, or switch on the reviewed stable screens.
- Setup's four stages were exercised in headed Chrome. Mode choices, owner
  name/email/password, provider/model/key/save-mode controls and completion
  action exposed usable names and native roles.
- Write and rewrite exposed a named English essay textbox, a named timer, and
  `aria-live="polite"` auto-save text.
- Settings exposed named tabs, form controls, switches, and a polite save-state
  region.
- The setup connection result updated a polite live region from its pending
  state to “需要修复…连接信息不完整…”. This confirms DOM/AX semantics only;
  no spoken announcement was heard or asserted.
- Lesson feedback/status regions are conditional and were not announced by a
  real screen reader in this review.

## Headed installed-Chrome review

All interactions below were performed against a headed installed Chrome window
using the Playwright CLI, not by calling React handlers directly.

| Case                        | Final observation                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup skip link             | First `Tab` revealed the skip link at the top of the viewport; `Enter` moved DOM focus to `main#main-content`                                             |
| Setup stages                | Mode → administrator → AI service → ready screen remained keyboard operable; labels and progress structure were present                                   |
| Write editor                | After skip-link activation, `Tab` reached `textarea#essay-editor`; `:focus-visible` was true with a 3 px solid `rgb(24, 89, 173)` outline                 |
| Rewrite editor              | Same named textbox and visible 3 px focus indicator were observed                                                                                         |
| Write submit dialog         | Focus entered “继续检查”, `Shift+Tab` wrapped to “确认提交”, `Escape` closed it, and focus returned to “提交作文”                                         |
| Lesson pause dialog         | Focus entered “继续当前练习”, reverse/forward tabbing stayed inside, `Escape` closed it, and focus returned to “暂停”                                     |
| Settings delete dialog      | Focus entered the confirmation input, both Tab directions wrapped between enabled controls, `Escape` closed it, and focus returned to “删除…”             |
| 320 CSS-pixel settings tabs | The local tab strip scrolled the off-screen tab into view as keyboard focus advanced; the document itself did not scroll horizontally                     |
| Responsive visual review    | Setup, write, lesson, rewrite, and settings remained readable at 640 and 320 CSS-pixel widths; no content loss or page-level two-axis scroll was observed |

The development-only Next.js tools portal was present. The final modal checks
still contained focus within each application dialog and restored it correctly.

## Contrast review

axe reported serious `color-contrast` entries as **incomplete**, not
violations, because it could not resolve a gradient background or because the
single-letter avatar was too short to classify.

- `.avatar` is `aria-hidden="true"` and decorative; it does not expose text to
  the accessibility tree.
- Setup gradient cases were manually checked using computed foreground colors
  and adjacent background pixels from an actual Chromium screenshot. The
  initially failing top-bar subtitle was changed to `rgb(82, 97, 118)`; four
  sampled background points ranged from `rgb(224, 234, 245)` to
  `rgb(227, 235, 245)`, yielding 5.182:1–5.245:1.
- Today's gradient-backed due label sampled at 5.537:1–6.091:1.
- The other setup gradient candidates (brand title, progress labels, heading
  and description) were also visually and numerically checked against their
  local background and met their applicable normal/large-text threshold.

These measurements resolve the known gradient candidates in this checkout,
but they do not turn axe's incomplete output into an automated proof.

## Reflow and reduced motion

For a 1280 CSS-pixel baseline, the audit used 640 and 320 CSS-pixel viewports as
the 200%/400%-equivalent reflow method. Setup, write, lesson, rewrite and
settings each had:

```text
document.scrollWidth == window.innerWidth
horizontalOverflow == 0
```

The earlier 15 px `clientWidth` difference seen in headed Chrome was the
traditional scrollbar gutter. `scrollWidth == innerWidth` and `scrollX == 0`,
so it was not recorded as a page overflow defect.

With reduced-motion emulation active,
`matchMedia('(prefers-reduced-motion: reduce)').matches` was true and no visible
element retained an animation or transition longer than 0.02 seconds.

Actual browser zoom controls were not changed. The reflow proxy therefore
cannot close the manual zoom gate.

## Defects found and closed during this review

| Finding                  | Initial behavior                                                 | Final verification                                                                                                        |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Nested lesson landmark   | Two nested `main` elements                                       | One `main` in all four automated targets and CDP tree                                                                     |
| Setup skip destination   | Fragment changed but focus stayed on `body`                      | Headed Chrome and all desktop-engine checks focus `main`                                                                  |
| Essay focus visibility   | Textarea suppressed its outline                                  | Write/rewrite show a 3 px solid focus indicator                                                                           |
| Write/lesson modal focus | No initial focus/trap/Escape/restore                             | Focus contract passes in Chromium, Firefox, WebKit and headed Chrome                                                      |
| Settings deletion modal  | Focus stayed outside, escaped the dialog, and Escape did nothing | Initial input focus, both-direction containment, Escape and invoker restore pass in all desktop engines and headed Chrome |
| Setup subtitle contrast  | 4.39:1–4.44:1 at sampled gradient points                         | 5.182:1–5.245:1 after the color change                                                                                    |

The Web package lint rerun completed with 0 errors and 3 existing
`react-refresh/only-export-components` warnings unrelated to this review.

## Actual assistive-technology attempt and blocker

The following macOS API probe was executed:

```bash
swift -e 'import ApplicationServices; print(AXIsProcessTrusted())'
```

Result:

```text
false
```

An attempted `osascript`/`System Events` frontmost-process inspection did not
complete under the current TCC permissions and was interrupted. VoiceOver was
not started, no speech output was heard, no rotor/navigation behavior was
observed, and no audio or screen-reader result is claimed.

Closing this blocker requires the workstation owner to grant the controlling
Codex/ChatGPT or terminal process access under **System Settings → Privacy &
Security → Accessibility** (and Automation/System Events if macOS requests
it). After that, a human must run the supported critical flows with VoiceOver.
The repository's existing quality matrix also calls for NVDA, or a documented
equivalent supported screen-reader matrix; that requires an appropriate
Windows environment.

## Remaining release actions

Before marking the accessibility gate complete or publishing a WCAG 2.2 AA
claim:

1. Run VoiceOver manually through setup, write, lesson feedback, rewrite,
   settings save/error states, and every destructive/timeout dialog. Record
   speech, rotor/landmark order, status announcements, modal context, and focus
   restoration.
2. Run NVDA on Windows, or approve and document an equivalent supported AT
   matrix. Chrome's/CDP's accessibility tree is not a substitute.
3. Use actual browser zoom controls at 200% and 400% in supported Chrome,
   Firefox, Edge and Safari; repeat keyboard focus visibility and reflow checks.
4. Perform the critical flows manually in supported desktop browsers. Current
   Firefox/WebKit results are automation, not human review.
5. Repeat the mobile flows on real iOS Safari and Android Chrome devices,
   including orientation, on-screen keyboard, scrolling, errors, and focus
   after dialogs.
6. Record a production-build review. This audit used a local development build
   and deterministic demo data.

## Reproduction commands

Use the repository-supported Node runtime:

```bash
export PATH="/path/to/node-24/bin:$PATH"
NEXT_PUBLIC_DEMO_MODE=true pnpm --filter @iwc/web exec next dev --hostname 127.0.0.1 --port 3217
```

In another terminal:

```bash
export PATH="/path/to/node-24/bin:$PATH"
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3217 IWC_A11Y_SUMMARY=true \
  node tests/accessibility-review/run-review.mjs
NEXT_PUBLIC_DEMO_MODE=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3217 \
  pnpm exec playwright test tests/e2e/accessibility.spec.ts --workers=1
pnpm --filter @iwc/web lint
```

The audit script's exit code covers only its automated checks. An exit code of
zero must not be used to imply that real assistive-technology, actual zoom,
manual cross-browser, or physical-device gates are complete.

Standards used for interpretation:

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [Understanding Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
