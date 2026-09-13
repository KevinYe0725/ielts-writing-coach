import { expect, test } from "@playwright/test";

import { deterministicDemo, expectNoHorizontalOverflow } from "./support";

test.describe("monochrome Today course surface", () => {
  test.skip(!deterministicDemo, "Requires the isolated demo preview.");

  test("uses black and white roles across the course shell", async ({
    page,
  }) => {
    await page.goto("/today");
    await expect(page.locator('[data-today-desk="focus"]')).toBeVisible();
    const colors = await page.locator("[data-app-shell]").evaluate((shell) => {
      const topbar = shell.querySelector("[data-workspace-header]");
      const primary = shell.querySelector("[data-today-primary] .button");
      const root = getComputedStyle(shell);
      const topbarStyle = topbar ? getComputedStyle(topbar) : null;
      const primaryStyle = primary ? getComputedStyle(primary) : null;
      return {
        shellBackground: root.backgroundColor,
        shellColor: root.color,
        topbarBackground: topbarStyle?.backgroundColor,
        primaryBackground: primaryStyle?.backgroundColor,
        primaryColor: primaryStyle?.color,
      };
    });
    expect(colors).toEqual({
      shellBackground: "rgb(247, 247, 247)",
      shellColor: "rgb(17, 17, 17)",
      topbarBackground: "rgb(255, 255, 255)",
      primaryBackground: "rgb(17, 17, 17)",
      primaryColor: "rgb(255, 255, 255)",
    });
  });

  test("keeps the existing course actions usable on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/today");
    await expect(page.locator('[data-today-desk="focus"]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(
      page.getByRole("heading", { name: "今天，从这里继续。" }),
    ).toBeVisible();
    await expect(page.locator("[data-today-primary]")).toBeVisible();
  });

  test("groups progress and evidence into one course summary", async ({
    page,
  }) => {
    await page.goto("/today");
    const summary = page.locator("[data-today-progress-panel]");
    await expect(summary).toBeVisible();
    await expect(summary.locator("[data-today-learning-thread]")).toBeVisible();
    await expect(summary.locator("[data-today-evidence]")).toBeVisible();
    await expect(
      page.locator('[data-essay-workspace="compact"] .nextStep p'),
    ).toHaveCount(0);
  });
});
