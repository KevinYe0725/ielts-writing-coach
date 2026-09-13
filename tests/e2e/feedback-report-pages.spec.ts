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
      page.getByRole("heading", { name: "看懂问题，学会修改" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "进入专项教学", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "总体评价", exact: true }),
    ).toHaveCount(0);
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
    await page.getByRole("tab", { name: "原文", exact: true }).click();
    await expect(
      page.locator("[data-testid='feedback-source-pane']"),
    ).toBeVisible();
    await expect(
      page.locator("[data-testid='feedback-suggestion-pane']"),
    ).toBeHidden();
  });

  test("paginates the focused comparison without vertical scrolling", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/feedback/compare?cycle=cycle-demo");

    const workbench = page.locator("[data-feedback-focus-workbench]");
    await expect(workbench).toHaveAttribute("data-feedback-page", "1");
    await expect(workbench).toHaveAttribute("data-feedback-page-count", "3");
    await expect(page.locator("[data-feedback-page='1']")).toBeVisible();
    await expect(page.locator("[data-feedback-page='2']")).toHaveCount(0);
    await expect(page.locator("[data-feedback-issue-card]")).toHaveCount(2);
    await expect(
      page.locator("[data-feedback-paragraph-review] details"),
    ).toHaveAttribute("open", "");
    await expect(
      page.locator("[data-feedback-paragraph-revision]"),
    ).toBeVisible();
    expect(
      await page
        .locator("[data-feedback-paragraph-revision]")
        .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
    ).toBeGreaterThanOrEqual(18);
    await expect(page.locator("[data-feedback-page-prev]")).toBeDisabled();
    await expect(page.locator("[data-feedback-page-next]")).toBeEnabled();
    expect(
      await workbench.evaluate((node) => {
        const element = node as HTMLElement;
        return getComputedStyle(element).overflowY;
      }),
    ).toBe("hidden");
    expect(
      await page.evaluate(() => {
        const main = document.querySelector(".main-content");
        return main ? main.scrollHeight <= main.clientHeight + 1 : false;
      }),
    ).toBe(true);
    expect(
      await page
        .locator("[data-testid='feedback-suggestion-pane']")
        .evaluate((node) => getComputedStyle(node).overflowY),
    ).toBe("auto");

    await page.locator("[data-feedback-page-next]").click();
    await expect(workbench).toHaveAttribute("data-feedback-page", "2");
    await expect(page.locator("[data-feedback-page='1']")).toHaveCount(0);
    await expect(page.locator("[data-feedback-page='2']")).toBeVisible();
    await expect(page.locator("[data-feedback-issue-card]")).toHaveCount(1);
    await expect(page.locator("[data-feedback-page-prev]")).toBeEnabled();
    await expect(page.locator("[data-feedback-page-next]")).toBeEnabled();

    await page.locator("[data-feedback-page-next]").click();
    await expect(workbench).toHaveAttribute("data-feedback-page", "3");
    await expect(page.locator("[data-feedback-page='2']")).toHaveCount(0);
    await expect(page.locator("[data-feedback-page='3']")).toBeVisible();
    await expect(page.locator("[data-feedback-issue-card]")).toHaveCount(0);
    await expect(page.locator("[data-feedback-page-next]")).toBeDisabled();
  });
});
