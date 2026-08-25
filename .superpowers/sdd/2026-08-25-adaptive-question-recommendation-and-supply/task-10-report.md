# Task 10 report — backup, privacy, administration, and release gates

## Status

**REPOSITORY_COMPLETE / EXTERNAL_PENDING** — Fix Round 1 closed all four
privacy/security review findings and the fresh repository-controlled gates are
green. A real Brave connection test and research-backed refill remain
`EXTERNAL_PENDING` until an authorized user enters a key in the UI.

Task 10 commit: `1e2766ee313f321376106e9c1a6f387e32c49cc2`.

## RED → GREEN

- Initial PostgreSQL-focused RED: 3 files, 3 failed and 4 passed. After
  correcting the backup dump-table test itself, the intended RED was 2 failed
  and 5 passed: learner export exposed generated `source`/`attribution`, and the
  Admin response lacked `question_supply`.
- Client RED: 1 failed / 108 passed because `SystemStatus.questionSupply` was
  absent.
- Admin browser RED: Chromium 1 failed because the aggregate block did not
  exist.
- Unsafe-code RED: 1 failed / 1 passed because an arbitrary stored failure
  string crossed the Admin route.
- Bootstrap RED: 1 failed / 7 skipped because the generated setup token was
  written to stdout.
- Final focused GREEN: 4 files / 116 tests passed on PostgreSQL 17.6; the Admin
  route unsafe-code suite passed 2/2; focused Admin Chromium passed 1/1; the
  bootstrap no-log regression passed.

## Implementation

- Removed generated-question operational provenance labels from learner-wide
  JSON/Markdown/ZIP records and proved search, batch, research, and
  recommendation sentinels are absent from all three formats.
- Proved the complete encrypted archive preserves an encrypted search
  connection in `database.dump` only after archive authentication.
- Added the aggregate-only Admin route/client projection and compact bilingual
  status block. Unsafe failure strings fail closed to `null`.
- Removed setup-token values from bootstrap logs and documented interactive
  protected-volume retrieval. Brave remains UI-managed; no environment search
  key was added.
- Closed release-gate hygiene found by exact commands: DB persistence tests now
  clean their instance-shared fixtures, Web DB tests run serially, Task 8/9
  color/type literals use central design tokens, and stale/mode-misaligned E2E
  assertions have correct ownership.

## Final gates

```text
PostgreSQL 17.6 migrate: pass
pnpm test: 91 files / 850 passed / 0 skipped / 0 failed
Compose operation regressions: 2 files / 13 passed / 0 skipped / 0 failed
format: pass
lint: pass, 0 errors / 4 existing warnings
typecheck: pass
Web build: pass, 48/48 pages
Worker build: pass, 2 ESM entries plus source maps
Demo E2E: 658 passed / 250 intentional skips / 0 failed
Non-Demo E2E: 135 passed / 73 intentional skips / 0 failed
Focused Demo ownership check: 24 passed / 0 skipped / 0 failed
git diff --check: pass
```

The first Demo matrix was 654 passed / 238 skipped / 4 failed on one stale
heading assertion across four projects. Its focused correction passed 4/4
before the complete green rerun. The first non-Demo matrix was 123 passed / 49
skipped / 24 failed because six browser-only Demo visual contracts ran without
their Demo fixtures across four projects; explicit mode ownership produced the
final green matrix without removing real HTTP search/Admin coverage.

## External boundary and residual risk

- `EXTERNAL_PENDING`: one user-entered Brave connection test and one real
  research-backed refill, including accepted/rejected review, source-wording
  review, revocation, and offline fallback.
- No Brave/provider credential was requested, read, stored, synthesized,
  logged, or transmitted.
- Existing real-account traversal and actual rendered 200%/400% zoom checks in
  the Annotation Desk evidence remain separately external-pending.
- Mind MCP was not exposed in this task, so the repository SDD ledger and this
  report provide the durable handoff.
- The owned tmpfs PostgreSQL container stopped and auto-removed. No project
  volume or unrelated Docker resource was changed.

## Fix Round 1/5 — review closure

Fix commit: `0201519e9092e3790179fbec2e896cf628ba3ae9`.

### Closed findings

1. Replaced both server and client failure-code regexes with the exact Task 6
   producer set: `AI_UNAVAILABLE` and `QUESTION_VALIDATION_REJECTED`. Known
   codes project; uppercase unknown, lowercase, and credential-shaped values
   fail closed to `null`.
2. Rebuilt the backup test around `encryptProviderSecret`. It extracts
   `database.dump` and `secrets.enc.json` only after outer authentication,
   reconstructs ciphertext/nonce/key version from the PostgreSQL COPY row,
   decrypts the archived master key, and recovers the fixture secret only with
   `search:<owner>:<connection>` AAD. Wrong outer/inner passphrases, key, owner
   AAD, and connection AAD all reject. The fixture secret is never logged.
3. `deleteLearningRecord` now deletes learner-owned recommendation exposure,
   swap, cooldown, and failure history inside the existing transaction. The
   test proves zero learner recommendation rows and an unchanged shared batch
   and generated question afterward.
4. Removed `recent_audit.target_id` from the Admin route, client DTO, mock, and
   UI. The retained event ID identifies the audit record; `target_type` is the
   safe resource class. Whole-response and rendered tests prove the user ID is
   absent while action/result/time context remains.

### Fix-round evidence

```text
Admin RED: 2 failed / 4 passed (raw target ID; uppercase unknown code)
Learning deletion RED: 1 failed (recommendation row remained)
Client mutation RED: target ID reappeared; uppercase unknown code projected
Focused PostgreSQL GREEN: 4 files / 121 passed
Full DB-backed workspace GREEN: 91 files / 850 passed / 0 skipped / 0 failed
Admin four-project E2E: 52 passed / 0 skipped / 0 failed
Format/lint/typecheck: pass; lint retains 4 existing warnings and 0 errors
Web build: pass, 48/48 pages
Worker build: pass, 2 ESM entries plus source maps
git diff --check: pass
```

The first full fix-round test attempt exposed an exact-one-audit fixture
assumption after earlier tests legitimately recorded other events. The test now
selects its own future-dated action and verifies its redacted shape without
assuming the global audit list has one item; the complete rerun passed.
