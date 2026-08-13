# IELTS Writing Coach

[English](./README.md) | [简体中文](./README.zh-CN.md)

IELTS Writing Coach is an open-source, self-hosted learning system for IELTS Academic and General Training Writing Task 2. It turns each essay into a complete learning cycle: a timed first draft, evidence-based assessment, targeted active practice, delayed closed-book rewriting, version comparison, and later transfer checks.

> [!IMPORTANT]
> Band scores are AI estimates, not official IELTS results. This project is independent and is not affiliated with or endorsed by IELTS, Cambridge University Press & Assessment, the British Council, or IDP.

## Project status

The source tree targets v1.0.0, but a stable release is not declared until the
versioned human-review evidence, real-provider journey, cloud-template check,
and release workflow have all passed. Until a tagged GitHub release appears,
`main` is a release candidate. Once releases begin, compatibility follows
semantic versioning; operators should still pin an exact release tag or image
digest and read the [upgrade guide](./docs/operations/upgrading.md) before
changing versions that store important learner data.

## What the system does

The application automates the administrative parts of deliberate practice while keeping the learner's high-value work active:

1. choose or paste a Task 2 question;
2. write Version 1 under a 40-minute timer;
3. receive evidence-linked TR, CC, LR, and GRA assessment;
4. complete a targeted lesson built from the essay's highest-priority issue;
5. rewrite from memory after a real delay;
6. compare Version 1 and Version 2; and
7. test the same skill later in an unfamiliar context.

The Web application and the repository-scoped Codex Skill share versioned learning contracts. A lesson can only provide short-term `applied` evidence; delayed, independent performance is required for `retained` or `transferred` state.

## Architecture

- Next.js Web application for the learner and administrator interfaces
- Graphile Worker process for durable AI jobs
- PostgreSQL for application data and the job queue
- shared TypeScript packages for AI adapters, learning contracts, learning rules, auth, and data access
- repository-scoped `coach-ielts-writing` Codex Skill

No Redis, object store, or proprietary hosted backend is required for the v1 architecture. See [ADR 0001](./docs/adr/0001-modular-monolith.md).

## Quick start with Docker Compose

Requirements: Docker Engine with Docker Compose v2 and OpenSSL. The database is bound to `127.0.0.1` by default.
The Web port is also bound to `127.0.0.1` by default. To publish it through a
maintained reverse proxy, explicitly set `IWC_BIND_ADDRESS` and configure HTTPS;
do not expose PostgreSQL.

```bash
cp .env.example .env
printf '\nPOSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" >> .env
docker compose up -d --build
docker compose logs bootstrap
curl --fail http://127.0.0.1:3000/api/v1/health/ready
```

The `bootstrap` log prints the one-time setup token when the secret volume is created. Open `http://127.0.0.1:3000/setup?token=YOUR_TOKEN`, create the owner account, and configure an AI provider. The application never sends a stored provider key to browser-side code.

Generated authentication, encryption, and setup secrets live in the `iwc_secrets` Docker volume. Keep that volume with the database backup; losing the encryption key makes persisted provider credentials unreadable. Follow the [backup and restore runbook](./docs/operations/backup-restore.md) before using real learner data.

To stop the application without deleting data:

```bash
docker compose down
```

Do not add `--volumes` unless you intentionally want to delete the database and generated secrets.

## Local development

Requirements: Node.js 24.14 or newer, pnpm 11.16, Docker Compose v2, and OpenSSL.

```bash
corepack enable
pnpm install --frozen-lockfile
docker compose up -d postgres
export DATABASE_URL='postgresql://iwc:iwc-local-only@127.0.0.1:5433/iwc'
export AUTH_SECRET="$(openssl rand -base64 48)"
export APP_ENCRYPTION_KEY="$(openssl rand -base64 32)"
export SETUP_TOKEN="$(openssl rand -base64 24)"
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open `http://127.0.0.1:3000/setup?token=$SETUP_TOKEN`. The development command starts both the Web and standalone Worker processes. The explicit `DATABASE_URL` uses port `5433`, which is the host port in `compose.yaml`; the container itself still uses port `5432`.

Before opening a pull request, run:

