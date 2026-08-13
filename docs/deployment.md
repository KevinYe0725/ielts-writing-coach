# Deployment guide

This document defines the supported deployment topology and the difference between Tier 1 and community configurations. Always read [backup and restore](./operations/backup-restore.md) and [upgrading](./operations/upgrading.md) before storing important learner data. Compose binds Web and PostgreSQL to `127.0.0.1` by default. Set `IWC_BIND_ADDRESS` explicitly only when a maintained HTTPS reverse proxy or an intentionally trusted network should reach Web; never use it to publish PostgreSQL.

## Support matrix

| Target         | Level             | Expected use                                                  |
| -------------- | ----------------- | ------------------------------------------------------------- |
| Docker Compose | Tier 1            | local or single-host self-managed deployment                  |
| Railway        | Tier 1            | managed PostgreSQL with separate Web and Worker services      |
| Render         | Community example | starting point for operators comfortable adapting a Blueprint |

Tier 1 means that a documented, reproducible deployment regression is release-blocking for this project. It does not provide a hosting uptime or support SLA. Render is best effort and is not part of the release gate.

All production-style deployments use the same logical topology:

```text
browser -> Web -> PostgreSQL <- Worker -> AI provider
```

Web and Worker must use the same PostgreSQL database and the same `APP_ENCRYPTION_KEY`. Only Web is public. PostgreSQL and Worker should remain private.

## Required configuration

Generate independent values locally. Do not paste the command output into an issue or commit it to the repository.

```bash
openssl rand -base64 48  # AUTH_SECRET
openssl rand -base64 32  # APP_ENCRYPTION_KEY: decodes to exactly 32 bytes
openssl rand -base64 24  # SETUP_TOKEN
```

| Variable                     | Web                      | Worker       | Notes                                                        |
| ---------------------------- | ------------------------ | ------------ | ------------------------------------------------------------ |
| `DATABASE_URL`               | required                 | required     | same PostgreSQL database                                     |
| `APP_URL`                    | required                 | optional     | exact public HTTPS origin, with no extra path                |
| `AUTH_SECRET`                | required                 | optional     | at least 32 characters; changing it invalidates sessions     |
| `APP_ENCRYPTION_KEY`         | required                 | required     | identical Base64 32-byte value or 64-character hex value     |
| `APP_ENCRYPTION_KEY_VERSION` | required                 | required     | normally `1`; changing the number does not rotate ciphertext |
| `SETUP_TOKEN`                | required for first setup | no           | one-time owner-creation credential                           |
| `DEPLOYMENT_MODE`            | required                 | recommended  | `personal` or `shared`                                       |
| `WORKER_MODE`                | `standalone`             | `standalone` | cloud deployments use the separate Worker                    |
| `PORT`                       | `3000`                   | no           | pins Web to the Railway HTTP proxy port                      |
| `WEB_REPLICAS`               | required                 | no           | start with `1`                                               |
| `TRUST_PROXY_HOPS`           | public deployments       | no           | sanitized ingress hops; `0` ignores all forwarding headers   |
| `OPENAI_API_KEY`             | optional                 | optional     | required on both services only for environment-key routing   |
| SMTP variables               | optional                 | no           | needed for emailed password-recovery links                   |
| `TELEMETRY_ENABLED`          | recommended              | recommended  | defaults to `false`                                          |

When a provider key is saved through the UI, Web encrypts it and Worker decrypts it. Different encryption keys therefore cause background AI jobs to fail. Do not change `APP_ENCRYPTION_KEY` after credentials are stored unless a supported re-encryption migration is available.

## Docker Compose — Tier 1

The root [`compose.yaml`](../compose.yaml) runs bootstrap, PostgreSQL 17, the migration command, Web, and Worker. The migration container must finish successfully before Web and Worker start.

```bash
cp .env.example .env
printf '\nPOSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" >> .env
docker compose up -d --build
docker compose ps
docker compose logs bootstrap
curl --fail http://127.0.0.1:3000/api/v1/health/ready
```

