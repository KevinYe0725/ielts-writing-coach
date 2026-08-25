# Final remediation B — shared refill lifecycle and privileged early retry

## Finding disposition

Completed. New shared-mode `question_bank_refill` AI jobs are owned by the
canonical privileged route owner, not the learner who exhausted supply. The
batch retains `triggered_by_user_id` only for waiter and audit context. Personal
mode remains actor-owned.

Learner-data deletion now excludes every `question_bank_refill` AI job from
both Graphile removal and AI-job deletion, including legacy learner-owned rows.
Owner and Admin users can explicitly retry a failed refill through a protected,
aggregate-only action without waiting for the automatic six-hour cooldown.

## Strict RED → GREEN evidence

The first PostgreSQL RED on the pre-fix implementation produced three intended
failures and fourteen passes:

- the shared refill AI job had the learner owner instead of the canonical
  privileged route owner;
- deleting learning data counted and removed a QUEUED legacy refill job;
- deleting learning data counted and removed a RUNNING legacy refill job.

The early-retry RED then failed the cooldown-bypass decision and the missing
service contract. Independent route, client, and browser RED runs failed on the
missing route, missing strict client method, and missing Admin action.

After Fix Round 1, the fresh PostgreSQL 17.6 focused suite passed 9 files /
184 tests. The full relevant suites passed:

```text
@iwc/db: 2 files / 11 tests
@iwc/worker: 14 files / 191 tests
@iwc/web: 54 files / 444 tests
Admin E2E across Chromium, Firefox, WebKit, and mobile: 56 tests
```

## Implementation

- Reused one transaction-resolved privileged route for shared refill job
  configuration and ownership. With no configured route, privileged users are
  selected deterministically by Owner-before-Admin and stable user ID.
- Kept the generation batch trigger unchanged, so pending-recommendation
  waiters and audit context still point to the initiating learner without
  turning generated instance assets into learner-owned output.
- Excluded `question_bank_refill` from both learning-deletion Graphile removal
  and AI-job deletion. Real PostgreSQL QUEUED/RUNNING tests inspect
  `graphile_worker._private_jobs`, preserve the batch/job relationship, and
  prove a later refill can enter after the preserved attempt terminates.
- Added one shared balanced target-mix builder used by automatic Task 7 refill
  and privileged retry. This remediation does not enforce provider output mix;
  that remains Final Remediation D.
- Added `POST /api/v1/admin/question-supply/retry` with trusted Origin,
  Owner/Admin RBAC, bounded empty JSON, per-actor rate limiting, and durable
  idempotency. A PostgreSQL advisory lock makes STARTED versus ATTACHED
  deterministic across concurrent callers.
- Persisted a fresh immutable batch and audit event only when the latest batch
  is FAILED. The action bypasses only the six-hour cooldown, refuses a later
  non-failed terminal state, and attaches to any non-terminal batch.
- Added an exact two-field client DTO (`state`, `batch_status`) and a compact
  Admin action with loading, started, attached, and error states. Tests reject
  any extra operational identifier and prove learner access receives 403.

## Verification gates

```text
PostgreSQL: fresh postgres:17.6-bookworm at 127.0.0.1:55438, migrations passed
Focused modified PG/client/security suite: 9 files / 184 tests passed
Full DB package: 11/11 passed
Full Worker package: 191/191 passed
Full Web package: 444/444 passed
Four-project Admin E2E: 56/56 passed
DB, Worker, Web typecheck: passed
DB and Worker lint: passed
Web lint: 0 errors / 4 pre-existing Fast Refresh warnings
Worker build: passed
Web production build: passed, 48/48 static pages and the new dynamic route
```

## Residual boundaries

- A real user-entered Brave/provider refill remains EXTERNAL_PENDING; no
  credential was requested, read, stored in fixtures, or transmitted.
- Final Remediation D still owns validation that provider output follows the
  requested target mix. This change deliberately shares the request builder
  without adding that enforcement early.
- Mind MCP was not exposed in this task, so this report and the repository SDD
  ledger are the durable handoff.

Commit: the commit containing this report.

## Fix Round 1/5 — atomic deletion, marginal balance, and locale ownership

### RED evidence

- A real PostgreSQL notification-row barrier paused learning deletion after its
  old pre-transaction job-key read. A concurrent ordinary AI/Graphile job then
  committed before deletion resumed: the AI row was deleted while the Graphile
  row survived. The regression failed on the missing AI row.
- The fully tied 5×8 bank selected type counts `0/7/8/0/0`. Type-heavy and
  topic-heavy dynamic-bank fixtures also concentrated targets in the first
  lexicographic types instead of balancing the underrepresented marginals.
- Chromium received a 409 whose English detail contained
  `backend-only-sentinel`; the Chinese Admin UI rendered that server text and
  could not find the required locale-owned Chinese error.

### Fix

- Learning deletion now locks the owner row, deletes only owner-scoped
  non-`question_bank_refill` AI rows with `RETURNING graphile_job_key`, and
  removes exactly those returned Graphile keys inside the same transaction.
  The owner lock serializes concurrent FK-backed job inserts. An injected
  Graphile DELETE/UPDATE trigger proves a removal failure rolls the AI deletion
  back.
- The one shared target builder now greedily chooses the lowest existing pair
  count, then the lowest live type marginal, then the lowest live topic
  marginal, with taxonomy order as the deterministic final tie-break. A tied
  fifteen-target request yields exactly three targets per type and topic counts
  differing by at most one. Uneven fixtures preserve lower-pair priority while
  balancing the remaining type/topic deficits.
- The Admin action maps `QUESTION_BANK_REFILL_RETRY_NOT_AVAILABLE` to
  locale-owned Chinese/English copy and uses locale-owned generic copy for all
  other failures. Backend detail is never rendered directly by this action.

### Focused GREEN

```text
Learning deletion PostgreSQL: 5/5 passed
Target-mix PostgreSQL: 3/3 passed
Admin retry Chromium: 1/1 passed
```
