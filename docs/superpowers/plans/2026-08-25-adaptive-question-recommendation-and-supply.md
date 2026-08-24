# Adaptive Question Recommendation and Dynamic Supply Implementation Plan

**Plan date:** 2026-08-25

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Recommend one learner-specific unseen IELTS Task 2 question, preserve a three-day exposure cooldown, and safely replenish the instance-shared bank through optional Brave research plus provider-neutral AI generation.

**Architecture:** A pure scorer ranks unseen candidates; a PostgreSQL recommendation service commits exposure and idempotent polling state; a separate Brave adapter supplies bounded public-topic context; and the existing AI job system generates and validates shared dynamic questions. Today consumes the recommendation API, while Settings adds one compact Owner/Admin-only search connection section.

**Tech Stack:** Node.js 24.14+, TypeScript 7, pnpm workspaces, Next.js 16, React 19, PostgreSQL 17, Drizzle ORM, Graphile Worker, Zod, AJV, Vitest, Playwright, AES-256-GCM.

**Spec:** docs/superpowers/specs/2026-08-24-adaptive-question-recommendation-and-supply-design.md

## Global Constraints

- A cycle or transfer question is permanently ineligible for that learner.
- A READY recommendation exposure is ineligible for exactly 72 hours.
- Private learner questions never enter automatic recommendation.
- Recommendation weights are type 40/(1+count), topic 35/(1+count), recent type 15, and recent topic 10.
- Random selection is limited to candidates within five points of the best score.
- Fewer than 12 eligible unseen questions triggers one shared refill batch.
- One batch proposes at most 15 questions and publishes at most 12.
- Only one non-terminal refill batch may exist per instance.
- Failed automatic refill has a six-hour automatic cooldown.
- Search is optional; failure falls back to offline AI generation.
- Search queries contain no learner data, essays, feedback, skills, or private prompts.
- Brave uses a fixed HTTPS endpoint; version one has no custom search URL.
- Learner APIs and UI never expose source URLs, jobs, providers, schemas, scoring weights, or generation internals.
- Search secrets are write-only, encrypted with the existing master key, and excluded from learner exports.
- No failed path may create a cycle, attempt, draft, or invalid question.
- Existing manual question browsing and private custom-question creation remain available.
- All implementation follows strict RED, GREEN, refactor cycles with focused commits.

---

## File and Interface Map

### Database ownership

- packages/db/src/schema.ts owns search connections, recommendation state, generation batches, and question provenance.
- packages/db/drizzle/0013_adaptive_question_supply.sql and matching metadata own the migration.
- packages/db/src/schema-version.ts remains the release/readiness source of truth.

### Recommendation ownership

- apps/web/src/lib/server/question-recommendation-score.ts owns pure eligibility scoring and top-bucket selection.
- apps/web/src/lib/server/question-recommendation.ts owns transactions, exposure, pending state, and refill triggering.
- apps/web/src/app/api/v1/question-recommendations/route.ts owns INITIAL/SWAP creation.
- apps/web/src/app/api/v1/question-recommendations/[id]/route.ts owns polling.

### Search ownership

- packages/search/src/types.ts defines the provider-neutral search contract.
- packages/search/src/brave.ts implements the only version-one adapter.
- apps/web/src/lib/server/search-connection.ts owns probe, encryption, save, revoke, and safe projection.
- apps/web/src/app/api/v1/search-connection routes own Owner/Admin HTTP boundaries.

### Generation ownership

- packages/ai/src/prompts.ts registers question_bank_refill.
- apps/worker/src/question-generation.ts owns provider schema, deterministic quality gates, and deduplication.
- apps/worker/src/tasks/question-supply.ts owns search, fallback, AI generation, validation, and publication.
- apps/worker/src/tasks/ai.ts delegates the new task kind.

### Client ownership

- apps/web/src/lib/client/types.ts defines recommendation and search-connection DTOs.
- apps/web/src/lib/client/http-service.ts and mock-service.ts implement those methods.
- apps/web/src/app/today/page.tsx and today.module.css own learner recommendation states.
- apps/web/src/app/settings/page.tsx and settings.module.css own search configuration.

---

### Task 1: Persist recommendation, supply, and search state

**Files:**

- Modify: packages/db/src/schema.ts
- Modify: packages/db/src/schema-version.ts
- Modify: packages/db/src/index.test.ts
- Create: packages/db/src/question-supply.test.ts
- Create: packages/db/drizzle/0013_adaptive_question_supply.sql
- Create: packages/db/drizzle/meta/0013_snapshot.json
- Modify: packages/db/drizzle/meta/\_journal.json

**Interfaces:**

- Produces: searchConnection, questionRecommendation, questionGenerationBatch tables and QuestionRecommendationStatus, QuestionGenerationBatchStatus types.
- Produces: nullable question.generationBatchId relation.
- Consumes: existing user, question, aiJob, createdAt, updatedAt, and domainId helpers.

