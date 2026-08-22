import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const globals = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const tokensPath = fileURLToPath(
  new URL("../../styles/tokens.css", import.meta.url),
);

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

const cssFiles = filesBelow(sourceRoot)
  .filter((path) => extname(path) === ".css")
  .sort();
const cssDocuments = cssFiles.map((path) => ({
  path,
  source: readFileSync(path, "utf8"),
}));
const tokens = readFileSync(tokensPath, "utf8");

function customProperties(source: string): Map<string, string> {
  return new Map(
    [...source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/gu)].map((match) => [
      match[1]!,
      match[2]!.trim().replace(/\s+/gu, " "),
    ]),
  );
}

function declarations(
  source: string,
  propertyPattern: string,
): Array<{ property: string; value: string }> {
  const pattern = new RegExp(
    `(?:^|[;{])\\s*(${propertyPattern})\\s*:\\s*([^;}]+)`,
    "gmu",
  );
  return [...source.matchAll(pattern)].map((match) => ({
    property: match[1]!,
    value: match[2]!.trim(),
  }));
}

const remainingGlobalClassInventory = [
  "amber",
  "badge",
  "badge-amber",
  "badge-blue",
  "badge-green",
  "badge-neutral",
  "badge-red",
  "blue",
  "button",
  "button-danger",
  "button-ghost",
  "button-lg",
  "button-primary",
  "button-secondary",
  "button-sm",
  "card",
  "card-title-row",
  "check-row",
  "check-row-icon",
  "check-row-next",
  "completion-actions",
  "completion-icon",
  "empty-icon",
  "empty-state",
  "error",
  "exercise-textarea",
  "eyebrow",
  "field-hint",
  "field-label",
  "form-field",
  "icon-button",
  "inline-probe",
  "modal-actions",
  "modal-backdrop",
  "modal-card",
  "modal-icon",
  "page-actions",
  "page-header",
  "page-header-copy",
  "page-lede",
  "panel-note",
  "rewrite-locked-message",
  "section-header",
  "select-input",
  "settings-fields",
  "skeleton-block",
  "skeleton-card",
  "skeleton-grid",
  "skeleton-layout",
  "skeleton-line",
  "skeleton-short",
  "skip-link",
  "spin",
  "sr-only",
  "stat-icon",
  "status-banner",
  "status-banner-warning",
  "success",
  "switch",
  "switch-row",
  "switch-row-copy",
  "text-area",
  "text-input",
  "transfer-result-card",
] as const;

const pageFamilyModules = [
  "../../components/app-shell.module.css",
  "../../components/writing-room.module.css",
  "../../app/entry.module.css",
  "../../app/today/today.module.css",
  "../../app/feedback/feedback.module.css",
  "../../app/lesson/page.module.css",
  "../../app/lesson/paper/paper.module.css",
  "../../app/compare/compare.module.css",
  "../../app/growth/growth.module.css",
  "../../app/transfer/transfer.module.css",
  "../../app/settings/settings.module.css",
  "../../app/admin/admin.module.css",
] as const;

const frozenHookSources = [
  {
    hook: "mobile-header",
    moduleClass: "mobileHeader",
    source: new URL("../../components/app-shell.tsx", import.meta.url),
  },
  {
    hook: "mobile-menu",
    moduleClass: "mobileMenu",
    source: new URL("../../components/app-shell.tsx", import.meta.url),
  },
  {
    hook: "next-task-card",
    moduleClass: "primaryAction",
    source: new URL("../../app/today/page.tsx", import.meta.url),
  },
  {
    hook: "practice-paper-question",
    moduleClass: "question",
    source: new URL("../../app/lesson/paper/page.tsx", import.meta.url),
  },
] as const;

function classTokens(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g)].map(
        (match) => match[1]!,
      ),
    ),
  ].sort();
}

