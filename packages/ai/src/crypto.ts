import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const AUTH_TAG_BYTES = 16;
const NONCE_BYTES = 12;

export interface EncryptedSecret {
  ciphertext: string;
  nonce: string;
  keyVersion: number;
}

export function parseMasterKey(encoded: string): Buffer {
  const value = encoded.trim();
  const key = /^[a-f\d]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
  if (key.byteLength !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

export function encryptProviderSecret(
  plaintext: string,
  masterKey: Buffer,
  keyVersion: number,
  additionalData: string,
): EncryptedSecret {
  if (masterKey.byteLength !== 32)
    throw new Error("The encryption key must contain 32 bytes.");
  if (!plaintext) throw new Error("A provider secret cannot be empty.");

  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", masterKey, nonce);
  cipher.setAAD(Buffer.from(additionalData, "utf8"));
  const body = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const ciphertext = Buffer.concat([body, cipher.getAuthTag()]);

  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    keyVersion,
  };
}

export function decryptProviderSecret(
  encrypted: EncryptedSecret,
  masterKey: Buffer,
  additionalData: string,
): string {
  if (masterKey.byteLength !== 32)
    throw new Error("The encryption key must contain 32 bytes.");
  const packed = Buffer.from(encrypted.ciphertext, "base64");
  if (packed.byteLength <= AUTH_TAG_BYTES)
    throw new Error("The encrypted secret is malformed.");
  const body = packed.subarray(0, -AUTH_TAG_BYTES);
  const tag = packed.subarray(-AUTH_TAG_BYTES);
  const nonce = Buffer.from(encrypted.nonce, "base64");
  if (nonce.byteLength !== NONCE_BYTES)
    throw new Error("The encrypted secret nonce is malformed.");

  const decipher = createDecipheriv("aes-256-gcm", masterKey, nonce);
  decipher.setAAD(Buffer.from(additionalData, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString(
    "utf8",
  );
}
