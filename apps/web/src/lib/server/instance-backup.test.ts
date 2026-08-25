import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  decryptProviderSecret,
  encryptProviderSecret,
  parseMasterKey,
} from "@iwc/ai";
import { readServerEnvironment } from "@iwc/config";
import { createDatabase, newDomainId, searchConnection, user } from "@iwc/db";

import {
  decryptBackupSecrets,
  decryptInstanceBackupArchive,
  createInstanceBackup,
  encryptInstanceBackupArchive,
  encryptBackupSecrets,
  postgresClientEnvironment,
  readEncryptedSecretsForTest,
} from "./instance-backup";

function restoredSearchConnection(
  sqlDump: string,
  connectionId: string,
): Record<string, string> {
  const copy = sqlDump.match(
    /COPY public\.search_connection \(([^)]+)\) FROM stdin;\n/u,
  );
  if (!copy?.[1]) throw new Error("search_connection COPY header is missing");
  const columns = copy[1]
    .split(", ")
    .map((column) => column.replaceAll('"', ""));
  const row = sqlDump
    .split("\n")
    .find((line) => line.startsWith(`${connectionId}\t`));
  if (!row) throw new Error("search_connection backup row is missing");
  return Object.fromEntries(
    columns.map((column, index) => [column, row.split("\t")[index] ?? ""]),
  );
}

