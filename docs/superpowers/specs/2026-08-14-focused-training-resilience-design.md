# Focused training resilience — design specification

**Goal:** Make focused teaching and its timed paper self-recovering for every learner, especially when a record was created by an earlier product version or an AI generation attempt is interrupted.

## Learner promise

Opening **Focused improvement** never leaves a learner at an internal error, a dead end, or a button they must understand in order to repair their own learning record. The learner either sees their teaching and paper, sees a clear preparation state that continues automatically, or can continue with another useful learning step while preparation finishes.

Earlier essays, feedback, saved paper answers, and completed evaluations are immutable throughout recovery.

## Recovery state model

The product uses three learner-facing states only:

1. **Ready** — a valid adaptive teaching article and a valid 60-minute paper are available.
2. **Preparing** — a recovery job is already active or has just been started. The page checks progress automatically after refreshes and route changes.
3. **Continuing safely** — the page cannot create a new package immediately, but preserves the earlier work, continues retrying when it is safe, and offers an understandable route back to the detailed feedback or writing flow. It never asks the learner to decipher a technical failure.

The API may retain richer job states internally, but the client must not display job IDs, provider names, schema terms, worker statuses, or retry counters.

## Automatic recovery

When the teaching loader identifies a legacy or incomplete package, the client automatically calls the existing recovery endpoint once for that lesson. It does not render a manual “generate” or “check” control first.

The server guarantees one active recovery per lesson. Concurrent tabs, reloads, and repeated automatic calls reuse the same recovery rather than enqueueing duplicate work. A complete valid package is returned unchanged. A terminal infrastructure failure can start at most one new automatic recovery for the same lesson every 15 minutes; it never deletes the earlier lesson or its paper responses.

The paper route uses the same recovery path, so entering through either teaching or paper has identical safe behavior.

## Generation and content fallbacks

Generation remains strict: only a fully validated adaptive article plus matching timed paper can become ready. No partially generated or malformed content reaches the learner.

For every skill in `SKILL_IDS`, the worker must have a validated source-owned recovery package. It is selected from the learner’s confirmed core skill. When a model request fails, times out, or produces invalid content, the worker uses that package instead of permanently failing the recovery. The package is clearly teaching material, does not pretend to be a personal language assessment, and keeps tutorial examples separate from paper answers.

If an old record has no recoverable core skill, the server derives one from the preserved assessment. If that is unavailable, it chooses the conservative general writing-foundation package. This is a continuity fallback, not a claim about the learner’s diagnosis.

## Refresh, network, and navigation behavior

- The automatic request is idempotent and safe to repeat after a refresh.
- A page that loses its network connection keeps the learner’s location and automatically checks again when the request path is available; it does not discard existing inputs.
- The page waits for 20 seconds of automatic preparation, then changes to **Continuing safely** with feedback and writing links. A later visit automatically checks recovery again.
- Route identity errors route back to Today instead of leaving a blank screen.
- Existing ready packages and all completed paper responses are never regenerated or overwritten by automatic recovery.

## Learner copy

The page uses plain, calm language such as “正在为你准备专项教学” and “原有学习记录已保留，你可以先查看批改报告”. It never says “legacy”, “AI job”, “provider”, “schema”, “retry”, “unavailable”, or exposes an internal error code.

## Verification requirements

Tests must prove:

- opening a legacy lesson automatically starts recovery and becomes ready without clicking a recovery control;
- opening the legacy paper has the same behavior;
- two tabs only create one recovery;
- reload while preparing preserves the same recovery and later becomes ready;
- failed provider output produces the matching validated source-owned package for every skill in `SKILL_IDS`;
- missing diagnosis selects the conservative continuity package;
- malformed output never becomes ready;
- existing adaptive lessons and saved paper answers are not overwritten;
- a bounded network or generation wait leads to a safe next step rather than a dead end;
- the visible UI contains no internal terminology;
- the deployed Railway account is tested through feedback → focused teaching → paper after every release that touches this flow.