- [ ] **Step 1: Stage an exact PostgreSQL 17 upgrade fixture**

Before changing schema or migrations, run the current 0012 migrations into the
upgrade database:

    docker run --rm -d --name iwc-question-supply-pg17 \
      -e POSTGRES_USER=iwc \
      -e POSTGRES_PASSWORD=iwc-plan-only \
      -e POSTGRES_DB=iwc_upgrade \
      -p 127.0.0.1:55435:5432 \
      postgres:17.6-bookworm
    DATABASE_URL=postgresql://iwc:iwc-plan-only@127.0.0.1:55435/iwc_upgrade pnpm --filter @iwc/db migrate
    docker exec iwc-question-supply-pg17 createdb -U iwc iwc_fresh

Expected: iwc_upgrade contains schema 0012 and iwc_fresh is empty.

- [ ] **Step 2: Write schema and PostgreSQL RED tests**

Add a test that inserts one privileged search connection, one PENDING recommendation, one generation batch, and one generated question. Assert:

```ts
expect(savedRecommendation).toMatchObject({
  action: "INITIAL",
  status: "PENDING",
  questionExternalId: null,
});
expect(savedQuestion.generationBatchId).toBe(batchId);
```

Add database tests proving invalid recommendation action/status, batch
status/mode, and search connection kind/status values are rejected by their
PostgreSQL enums.

- [ ] **Step 3: Run the DB test and capture RED**

Run:

```bash
DATABASE_URL=postgresql://iwc:iwc-plan-only@127.0.0.1:55435/iwc_upgrade pnpm exec vitest run packages/db/src/question-supply.test.ts
```

Expected: FAIL because the four schema exports do not exist.

- [ ] **Step 4: Add schema definitions**

Add these exported status types:

```ts
export type QuestionRecommendationStatus = "PENDING" | "READY" | "UNAVAILABLE";
export type QuestionRecommendationAction = "INITIAL" | "SWAP";
export type QuestionGenerationBatchStatus =
  | "QUEUED"
  | "SEARCHING"
  | "GENERATING"
  | "VALIDATING"
  | "SUCCEEDED"
  | "FAILED";
```

Add searchConnection with configuredByUserId, kind BRAVE, encrypted secret fields, status, testedAt, and timestamps. Add questionRecommendation with userId, nullable questionExternalId, action, status, excludedExternalId, shownAt, safeFailureCode, and timestamps. Add questionGenerationBatch with nullable trigger user, status, mode, targetMix, bounded researchSources, nullable search connection and AI job IDs, versions, counts, safeFailureCode, and timestamps. Add nullable question.generationBatchId with ON DELETE SET NULL.

Use PostgreSQL enums for recommendation action/status, batch status/mode, and
search connection kind/status so invalid states are rejected by the database,
not only TypeScript.

- [ ] **Step 5: Generate and inspect migration**

Run:

```bash
pnpm --filter @iwc/db generate -- --name adaptive_question_supply
```

Rename only if required so the migration tag is exactly 0013_adaptive_question_supply. Confirm the SQL creates indexes for user exposure history, recommendation status, and batch status. Do not add cascade deletion from users to shared questions or completed batches.

- [ ] **Step 6: Update schema descriptor**

Update DATABASE_SCHEMA_VERSION, expected migration count, journal timestamp, and SHA-256 hash in packages/db/src/schema-version.ts from the generated journal and SQL bytes.

- [ ] **Step 7: Run fresh and upgrade migrations**

Run once against an empty PostgreSQL 17 database and once against a database stopped after migration 0012:

```bash
DATABASE_URL=postgresql://iwc:iwc-plan-only@127.0.0.1:55435/iwc_upgrade pnpm --filter @iwc/db migrate
DATABASE_URL=postgresql://iwc:iwc-plan-only@127.0.0.1:55435/iwc_fresh pnpm --filter @iwc/db migrate
DATABASE_URL=postgresql://iwc:iwc-plan-only@127.0.0.1:55435/iwc_fresh pnpm --filter @iwc/db test
```

Expected: migration and DB tests PASS; journal count and hash match.

- [ ] **Step 8: Stop the isolated database and commit**

```bash
docker stop iwc-question-supply-pg17
git add packages/db/src packages/db/drizzle
git commit -m "feat: add adaptive question supply schema"
```

---

### Task 2: Implement pure training-value ranking

**Files:**

- Create: apps/web/src/lib/server/question-recommendation-score.ts
- Create: apps/web/src/lib/server/question-recommendation-score.test.ts

**Interfaces:**

- Produces: rankQuestionCandidates(input): RankedQuestion[]
- Produces: selectTopBucket(ranked, randomIndex): RankedQuestion | null
- Produces: exposureCutoff(now): Date
- Consumes: QuestionType and QuestionTopic strings already used by client/server contracts.

- [ ] **Step 1: Write literal RED tables**

Define candidate and history literals and assert exact scores:

