# Compatible Focused Generation Design

## Goal

Allow a learner using an OpenAI-compatible provider to receive a focused teaching article and its matching timed practice paper without risking the learner's draft, assessment, or existing cycle when a large structured response is malformed.

## Evidence

The current learner's DeepSeek connection completed the assessment and issue-classification jobs. The next `exercise_generation` job failed three times. That job asks one compatible-provider response to contain both a teaching article and an eight-item paper, then validates a large cross-field contract. The compatible adapter reports a contract-validation failure as a generic provider failure.

## Design

For `compatible` providers only, focused generation will use two independent structured requests:

1. Generate and validate the adaptive teaching article from the frozen diagnosis.
2. Generate and validate the 60-minute paper from the validated article's private objective, with fresh material.
3. Combine the two values and run the existing cross-package validator before any database write.

OpenAI and Mock providers retain the existing single-request behavior. No learner-facing state changes until the combined package passes validation. A failure therefore leaves the draft, assessment, diagnosis, and existing lesson data intact and remains retryable through the existing job-recovery path.

DeepSeek's preset will request its documented JSON-object response mode. The compatible adapter will also identify a structured-validation failure as an invalid structured response instead of displaying the generic request-failure text.

## Boundaries

- Do not expose provider bodies, API keys, implementation terms, or schema details to learners.
- Do not regenerate or overwrite Version 1, assessment, diagnosis, or a saved lesson plan.
- Do not save a teaching article unless its corresponding paper and the combined package validate.
- Retain the existing paper-answer isolation and Version-1 non-imitation checks in the final combined validator.

## Verification

- A regression test proves compatible generation issues two smaller calls and persists only the fully validated combined package.
- A regression test proves a failed second call creates no lesson mutation.
- Adapter tests prove the DeepSeek preset sends JSON-object mode and that malformed structured output is classified safely.
- Focused Worker and AI suites, type checks, formatting, and a controlled retry of the current account's failed generation are run before release.
