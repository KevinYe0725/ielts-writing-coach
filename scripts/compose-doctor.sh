#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIRECTORY="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/compose-common.sh
source "${SCRIPT_DIRECTORY}/lib/compose-common.sh"

usage() {
  cat <<'EOF'
Usage: pnpm compose:doctor -- --project NAME [--dry-run]

Read-only checks for one exact IELTS Writing Coach Compose project:
  - rendered Compose config and project-scoped volumes;
  - PostgreSQL, Web, Worker, and one-shot migration container state;
  - internal /health/ready and /version responses;
  - current migration lineage and fresh same-version Worker heartbeat;
  - identical running Web/Worker image and OCI application version.

Options:
  --project NAME   Exact Compose project to inspect (required).
  --dry-run        Print the checks without calling Docker.
  --help           Show this help.
EOF
}

IWC_PROJECT=""
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
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      iwc_die "unsupported doctor argument: $1"
      ;;
  esac
done

[[ -n "${IWC_PROJECT}" ]] || iwc_die "--project is required"
iwc_validate_project "${IWC_PROJECT}"
if [[ "${DRY_RUN}" == true ]]; then
  iwc_print_plan \
    "read-only deployment doctor" \
    "checks: Compose config, exact volumes, PostgreSQL, migration exit, Web, Worker, readiness, version, image identity" \
    "mutations: none"
  exit 0
fi

iwc_require_commands
iwc_validate_compose_target
iwc_assert_no_unexpected_project_containers
iwc_assert_volume_identity iwc_postgres
iwc_assert_volume_identity iwc_secrets

POSTGRES_ID="$(iwc_container_id postgres)"
WEB_ID="$(iwc_container_id web)"
WORKER_ID="$(iwc_container_id worker)"
MIGRATE_ID="$(iwc_container_id migrate true)"
BOOTSTRAP_ID="$(iwc_container_id bootstrap true)"
iwc_assert_container_identity "${POSTGRES_ID}" postgres
iwc_assert_container_identity "${WEB_ID}" web
iwc_assert_container_identity "${WORKER_ID}" worker
iwc_assert_container_identity "${MIGRATE_ID}" migrate
iwc_assert_container_identity "${BOOTSTRAP_ID}" bootstrap

[[ "$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' "${POSTGRES_ID}")" == "running|healthy" ]] ||
  iwc_die "PostgreSQL is not running and healthy"
[[ "$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' "${WEB_ID}")" == "running|healthy" ]] ||
  iwc_die "Web is not running and healthy"
[[ "$(docker inspect --format '{{.State.Status}}|{{.RestartCount}}' "${WORKER_ID}")" == "running|0" ]] ||
  iwc_die "Worker is not stable or has restarted"
[[ "$(docker inspect --format '{{.State.Status}}|{{.State.ExitCode}}' "${MIGRATE_ID}")" == "exited|0" ]] ||
  iwc_die "the migration container did not exit successfully"
[[ "$(docker inspect --format '{{.State.Status}}|{{.State.ExitCode}}' "${BOOTSTRAP_ID}")" == "exited|0" ]] ||
  iwc_die "the bootstrap container did not exit successfully"
[[ "$(docker inspect --format '{{.Image}}' "${WEB_ID}")" == "$(docker inspect --format '{{.Image}}' "${WORKER_ID}")" ]] ||
  iwc_die "Web and Worker are not running the same image"

METADATA="$(iwc_runtime_metadata)"
APPLICATION_VERSION="$(jq -er '.applicationVersion' <<<"${METADATA}")"
IMAGE_VERSION="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' "${WEB_ID}")"
[[ "${IMAGE_VERSION#v}" == "${APPLICATION_VERSION#v}" ]] ||
  iwc_die "running image label ${IMAGE_VERSION} disagrees with API version ${APPLICATION_VERSION}"

iwc_log "PASS: Compose project ${IWC_PROJECT} is operational"
iwc_log "application: ${APPLICATION_VERSION}"
iwc_log "database schema: $(jq -er '.databaseSchemaVersion' <<<"${METADATA}")"
iwc_log "PostgreSQL: $(jq -er '.database.postgresVersion' <<<"${METADATA}")"
iwc_log "readiness includes current migrations and a fresh same-version Worker heartbeat"
