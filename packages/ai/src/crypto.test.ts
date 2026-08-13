import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  decryptProviderSecret,
  encryptProviderSecret,
  parseMasterKey,
} from "./crypto";

describe("provider secret encryption", () => {
  it("round-trips with per-record authenticated data", () => {
    const key = randomBytes(32);
    const encrypted = encryptProviderSecret(
      "sk-not-a-real-key",
      key,
      4,
      "connection:a",
    );

    expect(encrypted.ciphertext).not.toContain("sk-not-a-real-key");
    expect(decryptProviderSecret(encrypted, key, "connection:a")).toBe(
      "sk-not-a-real-key",
    );
    expect(() =>
      decryptProviderSecret(encrypted, key, "connection:b"),
    ).toThrow();
  });

  it("accepts base64 and hex master keys", () => {
    const key = randomBytes(32);
    expect(parseMasterKey(key.toString("base64"))).toEqual(key);
    expect(parseMasterKey(key.toString("hex"))).toEqual(key);
  });
});
