#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIRECTORY="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/compose-common.sh
source "${SCRIPT_DIRECTORY}/lib/compose-common.sh"

usage() {
  cat <<'EOF'
Usage: pnpm compose:restore -- --project NAME --archive FILE --confirm TEXT [options]

Restore one fully encrypted .iwc-backup into one exact Compose project.

Required:
  --project NAME             Exact target Compose project.
  --archive FILE             Existing .iwc-backup archive.
  --confirm "RESTORE NAME"   Literal confirmation bound to the target project.

Options:
  --passphrase-file FILE     Read the passphrase from a private one-line file.
                             Without it, an interactive hidden prompt is used.
  --dry-run                  Print the resolved plan; do not decrypt or call Docker.
  --help                     Show this help.

Before changing the project, the command authenticates the outer archive,
validates the exact tar members, manifest, checksums, app/schema/PostgreSQL
compatibility, disk capacity, custom dump catalog, and strict secret fields.
It removes only NAME_iwc_secrets and replaces only database "iwc".
EOF
}

IWC_PROJECT=""
ARCHIVE_PATH=""
CONFIRMATION=""
PASSPHRASE_FILE=""
DRY_RUN=false
while (($# > 0)); do
  case "$1" in
    --)
      shift
      ;;
    --project)
      (($# >= 2)) || iwc_die "--project requires a value"
      IWC_PROJECT="$2"
      shift 2
      ;;
    --archive)
      (($# >= 2)) || iwc_die "--archive requires a value"
      ARCHIVE_PATH="$2"
      shift 2
      ;;
    --confirm)
      (($# >= 2)) || iwc_die "--confirm requires a value"
      CONFIRMATION="$2"
      shift 2
      ;;
    --passphrase-file)
      (($# >= 2)) || iwc_die "--passphrase-file requires a value"
      PASSPHRASE_FILE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      iwc_die "unsupported restore argument: $1"
      ;;
  esac
done

[[ -n "${IWC_PROJECT}" ]] || iwc_die "--project is required"
iwc_validate_project "${IWC_PROJECT}"
[[ -n "${ARCHIVE_PATH}" ]] || iwc_die "--archive is required"
[[ "${ARCHIVE_PATH}" == *.iwc-backup ]] || iwc_die "--archive must end with .iwc-backup"
EXPECTED_CONFIRMATION="RESTORE ${IWC_PROJECT}"
[[ "${CONFIRMATION}" == "${EXPECTED_CONFIRMATION}" ]] ||
  iwc_die "confirmation must be exactly: ${EXPECTED_CONFIRMATION}"

if [[ "${DRY_RUN}" == true ]]; then
  iwc_print_plan \
    "verified project-bound restore" \
    "archive: ${ARCHIVE_PATH}" \
    "preflight: decrypt/authenticate, exact members, manifest, checksums, compatibility, disk, dump catalog, secrets" \
    "exact mutations: known service containers, ${IWC_PROJECT}_iwc_secrets, database iwc" \
    "acceptance: migrations, readiness, same-version Worker, version/image identity"
  exit 0
fi

[[ -f "${ARCHIVE_PATH}" && ! -L "${ARCHIVE_PATH}" ]] ||
  iwc_die "--archive must name a regular, non-symlink file"
iwc_require_commands
iwc_validate_compose_target
iwc_assert_no_unexpected_project_containers

WORK_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/iwc-compose-restore.XXXXXXXX")"
chmod 700 "${WORK_DIRECTORY}"
IWC_TEMP_PASSPHRASE_FILE=""
cleanup() {
  local status="$?"
  trap - EXIT INT TERM
  iwc_remove_temporary_passphrase
  iwc_remove_work_directory "${WORK_DIRECTORY}"
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

iwc_make_passphrase_file "${PASSPHRASE_FILE}" false
SUMMARY_PATH="${WORK_DIRECTORY}/summary.json"
(
  cd -- "${IWC_REPOSITORY_ROOT}"
  pnpm exec tsx "${IWC_ARCHIVE_HELPER}" open \
    --archive "${ARCHIVE_PATH}" \
    --output-dir "${WORK_DIRECTORY}" \
    --passphrase-file "${IWC_ACTIVE_PASSPHRASE_FILE}"
) > "${SUMMARY_PATH}"

EXPECTED_VERSION="$(jq -er '.applicationVersion' "${SUMMARY_PATH}")"
EXPECTED_KEY_VERSION="$(jq -er '.encryptionKeyVersion' "${SUMMARY_PATH}")"
CONFIGURED_KEY_VERSION="$(iwc_rendered_value '.services.web.environment.APP_ENCRYPTION_KEY_VERSION')"
[[ "${CONFIGURED_KEY_VERSION}" == "${EXPECTED_KEY_VERSION}" ]] ||
  iwc_die "Compose APP_ENCRYPTION_KEY_VERSION ${CONFIGURED_KEY_VERSION} does not match backup ${EXPECTED_KEY_VERSION}"
APP_IMAGE="$(iwc_rendered_value '.services.web.image')"
POSTGRES_IMAGE="$(iwc_rendered_value '.services.postgres.image')"
docker image inspect "${APP_IMAGE}" >/dev/null 2>&1 ||
  iwc_die "matching application image is not local; set IWC_IMAGE and run docker compose pull before restore"
APP_IMAGE_VERSION="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' "${APP_IMAGE}")"
[[ "${APP_IMAGE_VERSION#v}" == "${EXPECTED_VERSION#v}" ]] ||
  iwc_die "configured image version ${APP_IMAGE_VERSION} does not match backup ${EXPECTED_VERSION}"

docker run --rm --network none --read-only --user 0 \
  --volume "${WORK_DIRECTORY}/database.dump:/backup/database.dump:ro" \
  --entrypoint pg_restore "${POSTGRES_IMAGE}" --list /backup/database.dump >/dev/null

POSTGRES_VOLUME="${IWC_PROJECT}_iwc_postgres"
SECRETS_VOLUME="${IWC_PROJECT}_iwc_secrets"
if docker volume inspect "${POSTGRES_VOLUME}" >/dev/null 2>&1; then
  iwc_assert_volume_identity iwc_postgres
  AVAILABLE_KIB="$(docker run --rm --network none --read-only --user 0 \
    --volume "${POSTGRES_VOLUME}:/target:ro" --entrypoint /bin/sh "${POSTGRES_IMAGE}" \
    -eu -c "df -Pk /target | awk 'NR == 2 {print \$4}'")"
  [[ "${AVAILABLE_KIB}" =~ ^[0-9]+$ ]] || iwc_die "could not determine target-volume free space"
  REQUIRED_BYTES=$(( $(jq -er '.databaseSizeBytes' "${SUMMARY_PATH}") * 2 + 256 * 1024 * 1024 ))
  ((AVAILABLE_KIB * 1024 >= REQUIRED_BYTES)) || iwc_die "target PostgreSQL volume lacks restore capacity"
fi
if docker volume inspect "${SECRETS_VOLUME}" >/dev/null 2>&1; then
  iwc_assert_volume_identity iwc_secrets
fi

iwc_log "preflight PASS; stopping only the five known services in project ${IWC_PROJECT}"
for service in web worker migrate bootstrap postgres; do
  CONTAINER_ID="$(iwc_container_id "${service}" true)"
  if [[ -n "${CONTAINER_ID}" ]]; then
    iwc_assert_container_identity "${CONTAINER_ID}" "${service}"
    iwc_compose stop "${service}" >/dev/null
    iwc_compose rm -f -s "${service}" >/dev/null
  fi
done
if docker volume inspect "${SECRETS_VOLUME}" >/dev/null 2>&1; then
  iwc_assert_volume_identity iwc_secrets
  docker volume rm "${SECRETS_VOLUME}" >/dev/null
fi
iwc_compose create --no-build postgres bootstrap >/dev/null
iwc_assert_volume_identity iwc_postgres
iwc_assert_volume_identity iwc_secrets

docker run --rm --network none --read-only --user 0 \
  --volume "${SECRETS_VOLUME}:/target" \
  --volume "${WORK_DIRECTORY}/secrets:/source:ro" \
  --entrypoint /bin/sh "${APP_IMAGE}" -eu -c '
    umask 077
    for file in auth_secret encryption_key setup_token; do
      test -s "/source/${file}"
      cp "/source/${file}" "/target/${file}"
      chown 1001:1001 "/target/${file}"
      chmod 600 "/target/${file}"
    done
  '

iwc_compose up -d --no-build --wait --wait-timeout 120 postgres
POSTGRES_ID="$(iwc_container_id postgres)"
iwc_assert_container_identity "${POSTGRES_ID}" postgres
iwc_compose exec -T postgres dropdb --if-exists --force -U iwc iwc
iwc_compose exec -T postgres createdb -U iwc -O iwc iwc
iwc_compose exec -T postgres \
  pg_restore -U iwc -d iwc --exit-on-error --no-owner --no-acl --no-password \
  < "${WORK_DIRECTORY}/database.dump"

iwc_compose up -d --no-build --wait --wait-timeout 180
"${SCRIPT_DIRECTORY}/compose-doctor.sh" --project "${IWC_PROJECT}"
iwc_log "PASS: archive restored into exact project ${IWC_PROJECT}"
iwc_log "archive SHA-256: $(jq -er '.archiveSha256' "${SUMMARY_PATH}")"