describe("global style ownership", () => {
  it("keeps globals below the audited foundations and compatibility ceiling", () => {
    expect(globals.split("\n").length).toBeLessThanOrEqual(880);
  });

  it("matches the complete approved remaining global class inventory", () => {
    expect(classTokens(globals)).toEqual([...remainingGlobalClassInventory]);
  });

  it("contains no page-family class token owned by a CSS Module", () => {
    const allowed = new Set<string>(remainingGlobalClassInventory);
    const moduleOwnedTokens = new Set(
      pageFamilyModules.flatMap((modulePath) =>
        classTokens(readFileSync(new URL(modulePath, import.meta.url), "utf8")),
      ),
    );
    const forbiddenModuleTokens = new Set(
      [...moduleOwnedTokens].filter((token) => !allowed.has(token)),
    );

    expect(
      classTokens(globals).filter((token) => forbiddenModuleTokens.has(token)),
    ).toEqual([]);
  });

  it.each(frozenHookSources)(
    "binds the frozen .$hook hook to styles.$moduleClass in one cn expression",
    ({ hook, moduleClass, source }) => {
      const component = readFileSync(source, "utf8");
      const ownershipExpression = new RegExp(
        `className=\\{cn\\(\\s*["']${hook}["']\\s*,\\s*styles\\.${moduleClass}\\s*\\)\\}`,
        "s",
      );

      expect(component).toMatch(ownershipExpression);
    },
  );
});

