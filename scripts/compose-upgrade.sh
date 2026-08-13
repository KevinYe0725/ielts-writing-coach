#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIRECTORY="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/compose-common.sh
source "${SCRIPT_DIRECTORY}/lib/compose-common.sh"

usage() {
  cat <<'EOF'
Usage: pnpm compose:upgrade -- --project NAME --image IMAGE --confirm TEXT [options]

Back up, pull, and upgrade one exact IELTS Writing Coach Compose project.

Required:
  --project NAME
  --image IMAGE              Pinned semantic-version tag or sha256 digest.
  --confirm "UPGRADE NAME TO IMAGE"

Options:
  --backup-output FILE       New pre-upgrade .iwc-backup path.
  --passphrase-file FILE     Forward a private passphrase file to backup.
  --dry-run                  Print ordering without calling Docker or writing.
  --help                     Show this help.

The rendered Compose config must already resolve IWC_IMAGE to IMAGE. This
prevents a temporary shell override from disappearing after the command exits.
The verified backup must succeed before any pull or deployment is attempted.
EOF
}

IWC_PROJECT=""
TARGET_IMAGE=""
CONFIRMATION=""
BACKUP_OUTPUT=""
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
    --image)
      (($# >= 2)) || iwc_die "--image requires a value"
      TARGET_IMAGE="$2"
      shift 2
      ;;
    --confirm)
      (($# >= 2)) || iwc_die "--confirm requires a value"
      CONFIRMATION="$2"
      shift 2
      ;;
    --backup-output)
      (($# >= 2)) || iwc_die "--backup-output requires a value"
      BACKUP_OUTPUT="$2"
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
      iwc_die "unsupported upgrade argument: $1"
      ;;
  esac
done

[[ -n "${IWC_PROJECT}" ]] || iwc_die "--project is required"
iwc_validate_project "${IWC_PROJECT}"
[[ -n "${TARGET_IMAGE}" ]] || iwc_die "--image is required"
iwc_validate_image_reference "${TARGET_IMAGE}"
EXPECTED_CONFIRMATION="UPGRADE ${IWC_PROJECT} TO ${TARGET_IMAGE}"
[[ "${CONFIRMATION}" == "${EXPECTED_CONFIRMATION}" ]] ||
  iwc_die "confirmation must be exactly: ${EXPECTED_CONFIRMATION}"
if [[ -n "${BACKUP_OUTPUT}" && "${BACKUP_OUTPUT}" != *.iwc-backup ]]; then
  iwc_die "--backup-output must end with .iwc-backup"
fi

if [[ "${DRY_RUN}" == true ]]; then
  iwc_print_plan \
    "backup-first pinned-image upgrade" \
    "target image: ${TARGET_IMAGE}" \
    "ordering: doctor -> verified encrypted backup -> pull -> up/migrate -> readiness -> doctor" \
    "rollback artifact: ${BACKUP_OUTPUT:-private backups/ default}"
  exit 0
fi

iwc_require_commands
iwc_validate_compose_target
RESOLVED_IMAGE="$(iwc_rendered_value '.services.web.image')"
[[ "${RESOLVED_IMAGE}" == "${TARGET_IMAGE}" ]] ||
  iwc_die "rendered Web image is ${RESOLVED_IMAGE}; persist IWC_IMAGE=${TARGET_IMAGE} before upgrading"

"${SCRIPT_DIRECTORY}/compose-doctor.sh" --project "${IWC_PROJECT}"
BACKUP_ARGUMENTS=(--project "${IWC_PROJECT}")
if [[ -n "${BACKUP_OUTPUT}" ]]; then
  BACKUP_ARGUMENTS+=(--output "${BACKUP_OUTPUT}")
fi
if [[ -n "${PASSPHRASE_FILE}" ]]; then
  BACKUP_ARGUMENTS+=(--passphrase-file "${PASSPHRASE_FILE}")
fi
"${SCRIPT_DIRECTORY}/compose-backup.sh" "${BACKUP_ARGUMENTS[@]}"

iwc_log "verified backup complete; pulling the pinned application image"
iwc_compose pull bootstrap migrate web worker
PULLED_VERSION="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' "${TARGET_IMAGE}")"
[[ -n "${PULLED_VERSION}" && "${PULLED_VERSION}" != "<no value>" ]] ||
  iwc_die "target image lacks an application-version OCI label"
iwc_compose up -d --no-build --wait --wait-timeout 180
"${SCRIPT_DIRECTORY}/compose-doctor.sh" --project "${IWC_PROJECT}"
RUNNING_VERSION="$(iwc_fetch_from_web /api/v1/version | jq -er '.application')"
[[ "${RUNNING_VERSION#v}" == "${PULLED_VERSION#v}" ]] ||
  iwc_die "running application version ${RUNNING_VERSION} does not match pulled image ${PULLED_VERSION}"
iwc_log "PASS: project ${IWC_PROJECT} upgraded to ${TARGET_IMAGE}"
