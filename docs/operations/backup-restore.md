# Backup and restore runbook

Back up IELTS Writing Coach before every upgrade and on a regular schedule appropriate for the amount of learner work you can afford to lose. A backup is complete only when it includes both PostgreSQL and the secrets/configuration needed to use that database.

## What must be protected

| Asset                                              | Why it matters                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| PostgreSQL logical dump                            | accounts, essays, learning state, jobs, configuration, and encrypted provider credentials |
| `APP_ENCRYPTION_KEY` and version                   | decrypts persisted provider credentials                                                   |
| `AUTH_SECRET`                                      | protects authentication state                                                             |
| `POSTGRES_PASSWORD` or managed database credential | allows the services to reconnect                                                          |
| deployment version or image digest                 | makes a like-for-like restore possible                                                    |
| SMTP and environment-provider credentials, if used | external integration configuration                                                        |

The setup token is sensitive even after initial setup and should remain protected. A CycleBundle export is useful for learner portability but is not a substitute for a full database backup.

Store backups outside the live host or cloud project, encrypt them at rest, restrict access, and define a retention policy. Never commit a dump, secret archive, `.env`, or provider key.

## Docker Compose backup

The database can remain online while `pg_dump` creates a transactionally consistent logical dump. The generated secret volume is effectively static, but archive it in the same backup set so the dump and encryption key cannot be separated.

Use the supported wrapper from the repository root. It requires an exact Compose
project, validates the rendered services and project-scoped volume names, requires
full readiness (including current migrations and a fresh same-version Worker),
checks disk capacity, creates and verifies a PostgreSQL 17 custom-format dump, and
never prints an instance secret:

```bash
pnpm compose:backup -- --help
pnpm compose:backup -- --project ielts-writing-coach
```

The interactive prompt is hidden and asks for the passphrase twice. Automation
must provide a private, one-line file instead of placing a passphrase in argv or
an environment variable:

```bash
pnpm compose:backup -- \
  --project ielts-writing-coach \
  --passphrase-file /secure/iwc-backup-passphrase \
  --output /secure/ielts-writing-coach-2026-08-13.iwc-backup
```

Without `--output`, the wrapper creates a new mode-`0600` file under the
gitignored `backups/` directory and a matching `.sha256` sidecar. The
`.iwc-backup` encrypts the complete payload—including essays and database rows—
with scrypt and AES-256-GCM. Its authenticated inner payload contains exactly:

- `database.dump`, a verified PostgreSQL custom-format logical dump;
- `manifest.json`, recording the backup/application/schema/PostgreSQL versions,
  database size, file checksums, encryption scope, and omitted external config;
- `secrets.enc.json`, a second passphrase-encrypted envelope for `AUTH_SECRET`,
  `APP_ENCRYPTION_KEY`, its positive version, and `SETUP_TOKEN`.

The manifest never contains plaintext secrets, `.env`, `DATABASE_URL`, SMTP
credentials, or environment-managed provider credentials. Preserve those omitted
settings separately in an encrypted secret manager. Keep the backup passphrase
outside the host and archive; losing it makes the backup unrecoverable.

### Verify the Compose backup

The backup command already verifies the dump catalog, secret structure, inner
file hashes, outer authenticated encryption, and archive SHA-256 as it creates the
file. Copy both output files off-host, then verify the transport checksum without
decrypting the archive:

```bash
(cd /secure && shasum -a 256 -c ielts-writing-coach-2026-08-13.iwc-backup.sha256)
```

Periodically restore into a separately named, isolated project. A checksum alone
does not prove that the passphrase, dump, application image, or restored service
topology works.

## Docker Compose restore

> [!WARNING]
> The following procedure replaces the named secret volume and the `iwc` database in the current Compose project. Confirm the repository path, backup path, Compose project, and target host before running it. Stop if the target contains data you still need.

For the most predictable recovery, configure the same `IWC_IMAGE` application
version and `APP_ENCRYPTION_KEY_VERSION` recorded by the backup. Prefer a new,
isolated project, validate it, and only then perform any separately backed-up
upgrade. Restore is deliberately project-bound and requires a literal confirmation:

```bash
pnpm compose:restore -- --help
pnpm compose:restore -- \
  --project iwc-recovery \
  --archive /secure/ielts-writing-coach-2026-08-13.iwc-backup \
  --confirm "RESTORE iwc-recovery"
```

For non-interactive recovery, also pass `--passphrase-file /secure/path`. Before
any mutation, the wrapper:

1. authenticates and decrypts the complete archive into a private temporary path;
2. rejects extra paths, links, non-canonical files, malformed manifests, wrong
   checksums, unsupported format/PostgreSQL, and app/schema version mismatch;
