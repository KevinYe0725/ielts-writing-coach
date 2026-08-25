# SDD ledger — plan: docs/superpowers/plans/2026-08-25-adaptive-question-recommendation-and-supply.md

Spec: docs/superpowers/specs/2026-08-24-adaptive-question-recommendation-and-supply-design.md
Plan base: ef38f24aa15af8929fa39c8c34cfe575a83337ca
Merge base: e13e97fee3006f9bd080b060350ba811556c187d
Worktree: /Users/kevinye/.codex/worktrees/ab68/IELST Writing
Branch: codex/frontend-redesign

## Pre-existing working-tree changes

- apps/web/src/app/entry.module.css
- apps/web/src/app/signin/page.tsx
- apps/web/src/components/app-shell.module.css
- apps/web/src/components/app-shell.tsx
- tests/e2e/account.spec.ts
- tests/e2e/app-shell.spec.ts
- tests/e2e/redesign-contracts.spec.ts

These belong to the previously approved frontend fixes. Every task implementer
must preserve them and stage only files listed in that task brief. Tasks 8–10
that later touch overlapping tests or UI files must edit incrementally.

## Preflight rulings

- Ruling: implementation agents run sequentially, with fresh reviewer agents
  after each task — the shared Codex worktree makes parallel implementer writes
  unsafe — cost if wrong: less wall-clock parallelism, but no cross-task commit
  corruption.
- Ruling: the real Brave-key acceptance step remains EXTERNAL_PENDING until the
  user enters a key in Settings — the product fallback is independently tested
  and implementation continues — cost if wrong: provider-specific integration
  defects could remain until final manual acceptance.
- Ruling: tasks must not stage or commit the seven pre-existing dirty frontend
  files unless their own brief explicitly names one — cost if wrong: a task may
  need a narrower commit and later integration work, but user-owned changes are
  never silently absorbed.
- Ruling: for Drizzle named generation in this repository, use
  pnpm --filter @iwc/db exec drizzle-kit generate --name NAME because the
  package-script wrapper forwards an extra separator that Drizzle rejects —
  cost if wrong: future migrations may need command adjustment, but generated
  SQL/snapshot/journal identity remains the review authority.
- Ruling: migration 0013 is unreleased and no known environment has applied
  the ecf6e02 bytes, so Fix Round 1 may regenerate 0013 rather than add 0014 —
  cost if wrong: an undisclosed database that applied the earlier 0013 would
  need a forward migration before it has the nonce and safety constraints.
- Ruling: Task 7 owns ordering and limiting the actual recent cycle query to
  three rows; Task 2 scores every recentCycles value supplied and must not
  silently slice by array position — cost if wrong: a future caller that passes
  more than three rows broadens the diversity window until its query is fixed.
- Ruling: Task 7 creates a generation batch in its recommendation transaction;
  Task 6 enqueue acquires a global PostgreSQL advisory lock, refuses another
  active batch or a failed batch newer than six hours, allows the exact six-hour
  boundary, creates an IDs-only AI job, and links it — cost if wrong: a future
  enqueue caller that does not create the batch first cannot use this helper.
- Ruling: Task 7 locks the learner row, appends READY exposure atomically, and
  isolates proactive refill reservation/enqueue in a nested savepoint so
  ACTIVE/COOLDOWN contention rolls back only the redundant batch while the
  usable recommendation commits — cost if wrong: databases without PostgreSQL
  savepoint semantics would need a different contention boundary.

## Preflight task consistency

