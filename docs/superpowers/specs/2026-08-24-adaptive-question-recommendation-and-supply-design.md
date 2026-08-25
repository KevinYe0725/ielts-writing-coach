# Adaptive Question Recommendation and Dynamic Supply

**Date:** 2026-08-24

**Status:** Approved for implementation planning
**Product:** IELTS Writing Coach

## 1. Purpose

When a learner starts a new essay, the system should recommend a question the
learner has not practised before. The choice should remain unpredictable while
improving coverage across IELTS Task 2 question types and topics.

When the shared question bank can no longer supply an unseen question, the
instance should replenish itself safely:

1. Search the web for recent public issue themes when a search connection is
   configured.
2. Ask the configured AI service to create original IELTS Task 2 questions
   informed by those themes.
3. Fall back to offline AI generation when search is unavailable.
4. Never create an empty cycle or damage learner state when every supply path
   fails.

## 2. Confirmed Product Decisions

- A practised question is never recommended to that learner again.
- Questions used in transfer practice also count as previously seen and are
  permanently excluded from unseen recommendations.
- A question that was shown but not started enters a three-day recommendation
  cooldown. It is not counted as practised.
- The learner keeps a visible “换一题 / Try another question” action.
- Web-researched and AI-generated questions enter an instance-shared dynamic
  question bank after validation.
- Dynamic questions contain no learner identifiers, essays, feedback, skill
  history, or private data.
- Web search is an optional, separately configured service.
- The first search adapter is Brave Search with a fixed official HTTPS
  endpoint.
- If search is not configured or fails, the current AI service generates
  original questions without web context.
- Search configuration must fit the existing Annotation Desk settings design
  and must not introduce a visually separate administration product.

## 3. Existing System Context

The current question endpoint returns private learner questions followed by the
static open question bank. Today selects the first returned question. Training
cycle creation receives an explicit question external ID and already enforces
the eight-active-essay limit and mixed-review constraints.

The static bank contains five Task 2 question types across eight topics, with
three original questions for each type/topic pair. Public catalog questions are
materialized into the database only when needed. AI providers are OpenAI,
OpenAI-compatible, or Mock; compatible providers do not share a standard web
search tool contract.

The new design keeps training-cycle creation explicit. Recommendation and
question supply happen before cycle creation.

## 4. Architecture

The feature has four isolated components:

1. **Recommendation service**
   - Builds the learner-specific eligible set.
   - Scores candidates for training value.
   - Chooses randomly only within the strongest candidate group.
   - Records exposure atomically before returning the question.

2. **Question supply service**
   - Measures the remaining unseen pool.
   - Creates one idempotent refill batch when supply is low.
   - Coordinates web research, AI generation, validation, and publication.

3. **Search adapter**
   - Uses a fixed Brave Search endpoint.
   - Accepts generic issue-theme queries only.
   - Returns bounded source records containing URL, title, and short snippet.
   - Has no dependency on the selected AI provider.

4. **Question quality gate**
   - Applies deterministic Task 2 structure and safety checks.
   - Rejects copied or highly similar prompts.
   - Uses a structured AI validation result for semantic duplicate checking.
   - Publishes only accepted questions into the shared dynamic bank.

## 5. Data Model

### 5.1 question_recommendation

Append-only learner recommendation records also serve as the exposure ledger.

- id: UUID
- user_id: learner FK
- question_external_id: nullable while pending
- action: INITIAL or SWAP
- status: PENDING, READY, or UNAVAILABLE
- excluded_external_id: nullable; the question being swapped away
- shown_at: nullable; set only when READY is committed
- safe_failure_code: nullable
- created_at and updated_at

Indexes:

- user_id plus shown_at
- user_id plus question_external_id plus shown_at
- status plus updated_at

The generic idempotency record remains the HTTP replay boundary. The
recommendation row is the domain state used for polling and exposure history.

### 5.2 question_generation_batch

Tracks one shared supply attempt without exposing its contents to learners.

- id: UUID
- triggered_by_user_id: nullable FK with ON DELETE SET NULL
- status: QUEUED, SEARCHING, GENERATING, VALIDATING, SUCCEEDED, or FAILED
- generation_mode: WEB_RESEARCH or OFFLINE
- target_mix: JSON containing requested topic/type counts
- research_sources: bounded JSON array of URL, title, and short snippet
- search_connection_id: nullable FK
- ai_job_id: nullable FK
- prompt_version and rubric_version
- accepted_count and rejected_count
- safe_failure_code
- created_at and updated_at

Only administrators may inspect batch metadata. Source snippets never appear in
learner APIs or ordinary learning-data exports.

### 5.3 search_connection

