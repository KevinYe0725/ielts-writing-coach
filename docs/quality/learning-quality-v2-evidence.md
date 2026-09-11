# Learning quality and reading experience — 11 September 2026

## Scope

This local iteration preserves the learning sequence and annotation-desk visual
direction. It changes report prioritisation, article navigation, prompt
consistency, and the coverage of evidence-grounded tutorial feedback.

- Reports show up to three representative actionable priorities, followed by
  the complete original-text review. Filters separate corrections, expression
  improvements, and optional polish. An original-text link reopens its matching
  suggestion even after filtering. Optional polish cannot become a top priority.
- Teaching exposes an existing, validated learning goal as learner-facing text.
  The article has an explicit active-practice heading and table-of-contents link.
  The mobile header remains compact; the article keeps its adaptive sections.
- Tutorial feedback adds 13 specific improvement codes across grammar, spelling,
  collocation, comparison, task coverage, support, qualification, order, and
  reference. Each retains exact learner evidence and can display a separate
  authored example. Historical codes remain supported. No provider-authored
  prose, grading state, or arbitrary rewrite is admitted into this response.
- Generation instructions use the actual Markdown contract rather than the old
  typed-block contract. Choice prompts do not demand unavailable written input;
  short-text prompts must include active production. Knowledge notes distinguish
  accepted language varieties and give a verified relative-clause example.
- A valid empty issue list is accepted. Failed source anchoring no longer creates
  a synthetic learner weakness. With no actionable diagnosis, the learning
  request explicitly describes optional consolidation. Optional polish is not
  sent to mixed-review recurrence evaluation as a learner error.

## Verification

- Initial selected baseline: 19 tests passed.
- New grammar, modal, collocation, and reference feedback cases failed against
  the old projection and passed after implementation. Invented evidence remains
  rejected, and original atom rendering remains compatible.
- Three classifier regressions reproduced: rejecting an empty schema response,
  failing the clean-answer job, and inventing a synthetic issue after anchoring
  failure. All three pass after the change.
- Desktop Chromium and iPhone-sized WebKit: 72 browser cases passed; 68
  non-demo cases were intentionally skipped by this demo run. Cases include
  filtering/original-text navigation, keyboard focus, mobile contents, source
  report access, paper draft retention, and the independent paper entry.
- Production Web build: 48 pages generated successfully.
- Web and Worker TypeScript checks passed. Web lint had zero errors and the four
  existing Fast Refresh warnings.
- Broader tests against a separate disposable PostgreSQL 17 database:
  **858 passed, 2 failed**. Both failures are in the unchanged question
  recommendation cooldown tests. Running the same tests against untouched
  `main` at `e88bbcf` reproduced both failures. They are not claimed as passing
  or silently skipped. No real learner database was used for these tests.

## Real-provider checks and limits

Small authored inputs were sent through the existing local DeepSeek connection
(`deepseek-v4-pro`); no learner essays or credentials were written into this
document. Agreement, modal form, collocation, unambiguous reference diagnosis,
valid alternative wording, and a clean sentence produced the intended final
outcomes with exact evidence. An initial pronoun test allowed a legitimate
plural interpretation; it was replaced with a genuinely ambiguous singular
referent, not used as a reason to force a correction.

The first clean-sentence call exposed the minimum-one-issue schema bug. It
succeeded with an empty issue list after the actual schema and worker path were
fixed, not merely after editing prompt wording.

Full tutorial generation was also exercised. Manual review, in addition to
schema validation, found unsupported examiner-preference advice and an incorrect
relative-clause explanation in early samples. The runtime knowledge was refined
using the sources recorded in `docs/knowledge-base/source-register.md`. The final
sample explains the main/relative-clause subjects correctly and does not claim
that singular collective-noun agreement is preferred by IELTS. It has six
sections and four active prompts. This is a limited case-based check, not an
official band calibration, broad model benchmark, or proof of retained learning.

Changes affect future generated content. Existing learner reports and tutorial
answers are not overwritten or regraded by this iteration.

## Review follow-up

Independent review identified three additional boundary gaps. Five regressions
were reproduced before the fixes, and the 64 focused worker/route checks pass:

- The new public goal is checked for implementation vocabulary and future-paper
  answer overlap. An unsafe old goal is omitted while the existing article still
  returns HTTP 200; this does not force a learner to regenerate an old course.
- Optional polish is categorised as `OPTIONAL_OPTIMIZATION`, not hard grammar,
  even when its skill identifier belongs to a grammar skill.
- Both new paper persistence and grading of historical papers replace criterion
  labels/descriptions/weights from the visible instruction. A hidden model-added
  requirement therefore does not reach the grader. Existing papers are not
  rejected merely because their old metadata paraphrased the instructions.

The independent follow-up review confirmed all three findings resolved, with
64/64 targeted tests and both Web and Worker typechecks passing. The final
production build also regenerated all 48 pages successfully.
