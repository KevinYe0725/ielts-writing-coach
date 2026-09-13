import { expect, test } from "@playwright/test";

import { deterministicDemo } from "./support";

test.describe("feedback report views", () => {
  test.skip(!deterministicDemo, "Requires the isolated demo preview.");

  test("keeps the summary and source comparison as sibling report views", async ({
    page,
  }) => {
    await page.goto("/feedback?cycle=cycle-demo");
    await expect(page.locator("[data-feedback-summary]")).toBeVisible();
    await expect(page.locator("[data-feedback-workbench]")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "原文对照", exact: true }),
    ).toHaveAttribute("href", "/feedback/compare?cycle=cycle-demo");

    await page.getByRole("link", { name: "原文对照", exact: true }).click();
    await expect(page).toHaveURL(/\/feedback\/compare\?cycle=cycle-demo$/);
    await expect(page.locator("[data-feedback-workbench]")).toBeVisible();
    await expect(page.locator("[data-feedback-summary]")).toHaveCount(0);
    await expect(page.locator("[data-feedback-next-step]")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "总体评价", exact: true }),
    ).toHaveAttribute("href", "/feedback?cycle=cycle-demo");
  });

  test("opens a priority directly in the comparison view", async ({ page }) => {
    await page.goto("/feedback?cycle=cycle-demo");
    await page
      .getByRole("region", { name: "这篇作文，先看这几处" })
      .getByRole("button")
      .first()
      .click();
    await expect(page).toHaveURL(
      /\/feedback\/compare\?cycle=cycle-demo&issue=issue-argument$/,
    );
    await expect(
      page.locator('[data-feedback-issue="issue-argument"]'),
    ).toHaveAttribute("aria-expanded", "true");
  });

  test("keeps the focused comparison usable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/feedback/compare?cycle=cycle-demo");
    await expect(page.locator("[data-feedback-workbench]")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
  });
});
