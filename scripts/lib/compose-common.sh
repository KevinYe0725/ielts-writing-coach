#!/usr/bin/env bash

# Shared, source-only helpers for the supported Compose operator commands.

readonly IWC_OPERATIONS_SCRIPT_DIRECTORY="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly IWC_REPOSITORY_ROOT="$(CDPATH= cd -- "${IWC_OPERATIONS_SCRIPT_DIRECTORY}/.." && pwd)"
readonly IWC_COMPOSE_FILE="${IWC_REPOSITORY_ROOT}/compose.yaml"
readonly IWC_ARCHIVE_HELPER="${IWC_OPERATIONS_SCRIPT_DIRECTORY}/compose-archive.ts"

iwc_log() {
  printf '[iwc-compose] %s\n' "$*"
}

iwc_die() {
  printf '[iwc-compose] ERROR: %s\n' "$*" >&2
  exit 1
}

iwc_validate_project() {
  local project="$1"
  [[ "${project}" =~ ^[a-z0-9][a-z0-9_-]{0,62}$ ]] ||
    iwc_die "--project must be 1-63 lowercase letters, digits, dashes, or underscores and start alphanumeric"
}

iwc_validate_image_reference() {
  local image="$1"
  [[ ${#image} -ge 2 && ${#image} -le 512 && "${image}" =~ ^[A-Za-z0-9] ]] ||
    iwc_die "target image reference has an invalid length or prefix"
  case "${image}" in
    *[!A-Za-z0-9._:/@+-]*)
      iwc_die "target image reference contains unsupported characters"
      ;;
  esac
  [[ "${image}" != *":latest" && "${image}" != *":local" ]] ||
    iwc_die "upgrade target must be a pinned version tag or digest, not latest/local"
  [[ "${image}" =~ @sha256:[a-f0-9]{64}$ || "${image}" =~ :v?[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] ||
    iwc_die "upgrade target must end in a semantic-version tag or immutable sha256 digest"
}

iwc_require_commands() {
  local command
  for command in docker jq node pnpm tar; do
    command -v "${command}" >/dev/null 2>&1 || iwc_die "required command is unavailable: ${command}"
  done
  docker compose version >/dev/null 2>&1 || iwc_die "Docker Compose v2 is required"
}

iwc_compose() {
  docker compose --file "${IWC_COMPOSE_FILE}" --project-name "${IWC_PROJECT}" "$@"
}

iwc_rendered_value() {
  local expression="$1"
  iwc_compose config --format json | jq -er "${expression}"
}

iwc_validate_compose_target() {
  local services
  local logical
  local resolved
  local expected
  iwc_compose config --quiet
  services="$(iwc_compose config --services)"
  for logical in bootstrap postgres migrate web worker; do
    printf '%s\n' "${services}" | grep -qx "${logical}" ||
      iwc_die "Compose service is missing: ${logical}"
  done
  for logical in iwc_postgres iwc_secrets; do
    resolved="$(iwc_rendered_value ".volumes.${logical}.name")"
    expected="${IWC_PROJECT}_${logical}"
    [[ "${resolved}" == "${expected}" ]] ||
      iwc_die "refusing non-project-scoped volume ${resolved}; expected ${expected}"
  done
  local web_image
  web_image="$(iwc_rendered_value '.services.web.image')"
  for logical in bootstrap migrate worker; do
    [[ "$(iwc_rendered_value ".services.${logical}.image")" == "${web_image}" ]] ||
      iwc_die "bootstrap, migrate, Web, and Worker must resolve to one image"
  done
}

iwc_container_id() {
  local service="$1"
  local include_stopped="${2:-false}"
  if [[ "${include_stopped}" == true ]]; then
    iwc_compose ps -aq "${service}"
  else
    iwc_compose ps -q "${service}"
  fi
}

iwc_assert_container_identity() {
  local container_id="$1"
  local service="$2"
  local identity
  [[ -n "${container_id}" ]] || iwc_die "${service} container does not exist"
  identity="$(docker inspect --type container --format '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}' "${container_id}")"
  [[ "${identity}" == "${IWC_PROJECT}|${service}" ]] ||
    iwc_die "container identity mismatch for ${service}"
}

iwc_assert_no_unexpected_project_containers() {
  local container_id
  local service
  while IFS= read -r container_id; do
    [[ -n "${container_id}" ]] || continue
    service="$(docker inspect --type container --format '{{index .Config.Labels "com.docker.compose.service"}}' "${container_id}")"
    case "${service}" in
      bootstrap|postgres|migrate|web|worker) ;;
      *) iwc_die "unexpected container service in target project: ${service:-unlabeled}" ;;
    esac
  done < <(docker ps -aq --filter "label=com.docker.compose.project=${IWC_PROJECT}")
}

iwc_assert_volume_identity() {
  local logical="$1"
  local volume="${IWC_PROJECT}_${logical}"
  local identity
  identity="$(docker volume inspect --format '{{index .Labels "com.docker.compose.project"}}|{{index .Labels "com.docker.compose.volume"}}' "${volume}" 2>/dev/null)" ||
    iwc_die "expected target volume does not exist: ${volume}"
  [[ "${identity}" == "${IWC_PROJECT}|${logical}" ]] ||
    iwc_die "volume identity mismatch for ${volume}"
}

iwc_fetch_from_web() {
  local path="$1"
  local web_id
  web_id="$(iwc_container_id web)"
  iwc_assert_container_identity "${web_id}" web
  iwc_compose exec -T web node -e '
    const path = process.argv[1];
    fetch(`http://127.0.0.1:3000${path}`, { signal: AbortSignal.timeout(10000) })
      .then(async (response) => {
        const body = await response.text();
        if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
        JSON.parse(body);
        process.stdout.write(body);
      })
      .catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exit(1);
      });
  ' "${path}"
}

