# Contributing to IELTS Writing Coach

Thank you for helping improve IELTS Writing Coach. Contributions of code, tests, documentation, accessibility fixes, learning-contract examples, and reproducible bug reports are welcome.

By participating, you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Report security problems privately under [SECURITY.md](./SECURITY.md), not in a public issue.

## Before you start

Open an issue before investing in a material product, schema, public API, learning-contract, rubric, or mastery-rule change. A small bug fix or documentation correction can normally go directly to a pull request.

Never include any of the following in a branch, issue, test fixture, screenshot, log, or pull request:

- real learner essays or account data;
- provider credentials, setup tokens, session cookies, or encryption keys;
- production database dumps or unredacted telemetry; or
- copyrighted exam questions that the project is not allowed to redistribute.

Use original synthetic examples. If a failure depends on private content, reduce it to the smallest invented reproduction before sharing it.

## Development setup

Requirements: Node.js 24.14 or newer, pnpm 11.16, Python 3.11 or newer,
PyYAML 6.0.3 for the maintainer Skill validator, Docker Compose v2, and
OpenSSL. The installed Skill itself uses only the Python standard library;
PyYAML is a repository validation dependency, not a learner runtime dependency.

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

Open `http://127.0.0.1:3000/setup?token=$SETUP_TOKEN`. The Compose PostgreSQL host port is `5433`; this is why the development `DATABASE_URL` differs from the container-to-container URL.

## Make a focused change

1. Create a branch from an up-to-date `main`.
2. Keep unrelated formatting and refactors out of the change.
3. Add or update tests for every behavior change.
4. Update user, operator, API, or contract documentation when behavior changes.
5. Run the checks below.
6. Sign off every commit under the DCO.

Database changes must be forward-compatible with a rolling Web/Worker deployment. Never edit an already released migration; add a new migration and test both a clean database and an upgrade from the previous release.

Learning-contract, rubric, prompt, exchange-format, and mastery-rule changes require:

- an explicit version decision;
- golden or regression fixtures that exercise the changed rule;
- compatibility treatment for previously persisted evidence and exports; and
- synchronized behavior between the Web application and `coach-ielts-writing` Skill where the contract is shared.

AI-generated output must be validated against deterministic schemas before persistence. Tests must not depend on a paid provider or a live network response.

## Verify the change

The normal repository gate is:

```bash
pnpm validate
```

It runs formatting checks, linting, TypeScript checks, and package tests. Also run the checks relevant to the change:

```bash
pnpm test:e2e
pnpm skill:validate
pnpm skill:forward:validate
docker compose build
```

Run `pnpm test:e2e` for learner flows or browser-visible behavior, `pnpm skill:validate` and `pnpm skill:forward:validate` for Skill or shared learning-contract changes, and `docker compose build` for image or deployment changes. A maintainer deliberately runs the paid/model-backed `pnpm skill:forward` suite when the final Skill digest changes; ordinary pull requests should not call a paid model automatically. In the pull request, list exactly which commands ran and any check that could not be run.

## Developer Certificate of Origin

This project uses the [Developer Certificate of Origin 1.1](./DCO.md), not a copyright-assignment agreement. A sign-off certifies that you have the right to submit the contribution under the repository's open-source license. It is not the same as cryptographically signing a commit.

Create a signed-off commit with:

```bash
git commit --signoff -m "Describe the change"
```

Git adds a line in this form using your configured identity:

```text
Signed-off-by: Your Name <your.email@example.com>
```

The name and email must identify the contributor and must match an identity you are authorized to use. Every non-merge commit in the pull request is checked. To repair your most recent commit:

```bash
git commit --amend --signoff --no-edit
```

To add sign-offs while rebasing several local commits:

```bash
git rebase --signoff origin/main
```

Review the rewritten history before force-pushing, and use `--force-with-lease`, never an unconditional force push. Do not add another person's sign-off without their authorization.

## Pull request checklist

- The change has one clear purpose and links any relevant issue or decision.
- New behavior has tests and user/operator documentation where needed.
- No secret, real essay, private user data, or unlicensed question is included.
- Contract and migration compatibility is explained.
- `pnpm validate` and relevant additional checks are reported.
- Every commit contains a valid `Signed-off-by` line.

Maintainers may ask for commits to be split, squashed, or amended before merge. Contributions accepted into the project are licensed under [Apache License 2.0](./LICENSE), subject to the contribution terms in that license and the DCO certification.
