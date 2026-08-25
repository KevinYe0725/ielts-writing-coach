# Final remediation F2 — global refill-admission lock order

## Finding disposition

Completed. Refill admission now has one exported transaction-scoped authority,
`lockQuestionBankRefillAdmission`. It owns the exact
`question-bank-refill` PostgreSQL advisory key. Automatic enqueue and protected
privileged retry both call the same helper.

Every `createQuestionRecommendation` transaction acquires this instance-wide
admission lock before the learner `FOR UPDATE` lock, selection, recommendation
insert, refill batch insert, or refill job insert. This is intentional even for
a request that ultimately returns READY without refilling, reaches the active
cycle limit, or finds that another active batch already exists. PostgreSQL
transaction advisory locks are reentrant, so the later nested savepoint and
enqueue acquisition is safe.

The deliberate tradeoff is instance-wide recommendation admission
serialization. It removes the global-to-user/user-to-global cycle at the cost
of reduced recommendation admission concurrency across unrelated learners.
Selection, persistence, and provider work remain outside this protocol except
where they already occur inside the recommendation transaction.

## Lock protocol and caller audit

The only production holder of the exact advisory-key literal is the exported
helper in `jobs.ts`.

| Path | Order |
| --- | --- |
| Recommendation | global refill admission -> learner row -> selection/READY or PENDING insert -> reentrant enqueue |
| Privileged retry | global refill admission -> active/latest batch rows -> retry batch insert -> reentrant enqueue |
| Direct enqueue | global refill admission -> reserved batch row -> route/owner resolution -> AI job insert |

Production `enqueueQuestionBankRefill` has only the recommendation reservation
caller after the early acquisition. Retry also enters through the helper before
any user-referencing insert. Test-only direct enqueue callers begin from a
pre-existing reservation and acquire the helper before locking it. The setup,
backup, migration, and search-connection advisory protocols use different keys
and were not changed.

## Strict RED -> GREEN and mutation evidence

Three real-PostgreSQL barriers acquire refill admission in one transaction,
observe the competing advisory waiter through `pg_locks`, and probe that the
relevant user rows remain independently lockable before releasing the first
transaction:

- same user and canonical route owner: privileged retry finishes STARTED and
  the competing recommendation commits READY;
- learner plus simultaneously retrying canonical privileged route owner: retry
  finishes STARTED and the learner recommendation commits PENDING, attached to
  that one active batch;
- two privileged recommenders: both commit PENDING against one active batch and
  one canonically owned refill job.

Each case has a bounded completion timeout and independently checks one active
batch, a bidirectionally linked batch/job reference, and no orphan refill AI
job. The first RED run against the inverse order failed exactly these 3 cases;
the other 41 service cases passed. Each failure was the intended one-second
user-row probe timeout while the recommendation transaction waited for the
advisory lock.

After GREEN, temporarily deleting only the early recommendation helper call
made the same focused 3/3 cases fail again with the same deterministic row-lock
timeouts. Restoring the call returned the service suite to 44/44.

## Preserved behavior

- Learner-row locking still serializes concurrent exposure selection after
  global admission; concurrent recommendation and idempotent replay tests pass.
- READY recommendations survive active/cooldown refill contention; zero-pool
  recommendations remain linked PENDING or become cooldown UNAVAILABLE exactly
  as before.
- The active-cycle capacity check still runs before selection or any
  recommendation/supply insert. A failure rolls back the transaction-scoped
  advisory lock with no durable side effect.
- Privileged retry still bypasses only the failed-batch cooldown. It attaches
  to an active batch and still refuses retry when the latest terminal batch did
  not fail.
- Reentrant enqueue preserves one active-batch and one-job idempotency.

## Fresh verification

The final run used Node 24.19.0 and a newly migrated tmpfs
`postgres:17.6-bookworm` database at `127.0.0.1:55442` with test-only
credentials.

```text
PostgreSQL migration chain: pass
Focused recommendation/jobs/learning-record: 3 files / 65 passed
Full repository tests: 92 files / 876 passed / 0 failed
format: pass
lint: pass, 0 errors / 4 existing Fast Refresh warnings
typecheck: pass
Web build: pass, 48/48 static pages
Worker build: pass, 2 ESM entries plus source maps
git diff --check: pass
```

The first full test attempt used an incorrectly narrowed PATH and omitted
Homebrew `pg_dump`; two backup tests therefore failed with
`spawn pg_dump ENOENT` while 475 Web tests passed. No source change was made.
Prepending Node 24 to the normal PATH restored `pg_dump`, and the complete
fresh rerun passed as recorded above.

## Remaining boundary

No throughput benchmark was added for the intentional instance-wide admission
serialization. Real Brave/provider acceptance and real-account/manual zoom
checks remain the established external-pending boundaries. No credential was
requested, read, or stored. The task-owned PostgreSQL container is removed
after verification.

Commit: the commit containing this report.
