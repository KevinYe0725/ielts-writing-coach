import { spawn } from "node:child_process";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt,
} from "node:crypto";
import {
  chmod,
  mkdtemp,
  open,
  readFile,
  rm,
  stat,
  statfs,
  writeFile,
} from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Pool } from "pg";

import { APPLICATION_VERSION, type ServerEnvironment } from "@iwc/config";
import { DATABASE_SCHEMA_VERSION } from "@iwc/db";

export const INSTANCE_BACKUP_FORMAT_VERSION = "1.0.0" as const;
const BACKUP_FORMAT_VERSION = INSTANCE_BACKUP_FORMAT_VERSION;
const MINIMUM_FREE_OVERHEAD_BYTES = 256 * 1_024 * 1_024;
const PG_DUMP_TIMEOUT_MS = 10 * 60 * 1_000;
const ARCHIVE_MAGIC = Buffer.from("IWCBACKUP1\n", "ascii");
const ARCHIVE_TAG_BYTES = 16;
const MAXIMUM_ARCHIVE_HEADER_BYTES = 4_096;

export interface EncryptedBackupSecrets {
  readonly format: "iwc-secrets-aes-256-gcm";
  readonly kdf: "scrypt";
  readonly salt: string;
  readonly nonce: string;
  readonly authTag: string;
  readonly ciphertext: string;
}

export interface InstanceBackupResult {
  readonly archivePath: string;
  readonly archiveName: string;
  readonly archiveBytes: number;
  readonly archiveSha256: string;
  readonly cleanup: () => Promise<void>;
  readonly stream: () => Readable;
}

interface EncryptedArchiveHeader {
  readonly format: "iwc-encrypted-instance-archive";
  readonly formatVersion: typeof BACKUP_FORMAT_VERSION;
  readonly cipher: "AES-256-GCM";
  readonly kdf: "scrypt";
  readonly salt: string;
  readonly nonce: string;
}

