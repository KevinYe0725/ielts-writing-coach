import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rm,
  stat,
  statfs,
  writeFile,
} from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { APPLICATION_VERSION } from "../packages/config/src/version";
import { DATABASE_SCHEMA_VERSION } from "../packages/db/src/schema-version";

import type { EncryptedBackupSecrets } from "../apps/web/src/lib/server/instance-backup.ts";
import * as instanceBackup from "../apps/web/src/lib/server/instance-backup.ts";

const instanceBackupExports = (
  "default" in instanceBackup &&
  typeof instanceBackup.default === "object" &&
  instanceBackup.default !== null
    ? instanceBackup.default
    : instanceBackup
) as typeof import("../apps/web/src/lib/server/instance-backup.ts");
const {
  decryptBackupSecrets,
  decryptInstanceBackupArchive,
  encryptBackupSecrets,
  encryptInstanceBackupArchive,
  INSTANCE_BACKUP_FORMAT_VERSION,
} = instanceBackupExports;

const ARCHIVE_FORMAT = "ielts-writing-coach-instance-backup";
const EXPECTED_ARCHIVE_FILES = [
  "database.dump",
  "manifest.json",
  "secrets.enc.json",
] as const;
const EXPECTED_SECRET_KEYS = [
  "applicationVersion",
  "authSecret",
  "encryptionKey",
  "encryptionKeyVersion",
  "setupToken",
] as const;
const MINIMUM_FREE_OVERHEAD_BYTES = 256 * 1_024 * 1_024;
const MAXIMUM_MANIFEST_BYTES = 64 * 1_024;
const MAXIMUM_SECRET_ENVELOPE_BYTES = 1 * 1_024 * 1_024;
const COMMAND_TIMEOUT_MS = 10 * 60 * 1_000;

interface BackupMetadata {
  readonly createdAt: string;
  readonly applicationVersion: string;
  readonly databaseSchemaVersion: string;
  readonly database: {
    readonly name: string;
    readonly sizeBytes: number;
    readonly postgresVersion: string;
  };
  readonly encryptionKeyVersion: number;
}

