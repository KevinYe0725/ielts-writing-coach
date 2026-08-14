import { expect, test } from "@playwright/test";

import { deterministicDemo, resetDemoState } from "./support";

const feedbackUrl =
  "/feedback?cycle=cycle-demo&lesson=lesson-collocation-perspective";
const lessonUrl =
  "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective";

async function gridColumnCount(
  locator: import("@playwright/test").Locator,
): Promise<number> {
  return locator.evaluate((element) => {
    const columns = window.getComputedStyle(element).gridTemplateColumns.trim();
    if (!columns || columns === "none") return 0;
    return columns.split(/\s+/).filter(Boolean).length;
  });
}

test.describe("desktop learning workspace", () => {
  test.skip(
    !deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=true and a demo-mode web server.",
  );

  test.beforeEach(async ({ page }) => resetDemoState(page));

  test("hides the sidebar, expands the workspace and remembers the choice", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(feedbackUrl);

    const shell = page.locator("[data-app-shell]");
    const sidebar = page.locator("#primary-sidebar");
    const toggle = page.locator("[data-sidebar-toggle]");
    const main = page.locator("#main-content");
    const workbench = page.locator("[data-feedback-workbench]");

    await expect(shell).toHaveAttribute("data-sidebar-state", "expanded");
    await expect(sidebar).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await gridColumnCount(workbench)).toBe(1);
    const expandedWidth = (await main.boundingBox())!.width;

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(shell).toHaveAttribute("data-sidebar-state", "collapsed");
    await expect(sidebar).toBeHidden();
    const collapsedWidth = (await main.boundingBox())!.width;
    expect(collapsedWidth).toBeGreaterThan(expandedWidth + 100);
    expect(await gridColumnCount(workbench)).toBe(2);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.localStorage.getItem("iwc:sidebar-collapsed:v1"),
        ),
      )
      .toBe("true");

    await page.reload();
    await expect(shell).toHaveAttribute("data-sidebar-state", "collapsed");
    await expect(sidebar).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await page.goto(lessonUrl);
    await expect(shell).toHaveAttribute("data-sidebar-state", "collapsed");
    await expect(sidebar).toBeHidden();

    await toggle.click();
    await expect(shell).toHaveAttribute("data-sidebar-state", "expanded");
    await expect(sidebar).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.localStorage.getItem("iwc:sidebar-collapsed:v1"),
        ),
      )
      .toBeNull();
  });

  test("keeps the existing mobile menu instead of showing the desktop toggle", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(feedbackUrl);

    await expect(page.locator("[data-sidebar-toggle]")).toBeHidden();
    await expect(page.locator("#primary-sidebar")).toBeHidden();
    await expect(page.locator(".mobile-header")).toBeVisible();
    await page.locator(".mobile-menu > summary").click();
    await expect(page.locator(".mobile-menu-panel")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  });

  test("keeps multiple essays available through the workspace and sidebar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/today");

    await page.getByRole("link", { name: "我的作文" }).click();
    await expect(page).toHaveURL(/\/essays$/);
    await expect(page.getByRole("heading", { name: "我的作文" })).toBeVisible();

    const workspace = page.locator("[data-essay-workspace]");
    await expect(workspace).toBeVisible();
    await expect(workspace.locator("[data-essay-card]")).toHaveCount(2);
    await expect(
      workspace
        .locator("[data-essay-card]")
        .filter({ hasText: "继续第一篇作文" })
        .getByRole("link", { name: "继续写作" }),
    ).toHaveAttribute("href", "/write?cycle=cycle-demo");
    await expect(
      workspace
        .locator("[data-essay-card]")
        .filter({ hasText: "开始第二篇作文" })
        .getByRole("link", { name: "开始写作" }),
    ).toHaveAttribute("href", "/write?cycle=cycle-demo-second");
    await expect(
      workspace.getByRole("link", { name: "开始新作文" }),
    ).toHaveAttribute("href", "/today?new-essay=1");

    await workspace.getByRole("link", { name: "开始新作文" }).click();
    await expect(page).toHaveURL(/\/today\?new-essay=1$/);
    await expect(
      page.getByRole("heading", { name: "先选一道题" }),
    ).toBeVisible();

    await page.goto("/today");
    await expect(
      page.locator('[data-essay-workspace="compact"]'),
    ).toBeVisible();
  });
});
