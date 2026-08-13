# Exercise contracts

## Contents

1. Supported skills
2. Exercise families
3. Lesson plan contract
4. Response contract
5. Hint and feedback rules

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

## 2. Exercise families

1. `source_spotlight`: select the relevant span; distinguish error from optional improvement.
2. `meaning_fork`: confirm intended meaning; branches but is not scored.
3. `expression_map`: map meaning, English perspective, and complete chunk.
4. `minimal_contrast`: choose and explain the best form among plausible alternatives.
5. `sentence_rebuild`: reconstruct semantic slots and complete relationships.
6. `constrained_rewrite`: write a full sentence under a meaning or structure constraint; includes one-meaning-many-ways tasks.
7. `reasoning_bridge`: classify, order, remove, or write claim/reason/mechanism/result units.
8. `paragraph_lab`: write 80–120 words, self-check, and resubmit; score only lesson targets.

## 3. Lesson plan contract

Use the canonical `LessonPlan` shape shared with the Web application:

```json
{
  "schemaVersion": "1.0.0",
  "id": "01989a00-0000-7001-8000-000000000002",
  "trainingCycleId": "01989a00-0000-7001-8000-000000000001",
  "status": "READY",
  "plannedUserSeconds": 2700,
  "corePathSeconds": 2700,
  "flexiblePathSeconds": 0,
  "objectives": [],
  "blocks": [],
  "plannerVersion": "planner-version",
  "generatorVersion": "generator-version"
}
```

Each block declares `kind`, `path`, `timeBudgetSeconds`, and `items`. `path=CORE` always runs; `FLEX` is remedial when core evidence is incomplete; `OPTIONAL` is voluntary enrichment after a core pass. FLEX and OPTIONAL are mutually exclusive tail paths. Use exactly one `BREAK` block on the CORE path with 180 seconds and no items.

Each exercise item uses canonical camelCase fields:

- IDs and traceability: `id`, `blockId`, `learningObjectiveId`, `primarySkillId`, and optional `sourceIssueId`;
- `stage`: `notice`, `understand`, `control`, `produce`, `near_transfer`, or `self_check`;
- a canonical `itemType` allowed by the selected skill definition;
- `expectedActiveSeconds`, `expectedTotalSeconds`, `isReserve`, `contextId`, and evidence opportunity;
- `firstAttemptRequired`, `hintPolicy`, and `feedbackPolicy`;
- validated quality state and one scoring criterion per explicit integrated objective.

Integrated items may score several dimensions, but each scoring dimension must map to one explicit `skill_id`.

## 4. Response contract

Store append-only attempts and evaluations:

```json
{
  "schemaVersion": "1.0.0",
  "id": "01989a00-0000-7001-8000-000000000020",
  "exerciseItemId": "01989a00-0000-7001-8000-000000000010",
  "firstAttemptId": "01989a00-0000-7001-8000-000000000021",
  "finalAttemptId": "01989a00-0000-7001-8000-000000000021",
  "attempts": [
    {
      "id": "01989a00-0000-7001-8000-000000000021",
      "answer": "verbatim",
      "submittedAt": "2026-08-13T12:00:00Z",
      "elapsedSeconds": 90,
      "hintLevel": "NONE",
      "referenceAnswerSeen": false
    }
  ],
  "evaluations": []
}
```

Never overwrite an earlier attempt or evaluation. `firstAttemptId` stays immutable; `finalAttemptId` points to the latest submitted attempt. Evaluations store dimension scores, quoted user-answer evidence, one most important suggestion, evaluator/prompt/rubric versions, confidence, and adjudication. A correct later attempt after `ANSWER_SHOWN` remains a prompted completion.

## 5. Hint and feedback rules

Hint ladder:

1. conceptual prompt without target wording;
2. partial structure or semantic slots;
3. complete example followed immediately by a different-context repair.

For open responses:

1. save the first answer;
2. give one minimal, target-specific cue;
3. collect the user's revision;
4. show full feedback and one reference expression;
5. add a new-context item only when needed.

Do not require exact wording. Judge meaning preservation, target use, overall acceptability, and confidence.
