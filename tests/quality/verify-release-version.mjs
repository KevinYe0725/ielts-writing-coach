import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(
  dirname(dirname(fileURLToPath(import.meta.url))),
);
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;

if (tag === undefined || !/^v\d+\.\d+\.\d+$/u.test(tag)) {
  throw new Error(
    "Pass a release tag in vMAJOR.MINOR.PATCH form (for example, v1.0.0).",
  );
}

const expectedVersion = tag.slice(1);
const manifestPaths = [join(repositoryRoot, "package.json")];
for (const workspaceGroup of ["apps", "packages"]) {
  const groupPath = join(repositoryRoot, workspaceGroup);
  for (const entry of readdirSync(groupPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(groupPath, entry.name, "package.json");
    if (existsSync(manifestPath)) manifestPaths.push(manifestPath);
  }
}

const mismatches = manifestPaths.flatMap((manifestPath) => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return manifest.version === expectedVersion
    ? []
    : [`${manifest.name ?? manifestPath}: ${manifest.version ?? "missing"}`];
});
const applicationVersionSource = readFileSync(
  join(repositoryRoot, "packages/config/src/version.ts"),
  "utf8",
);
const embeddedApplicationVersion = applicationVersionSource.match(
  /APPLICATION_VERSION\s*=\s*["']([^"']+)["']/u,
)?.[1];
if (embeddedApplicationVersion !== expectedVersion) {
  mismatches.push(
    `public APPLICATION_VERSION: ${embeddedApplicationVersion ?? "missing"}`,
  );
}

if (mismatches.length > 0) {
  throw new Error(
    `Release tag ${tag} does not match every package:\n${mismatches.join("\n")}`,
  );
}

console.log(
  `Release version ${expectedVersion} matches ${manifestPaths.length} package manifests and the public version API.`,
);
