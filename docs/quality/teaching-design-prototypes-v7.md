# Teaching design comparison prototypes

2026-09-12. User-approved scope: compare two clickable designs before replacing the actual tutorial. Previous article layout rejected; preserve teaching depth while changing presentation and learning rhythm.

## Scope and interaction

- A: example-led workbench, explanation on demand, adjacent writing area.
- B: one focused question at a time, freely selectable sections. Its three sections belong to this demonstration, not a universal generated course template.
- Shared example, explanations, transfer example, limits and writing prompt. In-page switching preserves draft, comparison and exploration state.
- Authored sample feedback is explicitly labelled. Editing the sample clears sample status and its feedback. Arbitrary drafts only receive reference-based self-check, never an invented AI judgment.
- In-memory state only; refresh discards prototype drafts. No answer requests or learning persistence. Existing lesson and all backend files remain unchanged.
- New route `/lesson/design-preview?view=workbench` or `view=focus` exists only with explicit demo mode. Real-account build returns404.

## Visual direction

Existing paper white, canvas blue-grey, ink navy and evidence blue. Green is reserved for added explanatory material. Noto Sans SC for explanations/UI, Source Serif4 for English examples. The signature interaction is the missing reasoning link: opening it changes the English example and its process explanation. Responsive single-column fallback; no new library or remote asset.

## Verification

- State regressions cover preserved drafts, free section jumps, sample invalidation, exploration isolation. Route tests cover demo-only access and initial design selection.
- Related lesson/component/style tests:53 passed. Web typecheck passed. Lint:0 errors,4 unchanged Fast Refresh warnings. Production build49/49 static pages; actual built prototype route returned404 with demo off.
- Browser CLI: desktop1440×1000 and mobile390×844, original/developed example toggle, alternate explanation, A/B switch with retained draft, sample feedback, edited sample invalidation, and English locale. Checked mobile document width: no overflow.
- Accessibility scan identified skipped heading depth in the explanation and was corrected. Focus-mode explanation and writing scans returned no violations; English mobile explanation also returned none.
- The demo shell's auth/session503 remains expected because3202 has no real account backend. No real account login or model evaluation is claimed.
- Independent read-only review approved the isolated prototype, with no actionable important findings after the heading-level correction.

Artifacts are under `output/playwright/teaching-options-*`. Preserve local services3201/3202; stop temporary production verification server3295. No merge, push or deployment.
