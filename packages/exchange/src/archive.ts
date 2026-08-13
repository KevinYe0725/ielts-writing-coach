import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import {
  assertContract,
  validateCycleBundle,
  type CycleBundle,
} from "@iwc/learning-contracts";

import { canonicalJson, sha256Hex } from "./canonical-json";

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_ENTRY_BYTES = 10 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 50;

export class BundleArchiveError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BundleArchiveError";
  }
}

function checksumInput(bundle: CycleBundle): Omit<CycleBundle, "checksum"> {
  const { checksum: _checksum, ...input } = bundle;
  return input;
}

export function calculateBundleChecksum(bundle: CycleBundle): string {
  return sha256Hex(canonicalJson(checksumInput(bundle)));
}

export function signCycleBundle(bundle: CycleBundle): CycleBundle {
  return {
    ...bundle,
    checksum: {
      algorithm: "SHA-256",
      canonicalization: "JCS",
      value: calculateBundleChecksum(bundle),
    },
  };
}

export function verifyCycleBundle(bundle: unknown): CycleBundle {
  assertContract("cycleBundle", bundle);
  const semantic = validateCycleBundle(bundle);
  if (!semantic.valid) {
    throw new BundleArchiveError(
      "BUNDLE_SEMANTIC_INVALID",
      semantic.issues
        .map((issue) => `${issue.instancePath}: ${issue.message}`)
        .join("; "),
    );
  }
  const expected = calculateBundleChecksum(bundle);
  if (bundle.checksum.value !== expected) {
    throw new BundleArchiveError(
      "BUNDLE_CHECKSUM_INVALID",
      "The CycleBundle checksum does not match its contents.",
    );
  }
  assertNoSecrets(bundle);
  return bundle;
}

function readUint16(data: Uint8Array, offset: number): number {
  return data[offset]! | (data[offset + 1]! << 8);
}

function readUint32(data: Uint8Array, offset: number): number {
  return (
    (data[offset]! |
      (data[offset + 1]! << 8) |
      (data[offset + 2]! << 16) |
      (data[offset + 3]! << 24)) >>>
    0
  );
}

