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

Auto-keyed JSON mutations now compute a SHA-256 fingerprint over the uppercase
method, exact path, and recursively key-sorted JSON body. The in-memory registry
stores only that 64-character digest, the generated idempotency key, and its
expiry. It never writes request bodies, API keys, credentials, or idempotency
keys to localStorage, IndexedDB, sessionStorage, cookies, or another persistent
store.

The registry:

- retains one key across all six internal attempts and later identical method
  calls while the outcome remains transport-unknown;
- clears the matching entry after the complete HTTP response body arrives,
  whether the result is success, a permitted status, or a parsed 400, 409, or
  503 problem;
- gives a changed method, path, or wire-equivalent canonical body a new key;
- leaves explicit caller-supplied deterministic keys outside the registry;
- caps unresolved operations at 256 and refreshes access order for LRU
  eviction;
- expires entries after 24 hours, matching the server idempotency-record TTL;
- clears every remaining in-memory entry after confirmed learning-data
  deletion.

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
Full repository tests: 94 files / 916 passed / 0 failed / 0 skipped
Web tests: 54 files / 505 passed
format: pass
typecheck: pass
lint: pass, 0 errors / 4 existing Fast Refresh warnings
Worker production build: pass, 2 ESM entries plus source maps
Web production build: pass, 48/48 static pages
```

The current evidence range is `e555176..H1 commit`, superseding the earlier
fourth-review snapshot and its 94-file / 905-test total.

## Remaining boundary

An unresolved logical key does not survive a full page reload. Closing that
boundary would require a separate security design for session persistence,
strict account namespace and deletion, and digest-plus-key-only storage. H1
does not persist credentials or request bodies and does not claim reload-safe
recovery.

Commit: the commit containing this report.
