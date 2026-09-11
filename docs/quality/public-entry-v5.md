# Public entry v5

## Design

The user requested a promotional website-style entry with Login and Sign up at the top right, inspired by OpenAI's homepage. This is our own IELTS Writing Coach identity, not a replica or endorsement. The OpenAI homepage was consulted at https://openai.com/ for restrained navigation, whitespace and a clear primary action.

`/signin` now shows a full-width public product page: centered display title, an explicitly labelled teaching example, a compact three-step learning explanation and a closing action. An anonymous root visit still redirects here; authenticated root visits still continue to Today. No server routing, signup policy or API contract changes.

Existing white/ink/blue/green tokens and Noto Sans/Source Serif/IBM Plex roles are reused. New public display-size tokens do not change workspace typography. Existing Radix Dialog provides focus containment; no new package or marketing template was installed. No fabricated testimonials, guaranteed scores, price claims or provider-configuration jargon was added.

Login and signup open the same existing `/api/v1/account-entry` form, with mode-specific labels and password autocomplete. Server-side automatic registration and invitation restrictions are retained. Return paths, input validation, localized errors, duplicate-submit prevention and recovery remain. Dismissing the dialog aborts its outstanding browser request and clears its form state; it does not purport to undo an account operation already processed by the server.

## Verification in progress

- TDD: the first5 public-entry browser contracts failed against the old page (missing public home/auth buttons). New public entry plus cancellation tests passed12/12 across Chromium/mobile after implementation.
- Existing account journeys migrated to explicit dialog opening, including normalization, shared-space invitation refusal, unsafe redirects, duplicate submission and credential errors. Combined public/account suite:49 passed,3 mode-specific skips.
- Client/components/root-route Vitest:246 passed,12 DB-environment skips. Style contracts19/19 included, unchanged assertions; CSS was adapted to tokens rather than relaxing the rules.
- Web build generated48/48 pages; typecheck passed. Lint0errors,4 existing Fast Refresh warnings.
- Desktop1440 and mobile390 screenshots inspected. Wide-page geometry waits for global CSS and compares available document width, accounting for WebKit scrollbars.
- The public header/footer sit outside `main`, so the skip link really bypasses navigation. The new keyboard test failed against the nested layout and passes after the boundary correction; mobile WebKit verifies main focus and landmark separation without assuming its platform Tab preference. Public-entry suite now14/14 across Chromium/mobile.
- Dialog dismissal is verified through the actual `requestfailed` event for its aborted account-entry request, followed by a clean reopened form and unchanged URL.

No main merge, push or deployment. Original real-account app3201 is preserved;3202 is an isolated example preview. Browser auth tests use controlled API responses, not the user's real account or a live registration.