```ts
expect(
  rankQuestionCandidates({
    candidates: [{ id: "q1", type: "discussion", topic: "health" }],
    priorCycles: [],
    recentCycles: [],
  })[0]?.score,
).toBe(100);
```

Add cases for one prior type, one prior topic, recent type/topic removal, exact 72-hour eligibility, permanent cycle/transfer exclusion, private exclusion, and top-bucket membership at best minus five versus best minus 5.01.

- [ ] **Step 2: Run RED**

```bash
pnpm exec vitest run apps/web/src/lib/server/question-recommendation-score.test.ts
```

Expected: FAIL because the scorer module is missing.

- [ ] **Step 3: Implement pure types and functions**

Use these signatures:

```ts
export interface RecommendationCandidate {
  id: string;
  type: QuestionType;
  topic: QuestionTopic;
}

export interface RankedQuestion extends RecommendationCandidate {
  score: number;
}

export function rankQuestionCandidates(input: {
  candidates: readonly RecommendationCandidate[];
  priorCycles: readonly RecommendationCandidate[];
  recentCycles: readonly RecommendationCandidate[];
}): RankedQuestion[];

export function selectTopBucket(
  ranked: readonly RankedQuestion[],
  randomIndex: (upperExclusive: number) => number,
): RankedQuestion | null;
```

Sort by score descending and ID ascending before selecting, so injected random indices are reproducible in tests.

- [ ] **Step 4: Run GREEN and mutation checks**

```bash
pnpm exec vitest run apps/web/src/lib/server/question-recommendation-score.test.ts
```

