#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const skillRoot = resolve(root, ".agents/skills/coach-ielts-writing");
const evidencePath = resolve(
  root,
  process.argv[2] ?? "tests/skill-forward/v1/forward-run.json",
);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) => entry.name !== "__pycache__" && !entry.name.endsWith(".pyc"),
    )
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    })
    .sort();
}

function skillDigest() {
  const hash = createHash("sha256");
  for (const path of walk(skillRoot)) {
    hash.update(relative(skillRoot, path).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function fail(message) {
  throw new Error(`Skill forward evidence invalid: ${message}`);
}

if (!existsSync(evidencePath) || !statSync(evidencePath).isFile()) {
  fail(`missing ${relative(root, evidencePath)}`);
}

const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
if (evidence.schemaVersion !== "1.0.0") fail("unsupported schemaVersion");
if (evidence.skillDigest !== skillDigest()) fail("Skill digest is stale");
if (evidence.invocation?.ephemeral !== true)
  fail("sessions were not ephemeral");
if (evidence.invocation?.ignoreUserConfig !== true) {
  fail("user configuration was not isolated");
}
if (evidence.invocation?.ignoreRules !== true)
  fail("exec rules were not isolated");
if (!Array.isArray(evidence.scenarios) || evidence.scenarios.length < 10) {
  fail("at least 10 scenarios are required");
}

const ids = new Set();
const threads = new Set();
for (const scenario of evidence.scenarios) {
  if (typeof scenario.id !== "string" || !scenario.id)
    fail("scenario missing id");
  if (ids.has(scenario.id)) fail(`duplicate scenario id ${scenario.id}`);
  ids.add(scenario.id);
  if (!/^[0-9a-f-]{36}$/.test(scenario.threadId ?? "")) {
    fail(`${scenario.id} has no valid ephemeral thread id`);
  }
  if (threads.has(scenario.threadId)) {
    fail(`${scenario.id} reused thread ${scenario.threadId}`);
  }
  threads.add(scenario.threadId);
  if (scenario.exitCode !== 0 || scenario.passed !== true) {
    fail(`${scenario.id} did not pass`);
  }
  if (!Array.isArray(scenario.assertions) || scenario.assertions.length === 0) {
    fail(`${scenario.id} has no assertions`);
  }
  for (const assertion of scenario.assertions) {
    if (assertion.passed !== true || typeof assertion.name !== "string") {
      fail(`${scenario.id} contains a failed or malformed assertion`);
    }
  }
  if (scenario.leakCount !== 0) fail(`${scenario.id} leaked protected content`);
}

const generatedAt = Date.parse(evidence.generatedAt);
if (!Number.isFinite(generatedAt)) fail("generatedAt is invalid");
if (generatedAt > Date.now() + 5 * 60_000) fail("generatedAt is in the future");

console.log(
  `Skill forward evidence is valid: ${evidence.scenarios.length} fresh sessions, 0 leaks, digest ${evidence.skillDigest.slice(0, 12)}.`,
);
