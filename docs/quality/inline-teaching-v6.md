# Inline focused teaching — local verification

Date: 2026-09-12. Base: 8f89d367. Isolated branch: codex/learning-quality-v2.

## Delivered

- Optional one-based exercise placement connects dynamically authored sections to adjacent practice. Missing, malformed public metadata and out-of-range positions preserve trailing exercises; old lessons do not need regeneration.
- Shared first-answer persistence, restoration, bounded polling and analysis retry remain unchanged. Inline practice presents the learner answer and evidence-bound supplement before a collapsed reference. Optional rewrite remains a local draft, not another assessed attempt.
- Users can continue reading or open the paper without answering, passing, or waiting for analysis. Evidence of mastery is not inferred from tutorial completion.
- A fuller causal-reasoning example explains the missing mechanism, qualified claims, contextual conditions and transfer. A different collocation course retains its different section structure.
- Generation prompt 5.3.0 and both worker generation paths request relevant placements without a fixed teaching sequence. Paper and tutorial continue to share the same observable ability; later paper answers stay separate.
- No new library, authentication change, database migration, real-account mutation, main merge, push or deployment.

## Verification

- Initial baseline: 161 unit tests passed.
- Placement/public-route regressions: observed missing placement failures before implementation, then passed. Article component rendering verifies inline order, legacy order, unique anchors and non-gated paper access.
- Independent code review caught a native OpenAI strict-schema incompatibility. Reproduced in both dispatched generation paths, then fixed by separating required provider-wire placement from optional persisted-reader placement. No broad adapter rewrite or new legacy gate. Re-review approved.
- Full root Vitest: **814 passed, 164 database/environment-dependent skips**, 104 files (84 passed,20 skipped). Database integration was not run; this iteration changes no schema or persistence semantics.
- DEMO lesson/feedback/paper browser suite, Chromium + mobile WebKit: **72 passed,68 mode skips**. Old fixture wording/layout assertions were updated to the approved inline interaction; first-answer/focus/geometry/accessibility assertions remain.
- Production HTTP browser suite, Chromium: **37 passed,36 mode skips**. Includes three new controlled-response inline cases: improvement, effective alternative and unavailable analysis.
- Production HTTPS browser suite, mobile WebKit: **37 passed,36 mode skips**. Same recovery and inline cases. The initial mobile HTTP attempt could not hydrate: production CSP upgraded scripts to HTTPS on the HTTP-only test port (confirmed TLS request failures). A temporary local HTTPS proxy with a one-day test certificate resolved the environment mismatch without weakening production security headers.
- Typecheck passed. Lint:0 errors,4 pre-existing Fast Refresh warnings. Formatting and git diff whitespace checks passed. Final production build:48/48 static pages.
- Manual desktop/mobile snapshots inspected: article, inline exercise, collapsed/expanded reference. Preview auth/session503 is expected because3202 is the independent demo environment, not a real account backend.

No live model inference or real-user-account acceptance is claimed. HTTP/HTTPS analysis tests use controlled API responses through the real client and UI; worker generation tests use controlled provider output.

## Preview and artifacts

Preview: http://127.0.0.1:3202/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective

- output/playwright/teaching-inline-desktop.png
- output/playwright/teaching-inline-practice-desktop.png
- output/playwright/teaching-inline-mobile.png
- output/playwright/teaching-inline-reference-mobile.png

Existing real-account app3201 and demo preview3202 remain running. Temporary test servers3295/3296 and the test-only certificate are removed after verification.
