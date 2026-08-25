# Final remediation D — target-mix quality and publication boundary

## Finding disposition

Completed. The balanced refill target is no longer a prompt-only request. The
Worker passes the exact persisted target mix to both deterministic validation
passes, and the quality gate enforces approved type/topic membership and the
per-pair count before a candidate can become accepted or pending semantic
review.

The internal target-mix contract is fail-closed: it must be a non-empty array
of canonical `questionType`/`topic`/`count` objects, use only the shared
taxonomy, contain positive integer counts no greater than 15, contain no
duplicate pair, and have a total count no greater than 15. Malformed target
data rejects the provider batch with an internal typed reason and publishes no
question.

## Strict RED → GREEN evidence

- The initial quality-gate RED produced 13 intended failures: supported but
  unapproved pairs were accepted, excess same-pair proposals remained pending,
  and every malformed target-mix case was ignored.
- The Worker-pipeline RED showed the missing handoff directly: the new count-1
  flood and mixed-input tests published zero after the validator made
  `targetMix` mandatory but before either Worker validation call supplied it.
- A PostgreSQL mutation RED removed both handoffs and made the real pipeline
  fail before semantic review and publication.
- A quota mutation that charged a semantic duplicate made the dedicated
  rejected-candidate test fail; restoring the implementation made the later
  candidate eligible again.

## Implementation boundary

- Added internal typed reasons `TARGET_MIX_INVALID`,
  `TARGET_MIX_PAIR_UNAPPROVED`, and `TARGET_MIX_COUNT_EXCEEDED`. They remain
  Worker-only: the database receives aggregate accepted/rejected counts and the
  existing generic `QUESTION_VALIDATION_REJECTED` failure code.
- Target validation rejects unsupported taxonomy, zero/fractional/greater-than-15
  counts, duplicate pairs, total counts above 15, empty/non-array values, and
  non-canonical extra fields.
- Schema, Task 2 surface, leakage, current-fact, exact-hash, copied-source, and
  five-gram failures run before quota occupation. Semantic invalid, low-confidence,
  or duplicate judgments also do not occupy a target slot.
- Accepted and pending candidates occupy the same per-pair counter in provider
  order. Later candidates over that count reject deterministically. Original
  provider indexes remain the semantic-judgment keys in both passes.
- The final accepted list still uses canonical prompt hashes and is sliced to
  the existing 12-publication ceiling before one transactional publication.

## PostgreSQL 17.6 acceptance

The final database run used a newly recreated tmpfs
`postgres:17.6-bookworm` container at `127.0.0.1:55440`, followed by every
repository migration.

The real Worker pipeline proved these atomic terminal outcomes:

```text
approved opinion/government count=1; provider returned 15 valid: 1 accepted / 14 rejected / 1 public row
approved opinion/education only; provider returned opinion/government: 0 accepted / 1 rejected / 0 rows
approved opinion/government count=2; mixed invalid/out-of-mix/valid: 2 accepted / 2 rejected / 2 rows
duplicate persisted target pair: 0 accepted / 1 rejected / 0 rows
```

Neither failed batch projection contained a `TARGET_MIX_*` reason.

## Fresh verification

```text
Focused Worker quality + real-PG pipeline: 2 files / 76 tests passed
Full @iwc/worker: 14 files / 210 tests passed
Full @iwc/db: 2 files / 11 tests passed
Relevant Web PostgreSQL gates, independently isolated: 5 files / 57 tests passed
@iwc/worker typecheck: passed
@iwc/worker lint: passed
@iwc/worker production build: passed, two ESM entry points and source maps
Targeted Prettier check: passed
git diff --check: passed
```

The first combined Web command was invalid evidence because Vitest ran files
concurrently against the intentional instance-global non-terminal-batch
constraint. The same five files passed independently; no production change was
made for that test-environment collision.

## Residual boundaries

- Real Brave/provider acceptance remains `EXTERNAL_PENDING`; no credential was
  requested, read, stored in fixtures, or transmitted.
- Final remediation E still owns the Today fallback and remaining minor
  documentation closure.
- Mind MCP was not exposed in this task, so this report and the SDD ledger are
  the durable handoff.

Commit: the commit containing this report.
