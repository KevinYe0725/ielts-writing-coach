# Assessment rubric

## Contents

1. Output contract
2. IELTS dimensions
3. Evidence and confidence
4. Issue classification
5. Version comparison

## 1. Output contract

Assess the submitted text as an IELTS Writing Task 2 attempt. Return four estimated bands in 0.5 increments, an overall estimate, confidence, and direct evidence. Never infer a higher or lower score from the user's target band.

For each dimension provide:

- `band_estimate`: 0–9 in 0.5 increments;
- `confidence`: `low`, `medium`, or `high`;
- `evidence`: exact excerpts or paragraph references;
- `strengths`: at most two score-relevant observations;
- `limitations`: at most three score-relevant observations;
- `next_action`: one observable improvement.

Use “estimated” throughout. If the prompt is incomplete, the essay is under 250 words, or the attempt was assisted, explain the limitation rather than fabricating certainty.

## 2. IELTS dimensions

### Task Response (TR)

Judge whether the response:

- addresses every instruction and the relevant scope of the prompt;
- presents a clear position where required;
- maintains that position consistently;
- develops main ideas through reasons, mechanisms, consequences, examples, or qualification;
- weighs competing effects explicitly in outweigh or evaluation tasks.

Do not reward the number of ideas. Two well-developed ideas can outperform a list of undeveloped claims.

### Coherence and Cohesion (CC)

Judge whether:

- each paragraph has a clear function and unified focus;
- information progresses in a recoverable logical order;
- references and substitutions are unambiguous;
- linking devices express real relationships rather than decorate the text;
- paragraphing supports the argument.

Do not score cohesion by connector count.

### Lexical Resource (LR)

Judge whether vocabulary is:

- precise for the intended meaning;
- naturally combined in collocations and chunks;
- appropriately formal for an academic essay;
- varied where variation improves clarity;
- accurately formed and spelled.

Distinguish an understandable but non-idiomatic combination from a hard lexical or grammatical error. For example, `much + comparative` is structurally valid in `much slighter`; the stronger concern in `slighter pressure` is natural collocation and perspective.

### Grammatical Range and Accuracy (GRA)

Judge:

- sentence and clause boundaries;
- control of simple and complex structures;
- verb forms, agreement, tense, voice, and non-finite triggers;
- articles, countability, number, and noun-phrase control;
- comparisons and modifiers;
- punctuation where it affects structure or clarity.

Consider both error frequency and communicative impact. Do not call an optional stylistic improvement a grammar error.

## 3. Evidence and confidence

Every negative judgment must point to the user's text. Preserve the original wording. Use character spans when the host contract supports them.

Use `high` confidence when the issue is rule-governed and the context is complete. Use `medium` for naturalness, ambiguity, or band-boundary judgments. Use `low` when prompt context is missing, the sentence permits multiple readings, or model judgment is unstable.

Low-confidence evidence may enter the report but must not independently change a skill state.

## 4. Issue classification

Classify each issue as one of:

- `hard_grammar`: a grammatical structure is not acceptable in context;
- `lexical_precision`: word form or meaning does not express the intended claim;
- `collocation_naturalness`: understandable but not a conventional combination;
- `l1_information_structure`: words are assembled around a source-language perspective rather than a natural English relationship;
- `logic_development`: the claim lacks a relevant reason, mechanism, result, or comparison;
- `cohesion`: reference or logical connection is unclear;
- `optional_style`: a valid alternative that may improve concision or tone.

Map course-supported issues only to the 13 IDs in `exercise-contracts.md`. Unsupported issues remain in feedback without receiving an invented ID.

## 5. Version comparison

Compare V1 and V2 only after storing both independently.

- Prefer the same prompt, rubric, model family, and evaluation settings.
- If prompt or rubric versions differ, mark score movement `not_directly_comparable`.
- If only the model differs, report that model variation may contribute to the difference.
- If either model identifier is missing, compare rubric-based patterns but do not label the score movement directly comparable.
- Compare target recurrence per 100 words, not raw counts alone.
- Separate improved writing from changes caused by assistance, interruption, or a much longer drafting time.
- Never erase a prior estimate when re-evaluating; append a new version.
