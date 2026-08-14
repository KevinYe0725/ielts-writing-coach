import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(currentDirectory, "../../app/api/v1");

function routeFiles(directory = apiRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

describe("API security architecture", () => {
  it("keeps every mutation behind the common Origin/CSRF boundary", () => {
    const mutations = routeFiles()
      .map((path) => ({ path, source: readFileSync(path, "utf8") }))
      .filter(({ source }) =>
        /export const (?:POST|PUT|PATCH|DELETE)\b/u.test(source),
      );

    expect(mutations.length).toBeGreaterThan(0);
    for (const route of mutations) {
      expect(route.source, route.path).toContain("protectMutation(request)");
    }
  });

  it("does not use the unbounded Request.json parser in a versioned API route", () => {
    for (const path of routeFiles()) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(
        /\brequest\.json\s*\(/u,
      );
    }
  });

  it("projects provider GET responses without encrypted secret columns", () => {
    const providerRoute = readFileSync(
      join(apiRoot, "providers/route.ts"),
      "utf8",
    );
    const getOnly = providerRoute.slice(
      0,
      providerRoute.indexOf("export const POST"),
    );
    expect(getOnly).not.toContain("secretCiphertext");
    expect(getOnly).not.toContain("secretNonce");
    expect(getOnly).not.toContain("keyVersion");
  });

  it("keeps provider and model-route technical metadata privileged", () => {
    for (const relativePath of [
      "providers/route.ts",
      "model-routes/route.ts",
    ]) {
      const source = readFileSync(join(apiRoot, relativePath), "utf8");
      const getOnly = source.slice(
        0,
        source.indexOf("export const POST") > -1
          ? source.indexOf("export const POST")
          : source.indexOf("export const PUT"),
      );
      expect(getOnly, relativePath).toContain(
        'requireRole(actor, ["owner", "admin"]);',
      );
    }
  });

  it("bounds delegated authentication bodies and disables auth caching", () => {
    const authRoute = readFileSync(
      join(apiRoot, "auth/[...all]/route.ts"),
      "utf8",
    );
    expect(authRoute).toContain("boundedDelegatedJsonRequest(request)");
    expect(authRoute.match(/forceNoStore\(/gu)?.length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("secret-scans JSON and rendered Markdown before every export", () => {
    for (const relativePath of [
      "data/export/route.ts",
      "training-cycles/[id]/export/route.ts",
    ]) {
      const source = readFileSync(join(apiRoot, relativePath), "utf8");
      expect(source, relativePath).toContain("assertNoSecrets(");
      expect(source.match(/assertNoSecrets\(/gu)?.length, relativePath).toBe(2);
    }
  });
});

describe("one-time link response policy", () => {
  it("prevents document shells from surviving a Railway deployment cache", () => {
    const nextConfig = readFileSync(
      join(currentDirectory, "../../../next.config.ts"),
      "utf8",
    );

    expect(nextConfig).toContain('{ key: "Cache-Control", value: "no-store" }');
  });

  it("uses a global no-referrer policy while one-time query strings hydrate", () => {
    const nextConfig = readFileSync(
      join(currentDirectory, "../../../next.config.ts"),
      "utf8",
    );
    expect(nextConfig).toContain(
      '{ key: "Referrer-Policy", value: "no-referrer" }',
    );
    expect(nextConfig).not.toContain(
      'Referrer-Policy", value: "strict-origin-when-cross-origin"',
    );
  });

  it("moves setup, invitation, and recovery tokens into memory and clears their URLs", () => {
    for (const page of ["setup", "join", "recover"]) {
      const source = readFileSync(
        join(currentDirectory, `../../app/${page}/page.tsx`),
        "utf8",
      );
      expect(source, page).toContain("useOneTimeLinkFromAddressBar()");
      expect(source, page).not.toMatch(/(?:local|session)Storage\s*(?:\.|\[)/u);
      expect(source, page).not.toContain("window.location.href");
    }

    const boundary = readFileSync(
      join(currentDirectory, "../client/one-time-link.ts"),
      "utf8",
    );
    expect(boundary).toContain("history.replaceState(");
    expect(boundary).not.toMatch(/(?:local|session)Storage\s*(?:\.|\[)/u);
  });
});
