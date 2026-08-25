# Final remediation F1 — cycle-coupled recommendation disposition

## Fix Round 1 disposition

Completed. The initial standalone recommendation DELETE was removed after
review because it let a learner erase a READY exposure without starting a
cycle. There is no learner-facing recommendation reset endpoint or client
method now.

Cycle creation is the sole disposition authority. `POST
/api/v1/training-cycles` accepts at most one of:

- `recommendation_id` for a recommended start;
- `abandon_recommendation_id` for a manual-bank or private-question fallback.

After resolving the canonical question, the route opens its existing
learner-locked cycle transaction. Inside that transaction it locks the owned
recommendation row `FOR UPDATE`, validates and transitions the recommendation,
then inserts the cycle. Any later mixed-review or cycle insertion failure rolls
back both mutations.

## State and exposure semantics

- Recommended start requires owned READY with the exact external question ID
  and transitions it to terminal STARTED.
- Fallback requires owned PENDING or READY. PENDING becomes ABANDONED. READY
  becomes STARTED when its question is the cycle question; only a genuinely
  different cycle question makes READY become ABANDONED.
- STARTED and ABANDONED cannot be transitioned or finalized again. Owner GET
  projects either as the existing generic unavailable state.
- A READY row that becomes STARTED or ABANDONED retains its
  `question_external_id` and `shown_at`. STARTED/ABANDONED shown rows remain in
  the open 72-hour exclusion window.
- A PENDING row that becomes ABANDONED has no question or `shown_at`, therefore
  creates no exposure.
- Refill workers still update only PENDING rows, so neither terminal status can
  be finalized by a later batch.

This is the explicit resolution of “no invisible READY”: a different-question
fallback makes the row terminal ABANDONED, so it cannot appear as usable READY
or finalize later, but its already-incurred shown exposure is conservatively
retained. Exact-question use becomes STARTED even if a client labels the field
as abandonment. Manual fallback cannot be used to reset the three-day cooldown.

## Today and Demo flow

Today retains the unresolved recommendation POST promise. A fallback cancels
obsolete UI polling, awaits the POST when necessary, retains the resulting ID,
and passes it as `abandon_recommendation_id` on the one cycle request. During an
active poll it passes the known ID. Custom flow saves the private question,
then creates its cycle with the same abandonment ID. It never sends
`recommendation_id` for a fallback and never issues DELETE.

If the coupled cycle request fails, the database transaction leaves the
recommendation unchanged. Today renders locale-owned actionable copy; a saved
private question remains available in the bank for retry. Demo mode mirrors
PENDING → ABANDONED and question-aware READY → STARTED/ABANDONED only inside
cycle creation while preserving READY exposure.

## Strict RED → GREEN evidence

- PostgreSQL RED: enum lacked STARTED; STARTED admin/privacy/worker fixtures
  failed.
- Service/route RED: the transaction abandon helper was absent, recommended
  assertion left READY, fallback payloads returned 422, and concurrent
  disposition tests could not produce the required 201/409 pair.
- Surface/client RED: recommendation DELETE and the client reset method still
  existed; fallback cycle requests omitted `abandon_recommendation_id`.
- Demo RED: coupled start left the durable state READY.
- Browser RED: all 6 initial focused Chromium cases failed before a valid
  coupled cycle request was observed.
- GREEN focused PostgreSQL/client/admin/privacy/worker matrix: 214/214.
- GREEN full non-Demo Chromium Today file: 16 passed / 12 Demo-only skips.
- GREEN four-project fallback matrix: 28/28 across Chromium, Firefox, WebKit,
  and iPhone 14 emulation.
- GREEN Demo recommended-start check: 1/1 with durable STARTED.

Real PostgreSQL barriers cover poll-finalize first and fallback first.
Recommended-start versus fallback contention returns one 201 and one 409 with
exactly one cycle. Tests also cover transaction rollback, other-user 404,
mutually exclusive IDs, READY cooldown, PENDING without exposure, terminal
replay rejection, and idempotent recommended/fallback HTTP replay.

## Fix Round 2 — question-aware fallback and deterministic races

The fallback transition now receives the resolved cycle question external ID.
A natural bank selection of the same READY question—and a malicious payload
trying to mark that exact use abandoned—both commit STARTED. A different
question still commits ABANDONED; PENDING remains ABANDONED.

SWAP cooldown is independent of recommendation status. Every recent SWAP row
uses its immutable `created_at` with the strict open `> 72h cutoff` predicate
to exclude `excluded_external_id`. Thus a PENDING SWAP that becomes ABANDONED
has no exposure to an unshown recommendation, while the question the learner
swapped away remains cooled. The exact 72-hour boundary is eligible.

The previous nondeterministic `Promise.all` contention check was replaced by
two real-PostgreSQL commit barriers:

- STARTED commits first; fallback receives terminal 409 and no second cycle.
- Different-question ABANDONED commits first; recommended start receives
  terminal 409 and no second cycle.

Fix Round 2 strict RED produced seven intended failures: same-question server,
route, and Demo state were ABANDONED; READY/ABANDONED/STARTED SWAP rows did not
all preserve excluded-question cooldown; and PENDING SWAP → ABANDONED released
the swapped-away question. Focused GREEN is 55/55.

## Migration identity and full gates

Unreleased migration `0013_adaptive_question_supply` was regenerated from the
0012 snapshot. Journal timestamp: `1787653611445`. SHA-256:
`b04e6006eb1bf21b6bbbfe8b49f4096ee02c37cae1cc093e344bb337c327f333`.
A fresh tmpfs `postgres:17.6-bookworm` database accepted the complete migration
chain under Node 24.19.0.

```text
@iwc/db: 2 files / 12 passed
@iwc/worker: 14 files / 212 passed
@iwc/web: 54 files / 474 passed
format: pass
lint: pass, 0 errors / 4 existing Fast Refresh warnings
typecheck: pass
Web build: pass, 48/48 static pages
Worker build: pass, 2 ESM entries plus source maps
git diff --check: pass
```

## Remaining boundary

Final remediation F2 (global refill-admission lock ordering) remains separate
and pending. Real Brave/provider acceptance and real-account/manual zoom checks
remain the established external-pending boundaries; no credential was
requested or used.
