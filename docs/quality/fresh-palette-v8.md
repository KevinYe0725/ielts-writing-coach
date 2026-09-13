# Fresh palette v8

Date: 2026-09-12. Scope: local frontend visual theme only. No learning, AI, authentication, persistence or deployment behavior changed.

## Role palette

| Role          | Value                          | Use                                          |
| ------------- | ------------------------------ | -------------------------------------------- |
| Ink           | `#123330`                      | Long-form text and headings                  |
| Paper         | `#FFFFFF`                      | Reading surfaces and controls                |
| Canvas        | `#F3FAF7`                      | Page background and quiet workspace areas    |
| Action teal   | `#077581`                      | Primary actions, links and active navigation |
| Success green | `#2F7D5A`                      | Positive learning state only                 |
| Amber / error | Existing `#7C531B` / `#B4474C` | Warnings and errors remain distinct          |

Derived muted text uses opaque token mixes rather than low-alpha text over white. This keeps the sea-glass background light without making labels unreadable. Added-example mint backgrounds do not carry success meaning by themselves.

## Updated surfaces

The role tokens are consumed by the global shell, public sign-in page, Today, writing room, feedback, focused teaching, paper, rewrite, compare, transfer, growth, account, settings, admin and the teaching design prototypes. Direct low-alpha ink text in shared learning surfaces now uses the readable ink token; borders and decorative separators remain quiet.

## Verification

- Style contract: 20 passed, including hand-calculated palette contrast checks (ink/canvas and ink/paper >=7:1; white/action, action/canvas and success/paper >=4.5:1).
- Root unit suite: 821 passed, 164 environment/database-dependent skips (86 files passed, 20 skipped).
- Key browser suite, Chromium + mobile: 146 passed, 80 mode/project skips. Includes accessibility scans for all primary routes, lesson, paper, account and public entry.
- Focused color regressions (redesign, rewrite, admin): 154 passed, 33 mode/project skips; one pre-existing mobile WebKit font-family assertion remains unrelated to palette.
- Production build: 49/49 pages. Typecheck passed. Web lint: 0 errors, 4 existing Fast Refresh warnings.
- Full 564-test Chromium/mobile run after the palette: 383 passed, 177 skipped, 4 unrelated pre-existing failures: two document-workspace focus assertions expecting the old practice heading, one mobile WebKit font-family timing/serialization assertion, and one mobile error-token helper count assertion. No color-contrast failures remain in the full run.
- Manual screenshots inspected at 1440×1000 and 390×844 for sign-in, Today, feedback and focused teaching. No horizontal overflow observed on mobile. Existing local services 3201 and 3202 remain running.