iwc_assert_ready_payload() {
  local ready_json="$1"
  jq -e '
    .status == "ready" and
    .checks.database == true and
    .checks.migrations == true and
    .checks.configuration == true and
    .checks.task_executor == true and
    (.versions.application | type == "string") and
    (.versions.databaseSchema | type == "string")
  ' >/dev/null <<<"${ready_json}" || iwc_die "readiness did not confirm database, migrations, configuration, and Worker"
}

iwc_runtime_metadata() {
  local ready_json
  local version_json
  local database_json
  local key_version
  ready_json="$(iwc_fetch_from_web /api/v1/health/ready)"
  iwc_assert_ready_payload "${ready_json}"
  version_json="$(iwc_fetch_from_web /api/v1/version)"
  jq -e '
    (.application | type == "string") and
    (.database_schema | type == "string")
  ' >/dev/null <<<"${version_json}" || iwc_die "version endpoint is malformed"
  [[ "$(jq -r '.application' <<<"${version_json}")" == "$(jq -r '.versions.application' <<<"${ready_json}")" ]] ||
    iwc_die "readiness and version endpoints disagree on application version"
  [[ "$(jq -r '.database_schema' <<<"${version_json}")" == "$(jq -r '.versions.databaseSchema' <<<"${ready_json}")" ]] ||
    iwc_die "readiness and version endpoints disagree on database schema"
  database_json="$(iwc_compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U iwc -d iwc -qAtc \
    "select json_build_object('name', current_database(), 'sizeBytes', pg_database_size(current_database()), 'postgresVersion', current_setting('server_version'))::text")"
  jq -e '.name == "iwc" and (.sizeBytes | type == "number") and (.sizeBytes > 0) and (.postgresVersion | type == "string")' \
    >/dev/null <<<"${database_json}" || iwc_die "PostgreSQL metadata query returned an invalid result"
  key_version="$(iwc_rendered_value '.services.web.environment.APP_ENCRYPTION_KEY_VERSION')"
  [[ "${key_version}" =~ ^[1-9][0-9]*$ ]] || iwc_die "APP_ENCRYPTION_KEY_VERSION must be a positive integer"
  jq -n \
    --arg created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg application_version "$(jq -r '.application' <<<"${version_json}")" \
    --arg database_schema_version "$(jq -r '.database_schema' <<<"${version_json}")" \
    --argjson database "${database_json}" \
    --argjson encryption_key_version "${key_version}" \
    '{createdAt:$created_at, applicationVersion:$application_version, databaseSchemaVersion:$database_schema_version, database:$database, encryptionKeyVersion:$encryption_key_version}'
}

iwc_make_passphrase_file() {
  local supplied="${1:-}"
  local confirmation="${2:-false}"
  local first
  local second
  if [[ -n "${supplied}" ]]; then
    [[ -f "${supplied}" && ! -L "${supplied}" ]] ||
      iwc_die "--passphrase-file must name a regular, non-symlink file"
    IWC_ACTIVE_PASSPHRASE_FILE="${supplied}"
    IWC_TEMP_PASSPHRASE_FILE=""
    return
  fi
  [[ -t 0 ]] || iwc_die "non-interactive use requires --passphrase-file"
  read -r -s -p "Backup passphrase (12-256 characters): " first
  printf '\n' >&2
  if [[ "${confirmation}" == true ]]; then
    read -r -s -p "Repeat backup passphrase: " second
    printf '\n' >&2
    [[ "${first}" == "${second}" ]] || iwc_die "passphrases do not match"
  fi
  [[ ${#first} -ge 12 && ${#first} -le 256 ]] ||
    iwc_die "backup passphrase must contain 12-256 characters"
  IWC_TEMP_PASSPHRASE_FILE="$(mktemp "${TMPDIR:-/tmp}/iwc-passphrase.XXXXXXXX")"
  chmod 600 "${IWC_TEMP_PASSPHRASE_FILE}"
  printf '%s' "${first}" > "${IWC_TEMP_PASSPHRASE_FILE}"
  unset first second
  IWC_ACTIVE_PASSPHRASE_FILE="${IWC_TEMP_PASSPHRASE_FILE}"
}

iwc_remove_temporary_passphrase() {
  if [[ -n "${IWC_TEMP_PASSPHRASE_FILE:-}" ]]; then
    case "${IWC_TEMP_PASSPHRASE_FILE}" in
      "${TMPDIR:-/tmp}"/iwc-passphrase.*)
        rm -f -- "${IWC_TEMP_PASSPHRASE_FILE}"
        ;;
      *)
        iwc_log "refusing to remove unexpected passphrase path"
        ;;
    esac
  fi
}

iwc_remove_work_directory() {
  local path="$1"
  case "${path}" in
    "${TMPDIR:-/tmp}"/iwc-compose-backup.*|"${TMPDIR:-/tmp}"/iwc-compose-restore.*|"${TMPDIR:-/tmp}"/iwc-compose-upgrade.*)
      if [[ -d "${path}" && ! -L "${path}" ]]; then rm -rf -- "${path}"; fi
      ;;
    *)
      iwc_log "refusing to remove unexpected work path"
      ;;
  esac
}

iwc_print_plan() {
  local operation="$1"
  shift
  iwc_log "DRY RUN: ${operation}"
  iwc_log "project: ${IWC_PROJECT}"
  while (($# > 0)); do
    iwc_log "$1"
    shift
  done
  iwc_log "no Docker resources or files were changed"
}