3. proves sufficient temporary and target-volume disk space;
4. validates the PostgreSQL custom dump catalog in an isolated read-only utility
   container; and
5. decrypts and strictly validates the exact five-field secret object without
   printing it.

Only after preflight succeeds does it stop/remove the five known application
services, replace exactly `<project>_iwc_secrets`, replace only database `iwc` in
that project, restore the dump, and start with `--no-build`. It never runs a broad
`docker compose down --volumes`, wildcard volume deletion, or Docker prune. It
then runs the supported doctor, which requires migrations plus a fresh
same-version Worker heartbeat and matching Web/Worker images.

```bash
pnpm compose:doctor -- --project iwc-recovery
```

Sign in, open several synthetic or authorized learner records, and complete a provider connection test plus one background job. Do not declare the restore complete from the health endpoint alone.

## Managed PostgreSQL backup

Use the hosting provider's point-in-time recovery in addition to portable logical backups. Run PostgreSQL 17 client tools, matching the Compose server major version where possible:

```bash
export IWC_BACKUP_DIR="$PWD/backups/2026-08-13T120000Z"
mkdir -p "$IWC_BACKUP_DIR"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl \
  > "$IWC_BACKUP_DIR/database.dump"
pg_restore --list "$IWC_BACKUP_DIR/database.dump" > /dev/null
shasum -a 256 "$IWC_BACKUP_DIR/database.dump" \
  > "$IWC_BACKUP_DIR/database.dump.sha256"
```

Obtain `DATABASE_URL` through the provider's secure environment or CLI. Avoid placing it directly in shell history. Export the required Web and Worker secrets to an encrypted operator-controlled secret manager; a managed database snapshot does not contain cloud environment variables.

For recovery, prefer creating a new empty managed PostgreSQL database, restoring into it, validating it in isolation, and then changing both Web and Worker to the new URL:

```bash
pg_restore --dbname="$RESTORE_DATABASE_URL" --exit-on-error \
  --no-owner --no-acl "$IWC_BACKUP_DIR/database.dump"
```

`RESTORE_DATABASE_URL` must identify a newly created, empty recovery database. Never point this command at an unrelated or production database. Apply the original shared encryption key and version to both services before testing provider credentials.

Railway and Render backup availability, retention, and point-in-time recovery depend on the current provider plan. Provider snapshots complement this logical dump; they do not replace the off-platform copy.

## Restore acceptance checklist

- Checksums match the archived values.
- PostgreSQL restore completed with no ignored errors.
- Web readiness reports both configuration and database ready.
- Web and Worker use the same restored database and encryption key version.
- Owner sign-in works; changing `AUTH_SECRET` may require signing in again.
- Authorized essay, lesson, rewrite, and skill-history samples are present.
- A provider test and a queued AI job complete successfully.
- The restored deployment is backed up again after any subsequent migration.

## Automated clean-instance recovery gate

Maintainers can exercise the v1 Compose recovery path end to end from the
repository root:

```bash
pnpm test:recovery-script
./scripts/verify-compose-backup-restore.sh
```

When CI has already built and loaded the candidate image, reuse that exact
artifact and prevent a second build:

```bash
IWC_RECOVERY_IMAGE="iwc-ci:${GITHUB_SHA}" \
  ./scripts/verify-compose-backup-restore.sh
```

All Compose starts inside the gate use `--no-build`; if the named image is not
local, the script pulls it instead of building source implicitly.

The gate builds one disposable image from the current source tree, unless
`IWC_RECOVERY_IMAGE` names an already available image. It then:

1. creates cryptographically unique source and restore Compose project names;
2. binds Web and PostgreSQL to four non-default loopback ports;
3. uses four project-scoped, separately named volumes;
4. starts Web and proves Worker operation by having it consume a queue probe;
5. inserts synthetic training-cycle, delayed-task, and skill-evidence records;
6. backs up PostgreSQL plus the three generated secret files and records their
   checksums and ownership modes;
7. removes the complete source project before creating the restore project;
8. restores into clean PostgreSQL and secret volumes; and
9. compares the protected learning-data fingerprint and secret checksums before
   checking Web and Worker again.

Success and failure both remove only the two randomly named test projects,
their volumes, the temporary backup, and any image built by the script. The
script snapshots the metadata of the default Compose volumes and the local
`iwc-browser-postgres` container, when present, and fails if that protected
state changes. It never uses the default project name, ports, or volumes.

This v1.0 gate is a **same-build backup/restore baseline**. Until an earlier
stable release exists, it is not evidence that a cross-version upgrade or
rollback has passed. After a stable release exists, upgrade compatibility must
be exercised as a separate, version-pinned gate following the upgrade runbook.