describe("annotation desk token contract", () => {
  it("defines every custom property consumed by shipped CSS", () => {
    const definitions = new Set(
      cssDocuments
        .flatMap(({ source }) => [...source.matchAll(/(--[\w-]+)\s*:/gu)])
        .map((match) => match[1]!),
    );
    const uses = new Set(
      cssDocuments
        .flatMap(({ source }) => [...source.matchAll(/var\(\s*(--[\w-]+)/gu)])
        .map((match) => match[1]!),
    );

    expect(
      [...uses].filter((property) => !definitions.has(property)).sort(),
    ).toEqual([]);
  });

  it("declares the complete approved role and scale tokens", () => {
    const defined = customProperties(tokens);
    const expected = {
      "--desk-ink": "#172033",
      "--desk-paper": "#fcfbf8",
      "--desk-canvas": "#eef1f5",
      "--desk-blue": "#1d56a0",
      "--desk-green": "#2f6d5a",
      "--desk-amber": "#7c531b",
      "--desk-error": "#b4474c",
      "--desk-type-auxiliary": "12px",
      "--desk-type-meta": "13px",
      "--desk-type-label": "14px",
      "--desk-type-body": "16px",
      "--desk-type-reading": "17px",
      "--desk-type-subheading": "20px",
      "--desk-type-section-title": "clamp(24px, 3vw, 28px)",
      "--desk-type-page-title": "clamp(30px, 4vw, 40px)",
      "--desk-weight-regular": "400",
      "--desk-weight-medium": "500",
      "--desk-weight-reading-semibold": "600",
      "--desk-weight-emphasis": "650",
      "--desk-weight-bold": "700",
      "--desk-space-1": "4px",
      "--desk-space-2": "8px",
      "--desk-space-3": "12px",
      "--desk-space-4": "16px",
      "--desk-space-6": "24px",
      "--desk-space-8": "32px",
      "--desk-space-12": "48px",
      "--desk-space-16": "64px",
      "--desk-space-20": "80px",
      "--desk-radius-sm": "6px",
      "--desk-radius-md": "10px",
      "--desk-radius-lg": "16px",
      "--desk-radius-pill": "999px",
      "--desk-radius-round": "50%",
      "--desk-layout-sidebar": "232px",
      "--desk-layout-mobile-header": "64px",
      "--desk-layout-entry-max": "560px",
      "--desk-layout-focus-max": "1120px",
      "--desk-layout-reading-max": "1160px",
      "--desk-layout-reading-copy": "760px",
      "--desk-layout-reading-aside": "220px",
      "--desk-layout-workspace-max": "1440px",
    } as const;

    for (const [property, value] of Object.entries(expected)) {
      expect(defined.get(property), property).toBe(value);
    }
    expect(defined.get("--desk-shadow-floating")).toMatch(
      /^0 18px 52px color-mix\(in srgb, var\(--desk-ink\) \d+%, transparent\)$/u,
    );
    for (const property of [
      "--desk-evidence-muted",
      "--desk-ink-muted",
      "--desk-line",
      "--desk-line-strong",
      "--desk-blue-soft",
      "--desk-green-soft",
      "--desk-amber-soft",
      "--desk-error-soft",
    ]) {
      expect(defined.get(property), property).toMatch(/^color-mix\(/u);
    }
  });

  it("keeps every legacy global variable as an alias to an approved desk token", () => {
    const root = globals.match(/:root\s*\{([^}]*)\}/su)?.[1] ?? "";
    const legacy = customProperties(root);
    expect(legacy.size).toBeGreaterThan(0);
    for (const [property, value] of legacy) {
      expect(value, property).toMatch(/^var\(--desk-[\w-]+\)$/u);
    }
  });

  it("uses no raw palette or Violet semantics outside the token source", () => {
    const violations = cssDocuments.flatMap(({ path, source }) => {
      if (path === tokensPath) return [];
      return [
        ...source.matchAll(
          /#[\da-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black|violet|purple)\b(?!-)/giu,
        ),
      ].map((match) => `${path.slice(sourceRoot.length + 1)}: ${match[0]}`);
    });

    expect(violations).toEqual([]);
  });

  it("uses approved typography roles for every declared size and weight", () => {
    const violations = cssDocuments.flatMap(({ path, source }) => [
      ...declarations(source, "font-size|font-weight")
        .filter(({ property, value }) => {
          if (value === "inherit") return false;
          return property === "font-size"
            ? !/^var\(--desk-type-[\w-]+\)$/u.test(value)
            : !/^var\(--desk-weight-[\w-]+\)$/u.test(value);
        })
        .map(
          ({ property, value }) =>
            `${path.slice(sourceRoot.length + 1)}: ${property}: ${value}`,
        ),
    ]);

    expect(violations).toEqual([]);
  });

  it("keeps spacing, radii, and shadows on the approved executable scales", () => {
    const approvedSpacing = new Set([0, 4, 8, 12, 16, 24, 32, 48, 64, 80]);
    const spacingViolations = cssDocuments.flatMap(({ path, source }) =>
      declarations(
        source,
        "gap|row-gap|column-gap|padding(?:-(?:top|right|bottom|left|inline|block))?|margin(?:-(?:top|right|bottom|left|inline|block))?",
      ).flatMap(({ property, value }) =>
        [...value.matchAll(/(-?[\d.]+)(px|rem|em)\b/gu)]
          .map((match) => {
            const parsed = Number(match[1]);
            return match[2] === "px" ? parsed : parsed * 16;
          })
          .filter(
            (pixels) =>
              !approvedSpacing.has(pixels) &&
              !(property === "margin" && pixels === -1),
          )
          .map(
            (pixels) =>
              `${path.slice(sourceRoot.length + 1)}: ${property}: ${value} (${pixels}px)`,
          ),
      ),
    );
    const radiusViolations = cssDocuments.flatMap(({ path, source }) =>
      declarations(source, "border-radius")
        .filter(
          ({ value }) =>
            !/^var\(--desk-radius-(?:sm|md|lg|pill|round)\)$/u.test(value) &&
            value !== "0",
        )
        .map(
          ({ value }) =>
            `${path.slice(sourceRoot.length + 1)}: border-radius: ${value}`,
        ),
    );
    const shadowViolations = cssDocuments.flatMap(({ path, source }) =>
      declarations(source, "box-shadow")
        .filter(
          ({ value }) =>
            value !== "none" && value !== "var(--desk-shadow-floating)",
        )
        .map(
          ({ value }) =>
            `${path.slice(sourceRoot.length + 1)}: box-shadow: ${value}`,
        ),
    );

    expect(spacingViolations).toEqual([]);
    expect(radiusViolations).toEqual([]);
    expect(shadowViolations).toEqual([]);
  });

  it("binds the shell and page layouts to named approved constants", () => {
    const layout = readFileSync(
      new URL(
        "../../components/layout/page-layout.module.css",
        import.meta.url,
      ),
      "utf8",
    );
    const shell = readFileSync(
      new URL("../../components/app-shell.module.css", import.meta.url),
      "utf8",
    );

    expect(layout).toContain("var(--desk-layout-entry-max)");
    expect(layout).toContain("var(--desk-layout-focus-max)");
    expect(layout).toContain("var(--desk-layout-reading-max)");
    expect(layout).toContain("var(--desk-layout-workspace-max)");
    expect(shell).toContain("var(--desk-layout-sidebar)");
    expect(shell).toContain("var(--desk-layout-mobile-header)");
  });
});
