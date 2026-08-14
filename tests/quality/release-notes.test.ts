import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DATABASE_SCHEMA_VERSION,
  EXPECTED_DATABASE_MIGRATION_COUNT,
} from "../../packages/db/src/schema-version";

const validator = fileURLToPath(
  new URL("./verify-release-notes.mjs", import.meta.url),
);

describe("versioned release notes gate", () => {
  it("accepts the complete v1.0.0 release notes", () => {
    const result = spawnSync(process.execPath, [validator, "v1.0.0"], {
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "migration, breaking-change, and external-gate",
    );
    expect(result.stdout).toContain(DATABASE_SCHEMA_VERSION);
    expect(result.stdout).toContain(
      `${EXPECTED_DATABASE_MIGRATION_COUNT} migrations`,
    );
  });

  it("rejects a release tag without a corresponding notes file", () => {
    const result = spawnSync(process.execPath, [validator, "v1.0.1"], {
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("docs/releases/v1.0.1.md");
  });
});
