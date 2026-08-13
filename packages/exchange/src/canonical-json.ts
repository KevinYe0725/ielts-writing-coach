import { createHash } from "node:crypto";

function serializeNumber(value: number): string {
  if (!Number.isFinite(value))
    throw new TypeError("Canonical JSON cannot contain a non-finite number.");
  if (Object.is(value, -0)) return "0";
  return JSON.stringify(value);
}

/** RFC 8785-compatible serialization for JSON-compatible JavaScript values. */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return serializeNumber(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(",")}]`;
      const object = value as Record<string, unknown>;
      const keys = Object.keys(object).sort();
      return `{${keys
        .filter((key) => object[key] !== undefined)
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
        .join(",")}}`;
    }
    default:
      throw new TypeError(`Canonical JSON cannot contain ${typeof value}.`);
  }
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
