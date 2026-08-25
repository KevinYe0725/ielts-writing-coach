# Final remediation G1 — atomic cycle replay and bounded response transport

## Scope and outcome

Baseline: `82d7767` (`fix: lock refill admission before recommendation polls`).

G1 closes third final broad-review findings 1 and 2 only:

1. cycle creation, recommendation disposition, D14 attachment, and the stored
   201 replay response now commit or roll back together;
2. every `HttpLearningClient` JSON attempt has one bounded deadline covering
   fetch, response-body read, parse, and status handling.

The separate Mock target-mix finding remains G2 scope.

## Server atomicity

`POST /api/v1/training-cycles` still reserves the generic key before entering
the learner-locked transaction. Inside that transaction it now:

- applies READY → STARTED or PENDING/READY → ABANDONED;
- attaches one due D14 mixed-review task when applicable;
- inserts the cycle;
- constructs the exact 201 body and Location;
- calls `completeIdempotentResponse(transaction, actor.id, key, 201, body)`;
- constructs the response before commit.

An idempotency-response UPDATE failure therefore rolls back every coupled row.
Unexpected error settlement releases only an incomplete record
(`response_status IS NULL`), so a response that has already completed cannot
be erased by a later response-layer fault.

The PostgreSQL regression installs a real trigger on `idempotency_record` that
suppresses the 201 UPDATE with `RETURN NULL`, producing a real zero-row
completion. Both recommended STARTED and fallback ABANDONED cases return 500
while the trigger is active and prove:

- zero new cycles;
- unchanged recommendation status;
- unchanged D14 target/status.

After the trigger is removed, retrying the same key creates one cycle and one
terminal disposition; the next same-key call replays the identical cycle ID.

## Client transport boundary

Each request attempt creates its own `AbortController` and 10-second default
deadline. The deadline remains armed through `fetch`, `response.text()`, JSON
parse, and HTTP status classification. A body abort, rejection, or stall is
normalized to retryable `LearningClientError` transport failure rather than
leaking `AbortError`.

Transport retries remain bounded at six attempts and are allowed only for:

- safe GET requests; or
- mutations that already carry an `Idempotency-Key`.

The mutation key is selected once before the attempt loop and reused unchanged.
An unkeyed POST is never transport-retried. An exhausted request returns the
safe bounded network error. The Today acceptance check proves its cycle button
leaves busy state, renders an actionable error, preserves one key across all
six internal attempts, and emits no unhandled page error.

## Strict RED → GREEN evidence

RED on the unmodified implementation:

- real PG trigger: both STARTED and ABANDONED cases retained two cycles
  (source + incorrectly committed target) after the replay UPDATE failed;
- completed-response settlement test lost the 201 replay record;
- recommendation and coupled-cycle post-header AbortError tests leaked the raw
  DOMException without a second attempt;
- stalled-body tests hit their watchdog instead of resolving/rejecting;
- GET body disconnect did not retry.

GREEN after the minimal fixes:

- focused PG route/security: 2 files, 21 tests passed;
- full `HttpLearningClient`: 1 file, 121 tests passed;
- focused abort/stall/safety transport matrix: 7 passed;
- full Web on fresh PG17: 54 files, 493 tests passed;
- full workspace test on fresh PG17: 92 files, 892 tests passed;
- focused Today Chromium: 1 passed;
- full non-Demo Today Chromium: 18 passed, 12 Demo-only skipped;
- repository format and typecheck: passed;
- repository lint: 0 errors, 4 pre-existing Fast Refresh warnings;
- repository production build: passed.

Database evidence: `postgres:17.6-bookworm`, server `17.6`, tmpfs data
directory, `Mounts=[]`.

## Fix Round 1 — exact completion, deletion race, and replay fidelity

`completeIdempotentResponse` now ends its UPDATE with `RETURNING key` and
requires exactly one returned row. Zero-row completion throws. This is the
rollback signal required by callers that pass their domain transaction; it
also makes non-transactional callers fail closed instead of reporting an
unreplayable success.

Caller audit: 35 production route files contain 40 completion calls. Every
route file also reserves through `reserveIdempotencyKey`; no completion-only
production route exists. Existing mocked route tests replace the security
module as a boundary, while direct helper and integration tests use the real
PostgreSQL UPDATE/RETURNING behavior.

Two PostgreSQL zero-row paths are covered:

- a `BEFORE UPDATE ... RETURN NULL` trigger proves STARTED, ABANDONED, cycle,
  and D14 attachment all roll back when the reservation cannot be completed;
- a deterministic concurrent barrier pauses the cycle after its real key has
  committed but before its learner transaction starts. Real
  `deleteLearningRecord` deletes that key, then the released cycle reaches a
  zero-row completion and rolls back. A same-key retry creates one cycle; the
  next call replays it without duplication.

201 cycle replay now reconstructs Location only from the exact safe outer
shape `{ cycle, next_action: "start_version_1" }` with a complete public
question projection and bounded cycle ID. Date fields are persisted as their
JSON ISO wire values instead of empty objects. The route test compares original
and replay status, whole body, and Location for equality; a non-cycle 201 shape
does not receive an inferred Location.

Transport evidence now uses real `ReadableStream` responses. Disconnect tests
enqueue a partial body and error the stream after headers; stalled streams wait
for the request attempt's AbortSignal before erroring. Keyed ordinary 400 and
503 responses each perform exactly one fetch. After Today exhausts one logical
cycle operation, a second click produces a different key while all six
internal attempts in each operation retain their own one key.

Fix Round 1 RED on `c531b5c`:

- missing reservation completion resolved instead of throwing;
- real zero-row trigger returned 201 and committed both terminal dispositions;
- deletion removed the cycle key but the later cycle could still report
  success;
- replay omitted Location and changed Date fields from ISO strings to `{}`.

Fix Round 1 GREEN on Node `24.19.0` and a second fresh PostgreSQL 17.6 tmpfs
database:

- focused security/route/transport: 3 files, 146 tests passed;
- full Web: 54 files, 493 tests passed;
- full workspace: 92 files, 892 tests passed;
- focused Today logical-retry acceptance: 1 passed;
- full non-Demo Today Chromium: 18 passed, 12 Demo-only skipped;
- repository format, typecheck, lint, and production build passed; lint retained
  four pre-existing Fast Refresh warnings and zero errors.

## Boundaries and residual risk

- Initial G1 evidence used Node 22.23.2; every Fix Round 1 final gate above was
  rerun with explicit PATH selecting Node 24.19.0, satisfying the declared
  `>=24.14.0` engine.
- The 10-second bound applies per attempt, with six attempts plus bounded
  exponential backoff; a fully unavailable keyed operation can therefore take
  roughly one minute before the final safe error.
- No API shape, recommendation state rule, retry count, Today operation mutex,
  or non-G1 feature was changed.