interface BackupManifest extends Omit<BackupMetadata, "encryptionKeyVersion"> {
  readonly format: typeof ARCHIVE_FORMAT;
  readonly formatVersion: typeof INSTANCE_BACKUP_FORMAT_VERSION;
  readonly database: BackupMetadata["database"] & {
    readonly dumpFormat: "PostgreSQL custom";
  };
  readonly archiveEncryption: {
    readonly encrypted: true;
    readonly algorithm: "scrypt + AES-256-GCM";
    readonly scope: "complete tar payload";
  };
  readonly uploads: {
    readonly included: false;
    readonly reason: string;
  };
  readonly secrets: {
    readonly encrypted: true;
    readonly algorithm: "scrypt + AES-256-GCM";
    readonly encryptionKeyVersion: number;
  };
  readonly externalConfigurationOmitted: readonly string[];
  readonly files: {
    readonly "database.dump": { readonly sha256: string };
    readonly "secrets.enc.json": { readonly sha256: string };
  };
}

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} has missing or unexpected fields.`);
  }
}

function requiredString(
  value: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const item = value[key];
  if (typeof item !== "string" || item.length === 0) {
    fail(`${label}.${key} must be a non-empty string.`);
  }
  return item;
}

function requiredPositiveInteger(
  value: Record<string, unknown>,
  key: string,
  label: string,
): number {
  const item = value[key];
  if (!Number.isSafeInteger(item) || Number(item) <= 0) {
    fail(`${label}.${key} must be a positive integer.`);
  }
  return Number(item);
}

function semver(value: string, label: string): string {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value)) {
    fail(`${label} is not a supported application version.`);
  }
  return value;
}

function schemaVersion(value: string): string {
  if (!/^\d{4}_[a-z0-9_]+$/u.test(value)) {
    fail("databaseSchemaVersion is malformed.");
  }
  return value;
}

function postgresMajor(value: string): number {
  const match = /^(\d+)(?:\.|$)/u.exec(value);
  if (!match?.[1]) fail("PostgreSQL version is malformed.");
  return Number(match[1]);
}

function sha256(value: string, label: string): string {
  if (!/^[a-f\d]{64}$/u.test(value)) fail(`${label} is not a SHA-256 digest.`);
  return value;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path))
    hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function requireRegularFile(
  path: string,
  label: string,
  maximumBytes?: number,
): Promise<number> {
  const info = await lstat(path).catch(() => undefined);
  if (!info?.isFile() || info.isSymbolicLink()) {
    fail(`${label} must be a regular file, not a symlink.`);
  }
  if (info.size <= 0) fail(`${label} is empty.`);
  if (maximumBytes !== undefined && info.size > maximumBytes) {
    fail(`${label} exceeds its safe size limit.`);
  }
  return info.size;
}

async function requirePrivateDirectory(path: string): Promise<void> {
  const info = await lstat(path).catch(() => undefined);
  if (!info?.isDirectory() || info.isSymbolicLink()) {
    fail(`Private work path is not a real directory: ${path}`);
  }
  await chmod(path, 0o700);
}

async function preparePrivateDestinationDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail(`Backup destination is not a real directory: ${path}`);
  }
  if ((info.mode & 0o077) !== 0) {
    fail(`Backup destination must not grant group or world access: ${path}`);
  }
}

async function readPassphrase(path: string): Promise<string> {
  await requireRegularFile(path, "Passphrase file", 1_024);
  const info = await lstat(path);
  if ((info.mode & 0o077) !== 0) {
    fail("Passphrase file must not grant group or world access.");
  }
  const raw = await readFile(path, "utf8");
  const passphrase = raw.replace(/\r?\n$/u, "");
  if (
    passphrase.length < 12 ||
    passphrase.length > 256 ||
    /[\r\n\0]/u.test(passphrase)
  ) {
    fail("The backup passphrase must contain 12-256 characters on one line.");
  }
  return passphrase;
}

async function readSecret(path: string, label: string): Promise<string> {
  await requireRegularFile(path, label, 16 * 1_024);
  const value = (await readFile(path, "utf8")).replace(/\r?\n$/u, "");
  if (value.length === 0 || /[\r\n\0]/u.test(value)) {
    fail(`${label} is empty or malformed.`);
  }
  return value;
}

function validateEncryptionKey(value: string): void {
  if (!/^[A-Za-z\d+/]+={0,2}$/u.test(value)) {
    fail("The archived encryption key is not canonical base64.");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.byteLength !== 32 || decoded.toString("base64") !== value) {
    fail("The archived encryption key must decode to exactly 32 bytes.");
  }
  decoded.fill(0);
}

function validateMetadata(value: unknown): BackupMetadata {
  if (!isRecord(value)) fail("Backup metadata must be an object.");
  requireExactKeys(
    value,
    [
      "applicationVersion",
      "createdAt",
      "database",
      "databaseSchemaVersion",
      "encryptionKeyVersion",
    ],
    "Backup metadata",
  );
  const database = value.database;
  if (!isRecord(database)) fail("Backup metadata.database must be an object.");
  requireExactKeys(
    database,
    ["name", "postgresVersion", "sizeBytes"],
    "Backup metadata.database",
  );
  const createdAt = requiredString(value, "createdAt", "Backup metadata");
  if (Number.isNaN(Date.parse(createdAt)))
    fail("createdAt is not an ISO date.");
  const name = requiredString(database, "name", "Backup metadata.database");
  if (Buffer.byteLength(name, "utf8") > 63 || /[\0-\x1F\x7F]/u.test(name)) {
    fail("Source PostgreSQL database name is malformed.");
  }
  const sizeBytes = requiredPositiveInteger(
    database,
    "sizeBytes",
    "Backup metadata.database",
  );
  const postgresVersion = requiredString(
    database,
    "postgresVersion",
    "Backup metadata.database",
  );
  if (postgresMajor(postgresVersion) !== 17) {
    fail("Only PostgreSQL 17 Compose backups are supported.");
  }
  return {
    createdAt,
    applicationVersion: semver(
      requiredString(value, "applicationVersion", "Backup metadata"),
      "applicationVersion",
    ),
    databaseSchemaVersion: schemaVersion(
      requiredString(value, "databaseSchemaVersion", "Backup metadata"),
    ),
    database: { name, sizeBytes, postgresVersion },
    encryptionKeyVersion: requiredPositiveInteger(
      value,
      "encryptionKeyVersion",
      "Backup metadata",
    ),
  };
}

function validateManifest(value: unknown): BackupManifest {
  if (!isRecord(value)) fail("manifest.json must contain an object.");
  requireExactKeys(
    value,
    [
      "applicationVersion",
      "archiveEncryption",
      "createdAt",
      "database",
      "databaseSchemaVersion",
      "externalConfigurationOmitted",
      "files",
      "format",
      "formatVersion",
      "secrets",
      "uploads",
    ],
    "Backup manifest",
  );
  if (
    value.format !== ARCHIVE_FORMAT ||
    value.formatVersion !== INSTANCE_BACKUP_FORMAT_VERSION
  ) {
    fail("Backup format or format version is unsupported.");
  }

  const database = value.database;
  if (!isRecord(database)) fail("manifest.database must be an object.");
  requireExactKeys(
    database,
    ["dumpFormat", "name", "postgresVersion", "sizeBytes"],
    "manifest.database",
  );
  const metadata = validateMetadata({
    createdAt: value.createdAt,
    applicationVersion: value.applicationVersion,
    databaseSchemaVersion: value.databaseSchemaVersion,
    encryptionKeyVersion: isRecord(value.secrets)
      ? value.secrets.encryptionKeyVersion
      : undefined,
    database: {
      name: database.name,
      sizeBytes: database.sizeBytes,
      postgresVersion: database.postgresVersion,
    },
  });
  if (database.dumpFormat !== "PostgreSQL custom") {
    fail("Only PostgreSQL custom-format dumps are supported.");
  }

  const archiveEncryption = value.archiveEncryption;
  if (!isRecord(archiveEncryption)) {
    fail("manifest.archiveEncryption must be an object.");
  }
  requireExactKeys(
    archiveEncryption,
    ["algorithm", "encrypted", "scope"],
    "manifest.archiveEncryption",
  );
  if (
    archiveEncryption.encrypted !== true ||
    archiveEncryption.algorithm !== "scrypt + AES-256-GCM" ||
    archiveEncryption.scope !== "complete tar payload"
  ) {
    fail("The complete backup payload must use the supported encryption.");
  }

  const secrets = value.secrets;
  if (!isRecord(secrets)) fail("manifest.secrets must be an object.");
  requireExactKeys(
    secrets,
    ["algorithm", "encrypted", "encryptionKeyVersion"],
    "manifest.secrets",
  );
  if (
    secrets.encrypted !== true ||
    secrets.algorithm !== "scrypt + AES-256-GCM"
  ) {
    fail("The secret envelope must use the supported encryption.");
  }

  const files = value.files;
  if (!isRecord(files)) fail("manifest.files must be an object.");
  requireExactKeys(
    files,
    ["database.dump", "secrets.enc.json"],
    "manifest.files",
  );
  const databaseFile = files["database.dump"];
  const secretsFile = files["secrets.enc.json"];
  if (!isRecord(databaseFile) || !isRecord(secretsFile)) {
    fail("manifest.files entries must be objects.");
  }
  requireExactKeys(databaseFile, ["sha256"], "manifest.files.database.dump");
  requireExactKeys(secretsFile, ["sha256"], "manifest.files.secrets.enc.json");
  sha256(
    requiredString(databaseFile, "sha256", "manifest.files.database.dump"),
    "database.dump checksum",
  );
  sha256(
    requiredString(secretsFile, "sha256", "manifest.files.secrets.enc.json"),
    "secrets.enc.json checksum",
  );

  if (!isRecord(value.uploads) || value.uploads.included !== false) {
    fail("v1 backups must explicitly state that uploads are not included.");
  }
  requireExactKeys(value.uploads, ["included", "reason"], "manifest.uploads");
  requiredString(value.uploads, "reason", "manifest.uploads");
  if (!Array.isArray(value.externalConfigurationOmitted)) {
    fail("manifest.externalConfigurationOmitted must be an array.");
  }
  if (
    value.externalConfigurationOmitted.some(
      (item) => typeof item !== "string" || item.length === 0,
    )
  ) {
    fail("manifest.externalConfigurationOmitted contains an invalid item.");
  }
  return value as unknown as BackupManifest;
}

function validateSecretEnvelope(value: unknown): EncryptedBackupSecrets {
  if (!isRecord(value)) fail("secrets.enc.json must contain an object.");
  requireExactKeys(
    value,
    ["authTag", "ciphertext", "format", "kdf", "nonce", "salt"],
    "Encrypted secret envelope",
  );
  for (const key of [
    "authTag",
    "ciphertext",
    "format",
    "kdf",
    "nonce",
    "salt",
  ]) {
    requiredString(value, key, "Encrypted secret envelope");
  }
  return value as unknown as EncryptedBackupSecrets;
}

export function validateDecryptedBackupSecrets(
  value: unknown,
  manifest: Pick<BackupManifest, "applicationVersion" | "secrets">,
): {
  readonly applicationVersion: string;
  readonly authSecret: string;
  readonly encryptionKey: string;
  readonly encryptionKeyVersion: number;
  readonly setupToken: string;
} {
  if (!isRecord(value)) fail("Decrypted backup secrets must be an object.");
  requireExactKeys(value, EXPECTED_SECRET_KEYS, "Decrypted backup secrets");
  const applicationVersion = requiredString(
    value,
    "applicationVersion",
    "Decrypted backup secrets",
  );
  const authSecret = requiredString(
    value,
    "authSecret",
    "Decrypted backup secrets",
  );
  const encryptionKey = requiredString(
    value,
    "encryptionKey",
    "Decrypted backup secrets",
  );
  const encryptionKeyVersion = requiredPositiveInteger(
    value,
    "encryptionKeyVersion",
    "Decrypted backup secrets",
  );
  const setupToken = requiredString(
    value,
    "setupToken",
    "Decrypted backup secrets",
  );
  if (applicationVersion !== manifest.applicationVersion) {
    fail("Secret and manifest application versions do not match.");
  }
  if (encryptionKeyVersion !== manifest.secrets.encryptionKeyVersion) {
    fail("Secret and manifest encryption-key versions do not match.");
  }
  if (authSecret.length < 32 || setupToken.length < 12) {
    fail("Archived authentication or setup secrets are too short.");
  }
  validateEncryptionKey(encryptionKey);
  return {
    applicationVersion,
    authSecret,
    encryptionKey,
    encryptionKeyVersion,
    setupToken,
  };
}

async function run(
  command: string,
  arguments_: readonly string[],
  options: { readonly cwd?: string; readonly maximumOutputBytes?: number } = {},
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return promisify(execFile)(command, arguments_, {
    cwd: options.cwd,
    encoding: "utf8",
    maxBuffer: options.maximumOutputBytes ?? 128 * 1_024,
    timeout: COMMAND_TIMEOUT_MS,
  });
}

async function ensureFreeSpace(
  path: string,
  requiredBytes: number,
): Promise<number> {
  if (!Number.isSafeInteger(requiredBytes) || requiredBytes <= 0) {
    fail("Required disk-space value is invalid.");
  }
  const disk = await statfs(path);
  const freeBytes = disk.bavail * disk.bsize;
  if (!Number.isSafeInteger(freeBytes) || freeBytes < requiredBytes) {
    fail(
      `Insufficient free disk space: ${requiredBytes} bytes required, ${freeBytes} available.`,
    );
  }
  return freeBytes;
}

async function extractMember(
  payloadPath: string,
  member: (typeof EXPECTED_ARCHIVE_FILES)[number],
  outputPath: string,
  maximumBytes: number,
): Promise<number> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    fail(`Invalid extraction limit for ${member}.`);
  }
  const output = createWriteStream(outputPath, { flags: "wx", mode: 0o600 });
  let extractedBytes = 0;
  let stderr = "";
  const child = spawn("tar", ["-xOzf", payloadPath, member], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const timeout = setTimeout(() => child.kill("SIGTERM"), COMMAND_TIMEOUT_MS);
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    if (stderr.length < 8_192) stderr += chunk.slice(0, 8_192);
  });
  child.stdout.on("data", (chunk: Buffer) => {
    extractedBytes += chunk.byteLength;
    if (extractedBytes > maximumBytes) child.kill("SIGTERM");
  });
  try {
    await new Promise<void>((resolvePromise, reject) => {
      child.once("error", reject);
      output.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0 && extractedBytes <= maximumBytes) resolvePromise();
        else
          reject(
            new Error(
              extractedBytes > maximumBytes
                ? `${member} exceeds its safe extraction limit.`
                : `Could not extract ${member} (${signal ?? code ?? "unknown"}): ${stderr.trim().slice(0, 256)}`,
            ),
          );
      });
      child.stdout.pipe(output);
    });
  } catch (error) {
    child.kill("SIGTERM");
    output.destroy();
    await rm(outputPath, { force: true });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  await new Promise<void>((resolvePromise, reject) => {
    if (output.closed) resolvePromise();
    else {
      output.once("close", resolvePromise);
      output.once("error", reject);
    }
  });
  return extractedBytes;
}

function parseArguments(arguments_: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (
      !flag?.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    ) {
      fail("Archive helper arguments must be --name value pairs.");
    }
    if (values.has(flag)) fail(`Duplicate archive helper argument: ${flag}`);
    values.set(flag, value);
  }
  return values;
}

function argument(values: Map<string, string>, flag: string): string {
  const value = values.get(flag);
  if (!value) fail(`Missing required archive helper argument: ${flag}`);
  return value;
}

function rejectUnexpectedArguments(
  values: Map<string, string>,
  allowed: readonly string[],
): void {
  for (const flag of values.keys()) {
    if (!allowed.includes(flag))
      fail(`Unsupported archive helper argument: ${flag}`);
  }
}

async function seal(values: Map<string, string>): Promise<void> {
  const allowed = [
    "--metadata",
    "--output",
    "--passphrase-file",
    "--secrets-dir",
    "--work-dir",
  ];
  rejectUnexpectedArguments(values, allowed);
  const workDirectory = resolve(argument(values, "--work-dir"));
  const secretsDirectory = resolve(argument(values, "--secrets-dir"));
  const output = resolve(argument(values, "--output"));
  const metadataPath = resolve(argument(values, "--metadata"));
  await requirePrivateDirectory(workDirectory);
  await requirePrivateDirectory(secretsDirectory);
  if (!output.endsWith(".iwc-backup")) {
    fail("Backup output must end with .iwc-backup.");
  }
  if (output === workDirectory || output.startsWith(`${workDirectory}${sep}`)) {
    fail(
      "Final backup output must not be inside the disposable work directory.",
    );
  }
  await preparePrivateDestinationDirectory(dirname(output));
  if (await lstat(output).catch(() => undefined))
    fail("Backup output already exists.");
  const sidecar = `${output}.sha256`;
  if (await lstat(sidecar).catch(() => undefined)) {
    fail("Backup checksum sidecar already exists.");
  }

  await requireRegularFile(
    join(workDirectory, "database.dump"),
    "database.dump",
  );
  await requireRegularFile(
    metadataPath,
    "Backup metadata",
    MAXIMUM_MANIFEST_BYTES,
  );
  const metadata = validateMetadata(
    JSON.parse(await readFile(metadataPath, "utf8")),
  );
  const passphrase = await readPassphrase(
    argument(values, "--passphrase-file"),
  );
  const secrets = {
    applicationVersion: metadata.applicationVersion,
    authSecret: await readSecret(
      join(secretsDirectory, "auth_secret"),
      "auth_secret",
    ),
    encryptionKey: await readSecret(
      join(secretsDirectory, "encryption_key"),
      "encryption_key",
    ),
    encryptionKeyVersion: metadata.encryptionKeyVersion,
    setupToken: await readSecret(
      join(secretsDirectory, "setup_token"),
      "setup_token",
    ),
  };
  validateDecryptedBackupSecrets(secrets, {
    applicationVersion: metadata.applicationVersion,
    secrets: {
      encrypted: true,
      algorithm: "scrypt + AES-256-GCM",
      encryptionKeyVersion: metadata.encryptionKeyVersion,
    },
  });
  const encryptedSecrets = await encryptBackupSecrets(secrets, passphrase);
  const secretsPath = join(workDirectory, "secrets.enc.json");
  await writeFile(
    secretsPath,
    `${JSON.stringify(encryptedSecrets, null, 2)}\n`,
    {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    },
  );
  const databasePath = join(workDirectory, "database.dump");
  const manifest: BackupManifest = {
    format: ARCHIVE_FORMAT,
    formatVersion: INSTANCE_BACKUP_FORMAT_VERSION,
    createdAt: metadata.createdAt,
    applicationVersion: metadata.applicationVersion,
    databaseSchemaVersion: metadata.databaseSchemaVersion,
    database: {
      ...metadata.database,
      dumpFormat: "PostgreSQL custom",
    },
    archiveEncryption: {
      encrypted: true,
      algorithm: "scrypt + AES-256-GCM",
      scope: "complete tar payload",
    },
    uploads: {
      included: false,
      reason: "v1.0 has no upload or object-storage feature",
    },
    secrets: {
      encrypted: true,
      algorithm: "scrypt + AES-256-GCM",
      encryptionKeyVersion: metadata.encryptionKeyVersion,
    },
    externalConfigurationOmitted: [
      "DATABASE_URL",
      "SMTP credentials",
      "environment-managed AI provider credentials",
    ],
    files: {
      "database.dump": { sha256: await sha256File(databasePath) },
      "secrets.enc.json": { sha256: await sha256File(secretsPath) },
    },
  };
  const manifestPath = join(workDirectory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  const payloadPath = join(workDirectory, "payload.tar.gz");
  await run("tar", ["-czf", payloadPath, ...EXPECTED_ARCHIVE_FILES], {
    cwd: workDirectory,
  });
  try {
    await encryptInstanceBackupArchive(payloadPath, output, passphrase);
  } finally {
    await rm(payloadPath, { force: true });
  }
  const archiveSha256 = await sha256File(output);
  await writeFile(sidecar, `${archiveSha256}  ${basename(output)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await chmod(output, 0o600);
  process.stdout.write(
    `${JSON.stringify({ archive: output, archiveSha256, manifest })}\n`,
  );
}