Stores one active instance search connection.

- id: UUID
- configured_by_user_id: owner/admin FK
- kind: BRAVE
- encrypted_api_key
- encryption_key_version
- status: ACTIVE, INVALID, or REVOKED
- tested_at, created_at, and updated_at

The API key uses the same envelope-encryption and owner-bound AAD principles as
AI provider secrets. It is included only in encrypted full-instance backup,
never in learner exports or logs.

### 5.4 question provenance

The existing question table remains the canonical question store.

- source is AI_RESEARCHED or AI_GENERATED.
- visibility is public.
- owner_id is null.
- bank_version identifies the dynamic generator version.
- external_id is derived from a canonical prompt hash, making exact duplicate
  insertion a database-level no-op.
- attribution contains a safe internal generation label, never copied source
  text.

The generation batch ID is persisted on the question through a nullable foreign
key so provenance can be audited without exposing research material.

## 6. Eligibility Rules

The recommendation service constructs a set of public validated questions,
including static catalog questions and accepted dynamic questions.

Hard exclusions:

- Any question used by one of the learner’s training cycles.
- Any question used by one of the learner’s transfer tasks.
- Any question shown in a READY recommendation during the preceding 72 hours.
- The question passed as excluded_external_id during a swap.
- Private questions; these remain manually selectable by their owner.
- Invalid, rejected, or unvalidated dynamic questions.

Static catalog rows do not need to be materialized before ranking. Exposure is
stored by stable external ID. The selected question is resolved/materialized
only when the cycle is created.

## 7. Training-Value Ranking

For each eligible question, compute a score from the learner’s completed and
active training-cycle distribution:

- Question-type coverage: 40 divided by one plus the learner’s prior cycle
  count for that type.
- Topic coverage: 35 divided by one plus the learner’s prior cycle count for
  that topic.
- Recent type diversity: 15 points when the type is absent from the last three
  cycles, otherwise zero.
- Recent topic diversity: 10 points when the topic is absent from the last
  three cycles, otherwise zero.

This produces a maximum score of 100 for a completely unpractised type/topic
that is also absent from the recent window. Counts include active and completed
cycles but not recommendation exposures.

If a due mixed-review task is waiting, candidates with a topic different from
the source cycle receive the full recent-diversity topic contribution. The
existing server rule that prohibits the exact source question remains.

After scoring:

1. Find the highest score.
2. Keep candidates no more than five points below it.
3. Choose one with cryptographically secure randomness.
4. In one user-locked transaction, create the READY recommendation and set
   shown_at.

Randomness cannot make a low-value candidate outrank the high-value group.
Idempotent replay returns the same recommendation.

## 8. Recommendation API

### POST /api/v1/question-recommendations

Mutation protected by Origin, session, bounded JSON, rate limit, and
idempotency.

Input:

- action: INITIAL or SWAP
- excluded_question_id: optional

Responses:

- 200 READY: recommendation ID plus learner-safe question projection.
- 202 PREPARING: recommendation ID and retry_after_seconds.
- 409 ACTIVE_CYCLE_LIMIT: unchanged existing learner limit.
- 503 QUESTION_SUPPLY_UNAVAILABLE: safe message and custom-question fallback.

### GET /api/v1/question-recommendations/{id}

Returns PENDING, READY, or UNAVAILABLE for the authenticated owner. A READY
response is projected from the canonical question record. No AI job ID, search
connection ID, source URL, prompt version, score, or ranking weight is returned.

### Existing APIs

- GET /questions continues to support manual browsing and custom questions.
  It is extended to include validated shared dynamic questions without
  duplicating static catalog rows.
- POST /training-cycles remains explicit and unchanged except that clients may
  include recommendation_id for audit. Cycle creation still resolves the
  question independently and remains the only action that counts as practice.

## 9. Supply Refill

After a READY recommendation is committed, the service counts that learner’s
remaining eligible unseen questions.

- At 12 or more: no supply action.
- Below 12: enqueue one shared refill batch if no non-terminal batch exists.
- At zero: create a PENDING recommendation request and ensure a refill batch
  exists.

The worker creates a balanced target mix based on gaps in the shared validated
bank, not the triggering learner’s private profile.

Each batch requests at most 15 proposals and publishes at most 12 accepted
questions. Only one non-terminal batch may exist per instance. After a failed
automatic batch, another automatic refill cannot start for six hours; an
Owner/Admin may request an explicit retry sooner.

The explicit retry is a protected administrator mutation. It creates a fresh,
immutable batch only when the latest batch failed, bypasses only that six-hour
cooldown, and safely attaches when another non-terminal batch won the race. Its
response contains only STARTED/ATTACHED and aggregate batch status; batch, AI
job, search connection, route, and user identifiers remain server-internal.

