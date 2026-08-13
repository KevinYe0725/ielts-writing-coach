# Local state and CycleBundle

## Contents

1. Workspace layout
2. Common fields
3. Cycle and queue
4. Evidence events
5. Atomicity and privacy
6. CycleBundle exchange

## 1. Workspace layout

Store data under a user-selected learning directory:

```text
.coach-ielts-writing/
├── manifest.json
├── profile.json
├── queue.json
├── ability-profile.json
├── evidence.jsonl
└── cycles/<cycle-id>/
    ├── cycle.json
    ├── question.md
    ├── question-instructions.md
    ├── attempt-v1.md
    ├── attempt-v1.meta.json
    ├── assessment.json
    ├── issue-evidence.json
    ├── objectives.json
    ├── feedback.md
    ├── lesson-plan.json
    ├── responses.jsonl
    ├── rewrite-packet.md
    ├── attempt-v2.md
    ├── attempt-v2.meta.json
    ├── comparison.json
    └── transfer/
```

The Skill installation directory is read-only with respect to user learning data.

## 2. Common fields

Every mutable JSON document contains:

- `schema_version`;
- `revision`, incremented on mutation;
- `created_at` and `updated_at` as timezone-aware ISO timestamps;
- stable IDs;
- provenance where AI judgment is involved: model, prompt version, rubric version, and confidence.

Use canonical lowercase RFC 9562 UUIDv7 for every persisted entity, bundle, task, and conflict ID. Python 3.11 scripts generate the 48-bit millisecond timestamp, version/variant bits, and cryptographic randomness directly. Preserve imported Web UUIDv7 values unchanged; never derive IDs from essay content.

## 3. Cycle and queue

`cycle.json` minimally contains:

```json
{
  "schema_version": "1.0.0",
  "revision": 1,
  "bundle_revision": 1,
  "bundle_parent_revision": null,
  "bundle_content_hash": null,
  "imported_bundle_checksums": {},
  "cycle_id": "01989a00-0000-7001-8000-000000000001",
  "state": "QUESTION_READY",
  "question_id": "01989a00-0000-7001-8000-000000000002",
  "abstract_targets": [],
  "assistance": "independent",
  "active_block_id": null,
  "active_item_id": null,
  "lesson_elapsed_seconds": 0,
  "lesson_status": "PLANNING",
  "rewrite_status": "PLANNED",
  "transfer_statuses": [],
  "rewrite_task": {
    "id": "01989a00-0000-7001-8000-000000000003",
    "status": "PLANNED",
    "targetRewriteAt": "2026-08-14T12:00:00Z",
    "dueAt": null,
    "lastInstructionExposureAt": null,
    "assisted": false,
    "prerequisiteSkipped": false
  },
  "transfer_tasks": [],
  "mixed_review_task": {
    "id": "01989a00-0000-7001-8000-000000000004",
    "dueAt": "2026-08-27T12:00:00Z",
    "status": "PLANNED"
  },
  "created_at": "2026-08-13T12:00:00Z",
  "updated_at": "2026-08-13T12:00:00Z"
}
```

`revision` protects local file mutations. `bundle_revision` is a separate, persisted exchange revision: it advances only when canonical portable content changes between exports. `bundle_parent_revision` records the exact previously exported/imported portable revision, `bundle_content_hash` records that snapshot's JCS content hash, and `imported_bundle_checksums` makes repeated bundle IDs idempotent while detecting ID collisions.

`queue.json` contains independently statused tasks. A task minimally has `task_id`, `cycle_id`, `kind`, `target_at`, optional `due_at`, and `status`.

## 4. Evidence events

`evidence.jsonl` is append-only and uses the canonical `SkillEvidenceEvent` contract. Each line includes `schemaVersion`, stable `id`, `userId`, one supported `skillId`, `kind`, `outcome`, independence and first-attempt flags, `hintLevel`, confidence, adjudication, context/topic IDs, source entity, and `occurredAt`.

