# Final remediation H1 — retain logical idempotency across user retries

## Scope and root cause

Baseline: `e555176` (`fix: align mock question supply target mix`).

H1 closes the fourth final broad-review Important finding and refreshes its
stale evidence totals. `HttpLearningClient.request()` already selected one key
before its six internal transport attempts, but every later public method call
selected a new key. A response could therefore commit on the server while all
six bodies disconnected, and the learner's next click could submit the same
logical mutation under a different key.

## Client logical-operation registry

The non-secret recommendation-creation and training-cycle mutations explicitly
opt into a SHA-256 fingerprint over the uppercase method, exact path, and
recursively key-sorted JSON body. The in-memory registry stores only that
64-character digest, the generated idempotency key, and its expiry. Other
auto-keyed mutations still keep one key through their six internal attempts,
but never canonicalize, digest, or retain their bodies across method calls. It
never writes request bodies, API keys, credentials, or idempotency keys to
localStorage, IndexedDB, sessionStorage, cookies, or another persistent store.

The registry:

- retains one key across all six internal attempts and later identical method
  calls while the outcome remains transport-unknown;
- clears the matching entry after successful/permitted HTTP classification or
  a definitive non-`IDEMPOTENCY_IN_PROGRESS` problem;
- retains the entry when a complete `IDEMPOTENCY_IN_PROGRESS` response is
  followed by transport exhaustion, so the next user call continues the
  server's original operation;
- gives a changed method, path, or wire-equivalent canonical body a new key;
- leaves explicit caller-supplied deterministic keys outside the registry;
- caps unresolved operations at 256 and refreshes access order for LRU
  eviction;
- expires entries after 24 hours, matching the server idempotency-record TTL;
- clears every remaining in-memory entry after confirmed learning-data
  deletion.

Concurrent identical opt-in calls first meet at a synchronous
canonical-material map before the asynchronous WebCrypto digest. They share one
digest, key, request promise, network operation, and result. The temporary map
is restricted to the two non-secret method bodies and is removed when the
shared promise settles; only digest and key can remain for later recovery.

A monotonically increasing module-local account generation contains no
identity. Each generation also owns an AbortSignal. Confirmed sign-out and
successful sign-in advance it; bootstrap advances it before and after the
account transition. Active logical operations capture the generation and
signal before canonicalization. A boundary synchronously aborts their request
controllers and clears both the unresolved registry and in-flight map. A failed
sign-out does not advance the boundary.

The registry is intentionally scoped to the live `HttpLearningClient`
instance. A page reload or browser restart creates a new registry. Persisting
it would widen the sensitive client-state surface; H1 therefore documents the
reload boundary instead of storing mutation state. Server idempotency remains
the authority for requests whose key is available.

## Fidelity acceptance

The unit transport tests use real `ReadableStream` responses whose bodies fail
after headers. For recommended STARTED, fallback ABANDONED, and initial
recommendation creation, the first logical call loses all six response bodies;
the next identical call uses the exact original key and receives the stored
cycle or recommendation identity.

The non-Demo Today Chromium fixtures model the server-side replay ledger:

- recommended READY -> STARTED commits one `cycle-committed-started`; six
  outcomes are lost; the second click replays that cycle under the same key;
- fallback READY/PREPARING -> ABANDONED commits one
  `cycle-committed-abandoned`; the second click sends the same question and
  `abandon_recommendation_id`, reuses the key, and creates no second cycle;
- initial recommendation commits one exposure and
  `recommendation-committed-initial`; after the bounded network error, the new
  `重新获取推荐题` action re-enters the identical INITIAL request and restores
  that recommendation under the same key.

Changed question, abandonment link, action body, or path receives a different
key. Definitive 400, 409, and 503 responses release the old logical key so a
later intentional call gets a new one. An LRU mutation check removed the access
refresh and made the cap test fail (259 generated keys instead of 258), then
passed again after restoring the implementation.

## Strict RED -> GREEN evidence

RED on `e555176`, Node 24.19.0:

- recommended STARTED and fallback ABANDONED user retries each called the key
  factory twice;
- initial recommendation retry called the key factory twice;
- the same canonical body with reordered properties called it twice;
- no digest-only logical-operation fingerprint API existed.