function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      passphrase,
      salt,
      32,
      { N: 32_768, r: 8, p: 1, maxmem: 64 * 1_024 * 1_024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

function compactSecrets(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

export async function encryptBackupSecrets(
  value: Record<string, unknown>,
  passphrase: string,
): Promise<EncryptedBackupSecrets> {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = await deriveKey(passphrase, salt);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(Buffer.from(`iwc-backup:${BACKUP_FORMAT_VERSION}`, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return {
      format: "iwc-secrets-aes-256-gcm",
      kdf: "scrypt",
      salt: salt.toString("base64"),
      nonce: nonce.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
  } finally {
    key.fill(0);
  }
}

export async function decryptBackupSecrets(
  envelope: EncryptedBackupSecrets,
  passphrase: string,
): Promise<Record<string, unknown>> {
  if (
    envelope.format !== "iwc-secrets-aes-256-gcm" ||
    envelope.kdf !== "scrypt"
  ) {
    throw new Error("Unsupported encrypted-secret backup format.");
  }
  const key = await deriveKey(passphrase, Buffer.from(envelope.salt, "base64"));
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(envelope.nonce, "base64"),
    );
    decipher.setAAD(Buffer.from(`iwc-backup:${BACKUP_FORMAT_VERSION}`, "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    ) as Record<string, unknown>;
  } finally {
    key.fill(0);
  }
}

function archiveHeader(value: unknown): EncryptedArchiveHeader {
  const candidate = value as Partial<EncryptedArchiveHeader> | null;
  if (
    !candidate ||
    candidate.format !== "iwc-encrypted-instance-archive" ||
    candidate.formatVersion !== BACKUP_FORMAT_VERSION ||
    candidate.cipher !== "AES-256-GCM" ||
    candidate.kdf !== "scrypt" ||
    typeof candidate.salt !== "string" ||
    typeof candidate.nonce !== "string"
  ) {
    throw new Error("Unsupported or malformed encrypted backup archive.");
  }
  return candidate as EncryptedArchiveHeader;
}

/** Encrypts the complete tar payload, including essays and other private data. */
export async function encryptInstanceBackupArchive(
  payloadPath: string,
  archivePath: string,
  passphrase: string,
): Promise<void> {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const header: EncryptedArchiveHeader = {
    format: "iwc-encrypted-instance-archive",
    formatVersion: BACKUP_FORMAT_VERSION,
    cipher: "AES-256-GCM",
    kdf: "scrypt",
    salt: salt.toString("base64"),
    nonce: nonce.toString("base64"),
  };
  const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32BE(headerBytes.byteLength);
  const authenticatedHeader = Buffer.concat([
    ARCHIVE_MAGIC,
    headerLength,
    headerBytes,
  ]);
  const key = await deriveKey(passphrase, salt);
  const handle = await open(archivePath, "wx", 0o600);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(authenticatedHeader);
    await handle.write(authenticatedHeader);
    for await (const chunk of createReadStream(payloadPath)) {
      const encrypted = cipher.update(chunk as Buffer);
      if (encrypted.byteLength > 0) await handle.write(encrypted);
    }
    const final = cipher.final();
    if (final.byteLength > 0) await handle.write(final);
    await handle.write(cipher.getAuthTag());
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(archivePath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    key.fill(0);
  }
  await handle.close();
}

/**
 * Authenticates and decrypts a complete `.iwc-backup` archive to a private tar
 * payload. A wrong password or any changed byte leaves no partial output.
 */
export async function decryptInstanceBackupArchive(
  archivePath: string,
  payloadPath: string,
  passphrase: string,
): Promise<void> {
  const handle = await open(archivePath, "r");
  let key: Buffer | undefined;
  let outputCreated = false;
  try {
    const archive = await handle.stat();
    const minimumBytes = ARCHIVE_MAGIC.byteLength + 4 + ARCHIVE_TAG_BYTES;
    if (archive.size <= minimumBytes)
      throw new Error("Backup archive is truncated.");
    const prefix = Buffer.alloc(ARCHIVE_MAGIC.byteLength + 4);
    await handle.read(prefix, 0, prefix.byteLength, 0);
    if (!prefix.subarray(0, ARCHIVE_MAGIC.byteLength).equals(ARCHIVE_MAGIC)) {
      throw new Error("Backup archive magic is invalid.");
    }
    const headerBytesLength = prefix.readUInt32BE(ARCHIVE_MAGIC.byteLength);
    if (
      headerBytesLength < 2 ||
      headerBytesLength > MAXIMUM_ARCHIVE_HEADER_BYTES ||
      archive.size <= minimumBytes + headerBytesLength
    ) {
      throw new Error("Backup archive header is invalid.");
    }
    const headerBytes = Buffer.alloc(headerBytesLength);
    await handle.read(
      headerBytes,
      0,
      headerBytes.byteLength,
      prefix.byteLength,
    );
    const header = archiveHeader(JSON.parse(headerBytes.toString("utf8")));
    const tag = Buffer.alloc(ARCHIVE_TAG_BYTES);
    await handle.read(tag, 0, tag.byteLength, archive.size - tag.byteLength);
    const authenticatedHeader = Buffer.concat([prefix, headerBytes]);
    key = await deriveKey(passphrase, Buffer.from(header.salt, "base64"));
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(header.nonce, "base64"),
    );
    decipher.setAAD(authenticatedHeader);
    decipher.setAuthTag(tag);
    const outputHandle = await open(payloadPath, "wx", 0o600);
    outputCreated = true;
    await pipeline(
      createReadStream(archivePath, {
        start: authenticatedHeader.byteLength,
        end: archive.size - ARCHIVE_TAG_BYTES - 1,
      }),
      decipher,
      outputHandle.createWriteStream(),
    );
  } catch (error) {
    if (outputCreated)
      await rm(payloadPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    key?.fill(0);
    await handle.close();
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function runCommand(
  command: string,
  arguments_: readonly string[],
  options: { readonly cwd?: string; readonly environment?: NodeJS.ProcessEnv },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: options.cwd,
      env: options.environment,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let errorOutput = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (errorOutput.length < 8_192) errorOutput += chunk.slice(0, 8_192);
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Backup command exceeded its ten-minute limit."));
    }, PG_DUMP_TIMEOUT_MS);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Backup command failed (${signal ?? code ?? "unknown"}): ${errorOutput.trim().slice(0, 256)}`,
          ),
        );
    });
  });
}

export function postgresClientEnvironment(
  databaseUrl: string,
): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl);
  if (!/^postgres(?:ql)?:$/u.test(url.protocol)) {
    throw new Error("Only PostgreSQL DATABASE_URL values can be backed up.");
  }
  const sslMode = url.searchParams.get("sslmode");
  return {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,
    LANG: process.env.LANG ?? "C.UTF-8",
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//u, "")),
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGCONNECT_TIMEOUT: "10",
    ...(sslMode ? { PGSSLMODE: sslMode } : {}),
  };
}

export async function createInstanceBackup(input: {
  readonly pool: Pool;
  readonly environment: ServerEnvironment;
  readonly passphrase: string;
  readonly now?: Date;
}): Promise<InstanceBackupResult> {
  const now = input.now ?? new Date();
  const workDirectory = await mkdtemp(join(tmpdir(), "iwc-backup-"));
  await chmod(workDirectory, 0o700);
  const cleanup = async () => {
    await rm(workDirectory, { recursive: true, force: true });
  };
  try {
    const databaseMetadata = await input.pool.query<{
      database_name: string;
      database_size_bytes: string;
      postgres_version: string;
    }>(`select current_database() as database_name,
              pg_database_size(current_database())::text as database_size_bytes,
              current_setting('server_version') as postgres_version`);
    const record = databaseMetadata.rows[0];
    const databaseBytes = Number(record?.database_size_bytes ?? 0);
    const disk = await statfs(workDirectory);
    const freeBytes = disk.bavail * disk.bsize;
    const requiredFreeBytes =
      Math.max(databaseBytes * 2, databaseBytes + 64 * 1_024 * 1_024) +
      MINIMUM_FREE_OVERHEAD_BYTES;
    if (!Number.isSafeInteger(databaseBytes) || freeBytes < requiredFreeBytes) {
      throw new Error(
        "Insufficient temporary disk space for a verified backup.",
      );
    }

    const databasePath = join(workDirectory, "database.dump");
    const bundledPgDump = "/usr/lib/postgresql/17/bin/pg_dump";
    const pgDump =
      process.env.IWC_PG_DUMP_PATH ??
      (existsSync(bundledPgDump) ? bundledPgDump : "pg_dump");
    await runCommand(
      pgDump,
      [
        "--format=custom",
        "--compress=6",
        "--no-owner",
        "--no-acl",
        "--no-password",
        `--file=${databasePath}`,
      ],
      {
        environment: postgresClientEnvironment(input.environment.DATABASE_URL),
      },
    );
    const bundledPgRestore = "/usr/lib/postgresql/17/bin/pg_restore";
    const pgRestore =
      process.env.IWC_PG_RESTORE_PATH ??
      (existsSync(bundledPgRestore) ? bundledPgRestore : "pg_restore");
    await runCommand(pgRestore, ["--list", databasePath], {
      environment: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH },
    });

    const encryptedSecrets = await encryptBackupSecrets(
      compactSecrets({
        applicationVersion: APPLICATION_VERSION,
        encryptionKey: input.environment.APP_ENCRYPTION_KEY,
        encryptionKeyVersion: input.environment.APP_ENCRYPTION_KEY_VERSION,
        authSecret: input.environment.AUTH_SECRET,
        setupToken: input.environment.SETUP_TOKEN,
      }),
      input.passphrase,
    );
    const secretsPath = join(workDirectory, "secrets.enc.json");
    await writeFile(
      secretsPath,
      `${JSON.stringify(encryptedSecrets, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    const databaseSha256 = await sha256File(databasePath);
    const secretsSha256 = await sha256File(secretsPath);
    const manifestPath = join(workDirectory, "manifest.json");
    const manifest = {
      format: "ielts-writing-coach-instance-backup",
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAt: now.toISOString(),
      applicationVersion: APPLICATION_VERSION,
      databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
      database: {
        name: record?.database_name ?? "unknown",
        sizeBytes: databaseBytes,
        postgresVersion: record?.postgres_version ?? "unknown",
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
        encryptionKeyVersion: input.environment.APP_ENCRYPTION_KEY_VERSION,
      },
      externalConfigurationOmitted: [
        "DATABASE_URL",
        "SMTP credentials",
        "environment-managed AI provider credentials",
      ],
      files: {
        "database.dump": { sha256: databaseSha256 },
        "secrets.enc.json": { sha256: secretsSha256 },
      },
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });

    const payloadPath = join(workDirectory, "payload.tar.gz");
    await runCommand(
      "tar",
      [
        "-czf",
        payloadPath,
        "manifest.json",
        "database.dump",
        "secrets.enc.json",
      ],
      {
        cwd: workDirectory,
        environment: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH },
      },
    );
    const archiveName = `ielts-writing-coach-${now.toISOString().replace(/[:.]/gu, "-")}.iwc-backup`;
    const archivePath = join(workDirectory, archiveName);
    await encryptInstanceBackupArchive(
      payloadPath,
      archivePath,
      input.passphrase,
    );
    await rm(payloadPath, { force: true });
    const archive = await stat(archivePath);
    return {
      archivePath,
      archiveName,
      archiveBytes: archive.size,
      archiveSha256: await sha256File(archivePath),
      cleanup,
      stream: () => createReadStream(archivePath),
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export async function readEncryptedSecretsForTest(
  path: string,
): Promise<EncryptedBackupSecrets> {
  return JSON.parse(await readFile(path, "utf8")) as EncryptedBackupSecrets;
}