```bash
pnpm validate
pnpm test:e2e
pnpm skill:validate
pnpm skill:forward:validate
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for test scope, privacy rules, contract changes, and the required DCO sign-off.

## Deployment support

| Target         | Support level                  | Configuration                                                                               |
| -------------- | ------------------------------ | ------------------------------------------------------------------------------------------- |
| Docker Compose | Tier 1                         | [`compose.yaml`](./compose.yaml)                                                            |
| Railway        | Tier 1                         | [`railway.web.toml`](./railway.web.toml) and [`railway.worker.toml`](./railway.worker.toml) |
| Render         | Community example, best effort | [`render.yaml`](./render.yaml)                                                              |

Tier 1 means that the project treats documentation and configuration regressions for that target as release-blocking. It does not imply a hosting SLA. The Render Blueprint is a community-maintained starting point: plans, platform behavior, migration sequencing, backups, and costs must be reviewed by the operator.

Read the [deployment guide](./docs/deployment.md) before deploying to Railway or Render. It documents the required service topology, shared secrets, migration ordering, and platform-specific verification.

## Operations

- Supported Compose commands (always pass the exact project explicitly):

  ```bash
  pnpm compose:doctor -- --project ielts-writing-coach
  pnpm compose:backup -- --project ielts-writing-coach
  pnpm compose:restore -- --project recovery --archive /secure/backup.iwc-backup --confirm "RESTORE recovery"
  pnpm compose:upgrade -- --project ielts-writing-coach --image ghcr.io/kevinye0725/ielts-writing-coach:1.0.0 --confirm "UPGRADE ielts-writing-coach TO ghcr.io/kevinye0725/ielts-writing-coach:1.0.0"
  ```

  Use each command's `--help` before a data-bearing operation. Backups are fully
  encrypted `.iwc-backup` files and contain a PostgreSQL custom dump, a versioned
  manifest, checksums, and a second encrypted instance-secret envelope. Restore
  authenticates and validates the archive before changing the explicitly named
  project; upgrade refuses to pull until its verified pre-upgrade backup passes.

- [Backup and restore](./docs/operations/backup-restore.md)
- [Upgrading and rollback](./docs/operations/upgrading.md)
- Health endpoints: `/api/v1/health/live` for process liveness and `/api/v1/health/ready` for configuration, current migrations, database connectivity, and a fresh Worker heartbeat
- Compatibility metadata: `/api/version` (also `/api/v1/version`) reports the application, database schema, contracts, planner, prompt, rubric, and exchange versions

## Codex Skill

The repository-scoped Skill lives at `.agents/skills/coach-ielts-writing` and is discovered automatically when Codex starts in this repository. To use it without the Web application, ask Codex to install the tagged repository path with the built-in `$skill-installer`:

```text
Use $skill-installer to install https://github.com/KevinYe0725/ielts-writing-coach/tree/v1.0.0/.agents/skills/coach-ielts-writing
```

The installed Skill becomes available on the next Codex turn. It uses Python 3.11 and the standard library only, stores learner state under the selected workspace's `.coach-ielts-writing/` directory, and does not call a separate AI API. Tagged releases also contain a standalone Skill ZIP; pin the tag rather than installing mutable `main`.

Maintainers validate structure with `pnpm skill:validate` and validate the checked-in evidence from 10+ independent ephemeral Codex sessions with `pnpm skill:forward:validate`; `pnpm skill:forward` deliberately runs the paid/model-backed suite again. See the [compatibility matrix](./docs/compatibility.md) and [forward-test protocol](./tests/skill-forward/README.md).

## Security and privacy

Do not place real essays, provider credentials, database dumps, session cookies, or other personal data in issues, fixtures, screenshots, or pull requests. API keys remain server-side and encrypted provider credentials use the operator-supplied `APP_ENCRYPTION_KEY`.

For vulnerabilities, follow [SECURITY.md](./SECURITY.md) and do not open a public issue.

## License and contributions

Source code and documentation are licensed under [Apache License 2.0](./LICENSE). Attribution information is in [NOTICE](./NOTICE). Contributions require a [Developer Certificate of Origin 1.1](./DCO.md) sign-off on every commit; no copyright assignment is requested.

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before contributing.
