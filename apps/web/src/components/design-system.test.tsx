import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EvidenceLink } from "./evidence-link";
import { layoutVariantForPathname, PageLayout } from "./layout/page-layout";

const evidenceLinkCss = readFileSync(
  new URL("./evidence-link.module.css", import.meta.url),
  "utf8",
);

describe("annotation desk primitives", () => {
  it("exposes stable layout semantics", () => {
    expect(
      renderToStaticMarkup(
        createElement(PageLayout, { children: "Essay", variant: "workspace" }),
      ),
    ).toContain('data-page-layout="workspace"');
  });

  it.each([
    ["active", "正在核对", true],
    ["verified", "证据已确认", true],
    ["revision", "仍需验证", true],
    ["unavailable", "暂无证据", true],
    ["disabled", "暂不可用", false],
  ] as const)(
    "renders %s evidence with the expected connector structure",
    (state, label, hasLine) => {
      const evidence = renderToStaticMarkup(
        createElement(EvidenceLink, {
          children: "Mechanism",
          label,
          state,
        }),
      );

      expect(evidence).toContain(`data-evidence-state="${state}"`);
      expect(evidence).toContain("Mechanism");
      expect(evidence).toContain(label);
      if (hasLine) {
        expect(evidence).toContain('aria-hidden="true"');
      } else {
        expect(evidence).not.toContain('aria-hidden="true"');
      }
    },
  );

  it("uses a neutral dashed connector for unavailable evidence", () => {
    const unavailableStateRule = evidenceLinkCss.match(
      /\.unavailable\s*\{([^}]*)\}/,
    )?.[1];
    const unavailableLineRule = evidenceLinkCss.match(
      /\.unavailable \.line\s*\{([^}]*)\}/,
    )?.[1];

    expect(unavailableStateRule).toContain("--desk-evidence-muted");
    expect(unavailableStateRule).not.toContain("--desk-error");
    expect(unavailableLineRule).toContain("dashed");
  });

  it("retains a three-pixel evidence track on narrow screens", () => {
    const mobileRules = evidenceLinkCss.slice(
      evidenceLinkCss.indexOf("@media (max-width: 520px)"),
    );

    expect(mobileRules).not.toMatch(
      /\.line\s*\{[^}]*display:\s*none;/s,
    );
    expect(mobileRules).toMatch(
      /\.line\s*\{[^}]*border-left:\s*3px solid currentColor;/s,
    );
    expect(mobileRules).toMatch(
      /\.unavailable \.line\s*\{[^}]*border-left-style:\s*dashed;/s,
    );
  });

  it.each([
    ["/signin", "entry"],
    ["/join", "entry"],
    ["/recover", "entry"],
    ["/setup", "entry"],
    ["/lesson", "reading"],
    ["/growth", "reading"],
    ["/today", "focus"],
    ["/essays", "focus"],
    ["/settings", "focus"],
    ["/account", "focus"],
    ["/admin", "focus"],
    ["/admin/backup", "focus"],
    ["/feedback", "workspace"],
    ["/lesson/paper", "workspace"],
  ] as const)("maps %s to the %s layout", (pathname, variant) => {
    expect(layoutVariantForPathname(pathname)).toBe(variant);
  });
});
