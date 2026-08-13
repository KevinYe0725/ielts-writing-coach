import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const scripts = {
  backup: fileURLToPath(new URL("./compose-backup.sh", import.meta.url)),
  doctor: fileURLToPath(new URL("./compose-doctor.sh", import.meta.url)),
  restore: fileURLToPath(new URL("./compose-restore.sh", import.meta.url)),
  upgrade: fileURLToPath(new URL("./compose-upgrade.sh", import.meta.url)),
};
const sources = Object.fromEntries(
  Object.entries(scripts).map(([name, path]) => [
    name,
    readFileSync(path, "utf8"),
  ]),
) as Record<keyof typeof scripts, string>;
const common = readFileSync(
  fileURLToPath(new URL("./lib/compose-common.sh", import.meta.url)),
  "utf8",
);
const archiveHelper = readFileSync(
  fileURLToPath(new URL("./compose-archive.ts", import.meta.url)),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(`${repositoryRoot}/package.json`, "utf8"),
) as { scripts: Record<string, string> };
const childEnvironment = { ...process.env };
for (const key of Object.keys(childEnvironment)) {
  if (key.startsWith("VITEST") || key === "NODE_OPTIONS") {
    delete childEnvironment[key];
  }
}

function run(
  name: keyof typeof scripts,
  arguments_: readonly string[],
): {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
} {
  const result = spawnSync("bash", [scripts[name], ...arguments_], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, TZ: "UTC" },
  });
  return {
    status: result.status,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

describe("supported Compose operator commands", () => {
  it("has executable Bash entry points and root package scripts", () => {
    for (const path of Object.values(scripts)) {
      execFileSync("bash", ["-n", path]);
      expect(statSync(path).mode & 0o111).not.toBe(0);
    }
    execFileSync("bash", [
      "-n",
      fileURLToPath(new URL("./lib/compose-common.sh", import.meta.url)),
    ]);
    expect(packageJson.scripts).toMatchObject({
      "compose:backup": "bash scripts/compose-backup.sh",
      "compose:doctor": "bash scripts/compose-doctor.sh",
      "compose:restore": "bash scripts/compose-restore.sh",
      "compose:upgrade": "bash scripts/compose-upgrade.sh",
    });
  });

  it("provides help without Docker and rejects missing explicit targets", () => {
    for (const name of Object.keys(scripts) as (keyof typeof scripts)[]) {
      const help = run(name, ["--help"]);
      expect(help.status, help.stderr).toBe(0);
      expect(help.stdout).toContain("--project NAME");

      const missing = run(name, ["--dry-run"]);
      expect(missing.status).not.toBe(0);
      expect(missing.stderr).toContain("--project is required");
    }

    for (const name of Object.keys(scripts) as (keyof typeof scripts)[]) {
      const helpThroughPackageScript = spawnSync(
        "pnpm",
        [`compose:${name}`, "--", "--help"],
        { cwd: repositoryRoot, encoding: "utf8", env: childEnvironment },
      );
      expect(
        helpThroughPackageScript.status,
        String(helpThroughPackageScript.stderr ?? ""),
      ).toBe(0);
    }
  });

  it("keeps dry-runs offline and project-bound", () => {
    const backup = run("backup", ["--project", "test-project", "--dry-run"]);
    expect(backup.status, backup.stderr).toBe(0);
    expect(backup.stdout).toContain(
      "no Docker resources or files were changed",
    );

    const doctor = run("doctor", ["--project", "test-project", "--dry-run"]);
    expect(doctor.status, doctor.stderr).toBe(0);
    expect(doctor.stdout).toContain("mutations: none");

    const restore = run("restore", [
      "--project",
      "test-project",
      "--archive",
      "/private/tmp/example.iwc-backup",
      "--confirm",
      "RESTORE test-project",
      "--dry-run",
    ]);
    expect(restore.status, restore.stderr).toBe(0);
    expect(restore.stdout).toContain("test-project_iwc_secrets");

    const image = "ghcr.io/example/iwc:1.0.0";
    const upgrade = run("upgrade", [
      "--project",
      "test-project",
      "--image",
      image,
      "--confirm",
      `UPGRADE test-project TO ${image}`,
      "--dry-run",
    ]);
    expect(upgrade.status, upgrade.stderr).toBe(0);
    expect(upgrade.stdout).toContain(
      "doctor -> verified encrypted backup -> pull -> up/migrate -> readiness -> doctor",
    );
  });

  it("rejects unsafe project names, confirmations, archive suffixes, and moving tags", () => {
    for (const project of [
      "",
      "IELTS",
      "../prod",
      "prod space",
      "a".repeat(64),
    ]) {
      const result = run("backup", ["--project", project, "--dry-run"]);
      expect(result.status).not.toBe(0);
    }

    const restore = run("restore", [
      "--project",
      "prod",
      "--archive",
      "/tmp/backup.tar.gz",
      "--confirm",
      "RESTORE prod",
      "--dry-run",
    ]);
    expect(restore.status).not.toBe(0);

    const wrongConfirmation = run("restore", [
      "--project",
      "prod",
      "--archive",
      "/tmp/backup.iwc-backup",
      "--confirm",
      "RESTORE test",
      "--dry-run",
    ]);
    expect(wrongConfirmation.status).not.toBe(0);

    for (const image of [
      "ghcr.io/example/iwc:latest",
      "ghcr.io/example/iwc:local",
      "ghcr.io/example/iwc:main",
      "ghcr.io/example/iwc:1.0.0;whoami",
    ]) {
      const result = run("upgrade", [
        "--project",
        "prod",
        "--image",
        image,
        "--confirm",
        `UPGRADE prod TO ${image}`,
        "--dry-run",
      ]);
      expect(result.status).not.toBe(0);
    }
  });

  it("fails closed around destructive restore and backup-first upgrade ordering", () => {
    expect(common).toContain('[[ "${resolved}" == "${expected}" ]] ||');
    expect(common).toContain("com.docker.compose.project");
    expect(sources.restore).not.toContain("docker compose down");
    expect(sources.restore).not.toMatch(/docker volume (?:prune|rm) [^\n]*\*/u);
    expect(sources.restore).toContain(
      '[[ "${CONFIRMATION}" == "${EXPECTED_CONFIRMATION}" ]]',
    );
    expect(sources.restore.indexOf("archiveHelper")).toBe(-1);
    expect(sources.restore.indexOf("compose-archive.ts")).toBe(-1);
    expect(
      sources.restore.indexOf('exec tsx "${IWC_ARCHIVE_HELPER}" open'),
    ).toBeLessThan(sources.restore.indexOf("iwc_compose stop"));
    expect(sources.restore).toContain('iwc_compose rm -f -s "${service}"');
    expect(sources.restore).toContain('docker volume rm "${SECRETS_VOLUME}"');
    expect(sources.restore).toContain("dropdb --if-exists --force -U iwc iwc");
    expect(sources.restore).toContain(
      '"${SCRIPT_DIRECTORY}/compose-doctor.sh" --project "${IWC_PROJECT}"',
    );

    expect(sources.upgrade.indexOf("compose-backup.sh")).toBeLessThan(
      sources.upgrade.indexOf("iwc_compose pull"),
    );
    expect(sources.upgrade.indexOf("iwc_compose pull")).toBeLessThan(
      sources.upgrade.indexOf("iwc_compose up"),
    );
    expect(sources.upgrade).toContain("--no-build --wait --wait-timeout 180");
  });

  it("uses the shared encrypted format and validates before extracting data", () => {
    expect(archiveHelper).toContain("INSTANCE_BACKUP_FORMAT_VERSION");
    expect(archiveHelper).toContain("decryptInstanceBackupArchive");
    expect(archiveHelper).toContain("encryptInstanceBackupArchive");
    expect(archiveHelper).toContain("decryptBackupSecrets");
    expect(archiveHelper).toContain("encryptBackupSecrets");
    expect(archiveHelper).toContain("EXPECTED_ARCHIVE_FILES");
    expect(archiveHelper).toContain("requireExactKeys");
    expect(archiveHelper).toContain("validateDecryptedBackupSecrets");
    expect(archiveHelper).toContain("ensureFreeSpace");
    expect(archiveHelper).toContain(
      "Backup payload checksum verification failed",
    );
    expect(archiveHelper).toContain(
      "The archived encryption key must decode to exactly 32 bytes",
    );
    expect(archiveHelper).not.toContain("console.log(decrypted");
  });

  it("round-trips the canonical encrypted UI-compatible archive offline", () => {
    const root = mkdtempSync(join(tmpdir(), "iwc-operations-test-"));
    const work = join(root, "work");
    const secrets = join(work, "secrets");
    const destination = join(root, "destination");
    const opened = join(root, "opened");
    mkdirSync(secrets, { recursive: true, mode: 0o700 });
    mkdirSync(destination, { mode: 0o700 });
    mkdirSync(opened, { mode: 0o700 });
    chmodSync(work, 0o700);
    const passphrasePath = join(root, "passphrase");
    writeFileSync(passphrasePath, "offline-test-passphrase", { mode: 0o600 });
    writeFileSync(join(work, "database.dump"), "offline custom-dump fixture", {
      mode: 0o600,
    });
    writeFileSync(
      join(work, "metadata.json"),
      JSON.stringify({
        createdAt: "2026-08-13T12:00:00.000Z",
        applicationVersion: "1.0.0",
        databaseSchemaVersion: "0009_sharp_maddog",
        database: {
          name: "iwc",
          sizeBytes: 1,
          postgresVersion: "17.6",
        },
        encryptionKeyVersion: 1,
      }),
      { mode: 0o600 },
    );
    const expected = {
      auth_secret: "a".repeat(48),
      encryption_key: Buffer.alloc(32, 7).toString("base64"),
      setup_token: "setup-token-for-offline-test",
    };
    for (const [file, value] of Object.entries(expected)) {
      writeFileSync(join(secrets, file), `${value}\n`, { mode: 0o600 });
    }
    const archive = join(destination, "offline.iwc-backup");
    try {
      const seal = spawnSync(
        "pnpm",
        [
          "exec",
          "tsx",
          "scripts/compose-archive.ts",
          "seal",
          "--work-dir",
          work,
          "--metadata",
          join(work, "metadata.json"),
          "--secrets-dir",
          secrets,
          "--passphrase-file",
          passphrasePath,
          "--output",
          archive,
        ],
        { cwd: repositoryRoot, encoding: "utf8", env: childEnvironment },
      );
      expect(seal.status, String(seal.stderr ?? "")).toBe(0);
      expect(
        readFileSync(archive).includes(Buffer.from(expected.auth_secret)),
      ).toBe(false);

      const open = spawnSync(
        "pnpm",
        [
          "exec",
          "tsx",
          "scripts/compose-archive.ts",
          "open",
          "--archive",
          archive,
          "--output-dir",
          opened,
          "--passphrase-file",
          passphrasePath,
        ],
        { cwd: repositoryRoot, encoding: "utf8", env: childEnvironment },
      );
      expect(open.status, String(open.stderr ?? "")).toBe(0);
      for (const [file, value] of Object.entries(expected)) {
        expect(readFileSync(join(opened, "secrets", file), "utf8").trim()).toBe(
          value,
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