In personal mode the refill uses the personal canonical AI route. In shared
mode it uses the instance canonical Owner/Admin AI route and never borrows a
learner session-only connection. The generated prompts remain instance assets
rather than learner-owned AI output. The AI job owner is the canonical route
owner (or the deterministic privileged instance owner when no route is yet
configured), while triggered_by_user_id remains batch-only waiter/audit
context. Learner-data deletion never removes a question_bank_refill AI job or
its Graphile queue row, including legacy learner-owned rows.

### 9.1 Web-research path

When an ACTIVE Brave connection exists:

- Search generic English-language issue themes in the eight supported topic
  families.
- Use strict Safe Search and a bounded recent time window.
- Do not search for “IELTS questions”, answer keys, essays, or learner text.
- Run at most eight topic queries with at most five results each.
- Limit each stored snippet to 500 characters and the full research payload to
  40 source records.
- Reject a search response after 256 KiB of UTF-8 body data.
- Limit redirects, body size, and the complete search phase to 15 seconds.
- Persist only canonical HTTPS URLs, titles, and short snippets.

### 9.2 Offline generation path

Use offline mode when:

- No search connection exists.
- Search authentication fails.
- Search times out or is rate-limited.
- Search returns too little safe material.

The same AI task and output schema are used, but research_sources is empty and
the prompt asks for original topic combinations from the approved taxonomy.

### 9.3 AI failure

If AI is unconfigured, blocked, or repeatedly invalid:

- Mark the batch FAILED with a safe code.
- Mark waiting recommendation requests UNAVAILABLE.
- Do not insert questions.
- Do not create cycles, attempts, or drafts.
- Keep manual bank browsing and custom-question creation reachable.
- A later connection repair may start a new batch; old failed batches remain
  auditable and immutable.

## 10. Generation and Quality Gate

One structured AI response proposes a bounded batch. Every proposed question
must include:

- question type
- topic
- English prompt
- IELTS track
- short source-theme rationale for internal validation only

Deterministic checks:

- Supported question type, topic, and track.
- Required Task 2 surface form for the selected type.
- One unambiguous task with no answer, rubric, or teaching instruction leakage.
- Prompt length from 40 through 900 characters and one through six sentences.
- No learner data, provider metadata, URLs, citations, or current factual
  claims that require specialist knowledge.
- Exact normalized hash is new.
- No twelve-word contiguous sequence copied from research snippets.

Similarity checks:

- Compare only against questions of the same type or topic.
- Reject normalized word five-gram Jaccard similarity at or above 0.55.
- Ask the configured model for a typed duplicate judgment over the remaining
  shortlist.
- A schema-invalid or low-confidence judgment rejects the candidate rather than
  publishing it.

Only batches with at least one accepted question become SUCCEEDED. Rejected
candidates are never returned or materialized as questions.

## 11. Search Connection APIs and RBAC

Owner/Admin only:

- GET /api/v1/search-connection
- PUT /api/v1/search-connection
- POST /api/v1/search-connection/test
- DELETE /api/v1/search-connection
- POST /api/v1/admin/question-supply/retry

Learners receive 403 with no connection metadata. API responses expose provider
kind, status, and tested time only. The API key is write-only.

The Brave endpoint is fixed in server code; version one has no custom search
base URL. This avoids turning the setting into an SSRF surface.

## 12. Learner Experience

Opening New Essay shows one recommendation rather than selecting the first
catalog item.

Visible content:

- “为你推荐 / Recommended for you”
- question type, topic, and IELTS track
- complete English task
- primary action: “用这道题开始写作”
- secondary action: “换一题”
- utility actions: “浏览全部题库” and “粘贴自己的题目”

“换一题” creates a new recommendation. The previous question immediately
enters the three-day cooldown.

The learner sees the explanation “已为你平衡近期题型与话题”. The interface does
not show ranking scores, candidate counts, AI labels, provider names, source
URLs, job IDs, or search states.

When supply is being prepared:

- “正在准备一组新题”
- automatic polling with a bounded deadline
- “粘贴自己的题目” remains available
- “稍后重试” appears after a safe timeout

No empty selector, permanent spinner, or disabled account state is allowed.

## 13. Settings Experience

The existing AI Service advanced area receives one compact
“联网题目检索” section.

Collapsed states:

- 未连接
- 可正常使用
- 需要检查

Expanded configuration:

- search service preset, initially Brave Search
- write-only API Key field
- Test connection
- Save or replace