Focused GREEN:

- full `HttpLearningClient`: 1 file / 132 passed;
- focused H1 logical lifecycle: 11 passed;
- focused Today fidelity acceptance: 3 passed;
- full non-Demo Today Chromium: 20 passed / 12 Demo-only skipped;
- no unhandled page error, duplicate cycle, duplicate exposure, or 409 replay
  conflict was observed.

## Fresh final verification

All final gates used Node 24.19.0 and a newly migrated tmpfs
`postgres:17.6-bookworm` database reporting server 17.6 and `Mounts=[]`.

```text
PostgreSQL migration chain: pass
Full repository tests: 94 files / 924 passed / 0 failed / 0 skipped
Web tests: 54 files / 513 passed
format: pass
typecheck: pass
lint: pass, 0 errors / 4 existing Fast Refresh warnings
Worker production build: pass, 2 ESM entries plus source maps
Web production build: pass, 48/48 static pages
```

The current evidence range is `d6ba3b3..H1 Fix Round 2 commit`, superseding the
earlier fourth-review snapshot and its 94-file / 905-test total.

## Remaining boundary

An unresolved logical key does not survive a full page reload. Closing that
boundary would require a separate security design for session persistence,
strict account namespace and deletion, and digest-plus-key-only storage. H1
does not persist credentials or request bodies and does not claim reload-safe
recovery.

## Fix Round 1/5 — classification, coalescing, and account scope

The first H1 review found three gaps in `16f5f78`:

1. the registry cleared immediately after body read, before recognizing
   `IDEMPOTENCY_IN_PROGRESS`;
2. concurrent identical calls both calculated a digest and performed a network
   operation, while every auto-keyed body, including API-key writes, passed
   through canonicalization;
3. a soft account transition did not invalidate unresolved client keys.

Strict RED on Node 24.19.0 proved all three boundaries: IN_PROGRESS plus five
lost bodies generated a second key on the next call; a delayed digest ran twice
and issued two fetches; the Brave API-key body was hashed twice; and account B
reused account A's unresolved key after confirmed sign-out.

GREEN after the changes:

- focused Fix Round lifecycle: 4/4 passed;
- full HTTP client plus account session: 2 files / 139 passed;
- STARTED, ABANDONED, and initial recommendation Today fidelity: 3/3 passed;
- full Web on fresh PostgreSQL 17.6: 54 files / 509 passed;
- full repository on the same fresh database: 94 files / 920 passed.

## Fix Round 2/5 — monotonic generation and active cancellation

The second H1 review found that Fix Round 1 observed an account epoch only when
the next request began. An old digest or response-body read could therefore
resume after a boundary, execute with the new session, and race its finally
against the new generation's in-flight entry.

Every opt-in operation now captures the monotonically increasing account
generation and its AbortSignal before canonicalization. It rechecks after
digest, before registry insertion and POST, after fetch/body/backoff awaits,
and before registry mutation. Active request controllers and shared promises
are tracked by generation. Boundary advance aborts old controllers, clears the
old digest registry and in-flight map, and makes every old waiter reject with
the fixed client-safe `ACCOUNT_CONTEXT_CHANGED` error.

Registry clear requires fingerprint, key, and generation. In-flight cleanup
requires promise identity, generation, the client's current generation, and
the global current generation. An A finally can therefore neither delete nor
reuse a B entry. Learning-data deletion advances the same generation after its
confirmed 204 and cannot leave a stale cycle operation attached to the live
client.

Strict RED on `d6ba3b3`:

- delayed account-A digest resumed under B and returned B's result;
- an account-A stalled response body retried and returned B's cycle;
- a pre-deletion cycle resumed after confirmed learning-data deletion.

The failed-sign-out control remained green and proved that an unsuccessful
boundary must not advance or abort. GREEN after the change:

- focused generation/cancellation matrix: 5/5 passed;
- full HTTP client plus account session: 2 files / 143 passed;
- STARTED, ABANDONED, and initial recommendation Today fidelity: 3/3 passed;
- full Web on fresh PostgreSQL 17.6: 54 files / 513 passed;
- full repository on the same fresh database: 94 files / 924 passed.

Commit: the commit containing this report.
