#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIRECTORY="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(CDPATH= cd -- "${SCRIPT_DIRECTORY}/.." && pwd)"
readonly COMPOSE_FILE="${REPOSITORY_ROOT}/compose.yaml"
readonly SENTINEL_SQL="${REPOSITORY_ROOT}/tests/deployment/fixtures/recovery-sentinel.sql"
readonly FINGERPRINT_SQL="${REPOSITORY_ROOT}/tests/deployment/fixtures/recovery-fingerprint.sql"
readonly UTILITY_IMAGE="postgres:17.6-bookworm"
readonly DEFAULT_POSTGRES_VOLUME="ielts-writing-coach_iwc_postgres"
readonly DEFAULT_SECRETS_VOLUME="ielts-writing-coach_iwc_secrets"
readonly BROWSER_POSTGRES_CONTAINER="iwc-browser-postgres"

RUN_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(6).toString("hex"))')"
SOURCE_PROJECT="iwc-rec-src-${RUN_TOKEN}"
RESTORE_PROJECT="iwc-rec-dst-${RUN_TOKEN}"
SOURCE_POSTGRES_VOLUME="${SOURCE_PROJECT}_iwc_postgres"
SOURCE_SECRETS_VOLUME="${SOURCE_PROJECT}_iwc_secrets"
RESTORE_POSTGRES_VOLUME="${RESTORE_PROJECT}_iwc_postgres"
RESTORE_SECRETS_VOLUME="${RESTORE_PROJECT}_iwc_secrets"
WORK_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/iwc-recovery-gate.XXXXXXXX")"
BACKUP_DIRECTORY="${WORK_DIRECTORY}/backup"
SOURCE_FINGERPRINT="${WORK_DIRECTORY}/source-fingerprint.json"
RESTORE_FINGERPRINT="${WORK_DIRECTORY}/restore-fingerprint.json"
SOURCE_SECRETS_FINGERPRINT="${BACKUP_DIRECTORY}/secrets.files.sha256"
RESTORE_SECRETS_FINGERPRINT="${WORK_DIRECTORY}/restore-secrets.files.sha256"
SOURCE_SECRETS_METADATA="${BACKUP_DIRECTORY}/secrets.files.metadata"
RESTORE_SECRETS_METADATA="${WORK_DIRECTORY}/restore-secrets.files.metadata"
IMAGE_OWNED=false
SOURCE_WEB_PORT=""
SOURCE_POSTGRES_PORT=""
RESTORE_WEB_PORT=""
RESTORE_POSTGRES_PORT=""
POSTGRES_PASSWORD="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("base64url"))')"
PROTECTED_STATE_BEFORE=""

if [[ -n "${IWC_RECOVERY_IMAGE:-}" ]]; then
  GATE_IMAGE="${IWC_RECOVERY_IMAGE}"
else
  GATE_IMAGE="iwc-recovery-gate:${RUN_TOKEN}"
  IMAGE_OWNED=true
fi

log() {
  printf '[compose-recovery] %s\n' "$*"
}

die() {
  printf '[compose-recovery] ERROR: %s\n' "$*" >&2
  exit 1
}

validate_project_name() {
  local project="$1"
  [[ "${project}" =~ ^iwc-rec-(src|dst)-[0-9a-f]{12}$ ]] ||
    die "refusing unsafe Compose project name: ${project}"
}

validate_owned_volume_name() {
  local volume="$1"
  [[ "${volume}" =~ ^iwc-rec-(src|dst)-[0-9a-f]{12}_iwc_(postgres|secrets)$ ]] ||
    die "refusing unsafe volume name: ${volume}"
  [[ "${volume}" != "${DEFAULT_POSTGRES_VOLUME}" ]] || die "default PostgreSQL volume resolved as a test target"
  [[ "${volume}" != "${DEFAULT_SECRETS_VOLUME}" ]] || die "default secret volume resolved as a test target"
}

validate_work_directory() {
  [[ "${WORK_DIRECTORY}" == "${TMPDIR:-/tmp}/iwc-recovery-gate."* ]] ||
    die "refusing unsafe temporary directory: ${WORK_DIRECTORY}"
}

resource_count_for_project() {
  local project="$1"
  local count
  count="$({
    docker ps -aq --filter "label=com.docker.compose.project=${project}"
    docker network ls -q --filter "label=com.docker.compose.project=${project}"
    docker volume ls -q --filter "label=com.docker.compose.project=${project}"
  } | sed '/^$/d' | wc -l | tr -d ' ')"
  printf '%s' "${count}"
}

