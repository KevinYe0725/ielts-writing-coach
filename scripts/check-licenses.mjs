#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const allowedLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "Apache-2.0 AND MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC-BY-4.0",
  "ISC",
  "LGPL-3.0-or-later",
  "MIT",
  "MIT-0",
  "MPL-2.0",
  "Python-2.0",
]);

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const output = execFileSync(pnpm, ["licenses", "list", "--json"], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
const report = JSON.parse(output);
if (report === null || typeof report !== "object" || Array.isArray(report)) {
  throw new Error("pnpm returned an invalid license report");
}

const observed = Object.keys(report).sort();
const rejected = observed.filter((license) => !allowedLicenses.has(license));
if (rejected.length > 0) {
  const packages = rejected.flatMap((license) =>
    (report[license] ?? []).map((entry) => ({
      license,
      name: entry.name,
      versions: entry.versions,
    })),
  );
  throw new Error(
    `Unreviewed dependency license(s): ${rejected.join(", ")}\n${JSON.stringify(packages, null, 2)}`,
  );
}

const packageCount = observed.reduce(
  (count, license) => count + (report[license]?.length ?? 0),
  0,
);
if (packageCount === 0)
  throw new Error("The dependency license report is empty");

console.log(
  `Dependency license policy passed: ${packageCount} package records across ${observed.length} reviewed SPDX license expressions.`,
);
