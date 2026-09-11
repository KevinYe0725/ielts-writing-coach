import { expect, test } from "@playwright/test";

import {
  deterministicDemo,
  expectNoHorizontalOverflow,
  resetDemoState,
} from "./support";

test.describe("document workspace navigation", () => {
  test.skip(
    !deterministicDemo,
    "The essay fixtures are provided by the explicit demo.",
  );
  test.beforeEach(async ({ page }) => resetDemoState(page));

  test("keeps the essay switcher and learning links available without a sidebar", async ({
    page,
  }) => {
    await page.goto(
      "/feedback?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );
    await expect(page.locator("#primary-sidebar")).toHaveCount(0);
    const header = page.locator("[data-workspace-header]");
    await expect(
      header.getByRole("button", { name: "切换作文" }),
    ).toBeVisible();
    await expect(
      header.getByRole("link", { name: "批改", exact: true }),
    ).toHaveAttribute(
      "href",
      "/feedback?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );
    await expect(
      header.getByRole("link", { name: "提升", exact: true }),
    ).toHaveAttribute(
      "href",
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );
  });

  test("searches actual essays, restores focus on Escape, and follows the selected next task", async ({
    page,
  }) => {
    await page.goto("/write?cycle=cycle-demo");
    const trigger = page.getByRole("button", { name: "切换作文" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "切换作文" });
    const search = dialog.getByRole("combobox");
    await expect(search).toBeFocused();
    await expect(dialog.getByRole("option")).toHaveCount(2);
    await dialog.screenshot({
      path:
        "output/playwright/essay-switcher-" +
        page.viewportSize()?.width +
        ".png",
    });
    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press("Tab");
      await expect(dialog.locator(":focus")).toHaveCount(1);
    }
    await search.fill("public transport");
    const essay = dialog.getByRole("option", {
      name: /Some people think governments/,
    });
    await expect(essay).toBeVisible();
    await expect(dialog.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await search.fill("public transport");
    await expect(essay).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(essay).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/write\?cycle=cycle-demo-second$/);
    await expect(
      page
        .locator("[data-workspace-header]")
        .getByRole("link", { name: "写作", exact: true }),
    ).toHaveAttribute("href", "/write?cycle=cycle-demo-second");
    await page.goBack();
    await expect(page).toHaveURL(/\/write\?cycle=cycle-demo$/);
    await expect(
      page
        .locator("[data-workspace-header]")
        .getByRole("link", { name: "写作", exact: true }),
    ).toHaveAttribute("href", "/write?cycle=cycle-demo");
  });

  test("keeps recovery links available when search has no matches", async ({
    page,
  }) => {
    await page.goto("/today");
    await expect(
      page.locator('[data-essay-workspace="compact"]'),
    ).toBeVisible();
    await page.getByRole("button", { name: "切换作文" }).click();
    const dialog = page.getByRole("dialog", { name: "切换作文" });
    await dialog.getByRole("combobox").fill("no-matching-topic-987");
    await expect(
      dialog.getByText("没有找到这篇作文。试试其他关键词。"),
    ).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "全部作文" }),
    ).toHaveAttribute("href", "/essays");
    await expect(dialog.getByRole("link", { name: "新作文" })).toHaveAttribute(
      "href",
      "/today?new-essay=1",
    );
    await dialog.getByRole("link", { name: "全部作文" }).click();
    await expect(page).toHaveURL(/\/essays$/);
  });

  test("opens the selected essay even when browser navigation storage is denied", async ({
    page,
  }) => {
    await page.goto("/today");
    await expect(
      page.locator('[data-essay-workspace="compact"]'),
    ).toBeVisible();
    await page.getByRole("button", { name: "切换作文" }).click();
    const dialog = page.getByRole("dialog", { name: "切换作文" });
    await expect(dialog.getByRole("option")).toHaveCount(2);
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "iwc:learning-navigation:v1")
          throw new DOMException("Storage denied", "SecurityError");
        original.call(this, key, value);
      };
    });
    await dialog
      .getByRole("option", { name: /Some people think governments/ })
      .click();
    await expect(page).toHaveURL(/\/write\?cycle=cycle-demo-second$/);
  });

  test("does not expose stale essay links after the current URL changes", async ({
    page,
  }) => {
    await page.goto("/feedback?cycle=B&lesson=lesson-B&issue=2");
    await expect(page.locator("[data-workspace-header]")).toBeVisible();
    await page.evaluate(() => {
      sessionStorage.setItem(
        "iwc:learning-navigation:v1",
        JSON.stringify({
          write: "/write?cycle=A",
          feedback: "/feedback?cycle=A",
          lesson: "/lesson?cycle=A&lesson=lesson-A",
          rewrite: "/rewrite?cycle=A&task=task-A",
          compare: "/compare?cycle=A",
          transfer: "/transfer?cycle=A&task=transfer-A",
        }),
      );
      window.dispatchEvent(new Event("iwc:learning-navigation"));
    });
    const header = page.locator("[data-workspace-header]");
    await expect(
      header.getByRole("link", { name: "批改", exact: true }),
    ).toHaveAttribute("href", "/feedback?cycle=B&lesson=lesson-B&issue=2");
    await header.locator("[data-workspace-more] > summary").click();
    await expect(header.locator('a[href*="cycle=A"]')).toHaveCount(0);
    await expect(
      header.getByRole("link", { name: "成长记录" }),
    ).toHaveAttribute("href", "/growth");
    await expect(header.getByRole("link", { name: "设置" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  for (const width of [1440, 1280, 390, 375]) {
    test(`keeps navigation and floating controls inside ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route("**/api/v1/auth/get-session", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            session: {},
            user: {
              id: "workspace-user",
              email: "learner@example.com",
              name: "Learner",
              role: "learner",
            },
          }),
        }),
      );
      await page.goto("/today");
      const header = page.locator("[data-workspace-header]");
      const trigger = header.getByRole("button", {
        name: /learner@example.com/,
      });
      await trigger.click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      const triggerBox = (await trigger.boundingBox())!;
      const menuBox = (await menu.boundingBox())!;
      expect(menuBox.y).toBeGreaterThanOrEqual(
        triggerBox.y + triggerBox.height,
      );
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width);
      await header.locator(".notification-center > summary").click();
      await expect(menu).toBeHidden();
      const notifications = page.locator(".notification-panel");
      await expect(notifications).toBeVisible();
      const panelBox = (await notifications.boundingBox())!;
      expect(panelBox.x).toBeGreaterThanOrEqual(0);
      expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width);
      await page.keyboard.press("Escape");
      await expect(notifications).toBeHidden();
      await header.locator("[data-workspace-more] > summary").click();
      await expect(header.getByRole("link", { name: "设置" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        path: `output/playwright/workspace-navigation-${width}.png`,
      });
    });
  }
});

test.describe("essay switcher over the HTTP boundary", () => {
  test.skip(
    deterministicDemo,
    "Run against an isolated HTTP-mode build with routed API fixtures.",
  );

  async function fixture(
    page: import("@playwright/test").Page,
    workspace: (route: import("@playwright/test").Route) => Promise<void>,
  ) {
    await page.route("**/api/v1/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/v1/essays") return workspace(route);
      if (pathname === "/api/v1/auth/get-session") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            session: {},
            user: {
              id: "selector-user",
              email: "learner@example.com",
              role: "learner",
            },
          }),
        });
      }
      if (pathname === "/api/v1/notifications")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ notifications: [] }),
        });
      return route.fulfill({
        status: 404,
        contentType: "application/problem+json",
        body: JSON.stringify({
          status: 404,
          detail: "No fixture data for this page.",
        }),
      });
    });
    await page.goto("/settings");
    await expect(
      page.getByRole("button", { name: /learner@example.com/ }),
    ).toBeEnabled();
  }

  test("loads only on opening and keeps global routes available with no essays", async ({
    page,
  }) => {
    let reads = 0;
    await fixture(page, async (route) => {
      reads += 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ active_count: 0, active_limit: 8, essays: [] }),
      });
    });
    expect(reads).toBe(0);
    await page.getByRole("button", { name: "切换作文" }).click();
    const dialog = page.getByRole("dialog", { name: "切换作文" });
    await expect(
      dialog.getByText("还没有作文，可以开始新作文。"),
    ).toBeVisible();
    await expect.poll(() => reads).toBe(1);
    await expect(
      dialog.getByRole("link", { name: "全部作文" }),
    ).toHaveAttribute("href", "/essays");
    await expect(dialog.getByRole("link", { name: "新作文" })).toHaveAttribute(
      "href",
      "/today?new-essay=1",
    );
    await page.keyboard.press("Escape");
    const header = page.locator("[data-workspace-header]");
    await expect(
      header.getByRole("link", { name: /IELTS Writing/ }),
    ).toHaveAttribute("href", "/today");
    await header.locator("[data-workspace-more] > summary").click();
    await expect(
      header.getByRole("link", { name: "成长记录" }),
    ).toHaveAttribute("href", "/growth");
    await expect(
      header.getByRole("link", { name: "设置", exact: true }).last(),
    ).toHaveAttribute("href", "/settings");
  });

  test("recovers a failed load and follows the supplied lesson identity by keyboard", async ({
    page,
  }) => {
    let unavailable = true;
    await fixture(page, async (route) => {
      if (unavailable)
        return route.fulfill({
          status: 503,
          contentType: "application/problem+json",
          body: JSON.stringify({
            status: 503,
            detail: "Workspace unavailable.",
          }),
        });
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          active_count: 1,
          active_limit: 8,
          essays: [
            {
              id: "selector-cycle",
              prompt: "Should schools teach practical decision-making?",
              topic: "education",
              status: "LESSON_READY",
              updated_at: "2026-09-12T12:00:00.000Z",
              next_action: {
                kind: "START_LESSON",
                entity_id: "actual-lesson",
                reason: "The lesson is ready.",
                due_at: null,
                overdue: false,
              },
              resources: {
                cycle_id: "selector-cycle",
                writing_available: true,
                feedback_available: true,
                lesson_id: "actual-lesson",
                rewrite_task_id: null,
                comparison_available: false,
                transfer_task_id: null,
              },
            },
          ],
        }),
      });
    });
    await page.getByRole("button", { name: "切换作文" }).click();
    const dialog = page.getByRole("dialog", { name: "切换作文" });
    await expect(dialog.getByRole("alert")).toContainText("暂时无法读取作文");
    await expect(dialog.getByRole("link", { name: "全部作文" })).toBeVisible();
    unavailable = false;
    await dialog.getByRole("button", { name: "重试" }).click();
    const essay = dialog.getByRole("option", { name: /Should schools teach/ });
    await expect(essay).toBeVisible();
    await dialog.getByRole("combobox").focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(
      /\/lesson\?cycle=selector-cycle&lesson=actual-lesson$/,
    );
  });
});
