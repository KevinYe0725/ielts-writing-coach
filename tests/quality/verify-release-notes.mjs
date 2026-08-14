import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DATABASE_SCHEMA_VERSION,
  EXPECTED_DATABASE_MIGRATION_COUNT,
} from "../../packages/db/src/schema-version.ts";

const repositoryRoot = dirname(
  dirname(dirname(fileURLToPath(import.meta.url))),
);
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;

if (tag === undefined || !/^v\d+\.\d+\.\d+$/u.test(tag)) {
  throw new Error(
    "Pass a release tag in vMAJOR.MINOR.PATCH form (for example, v1.0.0).",
  );
}

const notesPath = join(repositoryRoot, "docs", "releases", `${tag}.md`);
if (!existsSync(notesPath)) {
  throw new Error(`Release notes are required at docs/releases/${tag}.md.`);
}

const notes = readFileSync(notesPath, "utf8");
const failures = [];
const expectedTitle = `# IELTS Writing Coach ${tag}`;
if (notes.split(/\r?\n/u, 1)[0] !== expectedTitle) {
  failures.push(
    `the first line must be exactly ${JSON.stringify(expectedTitle)}`,
  );
}

const requiredSections = [
  "Database migrations",
  "Breaking changes",
  "Known limitations and external gates",
];
for (const section of requiredSections) {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const heading = new RegExp(`^## ${escaped}\\s*$`, "gmu");
  const matches = [...notes.matchAll(heading)];
  if (matches.length !== 1) {
    failures.push(`section \"${section}\" must appear exactly once`);
    continue;
  }
  const start = (matches[0]?.index ?? 0) + matches[0][0].length;
  const remainder = notes.slice(start);
  const nextHeading = remainder.search(/^##\s+/mu);
  const body = (
    nextHeading === -1 ? remainder : remainder.slice(0, nextHeading)
  )
    .replace(/<!--[^]*?-->/gu, "")
    .trim();
  if (body.length < 40) {
    failures.push(
      `section \"${section}\" must contain substantive release notes`,
    );
  }
}

if (/\b(?:TBD|TODO|PLACEHOLDER|COMING SOON)\b/iu.test(notes)) {
  failures.push("release notes must not contain unresolved placeholder text");
}
if (!notes.includes(`\`${DATABASE_SCHEMA_VERSION}\``)) {
  failures.push(
    `release notes must name current database schema ${DATABASE_SCHEMA_VERSION}`,
  );
}
if (
  !new RegExp(
    `\\b${EXPECTED_DATABASE_MIGRATION_COUNT}\\s+application\\s+migrations\\b`,
    "u",
  ).test(notes)
) {
  failures.push(
    `release notes must name ${EXPECTED_DATABASE_MIGRATION_COUNT} application migrations`,
  );
}

if (failures.length > 0) {
  throw new Error(
    `Release notes ${notesPath} are incomplete:\n${failures
      .map((failure) => `- ${failure}`)
      .join("\n")}`,
  );
}

console.log(
  `Release notes ${tag} contain migration, breaking-change, and external-gate sections for ${DATABASE_SCHEMA_VERSION} (${EXPECTED_DATABASE_MIGRATION_COUNT} migrations).`,
);