function inspectCentralDirectory(data: Uint8Array): void {
  if (data.byteLength > MAX_ARCHIVE_BYTES) {
    throw new BundleArchiveError(
      "ARCHIVE_TOO_LARGE",
      "The compressed bundle exceeds 20 MiB.",
    );
  }
  let end = -1;
  for (
    let offset = data.length - 22;
    offset >= Math.max(0, data.length - 65_557);
    offset -= 1
  ) {
    if (readUint32(data, offset) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  if (end < 0)
    throw new BundleArchiveError(
      "ARCHIVE_INVALID",
      "The ZIP end-of-directory record is missing.",
    );
  const entryCount = readUint16(data, end + 10);
  const centralSize = readUint32(data, end + 12);
  const centralOffset = readUint32(data, end + 16);
  if (entryCount > MAX_ENTRIES || centralOffset + centralSize > data.length) {
    throw new BundleArchiveError(
      "ARCHIVE_LIMIT_EXCEEDED",
      "The ZIP directory is invalid or contains too many entries.",
    );
  }
  let cursor = centralOffset;
  let total = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(data, cursor) !== 0x02014b50) {
      throw new BundleArchiveError(
        "ARCHIVE_INVALID",
        "The ZIP central directory is malformed.",
      );
    }
    const uncompressed = readUint32(data, cursor + 24);
    const nameLength = readUint16(data, cursor + 28);
    const extraLength = readUint16(data, cursor + 30);
    const commentLength = readUint16(data, cursor + 32);
    const name = strFromU8(
      data.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    if (name.startsWith("/") || name.includes("..") || name.includes("\\")) {
      throw new BundleArchiveError(
        "ARCHIVE_PATH_UNSAFE",
        "The archive contains an unsafe entry path.",
      );
    }
    if (uncompressed > MAX_ENTRY_BYTES) {
      throw new BundleArchiveError(
        "ARCHIVE_ENTRY_TOO_LARGE",
        `Archive entry ${name} exceeds 10 MiB.`,
      );
    }
    total += uncompressed;
    if (total > MAX_UNCOMPRESSED_BYTES) {
      throw new BundleArchiveError(
        "ARCHIVE_EXPANSION_LIMIT",
        "The archive expands beyond 50 MiB.",
      );
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
}

const forbiddenKey =
  /(?:api[_-]?key|secret|password|authorization|cookie|provider[_-]?secret|chat[_-]?history|access[_-]?token|refresh[_-]?token|id[_-]?token|session[_-]?token|one[_-]?time[_-]?link)/i;
const likelyKeyValue = /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/;

export function assertNoSecrets(value: unknown, path = "$"): void {
  if (typeof value === "string") {
    if (likelyKeyValue.test(value)) {
      throw new BundleArchiveError(
        "BUNDLE_SECRET_DETECTED",
        `A likely credential was found at ${path}.`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (forbiddenKey.test(key)) {
        throw new BundleArchiveError(
          "BUNDLE_SECRET_FIELD",
          `Forbidden field ${path}.${key} is present.`,
        );
      }
      assertNoSecrets(item, `${path}.${key}`);
    }
  }
}

export function bundleMarkdown(bundle: CycleBundle): string {
  const lines = [
    `# IELTS Writing Coach cycle ${bundle.cycle.id}`,
    "",
    `- Exported: ${bundle.manifest.exportedAt}`,
    `- Source: ${bundle.manifest.source}`,
    `- Contract: ${bundle.contractVersion}`,
    `- State: ${bundle.cycle.state}`,
    "",
    "## Question",
    "",
    bundle.cycle.question.prompt,
    "",
    bundle.cycle.question.instructions,
  ];
  for (const attempt of bundle.attempts) {
    lines.push("", `## ${attempt.version}`, "", attempt.content);
  }
  if (bundle.assessment) {
    lines.push(
      "",
      "## AI-estimated assessment",
      "",
      "> This is an AI estimate, not an official IELTS score or teacher certification.",
      "",
      `Overall: ${bundle.assessment.overallBand}`,
    );
    for (const [criterion, result] of Object.entries(
      bundle.assessment.criteria,
    )) {
      lines.push(`- ${criterion}: ${result.band} — ${result.rationale}`);
    }
  }
  if (bundle.issueEvidence.length > 0) {
    lines.push("", "## Evidence-backed issues", "");
    for (const issue of bundle.issueEvidence) {
      lines.push(`- ${issue.skillId}: “${issue.excerpt}” — ${issue.diagnosis}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function createCycleBundleArchive(input: CycleBundle): Uint8Array {
  const bundle = signCycleBundle(input);
  verifyCycleBundle(bundle);
  const markdown = bundleMarkdown(bundle);
  // Keep the archive boundary independently safe even when callers bypass an
  // HTTP export route. Scan both the canonical JSON and its rendered view.
  assertNoSecrets(bundle);
  assertNoSecrets(markdown, "$.markdown");
  const manifest = {
    bundle_id: bundle.manifest.bundleId,
    cycle_id: bundle.manifest.cycleId,
    contract_version: bundle.contractVersion,
    checksum: bundle.checksum,
    files: ["cycle-bundle.json", "report.md"],
  };
  return zipSync(
    {
      "manifest.json": strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
      "cycle-bundle.json": strToU8(`${JSON.stringify(bundle, null, 2)}\n`),
      "report.md": strToU8(markdown),
    },
    { level: 6 },
  );
}

export function readCycleBundleArchive(data: Uint8Array): CycleBundle {
  inspectCentralDirectory(data);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter: (file) =>
        ["manifest.json", "cycle-bundle.json", "report.md"].includes(file.name),
    });
  } catch (error) {
    throw new BundleArchiveError(
      "ARCHIVE_INVALID",
      `The ZIP archive cannot be read: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  const bundleFile = files["cycle-bundle.json"];
  if (!bundleFile)
    throw new BundleArchiveError(
      "BUNDLE_FILE_MISSING",
      "cycle-bundle.json is missing.",
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(bundleFile));
  } catch {
    throw new BundleArchiveError(
      "BUNDLE_JSON_INVALID",
      "cycle-bundle.json is not valid JSON.",
    );
  }
  return verifyCycleBundle(parsed);
}

/** Create a human-readable, secret-scanned archive for a learner-wide export. */
export function createLearningRecordArchive(
  record: unknown,
  markdown: string,
): Uint8Array {
  assertNoSecrets(record);
  assertNoSecrets(markdown, "$.markdown");
  const checksum = sha256Hex(canonicalJson(record));
  const manifest = {
    format: "iwc-learning-record",
    format_version: 1,
    checksum: {
      algorithm: "SHA-256",
      canonicalization: "JCS",
      value: checksum,
    },
    files: ["learning-record.json", "learning-record.md"],
  };
  return zipSync(
    {
      "manifest.json": strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
      "learning-record.json": strToU8(`${JSON.stringify(record, null, 2)}\n`),
      "learning-record.md": strToU8(
        markdown.endsWith("\n") ? markdown : `${markdown}\n`,
      ),
    },
    { level: 6 },
  );
}