Deduplicate by event ID and source tuple. `DELAYED_REWRITE` must come from `REWRITE`; `CROSS_TOPIC_TRANSFER` must come from `TRANSFER`. A lesson `EXERCISE` cannot claim either. `NO_OPPORTUNITY` and assisted evidence cannot change ability state.

## 5. Atomicity and privacy

- Write to a temporary file in the destination directory, flush, fsync, and replace atomically.
- Protect mutations with a lock file and expected revision.
- Never log essay text or provider credentials.
- Never recursively delete a path inferred from an unresolved variable or wildcard.
- Export excludes raw essay and response content unless the user explicitly opts in.
- Reject imports containing credential-like keys such as `api_key`, `authorization`, `password`, `secret`, or access tokens.

## 6. CycleBundle exchange

One file contains exactly one canonical cycle:

```json
{
  "contractVersion": "1.0.0",
  "manifest": {
    "bundleId": "01989a00-0000-7001-8000-000000000005",
    "cycleId": "01989a00-0000-7001-8000-000000000001",
    "source": "SKILL",
    "exportedAt": "2026-08-13T12:00:00Z",
    "revision": 1,
    "parentRevision": null,
    "appendOnlyEntityIds": [
      "01989a00-0000-7001-8000-000000000001",
      "01989a00-0000-7001-8000-000000000002"
    ]
  },
  "checksum": {
    "algorithm": "SHA-256",
    "canonicalization": "JCS",
    "value": "0000000000000000000000000000000000000000000000000000000000000000"
  },
  "cycle": {},
  "attempts": [],
  "assessment": null,
  "issueEvidence": [],
  "objectives": [],
  "lesson": { "plan": null, "responses": [] },
  "evidence": [],
  "dueTasks": { "rewrite": {}, "transfers": [], "mixedReview": {} },
  "conflicts": []
}
```

The checksum is SHA-256 over RFC 8785 JCS UTF-8 bytes of the complete bundle after removing the top-level `checksum` member. Import must verify the exact contract version, checksum, supported IDs, append-only ID coverage, secret exclusion, and cycle collision before writing anything. Question IDs are the stable internal UUIDv7 for public and private questions; UI slugs never cross the boundary, and an existing question's ID, prompt, and instructions are immutable.

Exchange stores semantic data, not raw chat transcripts or storage-layer paths. By default the CLI exports a structurally valid redacted bundle with attempts, assessment, issue evidence, objectives, lesson plan, and responses omitted. It is suitable for inspection but cannot resume a state whose prerequisites were redacted; import fails safely and requests a complete export. `--include-content` creates the complete continuation bundle and requires explicit user intent.

For an existing cycle, a direct update must have `revision = local revision + 1` and `parentRevision = local revision`. All existing append-only IDs and immutable entity contents must remain; attempts, evaluations, evidence, and other new entities may only be appended, while cycle/task state can advance. The same revision with the same canonical content is idempotent, including a repeated ZIP or JSON package. The same entity or bundle ID with different immutable content is an explicit conflict and leaves learning content unchanged. Historical `appendOnlyEntityIds` survive a round trip even when an entity is not currently materialized.

The CLI supports two representations of the same canonical object:

- `*.json`: the CycleBundle object as UTF-8 JSON;
- `*.iwc-bundle.zip` (or `*.zip`): the Web-compatible archive containing `cycle-bundle.json`, `manifest.json`, and a readable `report.md`.

The output filename selects JSON or ZIP during `export-bundle`; `import-bundle` accepts both and also recognizes ZIP magic bytes. The JSON inside the archive remains authoritative. Its UUIDv7 values and checksum are not replaced merely because it is wrapped in ZIP. `manifest.json` repeats the bundle ID, cycle ID, contract version, and checksum and must agree with `cycle-bundle.json` when present.

ZIP imports are inspected without extracting files. Reject traversal paths, duplicate names, encryption, more than 50 entries, a compressed archive over 20 MiB, any entry over 10 MiB, or total declared expansion over 50 MiB. A bounded member read and CRC verification prevent a forged directory size from bypassing these checks. `cycle-bundle.json` is required; unknown safe members are ignored for forward compatibility.
