import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EvidenceLink } from "./evidence-link";
import { layoutVariantForPathname, PageLayout } from "./layout/page-layout";

describe("annotation desk primitives", () => {
  it("exposes stable layout and evidence semantics", () => {
    expect(
      renderToStaticMarkup(
        createElement(PageLayout, { children: "Essay", variant: "workspace" }),
      ),
    ).toContain('data-page-layout="workspace"');

    const evidence = renderToStaticMarkup(
      createElement(
        EvidenceLink,
        { children: "Mechanism", label: "仍需验证", state: "revision" },
      ),
    );

    expect(evidence).toContain('data-evidence-state="revision"');
    expect(evidence).toContain('aria-hidden="true"');
    expect(evidence).toContain("仍需验证");
  });

  it("removes the evidence line when the link is disabled", () => {
    const evidence = renderToStaticMarkup(
      createElement(
        EvidenceLink,
        { children: "Evidence", label: "暂不可用", state: "disabled" },
      ),
    );

    expect(evidence).toContain('data-evidence-state="disabled"');
    expect(evidence).not.toContain('aria-hidden="true"');
    expect(evidence).toContain("暂不可用");
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