Temporarily change each weight once and confirm a literal test fails; restore it and rerun GREEN.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/server/question-recommendation-score.ts apps/web/src/lib/server/question-recommendation-score.test.ts
git commit -m "feat: rank unseen essay questions"
```

---

### Task 3: Add the provider-neutral Brave search package

**Files:**

- Create: packages/search/package.json
- Create: packages/search/tsconfig.json
- Create: packages/search/src/types.ts
- Create: packages/search/src/brave.ts
- Create: packages/search/src/brave.test.ts
- Create: packages/search/src/index.ts
- Modify: apps/web/package.json
- Modify: apps/worker/package.json
- Modify: pnpm-lock.yaml

**Interfaces:**

- Produces: SearchAdapter, SearchQuery, SearchResult, SearchConnectionValidation.
- Produces: BraveSearchAdapter constructor accepting apiKey and injectable fetch.
- Consumes: global fetch, AbortSignal, URL, and safe JSON only.

- [ ] **Step 1: Write adapter RED tests**

Test the actual request boundary with a stub fetch:

```ts
const adapter = new BraveSearchAdapter({
  apiKey: "test-key",
  fetch: async (request) => {
    expect(new URL(request.url).origin).toBe("https://api.search.brave.com");
    expect(request.headers.get("X-Subscription-Token")).toBe("test-key");
    return Response.json({
      web: {
        results: [
          {
            title: "Urban mobility",
            url: "https://example.test/a",
            description: "Public transport policy.",
          },
        ],
      },
    });
  },
});
```

Add RED cases for timeout, 401, 429, redirect, non-JSON, more than the byte limit, non-HTTPS result URLs, snippets above 500 characters, and more than five results.

The byte-limit fixture must exceed 256 KiB by one byte; the accepted boundary
fixture must be exactly 256 KiB.

- [ ] **Step 2: Run RED**

```bash
pnpm exec vitest run packages/search/src/brave.test.ts
```

Expected: FAIL because @iwc/search does not exist.

- [ ] **Step 3: Define the search contract**

```ts
export interface SearchQuery {
  query: string;
  freshness: "pm" | "py";
  count: number;
  language: "en";
  safeSearch: "strict";
  timeoutMs: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchAdapter {
  validateConnection(signal?: AbortSignal): Promise<SearchConnectionValidation>;
  search(input: SearchQuery): Promise<readonly SearchResult[]>;
}
```

- [ ] **Step 4: Implement BraveSearchAdapter**

Use the fixed endpoint https://api.search.brave.com/res/v1/web/search, X-Subscription-Token, search_lang=en, safesearch=strict, and count capped at five. Use AbortSignal.timeout plus a 256 KiB maximum response byte reader. Reject redirects rather than following them. Return normalized canonical HTTPS URLs only.

- [ ] **Step 5: Run package gates**

```bash
pnpm exec vitest run packages/search/src/brave.test.ts
pnpm --filter @iwc/search typecheck
pnpm --filter @iwc/search lint
```

- [ ] **Step 6: Commit**

```bash
git add packages/search apps/web/package.json apps/worker/package.json pnpm-lock.yaml
git commit -m "feat: add bounded Brave search adapter"
```

---

### Task 4: Persist and manage the encrypted search connection

**Files:**

- Create: apps/web/src/lib/server/search-connection.ts
- Create: apps/web/src/lib/server/search-connection.test.ts
- Create: apps/web/src/app/api/v1/search-connection/route.ts
- Create: apps/web/src/app/api/v1/search-connection/route.test.ts
- Create: apps/web/src/app/api/v1/search-connection/test/route.ts
- Create: apps/web/src/app/api/v1/search-connection/test/route.test.ts
- Modify: apps/web/src/lib/server/api-security-invariants.test.ts

**Interfaces:**

- Produces: getSearchConnectionProjection(db, actor)
- Produces: saveSearchConnection(db, actor, apiKey)
- Produces: revokeSearchConnection(db, actor)
- Consumes: BraveSearchAdapter, encryptProviderSecret, decryptProviderSecret, requireRole, auditEvent.

- [ ] **Step 1: Write RED server tests**

Cover Owner/Admin save, learner 403, write-only key projection, invalid key 422, encrypted ciphertext not containing plaintext, replace, revoke, shared canonical selection, and audit events.

Assert the public projection exactly:

```ts
expect(result).toEqual({
  kind: "brave",
  status: "ACTIVE",
  tested_at: expect.any(String),
});
expect(JSON.stringify(result)).not.toContain("api-key");
```

- [ ] **Step 2: Run RED**

```bash
pnpm exec vitest run apps/web/src/lib/server/search-connection.test.ts apps/web/src/app/api/v1/search-connection/route.test.ts apps/web/src/app/api/v1/search-connection/test/route.test.ts
```

- [ ] **Step 3: Implement server service**

Probe before persistence. Encrypt using AAD:

```ts
const additionalData = "search:" + actor.id + ":" + connectionId;
const encrypted = encryptProviderSecret(
  apiKey,
  parseMasterKey(environment.APP_ENCRYPTION_KEY),
  environment.APP_ENCRYPTION_KEY_VERSION,
  additionalData,
);
```

In shared mode, select the newest enabled Owner/Admin connection with Owner priority, then owner ID and connection ID tie-breaks. Never return ciphertext, nonce, key version, or configuring user ID.

- [ ] **Step 4: Implement HTTP routes**

All mutations call protectMutation before rate limiting and parsing, require Owner/Admin, use bounded JSON, and return no-store. PUT uses idempotency; DELETE revokes one canonical connection and is replay-safe.

- [ ] **Step 5: Run GREEN and security tests**

```bash
pnpm exec vitest run apps/web/src/lib/server/search-connection.test.ts apps/web/src/app/api/v1/search-connection
pnpm exec vitest run apps/web/src/lib/server/api-security-invariants.test.ts
pnpm --filter @iwc/web typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/server/search-connection* apps/web/src/app/api/v1/search-connection apps/web/src/lib/server/api-security-invariants.test.ts
git commit -m "feat: manage encrypted search connections"
```

---

### Task 5: Register the question-bank refill AI contract

**Files:**

- Modify: packages/ai/src/prompts.ts
- Modify: packages/ai/src/prompts.test.ts
- Modify: packages/ai/src/mock.ts
- Modify: packages/ai/src/mock.test.ts
- Modify: apps/worker/src/schemas.ts
- Create: apps/worker/src/question-generation.ts
- Create: apps/worker/src/question-generation.test.ts
- Modify: apps/web/src/lib/client/types.ts
- Modify: apps/web/src/lib/server/version.test.ts

**Interfaces:**

- Adds AITaskKind question_bank_refill.
- Produces: GeneratedQuestionProposal, QuestionGenerationJudgment, validateGeneratedQuestionBatch.
- Produces schema name iwc_question_bank_refill_v1.
- Consumes supported question types/topics and bounded research source records.

- [ ] **Step 1: Write prompt/schema/mock RED tests**

Assert the prompt registry includes question_bank_refill version 1.0.0 and rubric iwc-question-bank-refill-1.0.0. Assert the provider schema has additionalProperties false, at most 15 proposals, no learner fields, and only type/topic/track/prompt/internal rationale.

Add a Mock test returning two structurally valid original questions without claiming web research.

- [ ] **Step 2: Write quality-gate RED tests**

Table-drive rejection for unsupported taxonomy, malformed type surface, answer/rubric leakage, URL or citation leakage, specialist current-fact dependency, exact hash duplicate, copied twelve-token source span, schema-invalid duplicate judgment, and low-confidence duplicate judgment. Include one accepted proposal for each of the five question types.

Use literal boundaries: prompt length 39 fails, 40 and 900 pass, 901 fails;
zero or seven sentences fail; normalized word five-gram Jaccard 0.55 fails
while 0.549 remains eligible for semantic review.

- [ ] **Step 3: Run RED**

```bash
pnpm exec vitest run packages/ai/src/prompts.test.ts packages/ai/src/mock.test.ts apps/worker/src/question-generation.test.ts
```

- [ ] **Step 4: Implement prompt, schema, and validators**

Add this public provider shape:

```ts
export interface GeneratedQuestionProposal {
  type: QuestionType;
  topic: QuestionTopic;
  track: "academic" | "general_training";
  prompt: string;
  internalRationale: string;
}
```

Keep sources outside provider output. The Worker passes bounded sources as untrusted data and validates every proposal independently.

Set JSON Schema prompt minLength 40 and maxLength 900, internalRationale
minLength 1 and maxLength 300, and proposals maxItems 15.

Add question_bank_refill to the Web client AI_TASK_KINDS mirror in the same
task so route DTO parsing cannot silently drop the new model assignment.

- [ ] **Step 5: Implement deterministic Mock result**

Mock returns original fixed proposals and never sets WEB_RESEARCH mode. Update registry key tests to derive exact public keys from AI_TASK_KINDS rather than a magic count.

- [ ] **Step 6: Run GREEN**

```bash
pnpm --filter @iwc/ai test
pnpm --filter @iwc/worker test
pnpm --filter @iwc/ai typecheck
pnpm --filter @iwc/worker typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/ai/src apps/worker/src/schemas.ts apps/worker/src/question-generation* apps/web/src/lib/server/version.test.ts
git commit -m "feat: define dynamic question generation contract"
```

---

### Task 6: Implement the shared refill Worker pipeline

**Files:**

- Create: apps/worker/src/tasks/question-supply.ts
- Create: apps/worker/src/tasks/question-supply.test.ts
- Modify: apps/worker/src/tasks/ai.ts
- Modify: apps/worker/src/runtime.ts
- Modify: apps/worker/src/runtime.test.ts
- Modify: apps/web/src/lib/server/jobs.ts
- Modify: apps/web/src/lib/server/jobs.test.ts

**Interfaces:**

- Produces: enqueueQuestionBankRefill(transaction, triggerUserId, batchId)
- Produces: refillQuestionBank(job, helpers)
- Consumes: searchConnection service data, @iwc/search, question generation validator, questionGenerationBatch.

- [ ] **Step 1: Write Worker RED tests**

Use dependency-injected fake search and AI adapters. Cover:

- SEARCHING to GENERATING to VALIDATING to SUCCEEDED.
- No search connection to OFFLINE generation.
- Search 401, 429, timeout, and too-little-source fallback.
- AI unavailable to FAILED with no question insert.
- Fifteen proposal and twelve publication caps.
- One non-terminal batch and six-hour failed cooldown.
- Duplicate delivery inserts no duplicate questions.
- Shared deployment resolves the privileged AI route rather than learner session-only credentials.

- [ ] **Step 2: Run RED**

```bash
pnpm exec vitest run apps/worker/src/tasks/question-supply.test.ts apps/web/src/lib/server/jobs.test.ts apps/worker/src/runtime.test.ts
```

- [ ] **Step 3: Implement enqueue helper**

The helper creates an AI job with:

```ts
{
  taskKind: "question_bank_refill",
  protectedReference: { generationBatchId: batchId },
  idempotencyKey: "question-bank-refill:" + batchId,
}
```

The AI job contains IDs only. Research snippets remain in questionGenerationBatch.

- [ ] **Step 4: Implement refill pipeline**

Build at most eight generic topic queries. Load and decrypt the canonical Brave key only inside the Worker. On search failure, update generationMode to OFFLINE and continue. Generate proposals, apply deterministic gates, run semantic duplicate judgment on same-topic/type shortlists, publish accepted question rows with hash-derived external IDs, and update counts/status atomically.

- [ ] **Step 5: Register execute switch and repair behavior**

Add question_bank_refill to runAIJob execution and AI route repair tests. WAITING_FOR_CONSENT remains non-destructive; once an AI route is saved, the existing repair path queues the batch.

- [ ] **Step 6: Run GREEN**

```bash
pnpm exec vitest run apps/worker/src/tasks/question-supply.test.ts apps/worker/src/runtime.test.ts apps/web/src/lib/server/jobs.test.ts
pnpm --filter @iwc/worker typecheck
pnpm --filter @iwc/worker lint
```

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src apps/web/src/lib/server/jobs.ts apps/web/src/lib/server/jobs.test.ts
git commit -m "feat: refill the shared question bank"
```

---

### Task 7: Build transactional recommendation and polling APIs

**Files:**

- Create: apps/web/src/lib/server/question-recommendation.ts
- Create: apps/web/src/lib/server/question-recommendation.test.ts
- Create: apps/web/src/app/api/v1/question-recommendations/route.ts
- Create: apps/web/src/app/api/v1/question-recommendations/route.test.ts
- Create: apps/web/src/app/api/v1/question-recommendations/[id]/route.ts
- Create: apps/web/src/app/api/v1/question-recommendations/[id]/route.test.ts
- Modify: apps/web/src/app/api/v1/questions/route.ts
- Modify: apps/web/src/app/api/v1/questions/route.test.ts
- Modify: apps/web/src/app/api/v1/training-cycles/route.ts
- Modify: apps/web/src/lib/server/api-security-invariants.test.ts

**Interfaces:**

- Produces: createQuestionRecommendation(db, actorId, input)
- Produces: getQuestionRecommendation(db, actorId, recommendationId)
- Consumes: rankQuestionCandidates, selectTopBucket, enqueueQuestionBankRefill, static QUESTION_BANK, dynamic question rows.

- [ ] **Step 1: Write real PostgreSQL RED tests**

Seed public, private, cycle, transfer, exposure, and dynamic questions. Assert:

- cycle and transfer questions never return;
- a shown question at 71:59:59 remains excluded;
- a shown question at exactly 72:00:00 is eligible;
- private questions never return;
- SWAP excludes its current question and records exposure;
- two concurrent INITIAL calls with distinct idempotency keys return distinct exposure rows serialized under the user lock;
- replay of one key returns the same recommendation;
- zero candidates returns PENDING and one refill batch;
- a completed batch allows polling to finalize READY;
- supply failure finalizes UNAVAILABLE without cycle/attempt rows.

- [ ] **Step 2: Run RED**

```bash
IWC_TEST_DATABASE_URL="$IWC_TEST_DATABASE_URL" pnpm exec vitest run apps/web/src/lib/server/question-recommendation.test.ts apps/web/src/app/api/v1/question-recommendations
```

- [ ] **Step 3: Implement transaction service**

Lock the user row. Join prior training and transfer questions by stable external ID. Load READY exposures newer than exposureCutoff(now). Merge static questions with validated dynamic public rows. Score and select using crypto.randomInt injection. Commit READY plus shownAt before returning.

When eligible count after selection is below 12, create one generation batch and enqueue refill after reserving it in the same transaction.

- [ ] **Step 4: Implement POST and GET routes**

POST body:

```ts
z.object({
  action: z.enum(["INITIAL", "SWAP"]),
  excluded_question_id: z.string().trim().min(1).max(200).optional(),
}).strict();
```

Return 200 READY, 202 PREPARING, or 503 QUESTION_SUPPLY_UNAVAILABLE with learner-safe copy. GET requires the owning actor and never returns batch/job/search internals.

- [ ] **Step 5: Extend questions and cycle APIs**

GET /questions merges private, validated dynamic public, and static catalog rows with stable de-duplication. POST /training-cycles accepts optional recommendation_id, verifies ownership and question match, but still resolves the canonical question itself. Only cycle creation counts as practice.

- [ ] **Step 6: Run GREEN**

```bash
IWC_TEST_DATABASE_URL="$IWC_TEST_DATABASE_URL" pnpm exec vitest run apps/web/src/lib/server/question-recommendation.test.ts apps/web/src/app/api/v1/question-recommendations apps/web/src/app/api/v1/questions
pnpm exec vitest run apps/web/src/lib/server/api-security-invariants.test.ts
pnpm --filter @iwc/web typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/server/question-recommendation* apps/web/src/app/api/v1/question-recommendations apps/web/src/app/api/v1/questions apps/web/src/app/api/v1/training-cycles/route.ts apps/web/src/lib/server/api-security-invariants.test.ts
git commit -m "feat: recommend unseen essay questions"
```

---

### Task 8: Integrate recommendation into the Web client and Today

**Files:**

- Modify: apps/web/src/lib/client/types.ts
- Modify: apps/web/src/lib/client/http-service.ts
- Modify: apps/web/src/lib/client/http-service.test.ts
- Modify: apps/web/src/lib/client/mock-service.ts
- Modify: apps/web/src/app/today/page.tsx
- Modify: apps/web/src/app/today/today.module.css
- Modify: tests/e2e/setup-today.spec.ts

**Interfaces:**

- Produces LearningService methods requestQuestionRecommendation and getQuestionRecommendation.
- Consumes QuestionOption and the existing startTrainingCycle method.

- [ ] **Step 1: Write client mapping RED tests**

Define:

```ts
export type QuestionRecommendation =
  | { state: "READY"; id: string; question: QuestionOption }
  | { state: "PREPARING"; id: string; retryAfterSeconds: number }
  | { state: "UNAVAILABLE"; id: string; message: string };
```

Test strict projections that discard unknown provider/job/source fields and reject READY without a complete question.

- [ ] **Step 2: Write Today browser RED tests**

Add tests for initial recommended card, swap, manual bank disclosure, custom question, PREPARING polling, UNAVAILABLE fallback, successful start carrying recommendation_id, mobile order, keyboard focus after swap, and no backend vocabulary.

- [ ] **Step 3: Run RED**

```bash
pnpm exec vitest run apps/web/src/lib/client/http-service.test.ts
NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/setup-today.spec.ts --project=chromium --workers=1 --grep="recommend|swap|question"
```

- [ ] **Step 4: Implement client methods and Mock**

POST recommendations with idempotency and Origin. Poll only the recommendation resource, never generic AI jobs. Mock rotates deterministic unseen demo questions and records swapped IDs in demo storage for three days.

- [ ] **Step 5: Replace first-item selection with recommendation UI**

Render one recommendation card with type/topic/track labels, full prompt, “用这道题开始写作”, and “换一题”. Keep “浏览全部题库” and private custom question inside accessible disclosures. PREPARING keeps custom input reachable and uses a bounded poll deadline; UNAVAILABLE never creates a cycle.

- [ ] **Step 6: Run GREEN and visual checks**

```bash
pnpm exec vitest run apps/web/src/lib/client/http-service.test.ts
NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/setup-today.spec.ts --project=chromium --project=firefox --project=webkit --project=mobile --workers=2
pnpm --filter @iwc/web typecheck
```

Capture 1440x900, 1024x768, and 390x844 screenshots and verify no overflow, one visible primary CTA, visible focus, and clear hierarchy.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/client apps/web/src/app/today tests/e2e/setup-today.spec.ts
git commit -m "feat: recommend a new essay question"
```

---

### Task 9: Add the visually integrated search setting

**Files:**

- Modify: apps/web/src/lib/client/types.ts
- Modify: apps/web/src/lib/client/http-service.ts
- Modify: apps/web/src/lib/client/http-service.test.ts
- Modify: apps/web/src/lib/client/mock-service.ts
- Modify: apps/web/src/app/settings/page.tsx
- Modify: apps/web/src/app/settings/settings.module.css
- Modify: tests/e2e/account.spec.ts
- Modify: tests/e2e/redesign-contracts.spec.ts

**Interfaces:**

- Produces: getSearchConnection, testSearchConnection, saveSearchConnection, deleteSearchConnection client methods.
- Consumes: search connection APIs from Task 4 and existing AI advanced-settings visual primitives.

- [ ] **Step 1: Write client and UI RED tests**

Test strict public DTO:

```ts
export interface SearchConnectionSetting {
  kind: "brave";
  status: "ACTIVE" | "INVALID" | "MISSING";
  testedAt: string | null;
}
```

Browser tests cover MISSING, ACTIVE, INVALID, test failure, save/replace, revoke confirmation, learner invisibility, write-only key clearing, 390px no overflow, 12px text floor, and axe.

- [ ] **Step 2: Run RED**

```bash
pnpm exec vitest run apps/web/src/lib/client/http-service.test.ts
NEXT_PUBLIC_DEMO_MODE=false PLAYWRIGHT_BASE_URL=http://127.0.0.1:3295 pnpm exec playwright test tests/e2e/account.spec.ts tests/e2e/redesign-contracts.spec.ts --project=chromium --workers=1 --grep="search|检索"
```

- [ ] **Step 3: Implement client methods**

Use PUT for save/replace with an idempotency key, POST /test for a temporary key, GET for safe status, and DELETE for revoke. Never retain the input key in client state after success.

- [ ] **Step 4: Implement compact settings section**

Add “联网题目检索” inside the existing advanced body after AI Service and before Model Assignments. Reuse settings-section, settings-section-head, Badge, text-input, inline-actions, field-hint, LoadingButtonContent, and existing responsive form spacing. Do not add a navigation item, new page, custom URL, large promotional card, or learner-visible technical metadata.

Add one “题库补充 / Question bank refill” row to AI_ROUTE_TASKS and replace
copy that names a fixed task count with count-free language.

- [ ] **Step 5: Run GREEN and visual checks**

```bash
pnpm exec vitest run apps/web/src/lib/client/http-service.test.ts
NEXT_PUBLIC_DEMO_MODE=false PLAYWRIGHT_BASE_URL=http://127.0.0.1:3295 pnpm exec playwright test tests/e2e/account.spec.ts tests/e2e/redesign-contracts.spec.ts --project=chromium --project=firefox --project=webkit --project=mobile --workers=2 --grep="search|检索|entry, account, and settings"
pnpm --filter @iwc/web typecheck
pnpm --filter @iwc/web lint
```

Review full-page screenshots at 1440x900 and 390x844. The search section must visually read as one compact sibling of AI Service and Model Assignments.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/client apps/web/src/app/settings tests/e2e/account.spec.ts tests/e2e/redesign-contracts.spec.ts
git commit -m "feat: configure web search for question supply"
```

---

### Task 10: Close backup, privacy, release, and end-to-end gates

**Files:**

- Modify: apps/web/src/lib/server/instance-backup.test.ts
- Modify: apps/web/src/lib/server/learning-record.test.ts
- Modify: apps/web/src/app/api/v1/admin/status/route.ts
- Modify: apps/web/src/app/api/v1/admin/status/route.test.ts
- Modify: apps/web/src/app/admin/page.tsx
- Modify: docs/quality/annotation-desk-v1-evidence.md
- Modify: docs/quality/annotation-desk-review-remediation.md
- Modify: docs/deployment.md
- Modify: tests/e2e/setup-today.spec.ts
- Modify: tests/e2e/account.spec.ts
- Modify: tests/e2e/admin.spec.ts

**Interfaces:**

- Consumes every prior task.
- Produces release evidence and operator documentation only.

- [ ] **Step 1: Write backup/privacy RED tests**

Assert ordinary learning JSON/Markdown/ZIP exports contain no search connection, encrypted key, research source, generation batch, or recommendation score. Assert the encrypted full instance backup round-trip preserves searchConnection and can decrypt it only after archive authentication.

Assert the Owner/Admin status response exposes eligible count,
recommendation-state counts, batch mode/status, accepted/rejected counts, and
safe failure code, while excluding user IDs, prompts, snippets, URLs, provider
responses, and encrypted fields.

- [ ] **Step 2: Run RED**

```bash
pnpm exec vitest run apps/web/src/lib/server/instance-backup.test.ts apps/web/src/lib/server/learning-record.test.ts apps/web/src/app/api/v1/admin/status/route.test.ts
```

- [ ] **Step 3: Update backup and environment documentation**

Document the Owner/Admin UI-managed Brave connection. Explain proactive threshold 12, three-day exposure cooldown, six-hour failed-refill cooldown, and the offline fallback. Do not add an environment search key in version one, and do not print setup or search keys in logs.

Add a compact Admin “题库补充 / Question supply” status block backed by the
safe status projection. Reuse existing admin status rows and badges; do not
render research sources or learner recommendation history.

- [ ] **Step 4: Run full real PostgreSQL tests**

Use an isolated PostgreSQL 17.6 instance with tmpfs or a project-owned test directory:

```bash
docker run --rm -d --name iwc-question-supply-final-pg17 \
  --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER=iwc \
  -e POSTGRES_PASSWORD=iwc-final-only \
  -e POSTGRES_DB=iwc \
  -p 127.0.0.1:55436:5432 \
  postgres:17.6-bookworm
DATABASE_URL=postgresql://iwc:iwc-final-only@127.0.0.1:55436/iwc pnpm --filter @iwc/db migrate
IWC_TEST_DATABASE_URL=postgresql://iwc:iwc-final-only@127.0.0.1:55436/iwc DATABASE_URL=postgresql://iwc:iwc-final-only@127.0.0.1:55436/iwc pnpm test
docker stop iwc-question-supply-final-pg17
```

Expected: zero failures. Environment-gated skips must be listed and justified; recommendation/search PG suites must not skip.

- [ ] **Step 5: Run full static/build gates**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @iwc/web build
pnpm --filter @iwc/worker build
git diff --check
```

- [ ] **Step 6: Run browser matrices**

```bash
NEXT_PUBLIC_DEMO_MODE=true pnpm test:e2e
NEXT_PUBLIC_DEMO_MODE=false PLAYWRIGHT_BASE_URL=http://127.0.0.1:3295 pnpm exec playwright test tests/e2e/setup-today.spec.ts tests/e2e/account.spec.ts tests/e2e/admin.spec.ts --project=chromium --project=firefox --project=webkit --project=mobile --workers=2
```

Verify recommendation, swap, PREPARING, UNAVAILABLE, custom question, search settings, mobile layout, keyboard flow, and axe.

- [ ] **Step 7: Run external acceptance**

With a user-entered Brave key, run one connection test and one refill batch. Record:

- search endpoint success without exposing the key;
- batch accepted/rejected counts;
- generated questions do not reproduce source wording;
- search revocation causes offline fallback rather than learner failure.

Mark this gate EXTERNAL_PENDING until the user supplies the key in the UI. Do not request or store the key in chat, shell history, fixtures, or documentation.

- [ ] **Step 8: Update evidence and commit**

```bash
git add docs apps/web/src/lib/server/instance-backup.test.ts apps/web/src/lib/server/learning-record.test.ts apps/web/src/app/api/v1/admin/status apps/web/src/app/admin/page.tsx tests/e2e/setup-today.spec.ts tests/e2e/account.spec.ts tests/e2e/admin.spec.ts
git commit -m "docs: record adaptive question supply evidence"
```

---

## Final Review Checklist

- [ ] Every spec section maps to at least one task.
- [ ] Recommendation and exposure are distinct from cycle creation.
- [ ] Static, dynamic, transfer, private, and three-day histories are covered.
- [ ] Randomness cannot leave the best-score bucket.
- [ ] Search is independent from AI provider kind.
- [ ] Search and AI failures preserve manual question paths.
- [ ] Shared-mode routes never borrow learner session secrets.
- [ ] Search key is never returned, logged, or learner-exported.
- [ ] Generated questions are instance-shared but contain no learner data.
- [ ] Settings and Today pass desktop/mobile visual review.
- [ ] Fresh and 0012-to-0013 migrations pass on PostgreSQL 17.
- [ ] Full unit, type, lint, format, build, E2E, axe, and external gates are recorded honestly.
