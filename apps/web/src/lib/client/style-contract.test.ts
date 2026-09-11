import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse, type Root } from "postcss";
import valueParser from "postcss-value-parser";
import { describe, expect, it } from "vitest";

const globals = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const tokensPath = fileURLToPath(
  new URL("../../styles/tokens.css", import.meta.url),
);
const foundationsPath = fileURLToPath(
  new URL("../../styles/foundations.css", import.meta.url),
);

type CssDocument = { path: string; root?: Root; source: string };

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

const cssFiles = filesBelow(sourceRoot)
  .filter((path) => extname(path) === ".css")
  .sort();
const cssDocuments = cssFiles.map((path) => {
  const source = readFileSync(path, "utf8");
  return { path, root: parse(source, { from: path }), source };
});
const tokens = readFileSync(tokensPath, "utf8");
const foundations = readFileSync(foundationsPath, "utf8");
const globalsRoot = parse(globals, { from: "globals.css" });
const tokensRoot = parse(tokens, { from: tokensPath });
const foundationsRoot = parse(foundations, { from: foundationsPath });

function documentRoot(document: CssDocument): Root {
  return document.root ?? parse(document.source, { from: document.path });
}

function customProperties(root: Root): Map<string, string> {
  const properties = new Map<string, string>();
  root.walkDecls((declaration) => {
    if (!declaration.prop.startsWith("--")) return;
    properties.set(
      declaration.prop,
      declaration.value.trim().replace(/\s+/gu, " "),
    );
  });
  return properties;
}

function declarations(
  root: Root,
  propertyPattern: string,
): Array<{ property: string; value: string }> {
  const pattern = new RegExp(`^(?:${propertyPattern})$`, "u");
  const matches: Array<{ property: string; value: string }> = [];
  root.walkDecls((declaration) => {
    const property = declaration.prop.toLowerCase();
    if (!pattern.test(property)) return;
    matches.push({ property, value: declaration.value.trim() });
  });
  return matches;
}

function cssFileLabel(path: string): string {
  return path.startsWith(sourceRoot) ? path.slice(sourceRoot.length) : path;
}

// CSS custom properties have no implicit platform exemption. A missing
// property is allowed only when this exact name is audited here and its use
// supplies a fallback. Shipped CSS currently needs no such exception.
const allowedUndefinedFallbackProperties = new Set<string>();
// The shipped reset needs `font: inherit`; no other CSS-wide or shorthand
// value has an audited use.
const allowedFontShorthandValues = new Set(["inherit"]);

function customPropertyUses(root: Root): Array<{
  hasFallback: boolean;
  property: string;
}> {
  const uses: Array<{ hasFallback: boolean; property: string }> = [];
  const inspectValue = (value: string) => {
    valueParser(value).walk((node) => {
      if (node.type !== "function" || node.value.toLowerCase() !== "var") {
        return;
      }
      const firstArgument = node.nodes.find(
        (child) => child.type !== "space" && child.type !== "comment",
      );
      if (
        firstArgument?.type !== "word" ||
        !firstArgument.value.startsWith("--")
      ) {
        return;
      }
      uses.push({
        hasFallback: node.nodes.some(
          (child) => child.type === "div" && child.value === ",",
        ),
        property: firstArgument.value,
      });
    });
  };

  root.walkDecls((declaration) => inspectValue(declaration.value));
  root.walkAtRules((atRule) => inspectValue(atRule.params));
  return uses;
}

function undefinedCustomProperties(
  documents: readonly CssDocument[],
  allowedUndefinedFallbacks = allowedUndefinedFallbackProperties,
): string[] {
  const definitions = new Set(
    documents.flatMap((document) => [
      ...customProperties(documentRoot(document)).keys(),
    ]),
  );
  const violations = new Set<string>();

  for (const document of documents) {
    for (const { hasFallback, property } of customPropertyUses(
      documentRoot(document),
    )) {
      if (definitions.has(property)) continue;
      if (hasFallback && allowedUndefinedFallbacks.has(property)) continue;
      violations.add(`${cssFileLabel(document.path)}: ${property}`);
    }
  }

  return [...violations].sort();
}

