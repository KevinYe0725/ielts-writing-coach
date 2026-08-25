# Final remediation F1 — durable recommendation abandonment

## Finding disposition

Completed. Manual-bank and private-question fallbacks now close the current
recommendation durably before creating a question or cycle. `ABANDONED` is an
internal terminal status: it has no learner-visible supply internals, never
counts as an exposure or SWAP cooldown, cannot be finalized by a refill batch,
and is omitted from Admin's READY / PENDING / UNAVAILABLE aggregate.

The owner-only mutation is `DELETE
/api/v1/question-recommendations/{id}`. It requires the common Origin boundary,
authenticated-actor rate limit, UUID path, a strict empty body of at most 1 KiB,
and an Idempotency-Key. The learner row and owned recommendation row are locked
before PENDING, READY, or UNAVAILABLE becomes ABANDONED; replaying an already
ABANDONED row is safe. The state change and 204 idempotency completion commit in
one transaction. Responses contain neither batch nor job identity.

## Linearizable fallback flow

- GET polling and DELETE abandonment acquire the same learner lock before the
  recommendation row lock. Real PostgreSQL barriers cover both orderings.
- If polling finalizes first, DELETE clears `question_external_id` and
  `shown_at` before commit, removing the READY exposure.
- If DELETE commits first, GET projects a generic unavailable result and never
  finalizes the batch-linked row.
- Today retains the unresolved recommendation POST promise. A manual/private
  fallback cancels UI polling, awaits an in-flight POST when no ID is known,
  abandons the returned ID, and only then proceeds without `recommendation_id`.
- A failed DELETE renders locale-owned actionable copy and creates neither a
  custom question nor a training cycle.
- Demo mode persists `{ status: "ABANDONED" }`, removes the READY exposure, and
  allows the abandoned question to be selected again.

## Strict RED → GREEN evidence

- Schema RED: fresh PostgreSQL returned only PENDING / READY / UNAVAILABLE; the
  enum assertion failed until unreleased migration 0013 was regenerated.
- Service/route RED: 7 intended failures for the absent abandon service and
  DELETE route.
- Client/Demo RED: 3 intended failures for the absent strict client mutation
  and durable Demo transition.
- Browser RED: 6/6 focused non-Demo cases failed because fallback created a
  cycle before abandonment or never showed the local abandonment error.
- GREEN PostgreSQL/backend matrix: 84/84; focused client/Demo: 117/117.
- GREEN non-Demo Chromium: 6/6. Chromium, Firefox, WebKit, and iPhone 14
  emulation: 24/24.

## Migration identity and verification

Migration `0013_adaptive_question_supply` remains unreleased and was regenerated
from the 0012 snapshot. Its journal timestamp is `1787651956397`; SHA-256 is
`8e8caf64e59c8392e1cbdd76ef5f0cf3c85ea4dfca2393ada08902802266857e`.
A newly created tmpfs `postgres:17.6-bookworm` database accepted the complete
migration chain.

Fresh package gates:

```text
@iwc/db: 2 files / 12 passed
@iwc/worker: 14 files / 212 passed
@iwc/web: 54 files / 462 passed
format: pass
lint: pass, 0 errors / 4 existing Fast Refresh warnings
typecheck: pass
Web build: pass, 48/48 static pages
Worker build: pass, 2 ESM entries plus source maps
git diff --check: pass
```

## Boundaries and remaining work

- The current training-cycle schema does not persist `recommendation_id`; it is
  validated at cycle creation but provides no later durable audit link from a
  cycle back to a recommendation. F1 therefore cannot infer that an arbitrary
  READY row was already used after the fact. The fallback path never supplies
  `recommendation_id`, and its cycle cannot create that ambiguity.
- Final remediation F2 (global refill-admission lock ordering) is separate and
  remains pending.
- Real Brave/provider acceptance and real-account/manual zoom checks remain the
  existing external-pending boundaries; no credential was requested or used.
