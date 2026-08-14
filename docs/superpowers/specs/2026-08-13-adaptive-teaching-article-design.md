# Adaptive Teaching Article Design

## Purpose

Replace the fixed six-part focused lesson with a constrained, AI-generated IELTS tutorial. The lesson must adapt its structure, examples, depth, and practice to one diagnosed micro-skill while retaining deterministic quality gates.

The teaching page is not an extension of the correction report. It must not locate, highlight, or quote the learner's Version 1 essay. The diagnosis selects the teaching target internally; the learner receives a self-contained knowledge tutorial built from new examples.

## Product Principle

The content path is flexible; the learning outcome is constrained.

- Do not require every tutorial to contain an expression bank, worked example, or the same named chapters.
- Do require one narrow target, sufficient explanation, a genuine demonstration, active output, unseen-topic transfer, and an executable self-check.
- The renderer knows how to display a bounded vocabulary of article blocks. The AI decides which blocks to use and how to group them into sections.

## Generation Contract

Every generated teaching package contains an internal blueprint followed by the learner-facing article.

### Blueprint

The blueprint defines:

- one precise core ability in Chinese and English;
- the learner's current difficulty type:
  - `CONCEPT_GAP`;
  - `RECOGNISES_BUT_CANNOT_REVISE`;
  - `REVISES_BUT_CANNOT_GENERATE`;
  - `SAME_CONTEXT_ONLY`;
  - `UNSTABLE_CONTROL`;
- one observable completion standard;
- at most one prerequisite ability and one supporting ability;
- the selected article block kinds.

The blueprint is persisted for validation but its enums, IDs, and implementation fields are never displayed.

### Learner-facing article

The article contains:

- a dynamic title and short introduction;
- an estimated reading-and-practice time of 10–25 minutes;
- 2–5 dynamically named sections;
- 4–8 blocks across those sections;
- exactly one final summary block.

Allowed block kinds:

1. `EXPLANATION` — concept explanation with a concrete key point.
2. `CONTRAST` — weak/strong examples and the meaningful difference.
3. `REASONING` — a visible thinking process that reaches a new example.
4. `TOOLKIT` — optional language tools with conditions and cautions.
5. `PITFALLS` — optional misconceptions or recurring decision errors.
6. `PRACTICE` — 2–3 active prompts with revealable reference reasoning.
7. `SUMMARY` — transferable rules and a self-check question.

The allowed kinds are rendering primitives, not required chapters. Sections may contain different combinations and use any pedagogically justified titles.

## Deterministic Quality Gates

A package is rejected unless all of the following hold:

- the paper objective contains the same narrow target title;
- the article has 2–5 sections and 4–8 total blocks;
- all section anchors are unique and safe;
- the blueprint's selected kinds exactly match the article's actual kinds;
- there is at least one `EXPLANATION` block;
- there is at least one `CONTRAST` or `REASONING` demonstration;
- there is at least one `PRACTICE` block with at least two active prompts;
- at least one practice prompt uses `SHORT_TEXT` rather than recognition only;
- at least one practice prompt has `UNSEEN_TOPIC` context;
- there is exactly one `SUMMARY` block and it is the final block;
- non-empty bilingual learner-facing copy is present;
- the article does not reproduce a long exact span from Version 1;
- no model, prompt, schema, job, skill ID, evidence gate, or scoring implementation vocabulary is learner-facing;
- the tutorial does not disclose a complete model essay or the later paper's answers.

## Personalisation Rules

The generator chooses the teaching strategy from the diagnosed difficulty, not merely from the skill ID.

- `CONCEPT_GAP`: favour explanation, diagram-like reasoning, and contrasts.
- `RECOGNISES_BUT_CANNOT_REVISE`: favour contrasts and guided repair.
- `REVISES_BUT_CANNOT_GENERATE`: progressively remove scaffolding and require short generation.
- `SAME_CONTEXT_ONLY`: use substantively different IELTS topics and unseen transfer.
- `UNSTABLE_CONTROL`: use decision rules, plausible distractors, and a short self-check routine.

The generator may add at most one prerequisite and one supporting ability. Unrelated grammar, spelling, vocabulary, organisation, or argument issues must not be bundled into the tutorial.

## Reading Experience

The page behaves like a high-quality technical article, not a course dashboard.

- The learner reads one continuous article canvas.
- Body text is 16–17px with a 1.75–1.9 line-height and a 680–760px readable column.
- H1, H2, and H3 have visibly distinct hierarchy.
- Explanatory blocks flow as prose without generic cards.
- Contrast, reasoning, examples, and conclusions use restrained semantic callouts.
- English IELTS examples use a readable serif face; syntax patterns alone may use monospace styling.
- A dynamic right-hand table of contents is sticky when the content container is wide enough.
- The current section is highlighted with `aria-current="location"`.
- At narrower widths the contents becomes a collapsed vertical disclosure, never a horizontally clipped chip row.
- The article uses an `<article>` inside the existing application `<main>` and does not create nested main landmarks.

## Interaction

- Practice answers remain local to the teaching page and do not affect mastery or block progress.
- Reference answers remain hidden until the learner answers.
- Selecting a table-of-contents link moves to the real generated section and updates the current location.
- The only primary action is starting the 60-minute paper. Returning to the report is secondary.
- Keyboard navigation, focus visibility, reduced motion, bilingual UI, and mobile reflow remain supported.

## Compatibility

- New packages use `format: "ADAPTIVE_ARTICLE_V1"`.
- Existing legacy teaching modules without this format return the existing replacement-required response instead of being rendered through guessed mappings.
- The timed eight-question paper contract remains unchanged.
- Demo content is migrated to the new contract and intentionally demonstrates one tutorial shape only; the renderer tests additional block combinations.

## Acceptance Criteria

- No learner essay text, original-text locator, or source highlight appears on the teaching page.
- The demo article's section count and block order are driven entirely by data.
- The renderer handles every allowed block kind and omits unused kinds cleanly.
- The page contains exactly one main landmark and one teaching article.
- Desktop article prose is 680–760px wide with a readable line-height.
- At 1280px, collapsing the product sidebar can change the article from single-column to article-plus-contents based on actual content width.
- At 390px, the contents is collapsed by default, all links fit the viewport, and the first section begins within 550px of the document top.
- There is no horizontal page or example overflow at 390, 768, 1280, or 1440px.
- At least two different valid fixture shapes render without production-code changes.
- The generator rejects missing transfer, recognition-only practice, unrelated block bloat, duplicate anchors, a non-final summary, and long Version 1 quotation.
- Existing focused-teaching loading, replacement, retry, bilingual, quick-check, and paper-entry behaviour remains functional.
