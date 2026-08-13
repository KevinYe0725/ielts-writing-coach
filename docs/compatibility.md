# v1 compatibility matrix

This document is normative for the v1 exchange boundary. “Compatible” means the combination is covered by contracts and deterministic tests; it is not a promise that a future major contract can be read without migration.

| Component                   | Supported v1 line                                               | Compatibility rule                                                                                  |
| --------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Web application             | `1.0.x`                                                         | Reads and writes learning contract `1.0.0`                                                          |
| `coach-ielts-writing` Skill | `1.0.x`                                                         | Python 3.11+ standard library; reads and writes learning contract `1.0.0`                           |
| CycleBundle contract        | `1.0.0`                                                         | Canonical JSON and `.iwc-bundle.zip` in both directions                                             |
| Database                    | PostgreSQL 17                                                   | Migrations are forward-only; back up database and secret volume together                            |
| Runtime                     | Node.js 24.14+, pnpm 11.16                                      | Versions used in CI and release builds                                                              |
| OpenAI provider             | Responses API with structured output support                    | Connection capabilities are probed before an assessment route is accepted                           |
| OpenAI-compatible provider  | `/v1/chat/completions`                                          | JSON extraction plus one repair attempt; invalid structured output cannot score mastery             |
| Browser                     | Current Chrome, Edge, Firefox, Safari; responsive mobile layout | Critical flows have Chromium, Firefox, and WebKit automation; human release review remains separate |

## CycleBundle merge rules

- Web and Skill use the same contract version and support both canonical JSON and ZIP archives.
- A bundle with the same revision and the same canonical content is idempotent.
- A direct update must have `revision = local revision + 1` and `parentRevision = local revision`.
- Existing entities are immutable. An ID collision with different canonical content, an unexpected parent revision, or a branch produces an explicit conflict and writes nothing; imports never silently overwrite learner evidence.
- Append-only attempts, evaluations, evidence, and due-task changes are merged only after references and checksums validate.
- Both public-bank and private questions exchange their internal UUIDv7. UI slugs and public external IDs are display metadata, not entity identity.
- Local file/database editing revisions and the portable bundle revision are intentionally separate counters.
- Provider keys, session cookies, internal database fields, raw model traffic, and chat history never belong in a CycleBundle.

The release test performs both `Web → Skill → Web` and `Skill → Web → Skill` update chains, plus replay and conflict cases. See the [backup/restore runbook](./operations/backup-restore.md) for whole-instance portability; a CycleBundle is one learning cycle, not a database backup or full account archive.

## Version changes

Patch releases in the `1.0.x` line may add server-whitelisted optional fields but cannot reinterpret an existing field or relax evidence gates. A contract-breaking change requires a new contract version, an explicit migration, compatibility fixtures, and a major-version decision. Pin a release tag or image digest for important learner data.

---

# v1 兼容矩阵

v1 的 Web 与 Skill 均读写 learning contract `1.0.0`，CycleBundle 同时支持 canonical JSON 与 `.iwc-bundle.zip`。相同 revision 与相同规范化内容属于幂等重放；合法直线更新必须满足 `revision = 本地 revision + 1` 且 `parentRevision = 本地 revision`。若已有实体同 ID 不同内容、父 revision 不符或出现分叉，导入会生成明确冲突并保持零写入，绝不会静默覆盖学习证据。

公开题和私人题都使用内部 UUIDv7 交换，UI slug 不是实体 ID。本地文件/数据库编辑 revision 与可移植 bundle revision 是两个独立计数。Provider key、Cookie、内部数据库字段、原始模型流量和聊天记录一律不进入 CycleBundle。完整实例迁移请使用备份恢复流程，不要把单轮 CycleBundle 当作账户归档。