| Task | Tests versus implementation | File/interface consistency | Result |
|---|---|---|---|
| 1 | PostgreSQL RED covers schema, enums, fresh and 0012 upgrade paths | Produces all DB entities required downstream | Clean |
| 2 | Literal score/cooldown/bucket tests drive pure functions | Produces rankQuestionCandidates, selectTopBucket, exposureCutoff for Task 7 | Clean |
| 3 | HTTP-boundary tests cover every Brave failure and bound | Produces provider-neutral SearchAdapter for Tasks 4 and 6 | Clean |
| 4 | RBAC/encryption/projection tests match four search routes | Consumes Task 1 schema and Task 3 adapter; produces safe connection service | Clean |
| 5 | Registry/schema/Mock/quality RED tables match generated-question contract | Adds question_bank_refill used by Tasks 6 and 9 | Clean |
| 6 | Worker tests cover search/offline/failure/idempotence/shared routing | Consumes Tasks 1, 3, 4, 5; produces refill enqueue/pipeline for Task 7 | Clean |
| 7 | Real-PG tests cover exclusion, 72h, concurrency, polling and failure | Consumes Tasks 1, 2, 6; produces recommendation APIs for Task 8 | Clean |
| 8 | Client projection and browser state tests match Today implementation | Consumes Task 7; preserves manual/custom paths | Clean |
| 9 | Client/UI tests cover search states, RBAC, write-only key and visual gates | Consumes Tasks 4 and 5; edits shared client types after Task 8 | Clean, sequential dependency |
| 10 | Backup/privacy/admin/full gates cover cross-task obligations | Consumes all tasks; no new domain interface | Clean |

## Shared-file and interface matrix

| Producer task | Consumer task | Shared file or interface | Finding |
|---|---|---|---|
| 1 | 4 | searchConnection schema | Exact dependency; sequential |
| 1 | 6 | generationBatch and question provenance | Exact dependency; sequential |
| 1 | 7 | recommendation and generationBatch schema | Exact dependency; sequential |
| 1 | 10 | backup/migration identity | Exact dependency; sequential |
| 2 | 7 | ranking signatures | Names and weights match |
| 3 | 4 | Brave probe contract | Names and fixed endpoint match |
| 3 | 6 | SearchAdapter and SearchResult | Bounds and fallback match |
| 4 | 6 | canonical connection lookup/decryption | Shared/personal ownership rules match |
| 4 | 9 | search connection HTTP DTO | Public fields and write-only secret match |
| 5 | 6 | question_bank_refill prompt/schema | Task kind and schema name match |
| 5 | 9 | AI task list and route row | Task 9 explicitly adds the visible assignment |
| 6 | 7 | enqueueQuestionBankRefill and batch status | Task 7 triggers, Task 6 executes |
| 7 | 8 | recommendation POST/GET DTO | READY/PREPARING/UNAVAILABLE match |
| 8 | 9 | apps/web/src/lib/client/types.ts and http-service.ts | Task 9 builds on Task 8, never parallel |
| 8 | 10 | setup-today E2E | Task 10 extends, does not replace |
| 9 | 10 | account/redesign E2E and settings surface | Task 10 extends final gates |

## Task status

Baseline: pnpm validate PASS on ef38f24 plus the seven pre-existing frontend
working-tree changes. Package totals included AI 89, config 8, email 2,
learning-contracts 11, question-bank 5, DB 3, exchange 6, learning-core 30,
auth 5, Worker 127 with 3 environment skips, and Web 280 with 57 environment
skips. Lint had 0 errors and 4 existing Fast Refresh warnings.