The section reuses the current Annotation Desk type scale, paper surface,
hairline border, compact status badge, field spacing, and responsive form
patterns. It does not create a new navigation item, dashboard, large marketing
card, or backend-language panel.

Personal mode permits the owner to configure it. Shared mode permits
Owner/Admin only; learners never see the technical section.

## 14. Security and Privacy

- Search queries contain generic topic language only.
- Never send user IDs, essays, feedback, skill IDs, learning history, or private
  prompts to the search service.
- Search credentials are encrypted at rest and redacted from logs and APIs.
- Fixed Brave HTTPS origin; strict redirect, DNS, timeout, response-size, and
  content-type checks.
- Search output is untrusted input and is never treated as instructions.
- The AI receives bounded source records inside a server-authored prompt.
- Research sources are excluded from learner exports.
- Full instance backup includes the encrypted search credential inside the
  already encrypted secrets archive.
- Deleting learning data does not delete shared generated questions.
- Revoking the search connection does not delete prior validated questions.

## 15. Observability

Administrator-safe counters:

- eligible question count
- recommendation READY/PENDING/UNAVAILABLE counts
- refill batch status and accepted/rejected counts
- search versus offline generation mode
- safe failure code

No prompts, snippets, URLs, API keys, learner IDs, or model responses are
written to ordinary application logs.

## 16. Test Strategy

### Pure selection tests

- Permanent exclusion of cycle and transfer questions.
- Exact 72-hour exposure boundary.
- Type and topic coverage scoring.
- Last-three-cycle diversity.
- Top-five-point candidate bucket.
- Random choice cannot escape the bucket.

### PostgreSQL integration

- Concurrent INITIAL and SWAP requests serialize per learner.
- Idempotent replay returns the same question.
- READY exposure is committed before response.
- Failed cycle creation does not count as practice.
- Dynamic shared question is selectable by another learner.
- Low-pool trigger creates one refill batch.
- Shared refill jobs are privileged-owner-owned while retaining only the
  triggering learner on the batch.
- QUEUED and RUNNING legacy refill jobs survive learner-data deletion with
  their Graphile queue rows, and later refill admission remains recoverable.
- Concurrent privileged early retries create one balanced batch and safely
  attach the loser; idempotent replay creates no additional batch.

### Search adapter

- Fixed host and HTTPS.
- Safe Search and language parameters.
- Authentication failure, rate limit, timeout, redirect, malformed JSON, and
  oversized response.
- No credential or query-data leakage in errors.

### Worker and quality gate

- Search success to accepted dynamic questions.
- Search failure to offline generation.
- AI unavailable to safe UNAVAILABLE state.
- Exact duplicate, copied source span, malformed Task 2 structure, unsafe
  content, and semantic duplicate rejection.
- At-least-once job delivery cannot publish duplicates.

### Browser

- Initial recommendation.
- Swap and three-day cooldown behavior.
- Manual bank browsing and custom question remain available.
- PREPARING, READY, and UNAVAILABLE states.
- Search settings states and write-only secret behavior.
- Desktop, mobile, keyboard, focus, no overflow, and axe scans.

### External acceptance

- One real Brave Search connection test.
- One real research-backed refill batch.
- Manual review confirming generated tasks are clear, original, appropriately
  difficult, and do not reproduce sources.

## 17. Rollout

1. Add schema and APIs behind the recommendation service.
2. Seed no dynamic questions; existing static bank remains the initial source.
3. Add settings support and optional Brave connection.
4. Switch Today New Essay from first-item selection to recommendation.
5. Enable proactive refill below 12 remaining questions.
6. Keep manual question browsing and custom questions as permanent fallbacks.

No existing training cycle, question, essay, or learning evidence is rewritten.

## 18. Acceptance Criteria

- A learner never receives a practised cycle or transfer question as unseen.
- A swapped-away question is not recommended for 72 hours.
- Recommendation balances type, topic, and recent diversity before randomness.
- Concurrent/retried requests cannot expose inconsistent questions.
- Search is optional and provider-independent.
- Search failure automatically attempts offline generation.
- Total supply failure does not create or damage learner state.
- Validated generated questions are shared instance-wide and contain no learner
  data.
- Settings remain visually consistent and responsive.
- Learner-facing UI exposes no search, provider, job, schema, score, or source
  internals.
- Owner/Admin can retry a failed refill before six hours without bypassing the
  one-non-terminal-batch invariant or receiving operational identifiers.

## 19. Technical References

- Brave Search API Web Search documentation:
  https://api-dashboard.search.brave.com/app/documentation/web-search/get-started
- OpenAI Responses built-in web search documentation:
  https://platform.openai.com/docs/quickstart/make-your-first-api-request