The setup token is printed only when the secret volume is first created, although it remains in the local Docker log until logs are removed. Complete setup at `http://127.0.0.1:3000/setup?token=YOUR_TOKEN`.

Compose uses `/api/v1/health/ready` for the Web container health check. It stays
not-ready until PostgreSQL is reachable, the exact application migration
lineage is present, required instance secrets are valid, and a same-version
Worker has published a fresh heartbeat.

For a tagged public image, put a pinned tag or digest in `.env`, then pull before starting:

```dotenv
IWC_IMAGE=ghcr.io/kevinye0725/ielts-writing-coach:VERSION
```

```bash
docker compose pull
docker compose up -d
```

Do not use `latest` for data-bearing deployments. Do not run `docker compose down --volumes` during routine operation.

## Railway — Tier 1

Railway uses one managed PostgreSQL service and two services connected to this repository. The project is a shared monorepo, so keep the repository root as the build context.

The shortest supported path is the tested [IELTS Writing Coach Railway template](https://railway.com/deploy/n6tTY8). It creates PostgreSQL 17 and separate Web and Worker services with cross-service references, generated secrets, `PORT=3000`, and a public Web proxy already configured. Review the generated variables before deploying; Railway usage and billing remain the operator's responsibility.

For a manual deployment:

1. Create a Railway project and add PostgreSQL.
2. Add a `Web` service from this repository. Set its custom config-as-code path to `/railway.web.toml`.
3. Add a `Worker` service from the same repository. Set its custom config-as-code path to `/railway.worker.toml`.
4. Do not set either service's root directory to `apps/web` or `apps/worker`; the Docker build needs the complete workspace.
5. Give Web a public Railway domain, then set `APP_URL` to its exact `https://...` origin.
6. Set `DATABASE_URL` on both services to a Railway reference such as `${{Postgres.DATABASE_URL}}`, adjusting `Postgres` if the database service has another name.
7. Add the variables from the table above. `APP_ENCRYPTION_KEY` and its version must match on Web and Worker. Set Web's `TRUST_PROXY_HOPS=1` only after confirming the Railway edge is the sole direct ingress and sanitizes/appends `X-Forwarded-For`.

Railway supports custom config paths and pre-deploy commands; see its official [config-as-code](https://docs.railway.com/config-as-code) and [pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command) documentation.

### Railway migration ordering

Both Railway service files configure the released image's lock-aware migration wrapper as a pre-deploy command:

```text
node /app/docker/migrate-with-lock.mjs
```

The wrapper holds a PostgreSQL advisory lock while the isolated migration process runs. Web and Worker pre-deploy hooks may therefore overlap: one waits for the other, and each service starts only after its own hook succeeds. For the initial deployment and every schema-changing upgrade:

1. confirm both services still use their checked-in custom config path;
2. require every pre-deploy hook to exit successfully;
3. confirm Web and Worker run the same revision; and
4. confirm `https://YOUR_DOMAIN/api/v1/health/ready` returns HTTP 200.

Do not replace the wrapper with the uncoordinated migration entry point. The advisory lock depends on both services resolving the same `DATABASE_URL`.

### Railway verification

```bash
curl --fail https://YOUR_DOMAIN/api/v1/health/live
curl --fail https://YOUR_DOMAIN/api/v1/health/ready
```

Check that Web has one healthy instance, Worker remains running without restart loops, and both resolve the same database. Then complete `/setup?token=YOUR_SETUP_TOKEN` and run the provider connection test in the UI.

Railway's platform health check targets `/api/v1/health/live`. This avoids a
first-deployment deadlock on workspaces that serialize Web and Worker builds:
the platform can finish Web before starting Worker. This liveness probe is only
the platform startup gate. The deployment is not accepted until the public
`/api/v1/health/ready` check also reports current migrations, database access,
valid configuration, and a fresh same-version Worker heartbeat.

## Render — community example

[`render.yaml`](../render.yaml) is a best-effort Blueprint, not a Tier 1 target. It creates a Web service, a background Worker, and Render Postgres. Background workers, pre-deploy commands, database recovery, and the selected PostgreSQL plan can be billable; review current Render pricing before approving the Blueprint.

Render's official [Blueprint reference](https://render.com/docs/blueprint-spec) documents `sync: false`, generated secrets, database references, and `preDeployCommand`. The included Blueprint intentionally contains no secret values.

Before exposing the service:

1. deploy the Blueprint from your fork and review every resource and plan;
2. confirm Worker receives `APP_ENCRYPTION_KEY` from Web's generated value through the Blueprint's `fromService` reference;
3. replace Web's generated `SETUP_TOKEN` with a known, independently generated value before first-owner setup if the platform does not let you retrieve it safely;
4. verify Web's self-referenced `RENDER_EXTERNAL_URL` supplies its final `https://...onrender.com` origin; if users will access a custom domain, override `APP_URL` with that exact origin;
5. confirm both services use pre-deploy command `node /app/docker/migrate-with-lock.mjs` on plans that support it; and
6. confirm PostgreSQL's public inbound allowlist remains empty; and
7. verify that both deployments and migrations succeed.

Public deployments must also set `TRUST_PROXY_HOPS` to the number of ingress
proxies whose sanitized `X-Forwarded-For` chain Web should trust (normally `1`
for a single platform edge). A zero value deliberately ignores all forwarding
headers and uses one conservative shared unauthenticated rate-limit bucket.
Never set a non-zero value while clients can reach the Web container directly,
and verify the platform strips or appends—not blindly preserves—client-supplied
forwarding headers. Compose leaves this at `0` because it binds to loopback.

The Blueprint generates `AUTH_SECRET` on Web. It also uses Render's documented
base64-encoded 256-bit `generateValue` form for Web's `APP_ENCRYPTION_KEY`, then
copies that exact value into Worker through a `fromService` reference. Keep the
key version equal on both services. Do not override the encryption key on only
one service; Web and Worker must always read the same value.

For the default Render domain, the Blueprint self-references
`RENDER_EXTERNAL_URL` as `APP_URL`. If users will access a custom domain,
override `APP_URL` with that exact public HTTPS origin. The application uses
that origin for session trust, CSRF checks, invitation links, and
password-recovery links. It rejects any replacement encryption key that does
not decode to exactly 32 bytes.

Render's [deployment documentation](https://render.com/docs/deploys) states that pre-deploy commands are available for paid Web services and background workers. If your selected plan cannot run the migration command before deployment, treat the Blueprint as incomplete and do not use it for important data.

Render database backups and point-in-time recovery depend on the database and workspace plan. Follow Render's current [Postgres recovery and backup guide](https://render.com/docs/postgresql-backups) in addition to this project's logical-backup runbook.

The Blueprint also uses `/api/v1/health/ready`, not the liveness endpoint. The
Web service therefore requires both successful pre-deploy migrations and a
fresh heartbeat from the same-version background Worker before Render can mark
the deployment healthy.

## Post-deployment checks

For every target:

1. `/api/v1/health/live` returns HTTP 200;
2. `/api/v1/health/ready` returns HTTP 200 and reports database, migration lineage, configuration, and a fresh same-version Worker ready;
3. owner setup succeeds only with the intended setup token;
4. the provider connection test succeeds without exposing its key;
5. a synthetic training cycle can enqueue and complete an AI task; and
6. an operator can create and verify a backup.

The liveness endpoint does not query PostgreSQL and must not be used as the only release check. Readiness requires the exact application migration lineage and a fresh heartbeat from a same-version Graphile task executor. `/api/version` publishes the application, schema, teaching-contract, planner, prompt, rubric, and exchange versions. Readiness does not prove that an external AI provider or SMTP server is available, so test those separately in the administrator UI.