Task 1: fix round 1/5 (3 addressed, 0 open — nonce, generated owner check,
research source bounds; commits ecf6e02..1747b8a)
Task 1: complete (commits ef38f24..1747b8a, review clean)
Task 2: fix round 1/5 (1 addressed, 0 open — hidden recent slice; commits
e2a1025..ad52a4f)
Task 2: complete (commits 1747b8a..ad52a4f, review clean)
Task 3: minor (deferred): abort after response headers is classified as
INVALID_RESPONSE rather than TIMEOUT, while remaining safely redacted.
Task 3: fix round 1/5 (3 addressed, 0 open — branded safe errors, fatal UTF-8,
strict response envelope; commits 74c750d..0ac79ff)
Task 3: complete (commits ad52a4f..0ac79ff, review clean)
Task 4: minor (deferred): shared-mode DELETE is covered by the common canonical
selector but has no dedicated route assertion.
Task 4: fix round 1/5 (4 addressed, 0 open — INVALID lifecycle,
concurrent-save serialization, atomic idempotency completion, bounded DELETE;
commits 9c14cbd..d763e96)
Task 4: complete (commits 0ac79ff..d763e96, review clean)
Task 5: fix round 1/5 (6 addressed, 0 open — canonical taxonomy,
same-batch deduplication, strict Task 2 surfaces, rationale/source isolation,
canonical hashing, batch bound; commits 26f06d1..755b639)
Task 5: complete (commits d763e96..755b639, review clean)
Task 6: fix round 1/5 (1 addressed, 1 open — full semantic-shortlist coverage
addressed; stale intermediate transition remained; commits 5a23d5f..c8153ad)
Task 6: fix round 2/5 (1 addressed, 0 open — serialized intermediate
transitions and exact generation-batch waiter links; commits c8153ad..d77d26c)
Task 6: complete (commits 755b639..d77d26c, review clean)
Task 7: fix round 1/5 (4 addressed, 0 original open — SWAP cooldown,
dynamic-cycle eligibility, READY-safe refill contention, replay Location;
commits fd4ec40..8a928e5)
Task 7: fix round 2/5 (2 addressed, 0 open — private generated-row
fail-closed gate and static/dynamic external-ID canonical consistency;
commits 8a928e5..b5c799e)
Task 7: complete (commits d77d26c..b5c799e, review clean)
Task 8: fix round 1/5 (5 addressed, 1 open — strict READY projection,
cancel-safe bounded retry, rendered mutation lockout, D14 HTTP fixture,
locale-safe copy, and visible responsive CTA; commits a69dd04..047b119)
Task 8: fix round 2/5 (2 addressed, 0 open — synchronous duplicate-event
mutex and mobile account-control/CTA non-overlap; commits 047b119..8e64eb8)
Task 8: complete (commits b5c799e..8e64eb8, functional and visual review clean)
Task 9: fix round 1/5 (3 addressed, 1 open — exact DTO boundary, PUT
ACTIVE-only success, mounted-state axe; HTTP request oracle partial;
commits 35da218..387fcf5)
Task 9: fix round 2/5 (POST/DELETE addressed, GET/PUT partial — oracle
overfit StrictMode count and omitted GET/PUT header assertions;
commits 387fcf5..9d94570)
Task 9: fix round 3/5 (GET/PUT headers addressed, oracle still open — POST
method unchecked, unexpected methods ignored, phases not truly normalized;
commits 9d94570..547617b)
Task 9: fix round 4/5 (1 addressed, 0 open — exhaustive allowed-method
transcript and exact collapsed phase sequence; commits 547617b..a9c2fba)
Task 9: complete (commits 8e64eb8..a9c2fba, functional/security and visual review clean)
Task 10: fix round 1/5 complete (4 addressed, 0 open — closed safe-code set,
decryptable authenticated backup proof, learning-data recommendation deletion,
whole Admin DTO target-ID redaction; commits 1e2766e..0201519)
Task 10: complete (commits a9c2fba..0201519, repository gates green;
real Brave/provider acceptance remains EXTERNAL_PENDING)
Final broad review: changes requested (7 Important, 0 Critical — shared refill
ownership/deletion, active-cycle recommendation gate, PREPARING manual fallback,
mixed-review scoring, privileged early retry, target-mix enforcement, and
save/revoke serialization)
Final remediation A: complete (search save/revoke serialization; commit
41dc18a)
Final remediation B: complete (shared refill jobs use canonical privileged
ownership, legacy refill jobs survive learner-data deletion, and protected
Owner/Admin early retry is concurrency/idempotency safe; see
final-remediation-b-report.md)
Final remediation B: fix round 1/5 complete (atomic returned-row Graphile
deletion, owner-lock concurrency, deficit-aware type/topic target balance, and
locale-owned Admin retry errors; commit 8592686)
Final remediation C: complete (shared learner-locked active-cycle admission,
idempotent/concurrent 409 with zero learning/supply side effects, and
deterministic due mixed-review source-topic scoring; see
final-remediation-c-report.md; commit 987637e)
Final remediation D: complete (canonical bounded target validation, approved
pair/count enforcement across both semantic passes, real-PG atomic publication
counts, and learner-safe internal rejection handling; see
final-remediation-d-report.md)
Final remediation D: fix round 1/5 complete (bounded iterative semantic
revalidation, stable proposal/chunk idempotency keys, no duplicate judgments,
and later-candidate publication after rejected candidates release pair quota)
Final remediation E: complete (PREPARING manual/private start, strict PENDING
projection, Demo recommendation-state deletion, ephemeral tested Brave key,
post-header TIMEOUT, shared Admin DELETE assertion, and refreshed final gates;
see final-remediation-e-report.md; commit is the report-containing E commit)
Final remediation E: fix round 1/5 complete (separate recommendation-action
and cycle/custom mutexes; READY → SWAP → PENDING manual/private double-event
fallbacks each create one unattributed cycle and ignore the stale in-flight
poll; see final-remediation-e-report.md)
Final remediation E: fix round 2/5 complete (cycle-first central request,
retry, and swap guards; same-task manual/private/recommended start excludes
later recommendation traffic; both mutexes release after failure; see
final-remediation-e-report.md)
Final broad re-review: changes requested at d897490 (2 Important — durable
fallback abandonment and refill admission lock ordering; 1 stale-scope Minor)
Final remediation F1: complete at 938c248 (cycle-coupled STARTED/ABANDONED,
status-independent SWAP cooldown, forced race orderings; review clean)
Final remediation F2: complete (single exported global refill-admission helper,
global-before-user transaction order, reentrant enqueue, and three deterministic
PostgreSQL barrier/mutation cases; see final-remediation-f2-report.md)
Final remediation F2: fix round 1/5 complete (successful poll finalization now
acquires global admission before learner/recommendation rows; same-learner
create and overlapping privileged-retry PostgreSQL barriers prove bounded
completion, READY/STARTED state, one active linked job, and mutation sensitivity)
Final remediation F1: complete (internal ABANDONED state, protected atomic
DELETE, GET/DELETE PostgreSQL race barriers, strict client/Demo persistence,
and manual/private fallback abandonment before custom/cycle creation; see
final-remediation-f1-report.md)
Final remediation F1: fix round 1/5 complete (removed standalone exposure reset;
cycle POST now atomically transitions READY to STARTED or PENDING/READY to
ABANDONED under the learner lock; shown READY exposure remains cooled for 72h;
Today and Demo couple manual/private fallback to the one cycle request)
Final remediation F1: fix round 2/5 complete (fallback disposition is resolved
against the cycle question so exact READY use becomes STARTED; every recent
SWAP row cools excluded_external_id by created_at independent of status; two
PostgreSQL barriers force both recommended-vs-fallback commit orderings)
Current final evidence scope: baseline 85a6eaa plus the focused F2 Fix Round 1
remediation and updated report. Earlier broad ranges through d897490 remain
historical review evidence rather than the current final baseline.
Third final broad review: changes requested at 82d7767 (3 Important — cycle
idempotency atomicity, post-header client retry/deadline, Mock target contract;
1 stale-evidence Minor)
Final remediation G1: complete (cycle/disposition/D14/replay response share one
learner-locked transaction; completed replay records survive later settlement;
fetch/body/parse/status share one per-attempt deadline; GET and same-key
mutations retry transport failures within six attempts; Today releases busy
state after exhaustion; see final-remediation-g1-report.md)
Final remediation G2: pending (Mock target-mix contract)
