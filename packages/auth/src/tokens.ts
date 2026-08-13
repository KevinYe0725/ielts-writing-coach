import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function digestOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

export function tokenMatchesDigest(
  token: string,
  expectedDigest: string,
): boolean {
  const actual = Buffer.from(digestOpaqueToken(token));
  const expected = Buffer.from(expectedDigest);
  return (
    actual.byteLength === expected.byteLength &&
    timingSafeEqual(actual, expected)
  );
}
