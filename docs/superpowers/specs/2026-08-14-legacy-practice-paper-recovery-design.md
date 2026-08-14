# Legacy Practice-Paper Recovery Design

## Goal

Allow a learner whose historical focused-training record predates the current
teaching-and-paper format to receive a new complete practice paper without
losing any prior record or becoming stuck when generation is unavailable.

## Problem observed

The current replacement endpoint only accepts a cycle that already has both a
newer primary-skill value and an original-essay assessment. Historical
accounts can have the skill on the old lesson instead, or have no retained
assessment reference. The endpoint rejects those accounts. It also deletes the
old lesson before a replacement has been validated, so an asynchronous failure
can leave the learner without usable training.

## Chosen approach: non-destructive in-place recovery

This approach is intentionally conservative.

1. **Resolve the target skill safely.** Prefer the cycle's current primary
   skill. If it is absent, use the old lesson's recorded core skill. If neither
   is a known skill, do not modify anything; return a learner-facing recovery
   response that links back to the feedback report.
2. **Use the best available source, never require it.** If the original essay
   assessment exists, generation uses its selected evidence as it does today.
   If it does not, the worker creates a focused but general recovery package for
   the resolved skill. It must not claim that an unavailable diagnosis found a
   specific weakness.
3. **Keep the old lesson intact while work is pending.** The route creates or
   reuses one active generation request. It neither deletes the lesson,
   objectives, answers, nor historical jobs, and it does not move the cycle
   into an unusable state before success.
4. **Replace only after validation.** The worker validates the full generated
   teaching article and eight-question timed paper first. Only then does it
   update the existing lesson in place. Before overwriting learner-visible
   legacy content, it records a private migration snapshot of the legacy
   format, content, answers, result, submission time, and runtime state. Old
   per-item attempts and evaluations remain untouched.
5. **Always expose a recovery path.** A failed, blocked, or unavailable request
   returns a normal learner-facing state: the earlier record remains safe, the
   learner can retry later, or return to the feedback report. No raw job,
   provider, schema, or diagnosis-field language appears in the UI.

## Data and API design

### Lesson migration snapshot

Add a nullable JSON field to `lesson_plan`, written once immediately before a
successful in-place conversion. It contains only the prior lesson fields needed
to restore or audit the migration:

- `practiceFormat`, `paperContent`, `paperAnswers`, `paperResult`,
  `paperSubmittedAt`
- `stages`, `runtimeStatus`, `runtimeState`, elapsed and productive time
- `capturedAt` and `migrationVersion`

The snapshot is private server data: it is not returned by teaching or paper
APIs. Existing exercise attempts and evaluations are already separate records
and are never deleted.

### Replacement request

`POST /api/v1/lessons/:id/replace` will return one of these safe outcomes:

- `200` when the lesson already contains a valid current package;
- `202` with an existing or newly queued recovery request when generation is in
  progress;
- a recoverable learner-facing result when no valid historical skill can be
  determined, without deleting or changing the old lesson.

Protected job input will include the immutable lesson ID and a
`LEGACY_RECOVERY` source mode. The worker reads the legacy lesson itself under
the learner/cycle ownership boundary; the request never sends lesson content
from the browser.

### Worker behavior

Normal new-cycle generation remains unchanged. For `LEGACY_RECOVERY`:

- it may use an assessment when present;
- it otherwise uses a bounded, generic skill context;
- it does not early-return merely because the target legacy lesson exists;
- it validates the generated package before any write;
- it updates that exact lesson ID in a transaction, writes the snapshot only if
  absent, updates the current core skill when it was missing, and makes the
  cycle ready only after the write succeeds.

If generation fails, the target lesson and cycle state remain usable exactly as
they were before the request. Retrying creates no duplicate lesson, no duplicate
active request, and no data deletion.

## Learner experience

The legacy teaching and paper pages use the same calm recovery surface:

- **Primary action:** “生成新的专项教学和训练卷” / “Create updated teaching and paper”.
- **While preparing:** the learner can wait, return to the feedback report, or
  leave the page; no answer is lost.
- **If unavailable:** “你的原有训练记录已保留。新版训练暂时无法生成；你可以稍后重试，或返回批改报告。”
- **After success:** reload the same canonical lesson URL and open the new
  teaching article, then the one 60-minute complete paper.

The phrase “删除旧训练” is removed because it describes neither the safety
guarantee nor the actual behavior.

## Verification requirements

Tests must prove the exact failure mode that affected historical accounts:

1. A cycle missing the newer skill but whose lesson has a valid old core skill
   starts recovery rather than returning diagnosis-required.
2. A cycle without an assessment starts generic recovery rather than returning
   diagnosis-required.
3. Starting recovery does not delete a lesson, objective, answer, evaluation,
   or historical generation request.
4. Repeated clicks and idempotent replays return the same active request.
5. A worker failure leaves the old lesson readable and exposes retry/feedback
   navigation.
6. A successful worker run changes the same lesson ID, saves a single private
   snapshot, preserves historical answers, and produces a valid eight-question
   paper.
7. The normal current-account generation path still succeeds unchanged.
8. Browser coverage shows legacy recovery, failure fallback, retry, and return
   to feedback without technical or backend wording.

## Non-goals

- Reconstructing an assessment that was never saved.
- Claiming a general recovery package is a personal diagnostic finding.
- Removing historical records or automatically restoring a snapshot in this
  release.
- Changing the timed-paper evaluation, teaching-practice analysis, or account
  data controls.