assert_project_absent() {
  local project="$1"
  [[ "$(resource_count_for_project "${project}")" == "0" ]] ||
    die "random Compose project already has Docker resources: ${project}"
}

protected_state() {
  local volume
  local container
  volume="$({ docker volume inspect --format '{{.Name}}|{{.CreatedAt}}|{{json .Labels}}|{{json .Options}}' "${DEFAULT_POSTGRES_VOLUME}" 2>/dev/null || printf 'ABSENT'; })"
  volume+=$'\n'
  volume+="$({ docker volume inspect --format '{{.Name}}|{{.CreatedAt}}|{{json .Labels}}|{{json .Options}}' "${DEFAULT_SECRETS_VOLUME}" 2>/dev/null || printf 'ABSENT'; })"
  container="$({ docker inspect --type container --format '{{.Id}}|{{.State.StartedAt}}|{{.RestartCount}}|{{.State.Status}}' "${BROWSER_POSTGRES_CONTAINER}" 2>/dev/null || printf 'ABSENT'; })"
  printf '%s\n%s' "${volume}" "${container}"
}

choose_port() {
  node <<'NODE'
const net = require("node:net");
const server = net.createServer();
server.unref();
server.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
  const address = server.address();
  if (typeof address === "string" || address === null) process.exitCode = 1;
  else process.stdout.write(String(address.port));
  server.close();
});
NODE
}

