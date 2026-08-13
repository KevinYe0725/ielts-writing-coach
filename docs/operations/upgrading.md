# Upgrade and rollback runbook

Treat an IELTS Writing Coach upgrade as an application-plus-database change. The migration command is forward-only: an older image is not guaranteed to understand a schema that a newer image has migrated.

For the first v1.0 release there is no earlier stable application release to
upgrade from. The automated Compose recovery gate therefore establishes only a
same-build clean-restore baseline; it must not be reported as a successful
cross-version upgrade. Add a version-pinned previous-release fixture and a
separate upgrade assertion after the first stable release exists.

## Before every upgrade

1. Read all release notes between the current and target versions.
2. Confirm the target's Node, PostgreSQL, configuration, and learning-contract requirements.
3. Record the current image tag and immutable digest.
4. Create and verify a complete [database and secret backup](./backup-restore.md).
5. Confirm that `APP_ENCRYPTION_KEY` and `APP_ENCRYPTION_KEY_VERSION` are identical on Web and Worker.
6. Choose a maintenance window and stop new learner submissions if the release notes require downtime.

Do not combine an application upgrade, PostgreSQL major-version upgrade, encryption-key change, and hosting migration into one untested step.

## Docker Compose upgrade

Pin the target release in `.env`. Prefer an immutable digest for production; a version tag is easier to read but can only be trusted if release publishing keeps it immutable.

```dotenv
IWC_IMAGE=ghcr.io/kevinye0725/ielts-writing-coach:VERSION
```

Use the supported wrapper with the exact project, the same persisted image
reference, and the project/image-bound confirmation. It runs the deployment
doctor first, then requires a verified encrypted backup to complete before any
pull. It pulls only the four application services, starts with `--no-build`,
waits for readiness, and reruns the doctor plus image/API version comparison:

```bash
pnpm compose:upgrade -- --help
pnpm compose:upgrade -- \
  --project ielts-writing-coach \
  --image ghcr.io/kevinye0725/ielts-writing-coach:1.0.0 \
  --confirm "UPGRADE ielts-writing-coach TO ghcr.io/kevinye0725/ielts-writing-coach:1.0.0"
```

The rendered Compose config must already resolve Web, Worker, migration, and
bootstrap to that exact `--image`; normally this means persisting `IWC_IMAGE` in
`.env` first. Moving `latest`, `local`, or branch tags are refused. Automation can
pass `--passphrase-file`; `--backup-output` selects the new pre-upgrade archive.

`compose.yaml` starts the one-shot migration service after PostgreSQL is healthy and starts Web and Worker only after migration succeeds. If backup, pull, migration, readiness, or the post-upgrade doctor fails, preserve the logs and backup and do not bypass the dependency. The wrapper does not claim an automatic rollback: use the project-bound restore procedure after evaluating writes accepted since the backup.

For a source build instead of a published image:

```bash
git fetch --tags --prune
git checkout VERSION
pnpm install --frozen-lockfile
docker compose up -d --build
```

Use a tag or reviewed commit in place of `VERSION`; do not deploy an unreviewed moving branch to a data-bearing instance.

## Railway upgrade

Both checked-in Railway service files run the lock-aware pre-deploy command `node /app/docker/migrate-with-lock.mjs`. It serializes overlapping callers with a PostgreSQL advisory lock. Upgrade as follows:

1. back up the managed PostgreSQL database and cloud environment secrets;
2. deploy Web and Worker at the same target revision;
3. require both pre-deploy hooks to succeed;
4. verify Web readiness; and
5. confirm Worker is running the same revision without restart loops.

Do not replace the wrapper with an uncoordinated migration command. Confirm the custom config paths remain `/railway.web.toml` and `/railway.worker.toml` after platform changes and that both services resolve the same `DATABASE_URL`.

## Render community upgrade

Render is a community configuration. Review current Render plan features before each upgrade. Back up Render Postgres and the environment secrets, keep both services on the same commit, and require their checked-in lock-aware pre-deploy hooks to succeed before verifying Web and Worker.

If the selected plan does not support pre-deploy commands, do not perform a schema-changing upgrade in place. Restore or clone the database into a staging project, test the target version there, and plan an explicit cutover.

## Post-upgrade acceptance

Health checks are necessary but not sufficient. Verify all of the following before ending the maintenance window:

- `/api/v1/health/live` and `/api/v1/health/ready` return HTTP 200;
- the running Web and Worker use the intended tag or digest;
- migration logs show success and no restart loop is present;
- owner sign-in and an authorized historical learning cycle load;
- the AI provider connection test succeeds;
- one synthetic Version 1 job reaches a terminal successful state;
- a lesson response and delayed-task view still load; and
- a fresh post-migration backup can be created and inspected.

## Rollback decision

### Application-only release with no migration

If release notes confirm that no database or persisted-contract migration ran, pin the previous image and restart:

```bash
docker compose pull
docker compose up -d
curl --fail http://127.0.0.1:3000/api/v1/health/ready
```

The `.env` file must already reference the previous version before those commands run.

### Release that ran a migration

Do not point an older image at the migrated database unless the release notes explicitly declare that combination compatible. The safe rollback is:

1. stop Web and Worker;
2. restore the pre-upgrade database and matching secret/configuration backup;
3. pin the previous application image; and
4. run the complete restore acceptance checklist.

Follow [backup and restore](./backup-restore.md) for the exact recovery procedure. Any writes accepted after the pre-upgrade backup must be reconciled separately; restoring the backup discards them.

## Encryption-key changes are not ordinary upgrades

Changing `APP_ENCRYPTION_KEY` or only incrementing `APP_ENCRYPTION_KEY_VERSION` does not re-encrypt stored provider secrets. Existing ciphertext will become unreadable if the old key is removed. Until a release provides a documented key-rotation command, retain the existing key or remove and re-enter provider credentials in a controlled maintenance procedure after verifying what data is affected.
