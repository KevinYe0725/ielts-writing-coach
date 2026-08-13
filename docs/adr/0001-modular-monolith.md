# ADR 0001: Modular monolith with PostgreSQL-backed jobs

- Status: Accepted
- Date: 2026-08-13

## Decision

Use a TypeScript pnpm monorepo with a Next.js Web application, a separately runnable Graphile Worker, PostgreSQL as the durable store and queue, and versioned language-neutral JSON contracts shared with the Codex Skill.

The local personal deployment may run a session-only executor in the Web process. Shared and multi-replica deployments require encrypted persistent provider credentials.

## Consequences

- One public image can run Web, Worker, migration, and diagnostic commands.
- No Redis, Kafka, object store, or closed service is required for v1.
- AI jobs are at-least-once and every handler must be idempotent.
- Cross-language teaching behavior must be represented declaratively rather than copied as unrelated TypeScript and Python logic.