async function openArchive(values: Map<string, string>): Promise<void> {
  const allowed = ["--archive", "--output-dir", "--passphrase-file"];
  rejectUnexpectedArguments(values, allowed);
  const archive = resolve(argument(values, "--archive"));
  const outputDirectory = resolve(argument(values, "--output-dir"));
  if (!archive.endsWith(".iwc-backup")) {
    fail("Restore archive must end with .iwc-backup.");
  }
  const archiveBytes = await requireRegularFile(archive, "Backup archive");
  await requirePrivateDirectory(outputDirectory);
  await ensureFreeSpace(
    outputDirectory,
    archiveBytes * 4 + MINIMUM_FREE_OVERHEAD_BYTES,
  );
  const passphrase = await readPassphrase(
    argument(values, "--passphrase-file"),
  );
  const payloadPath = join(outputDirectory, "payload.tar.gz");
  await decryptInstanceBackupArchive(archive, payloadPath, passphrase);

  const listing = await run("tar", ["-tzf", payloadPath], {
    maximumOutputBytes: 16 * 1_024,
  });
  const names = listing.stdout.split(/\r?\n/u).filter(Boolean);
  if (
    names.length !== EXPECTED_ARCHIVE_FILES.length ||
    [...names]
      .sort()
      .some((name, index) => name !== [...EXPECTED_ARCHIVE_FILES].sort()[index])
  ) {
    fail("Backup payload must contain exactly the three canonical files.");
  }
  const verbose = await run("tar", ["-tvzf", payloadPath], {
    maximumOutputBytes: 32 * 1_024,
  });
  const entries = verbose.stdout.split(/\r?\n/u).filter(Boolean);
  if (entries.length !== 3 || entries.some((entry) => entry[0] !== "-")) {
    fail("Backup payload entries must all be regular files.");
  }
  const manifestPath = join(outputDirectory, "manifest.json");
  await extractMember(
    payloadPath,
    "manifest.json",
    manifestPath,
    MAXIMUM_MANIFEST_BYTES,
  );
  await requireRegularFile(
    manifestPath,
    "manifest.json",
    MAXIMUM_MANIFEST_BYTES,
  );
  const manifest = validateManifest(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  if (
    manifest.applicationVersion !== APPLICATION_VERSION ||
    manifest.databaseSchemaVersion !== DATABASE_SCHEMA_VERSION
  ) {
    fail(
      `Backup version ${manifest.applicationVersion}/${manifest.databaseSchemaVersion} is incompatible with this checkout (${APPLICATION_VERSION}/${DATABASE_SCHEMA_VERSION}).`,
    );
  }
  const requiredFreeBytes =
    Math.max(
      manifest.database.sizeBytes * 2,
      manifest.database.sizeBytes + 64 * 1_024 * 1_024,
      archiveBytes * 4,
    ) + MINIMUM_FREE_OVERHEAD_BYTES;
  const freeBytes = await ensureFreeSpace(outputDirectory, requiredFreeBytes);

  const databasePath = join(outputDirectory, "database.dump");
  const secretsPath = join(outputDirectory, "secrets.enc.json");
  const maximumDumpBytes = Math.max(
    manifest.database.sizeBytes * 2,
    manifest.database.sizeBytes + 64 * 1_024 * 1_024,
  );
  const dumpBytes = await extractMember(
    payloadPath,
    "database.dump",
    databasePath,
    maximumDumpBytes,
  );
  await extractMember(
    payloadPath,
    "secrets.enc.json",
    secretsPath,
    MAXIMUM_SECRET_ENVELOPE_BYTES,
  );
  await requireRegularFile(databasePath, "database.dump", maximumDumpBytes);
  await requireRegularFile(
    secretsPath,
    "secrets.enc.json",
    MAXIMUM_SECRET_ENVELOPE_BYTES,
  );
  if (
    (await sha256File(databasePath)) !==
      manifest.files["database.dump"].sha256 ||
    (await sha256File(secretsPath)) !==
      manifest.files["secrets.enc.json"].sha256
  ) {
    fail("Backup payload checksum verification failed.");
  }

  const envelope = validateSecretEnvelope(
    JSON.parse(await readFile(secretsPath, "utf8")),
  );
  const decrypted = validateDecryptedBackupSecrets(
    await decryptBackupSecrets(envelope, passphrase),
    manifest,
  );
  const secretDirectory = join(outputDirectory, "secrets");
  await mkdir(secretDirectory, { mode: 0o700 });
  await Promise.all([
    writeFile(
      join(secretDirectory, "auth_secret"),
      `${decrypted.authSecret}\n`,
      {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      },
    ),
    writeFile(
      join(secretDirectory, "encryption_key"),
      `${decrypted.encryptionKey}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    ),
    writeFile(
      join(secretDirectory, "setup_token"),
      `${decrypted.setupToken}\n`,
      {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      },
    ),
  ]);
  await rm(payloadPath, { force: true });
  await rm(secretsPath, { force: true });
  process.stdout.write(
    `${JSON.stringify({
      archive: resolve(archive),
      archiveSha256: await sha256File(archive),
      applicationVersion: manifest.applicationVersion,
      createdAt: manifest.createdAt,
      databaseName: manifest.database.name,
      databaseSchemaVersion: manifest.databaseSchemaVersion,
      databaseSizeBytes: manifest.database.sizeBytes,
      dumpBytes,
      encryptionKeyVersion: manifest.secrets.encryptionKeyVersion,
      freeBytes,
      postgresVersion: manifest.database.postgresVersion,
    })}\n`,
  );
}

async function checkSpace(values: Map<string, string>): Promise<void> {
  const allowed = ["--bytes", "--path"];
  rejectUnexpectedArguments(values, allowed);
  const requiredBytes = Number(argument(values, "--bytes"));
  const path = resolve(argument(values, "--path"));
  process.stdout.write(
    `${JSON.stringify({ freeBytes: await ensureFreeSpace(path, requiredBytes) })}\n`,
  );
}

export async function main(arguments_ = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = arguments_;
  const values = parseArguments(rest);
  if (command === "seal") await seal(values);
  else if (command === "open") await openArchive(values);
  else if (command === "check-space") await checkSpace(values);
  else fail("Use compose-archive.ts seal, open, or check-space.");
}

if (resolve(process.argv[1] ?? "") === resolve(import.meta.filename)) {
  main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Archive operation failed.";
    process.stderr.write(`[compose-archive] ERROR: ${message.slice(0, 512)}\n`);
    process.exitCode = 1;
  });
}
