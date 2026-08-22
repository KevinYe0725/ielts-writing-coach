import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const globals = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

const pageOwnedSelectors = [
  "app-shell",
  "next-task-card",
  "writing-page",
  "feedback-hero-grid",
  "practice-paper-question",
  "lesson-workspace",
  "comparison-hero",
  "growth-stat-grid",
  "transfer-check-card",
  "settings-layout",
  "health-grid",
] as const;

const frozenHookSources = [
  {
    hook: "mobile-header",
    source: new URL("../../components/app-shell.tsx", import.meta.url),
  },
  {
    hook: "mobile-menu",
    source: new URL("../../components/app-shell.tsx", import.meta.url),
  },
  {
    hook: "next-task-card",
    source: new URL("../../app/today/page.tsx", import.meta.url),
  },
  {
    hook: "practice-paper-question",
    source: new URL("../../app/lesson/paper/page.tsx", import.meta.url),
  },
] as const;

describe("global style ownership", () => {
  it("keeps globals below the audited compatibility ceiling", () => {
    expect(globals.split("\n").length).toBeLessThanOrEqual(1_400);
  });

  it.each(pageOwnedSelectors)(
    "does not retain the page-owned .%s selector",
    (selector) => {
      expect(globals).not.toMatch(
        new RegExp(`^\\.${selector}(?:[\\s:{.\\[])`, "m"),
      );
    },
  );

  it.each(frozenHookSources)(
    "keeps the frozen .$hook DOM hook attached",
    ({ hook, source }) => {
      expect(readFileSync(source, "utf8")).toContain(`"${hook}"`);
    },
  );
});
