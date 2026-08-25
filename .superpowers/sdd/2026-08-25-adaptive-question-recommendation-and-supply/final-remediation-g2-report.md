# Final remediation G2 — Mock consumes the approved target mix

## Scope and outcome

Baseline: `f44cae4` (`fix: require exact cycle replay completion`).

G2 closes third final broad-review finding 3 only. Structured generation now
has an optional closed `contractContext`. Its sole current variant is
`question_bank_refill_v1`, containing only typed question type, topic, and
count targets. It cannot carry learner identifiers, credentials, source text,
or arbitrary metadata. The context is server-owned contract data, not provider
prompt content.

The Worker canonicalizes the persisted target mix with the same bounded
taxonomy/count rules used by publication validation. It attaches that exact
canonical value to the refill generation request; malformed persisted JSON is
never represented as an approved contract. No Mock-specific method or adapter
branch exists in Worker.

OpenAI and compatible adapters retain their existing explicit outbound request
mapping. Adapter boundary tests pass a populated contract and prove neither
`contractContext` nor its discriminant appears in the provider HTTP body. The
compatible provider repair request also continues to map only the existing
text-generation fields.

## Deterministic Mock generation

For `iwc_question_bank_refill_v1`, Mock accepts only the closed discriminant,
one to fifteen unique approved pairs, integer counts from one to fifteen, and a
total count no greater than fifteen. Missing, extra-field, duplicate-pair,
unknown-taxonomy, or out-of-bound context returns an empty proposal value, so
the caller's real schema validator rejects it with the existing safe
schema-unsatisfied error. The removed fixed government/transport fallback
cannot leak incompatible pairs into a batch.

Valid targets expand in request order and exact requested count. The generator
uses topic-specific subjects, actions, and durable circumstances for all eight
topics, with the exact anchored surface required for all five Task 2 forms.
Tracks alternate deterministically. Internal rationales contain only the
taxonomy and local variant purpose. Response identity includes the contract,
so replaying the same structured request is stable.

The quality matrix exercises fifteen same-pair variants separately for each of
the five forms against all 120 static questions. Every proposal passes schema,
Task 2 surface, prompt/source/current-fact leakage, exact hash, copied-span,
and normalized five-gram gates. A separate uneven nine-proposal target covers
all five forms and all eight topics with exact pair order/counts and unique
prompts.

Mock also returns the existing typed high-confidence non-duplicate judgment for
the refill pipeline's bounded semantic-review request. Deterministic local
generation can therefore traverse the real validator instead of failing at a
generic schema-derived confidence of zero.

## End-to-end acceptance

Three integration levels are covered:

1. The real PostgreSQL balanced builder produces its tied fifteen-target
   baseline. Mock emits exactly those fifteen pairs, and the real validator
   accepts 15/15 against the static bank with no target-mix or quality
   rejection.
2. The in-memory Worker pipeline uses an uneven nine-proposal mix spanning all
   forms/topics. It publishes nine exact approved pairs, reports accepted=9 and
   rejected=0, creates nine unique hash-based external IDs, and duplicate
   delivery of the succeeded job is a no-op.
3. A real PostgreSQL `runAIJob` dispatch uses five non-legacy approved pairs.
   The real Mock adapter, semantic-review loop, validator, and atomic publisher
   finish SUCCEEDED with accepted=5, rejected=0, five exact public rows, and no
   `TARGET_MIX` or `COOLDOWN` state. Running this focused test twice on one
   database passes; the test now cleans up its generated dispatch rows.

## Strict RED -> GREEN evidence

RED on `f44cae4`:

- Mock returned two proposals for both a requested 9 and requested 15;
- missing and malformed contexts resolved with the fixed pair instead of
  rejecting;
- Worker captured `undefined` rather than the approved mix and published zero
  of the nine requested pairs;
- the real balanced-builder test received two proposals instead of fifteen;
- AI typecheck rejected every `contractContext` request and had no exported
  context type;
- the first generator attempt produced the right pairs but the fifteen-variant
  quality matrix rejected 12/15 per form for five-gram duplication. Adding
  deterministic distinct circumstances/actions fixed the source rather than
  weakening the validator.

GREEN focused evidence on Node 24.19.0:

- AI contract/Mock/adapter files: 4 files / 30 passed;
- full AI: 11 files / 101 passed;
- focused Worker contract and real Mock pipeline: 2 passed;
- real PostgreSQL balanced builder -> Mock -> validator: 15 accepted / 0
  rejected;
- real PostgreSQL dispatch -> publication: 5 accepted / 0 rejected, and the
  identical focused test passes twice on one database;
- full Worker: 14 files / 214 passed;
- full Web: 54 files / 494 passed.

## Fresh final verification

The final evidence used Node 24.19.0 and a newly migrated tmpfs
`postgres:17.6-bookworm` database. Docker reported `Mounts=[]`.

```text
PostgreSQL migration chain: pass
Full repository tests: 94 files / 905 passed / 0 failed / 0 skipped
format: pass
typecheck: pass
lint: pass, 0 errors / 4 existing Fast Refresh warnings
Worker production build: pass, 2 ESM entries plus source maps
Web production build: pass, 48/48 static pages
```

The first full-workspace attempt after a focused PostgreSQL run found a test
cleanup omission: dispatch-generated rows remained and the next deterministic
run correctly rejected them as exact duplicates. Adding `dispatchBatchId` to
that suite's row cleanup made two consecutive focused runs pass before the
fresh full gate above.

## Boundaries and residual risk

- Real OpenAI/compatible generation still receives the approved target mix in
  the existing untrusted prompt and remains protected by deterministic Worker
  enforcement; internal contract context is deliberately not transmitted.
- Mock is a finite deterministic offline supply. Repeating an already
  published identical target context can correctly encounter duplicate gates;
  production originality still depends on a configured real provider.
- Real Brave/provider acceptance remains `EXTERNAL_PENDING`; no credential was
  requested, read, generated, or stored.

Commit: the commit containing this report.
