import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const globals = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

const remainingGlobalClassInventory = [
  "amber",
  "badge",
  "badge-amber",
  "badge-blue",
  "badge-green",
  "badge-neutral",
  "badge-red",
  "badge-violet",
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
  "green",
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
  "violet",
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
