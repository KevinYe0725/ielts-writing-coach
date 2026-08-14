<div align="center">

<img src="https://raw.githubusercontent.com/KevinYe0725/ielts-writing-coach/main/assets/logo.svg" alt="IELTS Writing Coach logo" width="96" height="96" />

# IELTS Writing Coach

**A self-hosted learning loop for IELTS Writing Task 2.**

Write a timed draft · get evidence-linked feedback · practise your weakest skill · rewrite from memory · retain it for the real exam.

[![CI](https://img.shields.io/github/actions/workflow/status/KevinYe0725/ielts-writing-coach/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/KevinYe0725/ielts-writing-coach/actions/workflows/ci.yml)
[![CodeQL](https://img.shields.io/github/actions/workflow/status/KevinYe0725/ielts-writing-coach/codeql.yml?branch=main&style=for-the-badge&label=CodeQL)](https://github.com/KevinYe0725/ielts-writing-coach/actions/workflows/codeql.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=for-the-badge)](./LICENSE)
[![Node.js >= 24.14](https://img.shields.io/badge/Node.js-%3E%3D24.14-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white)](./package.json)
[![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](./compose.yaml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](./CONTRIBUTING.md)

**English** · [简体中文](./README.zh-CN.md)

</div>

---

> [!IMPORTANT]
> Band scores are AI estimates, not official IELTS results. This project is independent and is not affiliated with or endorsed by IELTS, Cambridge University Press & Assessment, the British Council, or IDP.

IELTS Writing Coach turns each essay into a **complete learning cycle**: a timed first draft, evidence-based assessment, targeted active practice, delayed closed-book rewriting, version comparison, and later transfer checks. Write better essays — and actually remember what you learned.

## ✨ Why IELTS Writing Coach?

Most AI essay tools only correct your writing once. IELTS Writing Coach is built on the learning science of deliberate practice and spaced retrieval:

|                                       |                                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔍 **Evidence-linked scoring**        | Every TR / CC / LR / GRA estimate ships with quoted evidence from your essay, the rubric version, and an honest confidence level — so you know _why_, not just _what_. |
| 🎯 **Targeted active practice**       | Each lesson is generated from your essay's single highest-priority weakness and keeps you actively writing for at least 65% of the time — no passive video watching.   |
| ⏳ **Delayed, closed-book rewriting** | You rewrite Version 2 from memory after a real delay. Reading feedback is easy; recalling and applying it is what builds exam skills.                                  |
| 🔒 **Self-hosted & private**          | Runs on your own machine with Docker Compose. Provider keys stay server-side and are encrypted at rest. Your essays never leave your infrastructure.                   |

## 🔄 The learning loop

Every essay moves through the same seven steps:

```mermaid
flowchart LR
    A["📝 <b>Write</b><br/>timed 40-minute draft"] --> B["🔍 <b>Assess</b><br/>evidence-linked TR · CC · LR · GRA"]
    B --> C["🎯 <b>Practise</b><br/>targeted lesson on your weakest skill"]
    C --> D["⏳ <b>Rewrite</b><br/>closed-book, after a real delay"]
    D --> E["⚖️ <b>Compare</b><br/>Version 1 vs Version 2"]
    E --> F["🚀 <b>Transfer</b><br/>same skill, new topic"]
    F -.->|"repeat until retained"| A
```

| Criterion | What it measures                                             |
| --------- | ------------------------------------------------------------ |
| **TR**    | Task Response — do you fully answer the question?            |
| **CC**    | Coherence & Cohesion — is the argument organised and linked? |
| **LR**    | Lexical Resource — vocabulary range and precision            |
| **GRA**   | Grammatical Range & Accuracy — sentence variety and control  |

Skill progress is **evidence-gated**, not activity-gated:

```mermaid
flowchart LR
    X["🆕 Not proven"] --> Y["📚 <b>Applied</b><br/>used in guided practice"]
    Y --> Z["🧠 <b>Retained</b><br/>recalled after a delay"]
    Z --> W["🚀 <b>Transferred</b><br/>used in an unfamiliar context"]
```

A lesson can only ever prove `applied`. `retained` requires delayed, independent performance — and `transferred` requires using the skill in a new context. No false mastery.

## 🚀 What's inside

### ✍️ Writing & assessment

- A distraction-free **writing room** with a 40-minute timer and word count
- **120 built-in Task 2 questions** (8 topics × 5 question types), or paste your own prompt
- Four-criterion scoring (TR, CC, LR, GRA) with quoted evidence and an estimated half-band
- Rubric-version pinning, so every score is traceable to the exact rubric that produced it

### 🎯 Focused practice

- A personalised lesson built from the highest-priority issue found in _your_ essay
- Recognition and selection capped at 25%; at least 65% active output
- One required core objective per lesson — deep practice, not surface coverage

### ⏳ Retention & transfer

- Delayed, closed-book rewrite (Version 2) with honest assistance tracking
- Side-by-side **version comparison** using the same rubric version
- **Transfer checks** that test the same skill in an unfamiliar topic and surface form
- A growth view that summarises evidence per skill — never equating activity volume with mastery

### 🛠️ Platform

- **Web** — `today` dashboard, writing room, feedback reports, lessons, growth, settings
- **Admin** — account administration, SMTP testing, recovery-link management
- Bilingual interface: **English / 简体中文**
- 20+ AI provider presets plus any OpenAI-compatible endpoint, each probed before use
- Encrypted provider credentials, SMTP email support, health endpoints, encrypted backups

## 🏗️ Architecture

A modular monolith: one deployable, durable job queue, no Redis, no object store, no proprietary backend.

```mermaid
flowchart TB
    subgraph B["🖥️ Browser"]
        L["🧑‍🎓 Learner"]
        M["🛠️ Admin"]
    end
    subgraph S["Self-hosted stack"]
        W["@iwc/web<br/>Next.js"]
        K["@iwc/worker<br/>Graphile Worker"]
        P[("PostgreSQL 17<br/>data + durable job queue")]
        G["Shared packages<br/>ai · learning-core · contracts · auth · db · question-bank · exchange · email · config"]
    end
    I["🧠 20+ AI providers"]
    C["💻 Codex Skill<br/>coach-ielts-writing"]
    O["Local learner state<br/>.coach-ielts-writing"]

    L --> W
    M --> W
    W --> P
    W --> G
    W --> K
    K --> P
    K --> G
    K --> I
    G --> I
    C -.->|"standalone · Python 3.11 stdlib · no AI API"| O
```

| Layer           | Technology                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Web application | Next.js, React, TypeScript                                                                                |
| Background jobs | Graphile Worker (durable AI assessment & lesson jobs)                                                     |
| Database        | PostgreSQL 17 (application data + job queue)                                                              |
| Shared packages | `ai`, `learning-core`, `learning-contracts`, `auth`, `db`, `question-bank`, `exchange`, `email`, `config` |
| Packaging       | pnpm workspaces, Docker Compose, GHCR images                                                              |
| Quality         | ESLint, Prettier, Vitest, Playwright, CodeQL, DCO                                                         |

## 🚀 Quick start

Requirements: **Docker Engine with Docker Compose v2** and **OpenSSL**. That's it.

```bash
git clone https://github.com/KevinYe0725/ielts-writing-coach.git
cd ielts-writing-coach

cp .env.example .env
printf '\nPOSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" >> .env

docker compose up -d --build
docker compose logs bootstrap   # prints the one-time setup token
```

1. Open `http://127.0.0.1:3000/setup?token=YOUR_TOKEN`
2. Create the owner account and configure an AI provider
3. Verify readiness: `curl --fail http://127.0.0.1:3000/api/v1/health/ready`

> [!WARNING]
> Generated authentication, encryption, and setup secrets live in the `iwc_secrets` Docker volume. Keep that volume with your database backup — losing the encryption key makes persisted provider credentials unreadable. Read the [backup and restore runbook](./docs/operations/backup-restore.md) before storing real learner data.

Both the Web app and PostgreSQL bind to `127.0.0.1` by default. To publish through a maintained reverse proxy, set `IWC_BIND_ADDRESS` explicitly, configure HTTPS, and never expose PostgreSQL.

## 🧠 AI providers

Built-in presets for 21 providers, plus a custom option for any OpenAI-compatible endpoint. Every selected model is **probed before it becomes a scoring route**, and stored provider keys are never sent to browser-side code.

|              |                  |               |
| ------------ | ---------------- | ------------- |
| OpenAI       | Anthropic Claude | Google Gemini |
| DeepSeek     | Qwen             | Kimi          |
| GLM          | MiniMax          | Mistral       |
| xAI Grok     | Groq             | OpenRouter    |
| Together     | Fireworks        | Perplexity    |
| SiliconFlow  | NVIDIA NIM       | Cerebras      |
| Azure OpenAI | Ollama           | LM Studio     |

## ☁️ Deploy

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/n6tTY8)

| Target         | Support level                  | Configuration                                                                             |
| -------------- | ------------------------------ | ----------------------------------------------------------------------------------------- |
| Docker Compose | Tier 1                         | [`compose.yaml`](./compose.yaml)                                                          |
| Railway        | Tier 1                         | [`railway.web.toml`](./railway.web.toml) · [`railway.worker.toml`](./railway.worker.toml) |
| Render         | Community example, best effort | [`render.yaml`](./render.yaml)                                                            |

Tier 1 means documentation and configuration regressions for that target are release-blocking. Read the [deployment guide](./docs/deployment.md) before deploying — it covers service topology, shared secrets, migration ordering, and platform verification.

## 💻 Codex Skill

Prefer practicing in your terminal? The repository ships a **Codex Skill** that runs the same learning loop with no Web app and no AI API calls — Python 3.11 standard library only, learner state stored locally.

```text
Use $skill-installer to install https://github.com/KevinYe0725/ielts-writing-coach/tree/v1.0.0/.agents/skills/coach-ielts-writing
```

The Web app and the Skill share **versioned learning contracts**, so progress and mastery states are defined identically in both. Pin the release tag rather than installing mutable `main`.

## 🛠️ Local development

Requirements: Node.js 24.14+, pnpm 11.16, Docker Compose v2, OpenSSL.

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

Open `http://127.0.0.1:3000/setup?token=$SETUP_TOKEN`. Before opening a pull request:

```bash
pnpm validate
pnpm test:e2e
pnpm skill:validate
pnpm skill:forward:validate
```

## 🔐 Security & privacy

- Provider credentials are encrypted at rest with the operator-supplied `APP_ENCRYPTION_KEY`
- Outbound model requests are SSRF-guarded; API keys never reach the browser
- Fully encrypted `.iwc-backup` archives with versioned manifests and checksums
- Upgrade refuses to pull until a verified pre-upgrade backup passes

Please **do not place real essays, credentials, database dumps, or session cookies** in issues, fixtures, screenshots, or pull requests. For vulnerabilities, follow [SECURITY.md](./SECURITY.md) and do not open a public issue.

## 📚 Documentation

| Area           | Links                                                                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product        | [PRD](./IELTS_Writing_Web_PRD.md) · [v1.0.0 release notes](./docs/releases/v1.0.0.md) · [compatibility matrix](./docs/compatibility.md)                                                                                     |
| Knowledge base | [Scoring & diagnosis](./docs/knowledge-base/scoring-and-diagnosis.md) · [Feedback & revision](./docs/knowledge-base/feedback-and-revision.md) · [Focused teaching design](./docs/knowledge-base/focused-teaching-design.md) |
| Operations     | [Backup & restore](./docs/operations/backup-restore.md) · [Upgrading & rollback](./docs/operations/upgrading.md) · [Deployment](./docs/deployment.md)                                                                       |
| Quality        | [Human review protocol](./docs/quality/human-review-protocol.md) · [v1 quality evidence](./docs/quality/v1-quality-evidence.md) · [Accessibility review](./docs/quality/accessibility-review-v1.md)                         |
| Architecture   | [ADR 0001 — modular monolith](./docs/adr/0001-modular-monolith.md)                                                                                                                                                          |

Health endpoints: `/api/v1/health/live` (process liveness) and `/api/v1/health/ready` (configuration, migrations, database, fresh Worker heartbeat). Version metadata: `/api/version`.

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) first. Every commit requires a [Developer Certificate of Origin 1.1](./DCO.md) sign-off — no copyright assignment is requested.

## 📄 License

Source code and documentation are licensed under [Apache License 2.0](./LICENSE). Attribution information is in [NOTICE](./NOTICE).

---

<div align="center">

**If this project helps you prepare, give it a ⭐ and share it with a fellow test-taker.**

Built with ❤️ for learners everywhere. Not affiliated with or endorsed by IELTS, Cambridge, the British Council, or IDP.

</div>
