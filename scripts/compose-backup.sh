#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIRECTORY="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/compose-common.sh
source "${SCRIPT_DIRECTORY}/lib/compose-common.sh"

usage() {
  cat <<'EOF'
Usage: pnpm compose:backup -- --project NAME [options]

Create a verified, fully encrypted IELTS Writing Coach Compose backup.

Required:
  --project NAME             Exact Compose project to inspect and back up.

Options:
  --output FILE              New .iwc-backup file. Default: private backups/.
  --passphrase-file FILE     Read the passphrase from a private one-line file.
                             Without it, an interactive hidden prompt is used.
  --dry-run                  Print the resolved plan; do not call Docker or write.
  --help                     Show this help.

The command never prints secrets. It writes database.dump, manifest.json, and
secrets.enc.json into an encrypted .iwc-backup archive plus a SHA-256 sidecar.
EOF
}

IWC_PROJECT=""
OUTPUT_PATH=""
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
    --output)
      (($# >= 2)) || iwc_die "--output requires a value"
      OUTPUT_PATH="$2"
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
      iwc_die "unsupported backup argument: $1"
      ;;
  esac
done

[[ -n "${IWC_PROJECT}" ]] || iwc_die "--project is required"
iwc_validate_project "${IWC_PROJECT}"
if [[ -z "${OUTPUT_PATH}" ]]; then
  OUTPUT_PATH="${IWC_REPOSITORY_ROOT}/backups/${IWC_PROJECT}-$(date -u +%Y%m%dT%H%M%SZ).iwc-backup"
fi
[[ "${OUTPUT_PATH}" == *.iwc-backup ]] || iwc_die "--output must end with .iwc-backup"
[[ "${OUTPUT_PATH}" != *$'\n'* && "${OUTPUT_PATH}" != *$'\r'* ]] ||
  iwc_die "--output contains a line break"

if [[ "${DRY_RUN}" == true ]]; then
  iwc_print_plan \
    "verified encrypted backup" \
    "output: ${OUTPUT_PATH}" \
    "checks: exact Compose services/volumes, readiness, version, Worker, disk, pg_restore catalog, archive SHA-256" \
    "archive: fully encrypted .iwc-backup with encrypted secret envelope"
  exit 0
fi

iwc_require_commands
iwc_validate_compose_target
"${SCRIPT_DIRECTORY}/compose-doctor.sh" --project "${IWC_PROJECT}"
POSTGRES_ID="$(iwc_container_id postgres)"
WEB_ID="$(iwc_container_id web)"
iwc_assert_container_identity "${POSTGRES_ID}" postgres
iwc_assert_container_identity "${WEB_ID}" web
[[ "$(docker inspect --format '{{.State.Status}}' "${POSTGRES_ID}")" == "running" ]] ||
  iwc_die "PostgreSQL must be running"
[[ "$(docker inspect --format '{{.State.Status}}' "${WEB_ID}")" == "running" ]] ||
  iwc_die "Web must be running"
iwc_assert_volume_identity iwc_postgres
iwc_assert_volume_identity iwc_secrets

WORK_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/iwc-compose-backup.XXXXXXXX")"
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

iwc_make_passphrase_file "${PASSPHRASE_FILE}" true
METADATA_PATH="${WORK_DIRECTORY}/metadata.json"
iwc_runtime_metadata > "${METADATA_PATH}"
chmod 600 "${METADATA_PATH}"
DATABASE_BYTES="$(jq -er '.database.sizeBytes' "${METADATA_PATH}")"
REQUIRED_BYTES=$((DATABASE_BYTES * 2 + 320 * 1024 * 1024))
(
  cd -- "${IWC_REPOSITORY_ROOT}"
  pnpm exec tsx "${IWC_ARCHIVE_HELPER}" \
    check-space --path "${WORK_DIRECTORY}" --bytes "${REQUIRED_BYTES}"
) >/dev/null

iwc_log "creating a transactionally consistent PostgreSQL custom-format dump"
iwc_compose exec -T postgres \
  pg_dump -U iwc -d iwc --format=custom --compress=6 --no-owner --no-acl --no-password \
  > "${WORK_DIRECTORY}/database.dump"
chmod 600 "${WORK_DIRECTORY}/database.dump"
iwc_compose exec -T postgres pg_restore --list \
  < "${WORK_DIRECTORY}/database.dump" >/dev/null

SECRETS_DIRECTORY="${WORK_DIRECTORY}/secrets"
mkdir -m 700 "${SECRETS_DIRECTORY}"
for secret_file in auth_secret encryption_key setup_token; do
  docker cp "${WEB_ID}:/run/iwc-secrets/${secret_file}" \
    "${SECRETS_DIRECTORY}/${secret_file}" >/dev/null
  chmod 600 "${SECRETS_DIRECTORY}/${secret_file}"
done

RESULT_PATH="${WORK_DIRECTORY}/result.json"
(
  cd -- "${IWC_REPOSITORY_ROOT}"
  pnpm exec tsx "${IWC_ARCHIVE_HELPER}" seal \
    --work-dir "${WORK_DIRECTORY}" \
    --metadata "${METADATA_PATH}" \
    --secrets-dir "${SECRETS_DIRECTORY}" \
    --passphrase-file "${IWC_ACTIVE_PASSPHRASE_FILE}" \
    --output "${OUTPUT_PATH}"
) > "${RESULT_PATH}"

VERIFICATION_DIRECTORY="${WORK_DIRECTORY}/verified"
mkdir -m 700 "${VERIFICATION_DIRECTORY}"
(
  cd -- "${IWC_REPOSITORY_ROOT}"
  pnpm exec tsx "${IWC_ARCHIVE_HELPER}" open \
    --archive "${OUTPUT_PATH}" \
    --output-dir "${VERIFICATION_DIRECTORY}" \
    --passphrase-file "${IWC_ACTIVE_PASSPHRASE_FILE}"
) > "${WORK_DIRECTORY}/verification.json"
iwc_compose exec -T postgres pg_restore --list \
  < "${VERIFICATION_DIRECTORY}/database.dump" >/dev/null
[[ "$(jq -er '.archiveSha256' "${WORK_DIRECTORY}/verification.json")" == "$(jq -er '.archiveSha256' "${RESULT_PATH}")" ]] ||
  iwc_die "sealed backup verification returned a different archive checksum"

iwc_log "PASS: encrypted backup created"
iwc_log "archive: $(jq -er '.archive' "${RESULT_PATH}")"
iwc_log "archive SHA-256: $(jq -er '.archiveSha256' "${RESULT_PATH}")"
iwc_log "checksum sidecar: $(jq -er '.archive' "${RESULT_PATH}").sha256"
