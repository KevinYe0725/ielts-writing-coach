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
raises on the 201 UPDATE. Both recommended STARTED and fallback ABANDONED cases
return 500 while the trigger is active and prove:

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
- full `HttpLearningClient`: 1 file, 119 tests passed;
- focused abort/stall/safety transport matrix: 5 passed;
- full Web on fresh PG17: 54 files, 487 tests passed;
- full workspace test on fresh PG17: 92 files, 886 tests passed;
- focused Today Chromium: 1 passed;
- full non-Demo Today Chromium: 18 passed, 12 Demo-only skipped;
- repository format and typecheck: passed;
- repository lint: 0 errors, 4 pre-existing Fast Refresh warnings;
- repository production build: passed.

Database evidence: `postgres:17.6-bookworm`, server `17.6`, tmpfs data
directory, `Mounts=[]`.

## Boundaries and residual risk

- The configured Node engine is `>=24.14.0`; this environment used Node
  `22.23.2`, so pnpm emitted the existing engine warning even though all gates
  above passed.
- The 10-second bound applies per attempt, with six attempts plus bounded
  exponential backoff; a fully unavailable keyed operation can therefore take
  roughly one minute before the final safe error.
- No API shape, recommendation state rule, retry count, Today operation mutex,
  or non-G1 feature was changed.
