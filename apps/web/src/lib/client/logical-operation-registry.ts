const SERVER_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_LOGICAL_OPERATIONS = 256;

interface LogicalOperationEntry {
  expiresAt: number;
  generation: number;
  key: string;
}

function canonicalJsonValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toJSON" in value) {
    const toJSON = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === "function")
      return canonicalJsonValue(toJSON.call(value));
  }
  if (Array.isArray(value))
    return value.map((item) => canonicalJsonValue(item) ?? null);
  if (value && typeof value === "object") {
    const canonical: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = canonicalJsonValue((value as Record<string, unknown>)[key]);
      if (item !== undefined) canonical[key] = item;
    }
    return canonical;
  }
  return value;
}

/**
 * Returns a digest-only identity for an exact logical JSON mutation. The raw
 * body is used only while calculating SHA-256 and is never retained by the
 * registry or written to browser storage.
 */
export function canonicalLogicalOperationMaterial(input: {
  body: unknown;
  method: string;
  path: string;
}): string {
  return JSON.stringify({
    body: canonicalJsonValue(input.body),
    method: input.method.toUpperCase(),
    path: input.path,
  });
}

export async function fingerprintLogicalOperationMaterial(
  canonical: string,
): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function fingerprintLogicalOperation(input: {
  body: unknown;
  method: string;
  path: string;
}): Promise<string> {
  return fingerprintLogicalOperationMaterial(
    canonicalLogicalOperationMaterial(input),
  );
}

/**
 * In-memory LRU for unresolved auto-keyed mutations. Its 24-hour expiry
 * matches the server idempotency-record TTL. A page reload intentionally
 * starts a new registry; no request bodies, credentials, or keys are persisted.
 */
export class LogicalOperationRegistry {
  private readonly entries = new Map<string, LogicalOperationEntry>();

  constructor(
    private readonly createKey: () => string,
    private readonly now: () => number,
    private readonly maxEntries = DEFAULT_MAX_LOGICAL_OPERATIONS,
    private readonly ttlMs = SERVER_IDEMPOTENCY_TTL_MS,
  ) {}

  getOrCreate(fingerprint: string, generation: number): string {
    const now = this.now();
    this.pruneExpired(now);
    const existing = this.entries.get(fingerprint);
    if (existing?.generation === generation) {
      this.entries.delete(fingerprint);
      this.entries.set(fingerprint, existing);
      return existing.key;
    }

    const entry = {
      expiresAt: now + this.ttlMs,
      generation,
      key: this.createKey(),
    };
    this.entries.set(fingerprint, entry);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return entry.key;
  }

  clear(fingerprint: string, key: string, generation: number): void {
    const entry = this.entries.get(fingerprint);
    if (entry?.key === key && entry.generation === generation)
      this.entries.delete(fingerprint);
  }

  clearAll(): void {
    this.entries.clear();
  }

  private pruneExpired(now: number): void {
    for (const [fingerprint, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(fingerprint);
    }
  }
}
