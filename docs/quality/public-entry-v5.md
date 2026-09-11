# Public entry v5

## Design

The user requested a promotional website-style entry with Login and Sign up at the top right, inspired by OpenAI's homepage. This is our own IELTS Writing Coach identity, not a replica or endorsement. The OpenAI homepage was consulted at https://openai.com/ for restrained navigation, whitespace and a clear primary action.

`/signin` now shows a full-width public product page: centered display title, an explicitly labelled teaching example, a compact three-step learning explanation and a closing action. An anonymous root visit still redirects here; authenticated root visits still continue to Today. No server routing, signup policy or API contract changes.

Existing white/ink/blue/green tokens and Noto Sans/Source Serif/IBM Plex roles are reused. New public display-size tokens do not change workspace typography. Existing Radix Dialog provides focus containment; no new package or marketing template was installed. No fabricated testimonials, guaranteed scores, price claims or provider-configuration jargon was added.

Login and signup open the same existing `/api/v1/account-entry` form, with mode-specific labels and password autocomplete. Server-side automatic registration and invitation restrictions are retained. Return paths, input validation, localized errors, duplicate-submit prevention and recovery remain. Dismissing the dialog aborts its outstanding browser request and clears its form state; it does not purport to undo an account operation already processed by the server.

## Final verification

- Final complete DEMO browser suite:387 passed,171 mode/project skips,0 failures (Chromium and mobile WebKit,2 workers).
- Final complete HTTP-mode browser suite against the production standalone build:102 passed,177 mode/project skips,0 failures (Chromium,port3295 required by the existing Origin assertion).
- Production source is committed through `cf722f1`; `008ffdb` only adds a font-readiness condition to an existing geometry test. Build48/48, web typecheck and lint passed (4 pre-existing Fast Refresh warnings,0 errors). Client/components/root-route unit suite246 passed,12 DB-environment skips; no backend/schema or dependency changes warranted rebuilding a test database this round.
- Independent review approved the auth extraction, lifecycle cancellation, focus restoration and policy preservation. Follow-ups fixed public landmark placement and retained Radix's generated dialog title ID. The explicit accessible-name regression failed on an empty name before the fix and passed afterward.
- During broad regression, an unchanged long-annotation geometry test compared fallback-font bounds against loaded Source Serif bounds (4px glyph-height difference and one extra wrapped line). It now awaits `document.fonts.ready` before measuring, without changing assertions or production annotation logic. Another unchanged mobile practice case passed5 isolated repeats; the final full run also passed it.

### Staged evidence

- TDD: the first5 public-entry browser contracts failed against the old page (missing public home/auth buttons). New public entry plus cancellation tests passed12/12 across Chromium/mobile after implementation.
- Existing account journeys migrated to explicit dialog opening, including normalization, shared-space invitation refusal, unsafe redirects, duplicate submission and credential errors. Combined public/account suite:49 passed,3 mode-specific skips.
- Client/components/root-route Vitest:246 passed,12 DB-environment skips. Style contracts19/19 included, unchanged assertions; CSS was adapted to tokens rather than relaxing the rules.
- Web build generated48/48 pages; typecheck passed. Lint0errors,4 existing Fast Refresh warnings.
- Desktop1440 and mobile390 screenshots inspected. Wide-page geometry waits for global CSS and compares available document width, accounting for WebKit scrollbars.
- The public header/footer sit outside `main`, so the skip link really bypasses navigation. The new keyboard test failed against the nested layout and passes after the boundary correction; mobile WebKit verifies main focus and landmark separation without assuming its platform Tab preference. Public-entry suite now14/14 across Chromium/mobile.
- Dialog dismissal is verified through the actual `requestfailed` event for its aborted account-entry request, followed by a clean reopened form and unchanged URL.

No main merge, push or deployment. Original real-account app3201 is preserved;3202 is an isolated example preview. Browser auth tests use controlled API responses, not the user's real account or a live registration.
