import { expect, test } from "@playwright/test";

import { deterministicDemo } from "./support";

test.describe("monochrome feedback report", () => {
  test.skip(!deterministicDemo, "Requires the isolated demo preview.");

  test("uses the public monochrome palette and removes decorative microcopy", async ({
    page,
  }) => {
    await page.goto("/feedback/compare?cycle=cycle-demo");
    await expect(page.locator("[data-feedback-workbench]")).toBeVisible();
    const colors = await page.locator("[data-app-shell]").evaluate((shell) => {
      const source = shell.querySelector("[data-essay-pane]");
      const suggestions = shell.querySelector("[data-suggestion-panel]");
      const root = getComputedStyle(shell);
      return {
        shellBackground: root.backgroundColor,
        shellColor: root.color,
        sourceBackground: source
          ? getComputedStyle(source).backgroundColor
          : null,
        suggestionsBackground: suggestions
          ? getComputedStyle(suggestions).backgroundColor
          : null,
      };
    });
    expect(colors).toEqual({
      shellBackground: "rgb(247, 247, 247)",
      shellColor: "rgb(17, 17, 17)",
      sourceBackground: "rgb(255, 255, 255)",
      suggestionsBackground: "rgb(255, 255, 255)",
    });
    await expect(
      page.getByText("示例报告 · 未评价语言", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator("[data-essay-pane] .documentHeader > span"),
    ).toHaveCount(0);
    await expect(
      page.locator("[data-essay-pane] .taskBlock > span"),
    ).toHaveCount(0);
    await expect(
      page.locator("[data-feedback-next-step] .duration"),
    ).toHaveCount(0);
    await expect(
      page.locator("[data-feedback-correction-preview]").first(),
    ).toBeVisible();
  });

  test("shows the full report by default without a mode switch", async ({
    page,
  }) => {
    await page.goto("/feedback/compare?cycle=cycle-demo");
    const report = page.locator("[data-feedback-report]");
    await expect(report).toHaveAttribute("data-feedback-report-mode", "full");
    await expect(
      report.locator('[data-feedback-full-detail="accuracy"]'),
    ).toBeVisible();
    await expect(
      report.getByRole("tab", { name: "快速修改", exact: true }),
    ).toHaveCount(0);
    await expect(
      report.getByRole("tab", { name: "完整报告", exact: true }),
    ).toHaveCount(0);
  });

  test("lets the active suggestion card collapse on a second click", async ({
    page,
  }) => {
    await page.goto("/feedback/compare?cycle=cycle-demo");
    const firstCard = page.locator("[data-feedback-issue-card]").first();
    const firstTrigger = firstCard.locator("[data-feedback-issue]").first();
    await expect(
      firstCard.locator("[data-feedback-issue-details]"),
    ).toBeVisible();
    await firstTrigger.click();
    await expect(
      firstCard.locator("[data-feedback-issue-details]"),
    ).toBeHidden();
    await expect(firstTrigger).toHaveAttribute("aria-expanded", "false");
  });
});