describe("encrypted instance backups", () => {
  it("round-trips instance secrets only with the supplied passphrase", async () => {
    const source = {
      authSecret: "auth-value-that-must-never-be-plaintext",
      encryptionKey: "master-value-that-must-never-be-plaintext",
      encryptionKeyVersion: 2,
    };
    const envelope = await encryptBackupSecrets(
      source,
      "correct horse battery staple",
    );
    expect(JSON.stringify(envelope)).not.toContain(source.authSecret);
    expect(JSON.stringify(envelope)).not.toContain(source.encryptionKey);
    await expect(
      decryptBackupSecrets(envelope, "wrong passphrase"),
    ).rejects.toThrow();
    await expect(
      decryptBackupSecrets(envelope, "correct horse battery staple"),
    ).resolves.toEqual(source);
  });

  it("passes PostgreSQL credentials through child environment, never argv", () => {
    const environment = postgresClientEnvironment(
      "postgresql://backup%20user:private%2Fpass@db.internal:5544/iwc?sslmode=require",
    );
    expect(environment).toMatchObject({
      PGDATABASE: "iwc",
      PGHOST: "db.internal",
      PGPORT: "5544",
      PGUSER: "backup user",
      PGPASSWORD: "private/pass",
      PGSSLMODE: "require",
    });
  });

  it("authenticates every byte of the complete private archive", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iwc-backup-crypto-test-"));
    const payload = join(directory, "payload.tar.gz");
    const archive = join(directory, "backup.iwc-backup");
    const restored = join(directory, "restored.tar.gz");
    try {
      await writeFile(payload, "private essay and database content", {
        mode: 0o600,
      });
      await encryptInstanceBackupArchive(
        payload,
        archive,
        "archive encryption passphrase",
      );
      expect(
        (await readFile(archive)).includes(Buffer.from("private essay")),
      ).toBe(false);
      await decryptInstanceBackupArchive(
        archive,
        restored,
        "archive encryption passphrase",
      );
      expect(await readFile(restored, "utf8")).toBe(
        "private essay and database content",
      );
      const tampered = await readFile(archive);
      tampered[Math.floor(tampered.byteLength / 2)]! ^= 1;
      await writeFile(archive, tampered);
      await expect(
        decryptInstanceBackupArchive(
          archive,
          join(directory, "tampered-output"),
          "archive encryption passphrase",
        ),
      ).rejects.toThrow();
      const protectedOutput = join(directory, "protected-existing-file");
      await writeFile(protectedOutput, "preserve me");
      await expect(
        decryptInstanceBackupArchive(
          archive,
          protectedOutput,
          "archive encryption passphrase",
        ),
      ).rejects.toThrow();
      expect(await readFile(protectedOutput, "utf8")).toBe("preserve me");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

const integrationUrl = process.env.DATABASE_URL;
const integration = integrationUrl ? describe : describe.skip;

integration("PostgreSQL instance backup", () => {
  if (!integrationUrl) return;
  const { db, pool } = createDatabase(integrationUrl);

  afterAll(async () => {
    await pool.end();
  });

  it("creates a private, restorable archive with the canonical three files", async () => {
    const environment = readServerEnvironment({
      NODE_ENV: "test",
      DATABASE_URL: integrationUrl,
      AUTH_SECRET: "a".repeat(32),
      APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
      SETUP_TOKEN: "test-only-setup-token",
    });
    const backup = await createInstanceBackup({
      pool,
      environment,
      passphrase: "integration backup passphrase",
      now: new Date("2026-08-13T12:00:00.000Z"),
    });
    try {
      const payload = `${backup.archivePath}.payload.tar.gz`;
      await decryptInstanceBackupArchive(
        backup.archivePath,
        payload,
        "integration backup passphrase",
      );
      const { stdout } = await promisify(execFile)("tar", ["-tzf", payload]);
      expect(stdout.trim().split("\n").sort()).toEqual([
        "database.dump",
        "manifest.json",
        "secrets.enc.json",
      ]);
      expect(backup.archiveBytes).toBeGreaterThan(0);
      expect(backup.archiveSha256).toMatch(/^[a-f\d]{64}$/u);
    } finally {
      await backup.cleanup();
    }
  });

  it("preserves encrypted search connections only inside an authenticated archive", async () => {
    const suffix = newDomainId();
    const ownerId = `backup-search-owner-${suffix}`;
    const connectionId = newDomainId();
    const fixtureSecret = `fixture-search-secret-${suffix}`;
    const masterKey = Buffer.alloc(32, 2);
    const keyVersion = 7;
    const additionalData = `search:${ownerId}:${connectionId}`;
    const encrypted = encryptProviderSecret(
      fixtureSecret,
      masterKey,
      keyVersion,
      additionalData,
    );
    const directory = await mkdtemp(join(tmpdir(), "iwc-backup-search-test-"));
    const environment = readServerEnvironment({
      NODE_ENV: "test",
      DATABASE_URL: integrationUrl,
      AUTH_SECRET: "b".repeat(32),
      APP_ENCRYPTION_KEY: masterKey.toString("base64"),
      APP_ENCRYPTION_KEY_VERSION: String(keyVersion),
      SETUP_TOKEN: "test-only-setup-token",
    });
    try {
      await db.insert(user).values({
        id: ownerId,
        name: "Backup search owner",
        email: `${suffix}@example.test`,
        role: "owner",
      });
      await db.insert(searchConnection).values({
        id: connectionId,
        configuredByUserId: ownerId,
        kind: "BRAVE",
        encryptedApiKey: encrypted.ciphertext,
        encryptedApiKeyNonce: encrypted.nonce,
        encryptionKeyVersion: encrypted.keyVersion,
        status: "ACTIVE",
      });

      const backup = await createInstanceBackup({
        pool,
        environment,
        passphrase: "authenticated archive passphrase",
        now: new Date("2026-08-25T12:00:00.000Z"),
      });
      try {
        const archiveBytes = await readFile(backup.archivePath);
        expect(archiveBytes.includes(Buffer.from(connectionId))).toBe(false);
        expect(archiveBytes.includes(Buffer.from(fixtureSecret))).toBe(false);
        expect(archiveBytes.includes(Buffer.from(encrypted.ciphertext))).toBe(
          false,
        );

        const rejectedPayload = join(directory, "wrong-passphrase.tar.gz");
        await expect(
          decryptInstanceBackupArchive(
            backup.archivePath,
            rejectedPayload,
            "wrong archive passphrase",
          ),
        ).rejects.toThrow();
        await expect(readFile(rejectedPayload)).rejects.toThrow();

        const payload = join(directory, "authenticated.tar.gz");
        await decryptInstanceBackupArchive(
          backup.archivePath,
          payload,
          "authenticated archive passphrase",
        );
        await promisify(execFile)("tar", [
          "-xzf",
          payload,
          "-C",
          directory,
          "database.dump",
          "secrets.enc.json",
        ]);
        const secretsEnvelope = await readEncryptedSecretsForTest(
          join(directory, "secrets.enc.json"),
        );
        await expect(
          decryptBackupSecrets(secretsEnvelope, "wrong inner passphrase"),
        ).rejects.toThrow();
        const archivedSecrets = await decryptBackupSecrets(
          secretsEnvelope,
          "authenticated archive passphrase",
        );
        expect(JSON.stringify(archivedSecrets)).not.toContain(fixtureSecret);
        expect(archivedSecrets).toMatchObject({
          encryptionKey: masterKey.toString("base64"),
          encryptionKeyVersion: keyVersion,
        });
        const { stdout } = await promisify(execFile)(
          process.env.IWC_PG_RESTORE_PATH ?? "pg_restore",
          [
            "--data-only",
            "--table=search_connection",
            "--file=-",
            join(directory, "database.dump"),
          ],
          { maxBuffer: 8 * 1_024 * 1_024 },
        );
        const restored = restoredSearchConnection(stdout, connectionId);
        const restoredEnvelope = {
          ciphertext: restored.encrypted_api_key!,
          nonce: restored.encrypted_api_key_nonce!,
          keyVersion: Number(restored.encryption_key_version),
        };
        const archivedMasterKey = parseMasterKey(
          String(archivedSecrets.encryptionKey),
        );
        const recovered = decryptProviderSecret(
          restoredEnvelope,
          archivedMasterKey,
          additionalData,
        );
        expect(recovered === fixtureSecret).toBe(true);
        expect(restoredEnvelope.keyVersion).toBe(keyVersion);
        expect(() =>
          decryptProviderSecret(
            restoredEnvelope,
            Buffer.alloc(32, 99),
            additionalData,
          ),
        ).toThrow();
        expect(() =>
          decryptProviderSecret(
            restoredEnvelope,
            archivedMasterKey,
            `search:wrong-owner:${connectionId}`,
          ),
        ).toThrow();
        expect(() =>
          decryptProviderSecret(
            restoredEnvelope,
            archivedMasterKey,
            `search:${ownerId}:${newDomainId()}`,
          ),
        ).toThrow();
      } finally {
        await backup.cleanup();
      }
    } finally {
      await db
        .delete(searchConnection)
        .where(eq(searchConnection.id, connectionId));
      await db.delete(user).where(eq(user.id, ownerId));
      await rm(directory, { recursive: true, force: true });
    }
  });
});
