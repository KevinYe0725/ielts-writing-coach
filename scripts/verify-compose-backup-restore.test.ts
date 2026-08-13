import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const scriptPath = fileURLToPath(
  new URL("./verify-compose-backup-restore.sh", import.meta.url),
);
const script = readFileSync(scriptPath, "utf8");
const releaseWorkflow = readFileSync(
  fileURLToPath(new URL("../.github/workflows/release.yml", import.meta.url)),
  "utf8",
);

describe("isolated Compose backup/restore gate", () => {
  it("is valid Bash and fails closed", () => {
    const result = spawnSync("bash", ["-n", scriptPath], {
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(script).toContain("set -Eeuo pipefail");
    expect(script).toContain("trap 'cleanup \"$?\"' EXIT");
  });

  it("uses unique source and restore projects with separately named volumes", () => {
    expect(script).toContain('SOURCE_PROJECT="iwc-rec-src-${RUN_TOKEN}"');
    expect(script).toContain('RESTORE_PROJECT="iwc-rec-dst-${RUN_TOKEN}"');
    expect(script).toContain(
      'SOURCE_POSTGRES_VOLUME="${SOURCE_PROJECT}_iwc_postgres"',
    );
    expect(script).toContain(
      'RESTORE_POSTGRES_VOLUME="${RESTORE_PROJECT}_iwc_postgres"',
    );
    expect(script).toContain('IWC_BIND_ADDRESS="127.0.0.1"');
    expect(script).toContain('IWC_PORT="${SOURCE_WEB_PORT}"');
    expect(script).not.toContain('IWC_PORT="127.0.0.1:');
    expect(script).toContain("choose_unique_ports");
    expect(script).toContain("compose_source up -d --no-build");
    expect(script).toContain("compose_restore up -d --no-build");
  });

  it("guards the default volumes and the existing browser database container", () => {
    expect(script).toContain(
      'DEFAULT_POSTGRES_VOLUME="ielts-writing-coach_iwc_postgres"',
    );
    expect(script).toContain(
      'DEFAULT_SECRETS_VOLUME="ielts-writing-coach_iwc_secrets"',
    );
    expect(script).toContain(
      'BROWSER_POSTGRES_CONTAINER="iwc-browser-postgres"',
    );
    expect(script).toContain(
      'if [[ "$(protected_state)" != "${PROTECTED_STATE_BEFORE}" ]]',
    );
    expect(script).toContain('cleanup_project "${SOURCE_PROJECT}" source');
    expect(script).toContain('cleanup_project "${RESTORE_PROJECT}" restore');
    expect(script).toContain(
      'docker image rm "${GATE_IMAGE}" >/dev/null 2>&1 || true',
    );
  });

  it("checks real recovery evidence instead of treating container start as success", () => {
    expect(script).toContain("pg_restore --list database.dump");
    expect(script).toContain("probe_worker source");
    expect(script).toContain("probe_worker restore");
    expect(script).toContain('[[ "${stable_state}" == "running|0" ]] || die');
    expect(script).toContain(
      'cmp --silent "${SOURCE_FINGERPRINT}" "${RESTORE_FINGERPRINT}"',
    );
    expect(script).toContain(
      'cmp --silent "${SOURCE_SECRETS_FINGERPRINT}" "${RESTORE_SECRETS_FINGERPRINT}"',
    );
    expect(script).toContain("this does not claim a cross-version upgrade");
  });

  it("reuses the loaded amd64 release-smoke image in the tag recovery gate", () => {
    expect(releaseWorkflow).toContain(
      "if: matrix.arch == 'amd64' && success()",
    );
    expect(releaseWorkflow).toContain(
      "IWC_RECOVERY_IMAGE: ${{ env.IWC_IMAGE }}",
    );
    expect(releaseWorkflow.indexOf("Compose cleanup")).toBeLessThan(
      releaseWorkflow.indexOf(
        "Isolated backup and clean-instance restore gate",
      ),
    );
    expect(script).toContain('if [[ -n "${IWC_RECOVERY_IMAGE:-}" ]]');
    expect(script).toContain("IMAGE_OWNED=false");
  });
});
