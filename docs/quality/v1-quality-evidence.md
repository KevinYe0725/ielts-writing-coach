# v1.0 quality evidence and remaining reviews

This document separates reproducible repository evidence from claims that still
need a real AI provider, human adjudication, an external deployment, or a manual
accessibility review. A green deterministic test is not treated as an IELTS
scoring certification.

## Automated evidence in the repository

| Gate                               | Versioned evidence                                          | Automated assertion                                                                                                                                                                                       | What it proves                                                                                         | What it does not prove                                                                        |
| ---------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 52 sentence/paragraph boundaries   | `tests/benchmarks/v1/boundary-samples.json`                 | `tests/quality/benchmark-corpus.test.ts` checks 52 unique samples, four per fixed skill, exact UTF-16 excerpts, canonical categories, and strict `IssueEvidence` validation                               | Offset, fixed-skill, category, and hard-grammar regressions are deterministic                          | The synthetic diagnoses have not been adjudicated by certified IELTS examiners                |
| `much slighter pressure` safeguard | Boundary corpus plus worker classification tests            | Requires `COLLOCATION_NATURALNESS` and `CHINESE_INFORMATION_ORGANIZATION`, with `hardGrammarError: false`                                                                                                 | The repository does not invent a `much + comparative` grammar error                                    | It does not establish the best rewrite for every intended meaning                             |
| 12 full essays                     | `tests/benchmarks/v1/essay-samples.json`                    | Checks 12 unique, original synthetic inputs of at least 250 words, stored word counts, fixed target skills, and the absence of gold-band fields                                                           | Full-length structured inputs exist without copied learner/exam-provider text or fabricated gold bands | IELTS band accuracy, language naturalness, and task quality remain unadjudicated              |
| 6 learning cycles                  | `tests/benchmarks/v1/cycle-samples.json`                    | Validates every evidence event, executes applied/retained/transferred gates, preserves `NO_OPPORTUNITY`, and round-trips all six through canonical CycleBundle ZIP import/export                          | Deterministic evidence gates and portable archive contracts reproduce expected decisions               | Live AI judgment, queue/database idempotency, and Web/Skill UX equivalence are separate gates |
| Precise issue categories           | Canonical schema/type and worker mapping tests              | Covers lexical precision, task coverage, argument development, cohesion/organization, prior categories, and generic fallback                                                                              | TR/CC/LR evidence no longer has to masquerade as optional optimization or hard grammar                 | An AI can still misclassify an issue; model evaluation is required                            |
| Archive integrity                  | `packages/exchange/src/archive.test.ts`                     | Direct canonical CycleBundle create/read round-trip and signed-content tamper rejection                                                                                                                   | Exported bundle integrity and checksum verification                                                    | Backup restoration and cross-version migrations require deployment tests                      |
| Web ↔ Skill exchange              | PostgreSQL/Skill interop tests and `docs/compatibility.md`  | Executes JSON and ZIP update chains in both directions, idempotent replay, revision-parent checks, private-question UUID identity, and zero-write conflict behavior                                       | Both implementations preserve the canonical v1 append-only exchange semantics                          | It is manual file exchange, not cloud synchronization                                         |
| Fresh-agent Skill behavior         | `tests/skill-forward/v1/forward-run.json`                   | Validates the final Skill digest against 10+ unique ephemeral Codex threads, command traces, durable-state assertions, scope boundaries, safe recovery, and protected-answer sentinels                    | The installed Skill triggers and follows key workflows in isolated real agent sessions                 | Model behavior can vary; deterministic scripts and schemas remain the authoritative gates     |
| Clean-instance recovery            | `scripts/verify-compose-backup-restore.sh`                  | Destroys an isolated source instance, restores PostgreSQL plus all three secrets into new volumes, compares data/secret fingerprints, and proves Web readiness plus Worker queue consumption              | A same-version v1 backup can restore into an independently created Compose instance                    | v1 has no earlier stable release from which to claim a cross-version upgrade                  |
| Provider-error secrecy             | AI and Worker safety regression tests                       | Uses an arbitrary-format credential sentinel to reject raw provider message/code persistence and ensures queue retries throw only normalized safe errors                                                  | Known and unknown provider error formats cannot cross the tested DB/UI/queue-log boundary              | Operators must still protect infrastructure-level packet captures and database access         |
| Browser matrix                     | `playwright.config.ts`, `tests/e2e/`                        | Chromium, Firefox, WebKit, and iPhone WebKit run against an automatically started demo server                                                                                                             | The deterministic demo journeys execute across the declared engines/viewports                          | It is not a real-device or assistive-technology certification                                 |
| Release gating                     | `.github/workflows/ci.yml`, `.github/workflows/release.yml` | CI installs all three browser engines; a tag release must pass version consistency, repository validation, corpus tests, Skill validation, DB migration/tests, E2E, and container smoke before publishing | A tag cannot intentionally bypass the configured quality gates                                         | The workflows are configuration until GitHub Actions executes them on the public repository   |

