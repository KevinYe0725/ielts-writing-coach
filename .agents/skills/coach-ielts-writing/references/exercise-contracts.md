# Exercise contracts

## Contents

1. Supported skills
2. Paper sections
3. Paper contract
4. Response contract
5. Feedback rules

## 1. Supported skills

Use only these course-generating IDs:

| Dimension | `skill_id` | Core ability |
|---|---|---|
| GRA | `complete_comparison` | Complete comparison structure and comparable objects |
| GRA | `verb_form_trigger` | Verb form after prepositions, infinitives, and other triggers |
| GRA | `sentence_boundary` | Fragments, run-ons, comma splices, and clause boundaries |
| GRA | `subject_verb_agreement` | High-frequency subject–verb agreement |
| GRA | `article_control` | Articles, countability, and singular/plural framing |
| LR | `collocation_perspective` | Natural collocation and English information perspective |
| LR | `word_form_precision` | Word class, form, and semantic precision |
| TR | `task_instruction_coverage` | Required task action and prompt scope |
| TR | `mechanism_chain` | Claim → reason → mechanism → result |
| TR | `development_relevance` | Relevant explanation and examples |
| TR | `weighing_qualification` | Comparison criteria, concession, and qualification |
| CC | `paragraph_function_order` | Sentence roles and logical paragraph order |
| CC | `reference_linking` | Clear reference and accurate logical linking |

Unsupported issues remain in feedback. Do not invent an ID.

## 2. Paper sections

1. `FOUNDATION`: one unambiguous recognition question and one short explanation.
2. `REPAIR`: two meaning-preserving corrections or rewrites.
3. `GENERATION`: two original responses in different contexts without hints.
4. `INTEGRATION`: two larger IELTS-style outputs, including an 80–120 word paragraph.

## 3. Paper contract

The learner-facing paper contains exactly eight questions and 60 suggested minutes:

```json
{
  "format": "TIMED_PAPER_V2",
  "durationMinutes": 60,
  "titleZh": "本篇作文专项训练卷",
  "objectiveZh": "检验一个明确的核心能力",
  "items": []
}
```

Each item declares its section, bilingual title, one complete plain-Chinese instruction, English prompt/source, response mode, options where relevant, minute budget, word range, and protected evaluator criteria. Choice answer keys must refer only to visible options. Open questions must not carry hidden accepted strings. The instruction explicitly states required ideas, output size, and restrictions; evaluator criteria mirror this instruction and are not shown as a separate learner-facing rubric.

## 4. Response contract

Store one immutable answer sheet and one whole-paper evaluation:

```json
{
  "schemaVersion": "1.0.0",
  "id": "01989a00-0000-7001-8000-000000000020",
  "paperId": "01989a00-0000-7001-8000-000000000010",
  "submittedAt": "2026-08-13T12:00:00Z",
  "answers": {},
  "result": null
}
```

Never overwrite the submitted answer sheet. A failed evaluation can be repeated against the same sheet, but it cannot create another answer attempt. Internal model and provenance data stay in protected records and are not displayed in learner feedback.

## 5. Feedback rules

Do not show hints, answer keys, item judgments, protected criteria, or an adaptive branch before submission. After submission, keep successful questions concise and expand only below-standard questions. Do not require exact wording. Judge meaning preservation, target use, overall acceptability, and only requirements stated in the visible instruction.