function fontShorthandViolations(
  documents: readonly CssDocument[],
  allowedValues = allowedFontShorthandValues,
): string[] {
  const normalizedAllowedValues = new Set(
    [...allowedValues].map((value) => value.trim().toLowerCase()),
  );
  return documents
    .flatMap((document) =>
      declarations(documentRoot(document), "font")
        .filter(
          ({ value }) =>
            !normalizedAllowedValues.has(value.trim().toLowerCase()),
        )
        .map(({ value }) => `${cssFileLabel(document.path)}: font: ${value}`),
    )
    .sort();
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
    hook: "topbar",
    moduleClass: "topbar",
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
    expect(undefinedCustomProperties(cssDocuments)).toEqual([]);
  });

  it("detects a misspelled custom property in a mutation fixture", () => {
    const mutation = [
      {
        path: "mutation.css",
        source:
          '/* --desk-bule: hotpink; */ :root { --desk-blue: #1d56a0; } .fixture::before { content: "--desk-bule: hotpink"; color: var(--desk-bule); }',
      },
    ];

    expect(undefinedCustomProperties(mutation)).toEqual([
      "mutation.css: --desk-bule",
    ]);
  });

  it("requires an explicit allowlist for an undefined property with fallback", () => {
    const fallbackFixture = [
      {
        path: "fallback.css",
        source: ".fixture { color: var(--host-accent, currentColor); }",
      },
    ];

    expect(undefinedCustomProperties(fallbackFixture)).toEqual([
      "fallback.css: --host-accent",
    ]);
    expect(
      undefinedCustomProperties(fallbackFixture, new Set(["--host-accent"])),
    ).toEqual([]);
  });

  it("allows only the audited inherit font shorthand in shipped CSS", () => {
    expect(fontShorthandViolations(cssDocuments)).toEqual([]);
  });

  it("detects a non-inherit font shorthand in a mutation fixture", () => {
    const mutation = [
      {
        path: "mutation.css",
        source: ".fixture { font: 650 16px/1.5 var(--desk-font-body); }",
      },
    ];

    expect(fontShorthandViolations(mutation)).toEqual([
      "mutation.css: font: 650 16px/1.5 var(--desk-font-body)",
    ]);
  });

  it("normalizes mixed-case font properties and inherit values", () => {
    const mutation = [
      {
        path: "mixed-case.css",
        source:
          ".safe { FoNt: InHeRiT; } .unsafe { FONT: 650 16px/1.5 var(--desk-font-body); }",
      },
    ];

    expect(fontShorthandViolations(mutation)).toEqual([
      "mixed-case.css: font: 650 16px/1.5 var(--desk-font-body)",
    ]);
  });

  it("declares the complete approved role and scale tokens", () => {
    const defined = customProperties(tokensRoot);
    const expected = {
      "--desk-ink": "#172033",
      "--desk-paper": "#ffffff",
      "--desk-canvas": "#f6f8fb",
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
      "--desk-font-body": '"Noto Sans SC Variable", "PingFang SC", sans-serif',
      "--desk-font-reading": '"Source Serif 4 Variable", Georgia, serif',
      "--desk-font-utility": '"IBM Plex Sans Variable", "Segoe UI", sans-serif',
      "--desk-body-weight-regular": "400",
      "--desk-body-weight-medium": "500",
      "--desk-body-weight-semibold": "650",
      "--desk-body-weight-bold": "700",
      "--desk-reading-weight-regular": "400",
      "--desk-reading-weight-semibold": "600",
      "--desk-utility-weight-medium": "500",
      "--desk-utility-weight-semibold": "600",
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

  it("keeps all typography roles in the approved token system", () => {
    const approvedFamilies = new Set([
      "inherit",
      "var(--desk-font-body)",
      "var(--desk-font-reading)",
      "var(--desk-font-utility)",
    ]);
    const approvedWeights = new Set([
      "inherit",
      "var(--desk-body-weight-regular)",
      "var(--desk-body-weight-medium)",
      "var(--desk-body-weight-semibold)",
      "var(--desk-body-weight-bold)",
      "var(--desk-reading-weight-regular)",
      "var(--desk-reading-weight-semibold)",
      "var(--desk-utility-weight-medium)",
      "var(--desk-utility-weight-semibold)",
    ]);
    const typographyDefinition =
      /^--(?:font-(?:sans|serif)|desk-(?:font-(?:body|reading|utility)|weight-[\w-]+|(?:body|reading|utility)-weight-[\w-]+))$/u;
    const typographyDefinitionsOutsideTokens = cssDocuments.flatMap(
      ({ path, root }) => {
        if (path === tokensPath) return [];
        return [...customProperties(root).keys()]
          .filter((property) => typographyDefinition.test(property))
          .map((property) => `${cssFileLabel(path)}: ${property}`);
      },
    );
    const tokenTypography = Object.fromEntries(
      [...customProperties(tokensRoot)].filter(([property]) =>
        typographyDefinition.test(property),
      ),
    );
    const variationSettings = cssDocuments.flatMap(({ path, root }) =>
      declarations(root, "font-variation-settings").map(
        ({ value }) =>
          `${cssFileLabel(path)}: font-variation-settings: ${value}`,
      ),
    );
    const familyViolations = cssDocuments.flatMap(({ path, root }) =>
      declarations(root, "font-family")
        .filter(({ value }) => !approvedFamilies.has(value))
        .map(({ value }) => `${cssFileLabel(path)}: font-family: ${value}`),
    );
    const weightViolations = cssDocuments.flatMap(({ path, root }) =>
      declarations(root, "font-weight")
        .filter(({ value }) => !approvedWeights.has(value))
        .map(({ value }) => `${cssFileLabel(path)}: font-weight: ${value}`),
    );
    const fontRoleMismatches = cssDocuments.flatMap(({ path, root }) => {
      const violations: string[] = [];
      root.walkRules((rule) => {
        let family: string | undefined;
        let weight: string | undefined;
        for (const node of rule.nodes ?? []) {
          if (node.type !== "decl") continue;
          const property = node.prop.toLowerCase();
          if (property === "font-family") family = node.value.trim();
          if (property === "font-weight") weight = node.value.trim();
        }
        const role = family?.match(
          /^var\(--desk-font-(body|reading|utility)\)$/u,
        )?.[1];
        if (!role || !weight || weight === "inherit") return;
        if (weight.startsWith(`var(--desk-${role}-weight-`)) return;
        const selector = rule.selector.trim().replace(/\s+/gu, " ");
        violations.push(
          `${cssFileLabel(path)}: ${selector}: ${family} + ${weight}`,
        );
      });
      return violations;
    });

    const foundationTypographyDefinitions = [
      ...customProperties(foundationsRoot),
    ]
      .map(([property]) => property)
      .filter((property) => typographyDefinition.test(property));

    expect({
      familyViolations,
      fontRoleMismatches,
      foundationConsumesBodyFamily: foundations.includes(
        "font-family: var(--desk-font-body)",
      ),
      foundationConsumesBodyWeight: foundations.includes(
        "font-weight: var(--desk-body-weight-regular)",
      ),
      foundationTypographyDefinitions,
      tokenTypography,
      typographyDefinitionsOutsideTokens,
      variationSettings,
      weightViolations,
    }).toEqual({
      familyViolations: [],
      fontRoleMismatches: [],
      foundationConsumesBodyFamily: true,
      foundationConsumesBodyWeight: true,
      foundationTypographyDefinitions: [],
      tokenTypography: {
        "--desk-font-body":
          '"Noto Sans SC Variable", "PingFang SC", sans-serif',
        "--desk-font-reading": '"Source Serif 4 Variable", Georgia, serif',
        "--desk-font-utility":
          '"IBM Plex Sans Variable", "Segoe UI", sans-serif',
        "--desk-body-weight-regular": "400",
        "--desk-body-weight-medium": "500",
        "--desk-body-weight-semibold": "650",
        "--desk-body-weight-bold": "700",
        "--desk-reading-weight-regular": "400",
        "--desk-reading-weight-semibold": "600",
        "--desk-utility-weight-medium": "500",
        "--desk-utility-weight-semibold": "600",
      },
      typographyDefinitionsOutsideTokens: [],
      variationSettings: [],
      weightViolations: [],
    });
  });

  it("keeps every legacy global variable as an alias to an approved desk token", () => {
    const legacy = new Map<string, string>();
    globalsRoot.walkRules((rule) => {
      if (rule.selector !== ":root") return;
      for (const node of rule.nodes ?? []) {
        if (node.type !== "decl" || !node.prop.startsWith("--")) continue;
        legacy.set(node.prop, node.value.trim().replace(/\s+/gu, " "));
      }
    });
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

  it("uses approved typography roles for every declared size", () => {
    const violations = cssDocuments.flatMap(({ path, root }) => [
      ...declarations(root, "font-size")
        .filter(({ property, value }) => {
          if (value === "inherit") return false;
          return !/^var\(--desk-type-[\w-]+\)$/u.test(value);
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
    const spacingViolations = cssDocuments.flatMap(({ path, root }) =>
      declarations(
        root,
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
    const radiusViolations = cssDocuments.flatMap(({ path, root }) =>
      declarations(root, "border-radius")
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
    const shadowViolations = cssDocuments.flatMap(({ path, root }) =>
      declarations(root, "box-shadow")
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
    expect(shell).toContain("var(--workspace-header-height)");
    expect(shell).toContain("var(--desk-layout-workspace-max)");
  });
});