The benchmark manifest is `tests/benchmarks/v1/manifest.json`. It records the
Apache-2.0 provenance and the same non-certification limits in machine-readable
form.

## Browser and accessibility matrix

The deterministic browser suite uses a fresh demo-mode Web process on
`127.0.0.1:3201`. CI installs Chromium, Firefox, and WebKit before running the
projects below.

| Project    | Engine / viewport        | Covered automatically                                                                                                          |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `chromium` | Desktop Chrome profile   | Full setup, Today, lesson, writing, delayed rewrite, IndexedDB recovery, structural accessibility, and keyboard skip-link flow |
| `firefox`  | Desktop Firefox profile  | Same desktop journeys and accessibility checks                                                                                 |
| `webkit`   | Desktop Safari profile   | Same desktop journeys; uses Safari/WebKit's `Alt+Tab` link-navigation behavior for the skip-link check                         |
| `mobile`   | iPhone 14 WebKit profile | Core page structure, setup, Today, lesson, delayed rewrite, IndexedDB recovery, and mobile navigation/overflow                 |

The touch project intentionally does not claim a hardware-keyboard contract.
Desktop-only keyboard shortcut and skip-link cases are skipped there; mobile
navigation and input/recovery journeys are tested instead.

Every core-route smoke check combines the repository's structural assertions
with an axe scan using WCAG 2.0 A/AA, 2.1 A/AA, and 2.2 AA rule tags. The
structural layer verifies document language, one primary landmark and `h1`, a
skip link, labelled visible controls, named visible buttons, and unique IDs
across nine core routes. Automated scanning does **not** certify WCAG
conformance. Before a public accessibility claim, complete and record:

- keyboard-only review on supported desktop browsers;
- VoiceOver and NVDA (or an equivalent supported screen-reader matrix);
- 200%/400% zoom, reflow, focus visibility, contrast, reduced motion, and error
  announcement review;
- real iOS Safari and Android Chrome checks on supported devices.

## Reproducible commands

```bash
pnpm exec vitest run --config tests/quality/vitest.config.ts
pnpm --filter @iwc/learning-contracts test
pnpm --filter @iwc/learning-core test
pnpm --filter @iwc/exchange test
pnpm --filter @iwc/worker test
pnpm skill:forward:validate
pnpm exec playwright install chromium firefox webkit
NEXT_PUBLIC_DEMO_MODE=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3201 pnpm test:e2e
node tests/quality/verify-release-version.mjs v1.0.0
```

Local release-candidate audit on 2026-08-13 used Node 24.19.0 and PostgreSQL
17.6. The complete, immutable result belongs in the first public GitHub Actions
run and is intentionally not replaced here by fragile test-count snapshots.
Before the initial commit, the local package suite, PostgreSQL migrations and
integration tests, type checks, lint, deterministic quality suite, and current
13-session Skill forward-evidence validator passed. The final browser and
production-image checks are rerun after the source tree is frozen. These local
results are evidence of that checkout only; they are not a claim that GitHub
Actions, a real provider, a cloud template, or the manual accessibility matrix
has already passed.

## Required real-AI and human evidence before stronger claims

The following remain release evidence tasks, not optional polish:

1. Build a separately versioned, human-labelled open-response regression set.
   Record annotator instructions, disagreements, adjudication, provider/model,
   prompt and rubric versions, confidence thresholds, and pass criteria.
2. Run the PRD's 95% generated-item acceptance sample with human review of goal
   clarity, answer determinacy, meaning preservation, and natural language.
   Deterministic templates alone cannot satisfy this claim.
3. Have qualified reviewers adjudicate any corpus used to claim IELTS scoring
   calibration. The 12 synthetic essays deliberately contain no gold bands.
   Product scores must continue to say “AI estimate”, not “official IELTS
   score”.
4. Exercise supported real providers and model routes, including structured
   output failures, low confidence, retry/idempotency, configuration repair,
   and model/rubric-version changes. Mock results are demo-only and cannot
   create mastery evidence.
5. Execute backup/restore, upgrade, Railway, and supported deployment-template
   E2E in disposable external environments. Repository configuration and local
   container smoke do not prove hosted reliability.
6. Complete the manual accessibility matrix above. Automated structural checks
   are useful regression guards, not accessibility certification.

Results from these reviews must be stored as dated, versioned reports with the
sample IDs and failures included. Do not replace a failed or ambiguous item
silently, and do not report a percentage without its denominator.
