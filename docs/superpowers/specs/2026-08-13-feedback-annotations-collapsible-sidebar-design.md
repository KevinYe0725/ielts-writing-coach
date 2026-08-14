# Feedback Annotations and Collapsible Sidebar Design

## Goal

Correct the report's multi-line source annotations and let desktop learners hide the primary sidebar to give dense feedback and teaching pages more usable space.

## Source annotations

- Keep exact source offsets and immutable Version 1 text.
- Replace the invalid visual structure `<mark><button>…</button></mark>` with one focusable inline `<mark role="button">` so browser line wrapping and painted decoration share the same geometry.
- Support click, Enter and Space without moving focus; Space prevents page scrolling.
- Use multi-line `text-decoration` rather than one `border-bottom` box.
- Distinguish learner meaning:
  - language correction: amber solid underline;
  - naturalness/collocation: blue solid underline;
  - development or missing logic: violet dotted underline labelled as a suggestion to add, not a sentence-wide error.
- AI assessment instructions should request the smallest exact actionable source span. Missing-content issues may retain a context span, but must be classified as development rather than a hard language error.

## Desktop sidebar

- Default remains expanded.
- A permanent Topbar button hides or shows the sidebar and keeps focus after activation.
- Hidden means removed from layout and accessibility navigation, not translated off-screen.
- Persist the preference locally across routes and reloads; mobile navigation ignores the desktop preference.
- Hidden state expands ordinary main content from 1180px to at most 1320px.
- Report and teaching columns use their actual container width, so the released sidebar space can trigger a useful split without squeezing either pane.

## Accessibility and failure handling

- Sidebar toggle uses `aria-controls="primary-sidebar"` and `aria-expanded`.
- Annotation marks expose `aria-pressed`, visible focus and learner-facing labels.
- If browser storage is unavailable, the sidebar still works for the current page and defaults expanded on reload.
- At 960px and below, the existing mobile header/menu remains authoritative.

## Acceptance

- Multi-line source annotations generate multiple client rectangles and do not change the essay's line wrapping when selected.
- No source annotation contains a native button.
- Cards and source annotations remain bidirectionally synchronized by mouse and keyboard.
- Sidebar can hide/show, main content grows, state survives reload/navigation, and mobile navigation is unchanged.
- Desktop, 1279px, 961px and 390px layouts have no horizontal page overflow.