choose_unique_ports() {
  local candidate
  local duplicate
  local used
  local -a selected=()
  while ((${#selected[@]} < 4)); do
    candidate="$(choose_port)"
    [[ "${candidate}" =~ ^[0-9]+$ ]] || die "failed to allocate a test port"
    [[ "${candidate}" != "3000" && "${candidate}" != "5432" && "${candidate}" != "5433" ]] || continue
    duplicate=false
    if ((${#selected[@]} > 0)); then
      for used in "${selected[@]}"; do
        [[ "${used}" == "${candidate}" ]] && duplicate=true
      done
    fi
    if [[ "${duplicate}" == false ]]; then
      selected+=("${candidate}")
    fi
  done
  SOURCE_WEB_PORT="${selected[0]}"
  SOURCE_POSTGRES_PORT="${selected[1]}"
  RESTORE_WEB_PORT="${selected[2]}"
  RESTORE_POSTGRES_PORT="${selected[3]}"
}

compose_source() {
  APP_URL="http://127.0.0.1:${SOURCE_WEB_PORT}" \
    IWC_BIND_ADDRESS="127.0.0.1" \
    IWC_IMAGE="${GATE_IMAGE}" \
    IWC_PORT="${SOURCE_WEB_PORT}" \
    IWC_POSTGRES_PORT="${SOURCE_POSTGRES_PORT}" \
    POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
    docker compose --file "${COMPOSE_FILE}" --project-name "${SOURCE_PROJECT}" "$@"
}

compose_restore() {
  APP_URL="http://127.0.0.1:${RESTORE_WEB_PORT}" \
    IWC_BIND_ADDRESS="127.0.0.1" \
    IWC_IMAGE="${GATE_IMAGE}" \
    IWC_PORT="${RESTORE_WEB_PORT}" \
    IWC_POSTGRES_PORT="${RESTORE_POSTGRES_PORT}" \
    POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
    docker compose --file "${COMPOSE_FILE}" --project-name "${RESTORE_PROJECT}" "$@"
}

cleanup_project() {
  local project="$1"
  local kind="$2"
  validate_project_name "${project}"
  if [[ "${kind}" == "source" ]]; then
    compose_source down --volumes --remove-orphans --timeout 10 >/dev/null 2>&1 || true
  else
    compose_restore down --volumes --remove-orphans --timeout 10 >/dev/null 2>&1 || true
  fi
}

cleanup() {
  local status="$1"
  trap - EXIT INT TERM
  cleanup_project "${SOURCE_PROJECT}" source
  cleanup_project "${RESTORE_PROJECT}" restore
  if [[ "${IMAGE_OWNED}" == true ]]; then
    docker image rm "${GATE_IMAGE}" >/dev/null 2>&1 || true
  fi
  if [[ -d "${WORK_DIRECTORY}" ]]; then
    validate_work_directory
    rm -rf -- "${WORK_DIRECTORY}"
  fi
  if [[ "$(protected_state)" != "${PROTECTED_STATE_BEFORE}" ]]; then
    printf '[compose-recovery] ERROR: protected default resources changed during the isolated gate\n' >&2
    status=1
  fi
  if [[ "$(resource_count_for_project "${SOURCE_PROJECT}")" != "0" || "$(resource_count_for_project "${RESTORE_PROJECT}")" != "0" ]]; then
    printf '[compose-recovery] ERROR: isolated Docker resources remain after cleanup\n' >&2
    status=1
  fi
  if [[ ${status} -eq 0 ]]; then
    log "PASS: backup and clean-instance restore verified; isolated resources removed"
  else
    log "FAIL: recovery gate did not pass; isolated resources were cleaned"
  fi
  exit "${status}"
}

trap 'cleanup "$?"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

wait_for_postgres() {
  local kind="$1"
  local attempt
  for attempt in $(seq 1 60); do
    if [[ "${kind}" == "source" ]]; then
      if compose_source exec -T postgres pg_isready -U iwc -d iwc >/dev/null 2>&1; then return 0; fi
    else
      if compose_restore exec -T postgres pg_isready -U iwc -d iwc >/dev/null 2>&1; then return 0; fi
    fi
    sleep 2
  done
  die "${kind} PostgreSQL did not become ready"
}

wait_for_web() {
  local port="$1"
  local attempt
  local body
  for attempt in $(seq 1 90); do
    if body="$(curl --fail --silent --show-error "http://127.0.0.1:${port}/api/v1/health/ready" 2>/dev/null)"; then
      if node -e '
        const body = JSON.parse(process.argv[1]);
        if (
          body.status !== "ready" ||
          body.checks?.database !== true ||
          body.checks?.migrations !== true ||
          body.checks?.configuration !== true ||
          body.checks?.task_executor !== true
        ) process.exit(1);
      ' "${body}"; then
        return 0
      fi
    fi
    sleep 2
  done
  die "Web readiness did not pass on isolated port ${port}"
}

assert_worker_running() {
  local kind="$1"
  local container_id
  local state
  local stable_state
  if [[ "${kind}" == "source" ]]; then
    container_id="$(compose_source ps -q worker)"
  else
    container_id="$(compose_restore ps -q worker)"
  fi
  [[ -n "${container_id}" ]] || die "${kind} Worker container was not created"
  state="$(docker inspect --format '{{.State.Status}}|{{.RestartCount}}' "${container_id}")"
  [[ "${state}" == "running|0" ]] || die "${kind} Worker is not stable (state ${state})"
  sleep 3
  stable_state="$(docker inspect --format '{{.State.Status}}|{{.RestartCount}}' "${container_id}")"
  [[ "${stable_state}" == "running|0" ]] || die "${kind} Worker entered a restart loop (state ${stable_state})"
}

probe_worker() {
  local kind="$1"
  local key="recovery-probe-${kind}-${RUN_TOKEN}"
  local remaining
  local attempt
  if [[ "${kind}" == "source" ]]; then
    compose_source exec -T postgres psql -X -v ON_ERROR_STOP=1 -U iwc -d iwc -qAtc \
      "SELECT id FROM graphile_worker.add_job(identifier := 'dispatch_notifications', payload := '{}'::json, max_attempts := 1, job_key := '${key}');" >/dev/null
  else
    compose_restore exec -T postgres psql -X -v ON_ERROR_STOP=1 -U iwc -d iwc -qAtc \
      "SELECT id FROM graphile_worker.add_job(identifier := 'dispatch_notifications', payload := '{}'::json, max_attempts := 1, job_key := '${key}');" >/dev/null
  fi
  for attempt in $(seq 1 60); do
    if [[ "${kind}" == "source" ]]; then
      remaining="$(compose_source exec -T postgres psql -X -v ON_ERROR_STOP=1 -U iwc -d iwc -qAtc "SELECT count(*) FROM graphile_worker.jobs WHERE key = '${key}';")"
    else
      remaining="$(compose_restore exec -T postgres psql -X -v ON_ERROR_STOP=1 -U iwc -d iwc -qAtc "SELECT count(*) FROM graphile_worker.jobs WHERE key = '${key}';")"
    fi
    [[ "${remaining}" == "0" ]] && return 0
    sleep 1
  done
  die "${kind} Worker did not consume the queue readiness probe"
}

assert_expected_volume() {
  local volume="$1"
  local project="$2"
  local purpose="$3"
  local actual_project
  local actual_purpose
  validate_owned_volume_name "${volume}"
  actual_project="$(docker volume inspect --format '{{index .Labels "com.docker.compose.project"}}' "${volume}")"
  actual_purpose="$(docker volume inspect --format '{{index .Labels "com.docker.compose.volume"}}' "${volume}")"
  [[ "${actual_project}" == "${project}" && "${actual_purpose}" == "${purpose}" ]] ||
    die "volume ownership label mismatch for ${volume}"
}

write_secret_manifests() {
  local volume="$1"
  local checksum_path="$2"
  local metadata_path="$3"
  local output_directory
  local checksum_name
  local metadata_name
  output_directory="$(dirname -- "${checksum_path}")"
  checksum_name="$(basename -- "${checksum_path}")"
  metadata_name="$(basename -- "${metadata_path}")"
  docker run --rm --entrypoint /bin/sh \
    --volume "${volume}:/source:ro" \
    --volume "${output_directory}:/output" \
    "${UTILITY_IMAGE}" -eu -c '
      cd /source
      for file in auth_secret encryption_key setup_token; do
        test -s "${file}"
        sha256sum "${file}"
      done | sort -k2 > "/output/'"${checksum_name}"'"
      for file in auth_secret encryption_key setup_token; do
        stat -c "%n|%u|%g|%a" "${file}"
      done | sort > "/output/'"${metadata_name}"'"
    '
}

archive_secrets() {
  local volume="$1"
  docker run --rm --entrypoint /bin/sh \
    --volume "${volume}:/source:ro" \
    --volume "${BACKUP_DIRECTORY}:/backup" \
    "${UTILITY_IMAGE}" -eu -c '
      cd /source
      test -s auth_secret
      test -s encryption_key
      test -s setup_token
      tar -czf /backup/secrets.tar.gz auth_secret encryption_key setup_token
    '
}

restore_secrets() {
  local volume="$1"
  docker run --rm --entrypoint /bin/sh \
    --volume "${volume}:/target" \
    --volume "${BACKUP_DIRECTORY}:/backup:ro" \
    "${UTILITY_IMAGE}" -eu -c '
      test "$(tar -tzf /backup/secrets.tar.gz | sort | tr "\n" " ")" = "auth_secret encryption_key setup_token "
      tar --same-owner -C /target -xzf /backup/secrets.tar.gz
    '
}

write_backup_checksums() {
  docker run --rm --entrypoint /bin/sh \
    --volume "${BACKUP_DIRECTORY}:/backup" \
    "${UTILITY_IMAGE}" -eu -c '
      cd /backup
      sha256sum database.dump secrets.tar.gz secrets.files.sha256 secrets.files.metadata > SHA256SUMS
      sha256sum -c SHA256SUMS >/dev/null
      pg_restore --list database.dump >/dev/null
    '
}

verify_backup_checksums() {
  docker run --rm --entrypoint /bin/sh \
    --volume "${BACKUP_DIRECTORY}:/backup:ro" \
    "${UTILITY_IMAGE}" -eu -c '
      cd /backup
      sha256sum -c SHA256SUMS >/dev/null
      pg_restore --list database.dump >/dev/null
    '
}

validate_project_name "${SOURCE_PROJECT}"
validate_project_name "${RESTORE_PROJECT}"
for volume in "${SOURCE_POSTGRES_VOLUME}" "${SOURCE_SECRETS_VOLUME}" "${RESTORE_POSTGRES_VOLUME}" "${RESTORE_SECRETS_VOLUME}"; do
  validate_owned_volume_name "${volume}"
done
validate_work_directory
[[ -f "${COMPOSE_FILE}" && -f "${SENTINEL_SQL}" && -f "${FINGERPRINT_SQL}" ]] || die "required repository files are missing"
command -v docker >/dev/null || die "docker is required"
command -v node >/dev/null || die "Node.js is required"
command -v curl >/dev/null || die "curl is required"
docker info >/dev/null 2>&1 || die "Docker daemon is unavailable"
docker compose version >/dev/null || die "Docker Compose v2 is required"
assert_project_absent "${SOURCE_PROJECT}"
assert_project_absent "${RESTORE_PROJECT}"
PROTECTED_STATE_BEFORE="$(protected_state)"
mkdir -p "${BACKUP_DIRECTORY}"
choose_unique_ports

log "isolated source project: ${SOURCE_PROJECT} (Web ${SOURCE_WEB_PORT}, PostgreSQL ${SOURCE_POSTGRES_PORT})"
log "isolated restore project: ${RESTORE_PROJECT} (Web ${RESTORE_WEB_PORT}, PostgreSQL ${RESTORE_POSTGRES_PORT})"

if [[ "${IMAGE_OWNED}" == true ]]; then
  log "building one disposable application image from the current v1 source tree"
  docker build --tag "${GATE_IMAGE}" "${REPOSITORY_ROOT}"
else
  log "using caller-provided image ${GATE_IMAGE}"
  docker image inspect "${GATE_IMAGE}" >/dev/null 2>&1 || docker pull "${GATE_IMAGE}"
fi

log "starting the isolated source instance"
compose_source up -d --no-build
wait_for_postgres source
wait_for_web "${SOURCE_WEB_PORT}"
assert_worker_running source
probe_worker source
assert_expected_volume "${SOURCE_POSTGRES_VOLUME}" "${SOURCE_PROJECT}" iwc_postgres
assert_expected_volume "${SOURCE_SECRETS_VOLUME}" "${SOURCE_PROJECT}" iwc_secrets

log "inserting representative training, scheduling, and skill-state records"
compose_source exec -T postgres psql -X -v ON_ERROR_STOP=1 -U iwc -d iwc < "${SENTINEL_SQL}"
compose_source exec -T postgres psql -X -v ON_ERROR_STOP=1 -U iwc -d iwc -qAt < "${FINGERPRINT_SQL}" > "${SOURCE_FINGERPRINT}"
[[ -s "${SOURCE_FINGERPRINT}" ]] || die "source data fingerprint is empty"

log "creating and independently verifying the logical database and secret backup"
compose_source exec -T postgres pg_dump -U iwc -d iwc --format=custom --no-owner --no-acl > "${BACKUP_DIRECTORY}/database.dump"
archive_secrets "${SOURCE_SECRETS_VOLUME}"
write_secret_manifests "${SOURCE_SECRETS_VOLUME}" "${SOURCE_SECRETS_FINGERPRINT}" "${SOURCE_SECRETS_METADATA}"
write_backup_checksums

log "destroying the source project before clean-instance recovery"
cleanup_project "${SOURCE_PROJECT}" source
[[ "$(resource_count_for_project "${SOURCE_PROJECT}")" == "0" ]] || die "source resources remain before restore"
docker volume inspect "${SOURCE_POSTGRES_VOLUME}" >/dev/null 2>&1 && die "source PostgreSQL volume survived cleanup"
docker volume inspect "${SOURCE_SECRETS_VOLUME}" >/dev/null 2>&1 && die "source secret volume survived cleanup"

log "creating fresh, separately named restore volumes"
verify_backup_checksums
compose_restore create --no-build postgres bootstrap >/dev/null
assert_expected_volume "${RESTORE_POSTGRES_VOLUME}" "${RESTORE_PROJECT}" iwc_postgres
assert_expected_volume "${RESTORE_SECRETS_VOLUME}" "${RESTORE_PROJECT}" iwc_secrets
restore_secrets "${RESTORE_SECRETS_VOLUME}"

log "restoring the database into the clean PostgreSQL volume"
compose_restore up -d --no-build postgres
wait_for_postgres restore
compose_restore exec -T postgres pg_restore -U iwc -d iwc --exit-on-error --no-owner --no-acl < "${BACKUP_DIRECTORY}/database.dump"

log "starting restored Web and Worker services"
compose_restore up -d --no-build
wait_for_web "${RESTORE_WEB_PORT}"
assert_worker_running restore
probe_worker restore

log "comparing protected learning data and secret checksums"
compose_restore exec -T postgres psql -X -v ON_ERROR_STOP=1 -U iwc -d iwc -qAt < "${FINGERPRINT_SQL}" > "${RESTORE_FINGERPRINT}"
cmp --silent "${SOURCE_FINGERPRINT}" "${RESTORE_FINGERPRINT}" || die "restored training/scheduling/skill fingerprint differs from the source"
write_secret_manifests "${RESTORE_SECRETS_VOLUME}" "${RESTORE_SECRETS_FINGERPRINT}" "${RESTORE_SECRETS_METADATA}"
cmp --silent "${SOURCE_SECRETS_FINGERPRINT}" "${RESTORE_SECRETS_FINGERPRINT}" || die "restored secret checksums differ from the source"
cmp --silent "${SOURCE_SECRETS_METADATA}" "${RESTORE_SECRETS_METADATA}" || die "restored secret ownership or modes differ from the source"

log "v1 baseline recovery assertions passed; this does not claim a cross-version upgrade"
