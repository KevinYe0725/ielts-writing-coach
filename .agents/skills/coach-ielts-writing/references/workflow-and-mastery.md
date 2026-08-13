# Workflow and mastery

## Contents

1. Cycle states
2. Unique next action
3. Evidence states
4. Scheduling
5. Assistance and opportunity
6. Interruptions

## 1. Cycle states

Use only these primary cycle states:

```text
QUESTION_READY
ATTEMPT_1_ACTIVE
SUBMITTED
ANALYZING
FEEDBACK_READY
LESSON_GENERATING
LESSON_READY
LESSON_ACTIVE
LESSON_RESOLVED
REWRITE_LOCKED
REWRITE_READY
ATTEMPT_2_ACTIVE
COMPARING
CORE_CYCLE_COMPLETED
```

The deterministic state script owns transitions. Lesson, rewrite, and transfer tasks also retain their own independent status fields. Do not edit `cycle.json` manually.

Course position is stored as `active_block_id`, `active_item_id`, and `lesson_elapsed_seconds`, not as an irreversible list of teaching phases. Update it after every submitted item so `status` can resume at one unambiguous location. User-facing stages are: diagnosis, understanding, independent output, application, and closure.

## 2. Unique next action

Prioritise in this order:

1. an active writing attempt;
2. an unfinished core lesson;
3. a due rewrite;
4. a due recovery task;
5. a due transfer opportunity;
6. comparison waiting for a submitted V2;
7. a new cycle.

Do not call a rewrite “overdue” while its teaching prerequisite is incomplete. A user may skip the lesson, but mark the rewrite `SKIPPED_PREREQUISITE`; it cannot prove the lesson caused retention.

## 3. Evidence states

```text
diagnosed  -> observed in an attempt
practicing -> recognition or controlled repair
applied    -> unprompted course generation and immediate near transfer
retained   -> unprompted use at least 24 hours after teaching
transferred -> independent use on a different question/topic
```

Hard gates:

- Recognition and controlled repair cannot advance beyond `practicing`.
- A lesson cannot write `retained` or `transferred`.
- A Version 2 written with assistance cannot prove retention.
- One transfer success is evidence, not final mastery. Require two successful spaced cross-topic opportunities before describing a skill as reliably transferred.
- Preserve successful historical evidence if a later error occurs. Mark the state unstable and schedule review.

## 4. Scheduling

- Create `target_rewrite_at` when the lesson is planned; it is a suggested window, not a formal due time.
- Set formal rewrite `due_at` only after the last relevant teaching exposure; use at least 24 hours and normally D1–D2.
- Schedule near-topic transfer for D5–D7.
- Schedule a mixed, low-cue check around D14.
- If a recovery task supplies another explanation or example, recalculate rewrite timing from that later exposure.

Store all timestamps as timezone-aware ISO 8601 values.

## 5. Assistance and opportunity

Use assistance labels:

- `independent`: no target cue, answer, correction, or relevant reference viewed;
- `abstract_target_seen`: an abstract check item was shown before writing;
- `hinted`: conceptual or structural hint used;
- `answer_seen`: full example or correction viewed;
- `external_assistance`: dictionary, grammar checker, person, or other AI used;
- `interrupted`: timing conditions were materially changed.

A target can be evaluated only when the task creates a natural opportunity to use it. Record `no_opportunity` when omission is legitimate. Do not require a memorised phrase if another natural construction serves the same purpose.

## 6. Interruptions

- Every submitted item is a safe pause point.
- Within 30 minutes, resume directly.
- After 30 minutes and before 24 hours, use one 30-second reactivation item.
- After 24 hours, begin with a two-minute unprompted retrieval baseline; do not combine yesterday's prompted result with today's independent result as one passing event.
- After seven days, compress stale remaining work into a short review rather than forcing the original long lesson.
- After two abnormal interruptions in one lesson, split only the remaining core work into 20–25 minute modules.
