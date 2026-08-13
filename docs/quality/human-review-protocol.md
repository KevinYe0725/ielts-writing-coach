# Human review protocol for v1.0

The repository's deterministic corpus protects schemas, offsets, evidence
gates, and known regressions. It cannot establish whether real-model exercises
are natural or whether open-answer judgments agree with qualified humans. This
protocol turns those two PRD requirements into a repeatable release review.

The machine-readable plan is
`tests/human-review/v1/review-plan.json`. The committed run template remains
`NOT_RUN`; it is deliberately not evidence of a pass.

## Freeze the run before calling a model

1. Copy `review-run.template.json` to an immutable, dated run file. Do not edit
   the template in place.
2. Record provider, exact model ID, prompt version, rubric version, corpus
   version, and run timestamps. Mock is prohibited for language-quality
   evidence.
3. Version the open-response pass thresholds and record
   `openResponsePassThresholdsDeclaredAt` before the first model call. Changing
   thresholds after viewing predictions invalidates the run.
4. Record two reviewer IDs, relevant qualifications, and consent to publish
   de-identified reviews. Do not store personal contact details in the report.
5. Generate the complete stratified sample before review. Retain failures and
   retries; do not silently replace a weak sample.

## Generated-item acceptance review

Review at least 52 items: at least four for each of the 13 fixed skills. Sample
across the item types and lesson stages actually shipped. Each item is accepted
only when all four criteria pass:

- the training goal is clear;
- the allowed answer or rubric is determinate enough to grade;
- the intended meaning is preserved;
- the English is natural for the specified meaning and context.

Two reviewers label every item independently. They must not see each other's
label or the aggregate rate before submitting. Record an adjudicated boolean
for every criterion and an adjudicator. The validator recomputes `accepted` and
the denominator. The PRD gate is an acceptance rate of at least 0.95; rounding
does not turn a lower raw rate into a pass.

## Open-response regression review

Review at least 26 responses: at least two for every fixed skill, with sentence
and paragraph levels both represented. Use deliberately mixed pass/fail,
borderline, equivalent-natural-answer, meaning-change, and low-confidence
cases. Preserve the model's judgment, cited answer evidence, and confidence.

Two reviewers independently label each answer, then adjudicate disagreements
with a rationale. Report the metrics declared in the frozen threshold file;
never choose a metric or cutoff after seeing the results. A low-confidence or
disputed AI judgment must remain invalid for a mastery state transition even if
the aggregate regression gate passes.

## Twelve-essay adjudication

The 12 repository essays are synthetic pipeline fixtures with no gold bands.
If they are used for calibration, two qualified reviewers independently assign
TR, CC, LR, GRA, and overall bands with rationales, followed by adjudication.
Record model-versus-human differences descriptively under the predeclared
analysis plan. Do not call either the human or model result an official IELTS
score, and do not infer a product accuracy claim from 12 essays alone.

## Validate and publish

After all adjudications are final, set `status` to `COMPLETE`, fill the summary
from the raw records, and run:

```bash
node tests/quality/validate-human-review.mjs path/to/completed-run.json
```

The validator rejects Mock runs, missing metadata, fewer than two independent
reviews, insufficient skill coverage, missing failures, inconsistent summary
denominators, generated-item rates below 95%, unadjudicated essays, and removal
of the “not official IELTS” caveat.

Publish the de-identified run file, its frozen thresholds, and the model input
fixture checksums. Keep reviewer contact details, learner data, secrets, and raw
provider credentials outside the repository. A new provider, model, prompt,
rubric, or materially changed generator requires a new run ID; it must not
overwrite an earlier result.

## Required record shapes

The validator requires the following fields in addition to the top-level
metadata shown by the template. Extra explanatory fields may be added, but these
fields must remain machine-readable.

```json
{
  "reviewers": [
    {
      "id": "reviewer-pseudonym",
      "qualification": "Relevant qualification, recorded without contact data",
      "consentToPublishDeidentifiedReview": true
    }
  ],
  "generatedItems": [
    {
      "sampleId": "generated-001",
      "skillId": "collocation_perspective",
      "itemType": "CONSTRAINED_REWRITE",
      "prompt": "The exact reviewed prompt",
      "reviews": [
        {
          "reviewerId": "reviewer-a",
          "independent": true,
          "reviewedAt": "2026-08-13T12:00:00.000Z"
        }
      ],
      "adjudicated": {
        "goalClarity": true,
        "answerDeterminacy": true,
        "meaningPreservation": true,
        "languageNaturalness": true,
        "accepted": true,
        "adjudicatorId": "reviewer-a",
        "adjudicatedAt": "2026-08-14T12:00:00.000Z"
      }
    }
  ],
  "openResponses": [
    {
      "sampleId": "open-001",
      "skillId": "mechanism_chain",
      "level": "paragraph",
      "reviews": [],
      "adjudicated": { "pass": false, "rationale": "Required rationale" },
      "modelJudgment": {
        "pass": true,
        "evidence": "The exact answer evidence cited by the model"
      }
    }
  ],
  "essayAdjudications": [
    {
      "essayId": "essay-001",
      "reviews": [],
      "adjudicated": {
        "overallBand": 6.5,
        "criteria": {
          "TR": { "band": 6, "rationale": "Required rationale" },
          "CC": { "band": 7, "rationale": "Required rationale" },
          "LR": { "band": 6, "rationale": "Required rationale" },
          "GRA": { "band": 6, "rationale": "Required rationale" }
        }
      }
    }
  ]
}
```

Each actual record needs two independent `reviews`; abbreviated empty arrays in
the shape example are not valid completed data. The summary must contain
`generatedItemDenominator`, `generatedItemAccepted`,
`generatedItemAcceptanceRate`, `openResponseDenominator`, and
`essayDenominator`; the validator recomputes each value from raw records.
