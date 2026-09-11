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

async function signedInSession(page: import("@playwright/test").Page) {
  await page.route("**/api/v1/auth/get-session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session: { token: "never-rendered" },
        user: {
          id: "shell-test-user",
          email: "learner@example.com",
          name: "Learner",
          role: "learner",
        },
      }),
    });
  });
}

test.describe("desktop learning workspace", () => {
  test.skip(
    !deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=true and a demo-mode web server.",
  );

  test.beforeEach(async ({ page }) => resetDemoState(page));

  test("keeps the full workspace available across reload and route changes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(feedbackUrl);
    const header = page.locator("[data-workspace-header]");
    await expect(header).toBeVisible();
    await expect(page.locator("#primary-sidebar")).toHaveCount(0);
    await expect(page.locator("[data-sidebar-toggle]")).toHaveCount(0);
    expect(
      (await page.locator("#main-content").boundingBox())!.width,
    ).toBeGreaterThan(1200);
    await page.reload();
    await expect(
      header.getByRole("link", { name: "批改", exact: true }),
    ).toHaveAttribute("href", feedbackUrl);
    await page.goto(lessonUrl);
    await expect(
      header.getByRole("link", { name: "提升", exact: true }),
    ).toHaveAttribute("href", lessonUrl);
    await expect(page.locator("#primary-sidebar")).toHaveCount(0);
  });

  test("keeps touch navigation visible and More inside the mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(feedbackUrl);
    const header = page.locator("[data-workspace-header]");
    await expect(
      header.getByRole("link", { name: "批改", exact: true }),
    ).toBeVisible();
    await header.locator("[data-workspace-more] > summary").click();
    await expect(header.getByRole("link", { name: "设置" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  });

  test("keeps multiple essays available through the workspace and essay switcher", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/today");

    await expect(
      page.locator('[data-essay-workspace="compact"]'),
    ).toBeVisible();
    await page.getByRole("button", { name: "切换作文" }).click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "全部作文" })
      .click();
    await expect(page).toHaveURL(/\/essays$/);
    await expect(page.getByRole("heading", { name: "我的作文" })).toBeVisible();

    const workspace = page.locator("[data-essay-workspace]");
    await expect(workspace).toBeVisible();
    await expect(workspace).toHaveAttribute("data-active-limit", "8");
    await expect(workspace).toContainText("进行中 2 / 8 篇");
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
      page.getByRole("heading", { name: "今天就写这一题" }),
    ).toBeVisible();

    await page.goto("/today");
    await expect(
      page.locator('[data-essay-workspace="compact"]'),
    ).toBeVisible();
  });

  test("lays essays out as readable rows before there is room for two columns", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/essays");

    const grid = page.locator('[data-essay-workspace="full"] [role="list"]');
    expect(await gridColumnCount(grid)).toBe(1);
    await expect(grid.locator("[data-essay-card]")).toHaveCount(2);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);

    await page.setViewportSize({ width: 1280, height: 900 });
    expect(await gridColumnCount(grid)).toBe(2);
  });

  test("keeps essay metadata readable below the document-first page title", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/essays");

    const firstCard = page.locator("[data-essay-card]").first();
    const supportSizes = await Promise.all([
      firstCard
        .locator(".badge")
        .evaluate((element) =>
          Number.parseFloat(window.getComputedStyle(element).fontSize),
        ),
      firstCard
        .getByText("8月14日", { exact: true })
        .evaluate((element) =>
          Number.parseFloat(window.getComputedStyle(element).fontSize),
        ),
    ]);

    for (const size of supportSizes) {
      expect(size, "badge and date computed font sizes").toBeGreaterThanOrEqual(
        12,
      );
    }
    const titleSize = await page
      .getByRole("heading", { name: "我的作文", exact: true })
      .evaluate((element) =>
        Number.parseFloat(window.getComputedStyle(element).fontSize),
      );
    expect(titleSize).toBeGreaterThanOrEqual(28);
  });

  test("keeps the complete current identity when stored navigation is stale", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(feedbackUrl);
    const header = page.locator("[data-workspace-header]");
    await expect(
      header.getByRole("link", { name: "批改", exact: true }),
    ).toHaveAttribute("href", feedbackUrl);
    await page.evaluate(() => {
      sessionStorage.setItem(
        "iwc:learning-navigation:v1",
        JSON.stringify({
          feedback: "/feedback?cycle=old-cycle&lesson=old-lesson",
          lesson: "/lesson?cycle=old-cycle&lesson=old-lesson",
          rewrite: "/rewrite?cycle=old-cycle&task=old-task",
          compare: "/compare?cycle=old-cycle",
        }),
      );
      window.dispatchEvent(new Event("iwc:learning-navigation"));
    });
    await expect(
      header.getByRole("link", { name: "批改", exact: true }),
    ).toHaveAttribute("href", feedbackUrl);
    await expect(
      header.getByRole("link", { name: "批改", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(header.locator('a[href*="old-cycle"]')).toHaveCount(0);
  });

  for (const [route, label] of [
    ["feedback", "批改"],
    ["compare", "对比"],
  ] as const) {
    test(
      "updates the current " +
        route +
        " identity on same-route history navigation",
      async ({ page }) => {
        await page.goto("/" + route + "?cycle=old");
        await expect(
          page.locator(
            route === "compare"
              ? '[data-evidence-record="comparison"]'
              : "[data-feedback-workbench]",
          ),
        ).toBeVisible();
        const current = page
          .locator("[data-context-topbar]")
          .getByRole("link", { name: label, exact: true });
        await expect(current).toHaveAttribute(
          "href",
          "/" + route + "?cycle=old",
        );
        await page.evaluate((path) => {
          window.history.pushState(
            null,
            "",
            "/" + path + "?cycle=new&view=details",
          );
        }, route);
        await expect(current).toHaveAttribute(
          "href",
          "/" + route + "?cycle=new&view=details",
        );
        await expect(current).toHaveAttribute("aria-current", "page");
        await page.goBack();
        await expect(current).toHaveAttribute(
          "href",
          "/" + route + "?cycle=old",
        );
      },
    );
  }

  test("maps transfer, account, and administration to their real current context", async ({
    page,
  }, testInfo) => {
    await signedInSession(page);
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        "iwc:learning-navigation:v1",
        JSON.stringify({
          transfer: "/transfer?cycle=old&task=old",
        }),
      );
    });

    for (const [path, name, href] of [
      [
        "/transfer?cycle=new&task=new",
        /陌生题迁移|transfer/i,
        "/transfer?cycle=new&task=new",
      ],
      ["/account", /账户|account/i, "/account"],
      ["/admin", /系统状态|system status/i, "/admin"],
      ["/admin/backup", /创建备份|create backup/i, "/admin/backup"],
    ] as const) {
      await page.goto(path);
      const contextLink = page
        .locator("[data-context-topbar]")
        .getByRole("link", { name });
      await expect(contextLink).toBeVisible();
      await expect(contextLink).toHaveAttribute("href", href);
      await expect(contextLink).toHaveAttribute("aria-current", "page");
    }
  });

  test("persists the locale choice in storage and across app navigation", async ({
    page,
  }, testInfo) => {
    await page.goto("/today");

    // The locale button is present in the server-rendered shell before its
    // click handler is attached. Wait for Today's client-loaded workspace so
    // a busy four-project run cannot mistake a pre-hydration click for a user
    // interaction.
    await expect(
      page.locator('[data-essay-workspace="compact"]'),
    ).toBeVisible();
    await page.locator(".topbar .locale-switch").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect
      .poll(() =>
        page.evaluate(() => window.localStorage.getItem("iwc.locale")),
      )
      .toBe("en");

    await page.getByRole("button", { name: "Switch essay" }).click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "All essays" })
      .click();
    await expect(page).toHaveURL(/\/essays$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator(".topbar .locale-switch")).toHaveAccessibleName(
      "Switch to Chinese interface",
    );

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect
      .poll(() =>
        page.evaluate(() => window.localStorage.getItem("iwc.locale")),
      )
      .toBe("en");
    await expect(page.locator(".topbar .locale-switch")).toHaveAccessibleName(
      "Switch to Chinese interface",
    );
  });

  test("returns account-menu focus on Escape and clears learning destinations on logout", async ({
    page,
  }, testInfo) => {
    await signedInSession(page);
    await page.route("**/api/v1/auth/sign-out", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });
    await page.goto("/today");
    await expect(
      page.locator('[data-essay-workspace="compact"]'),
    ).toBeVisible();
    await page.evaluate(() => {
      window.sessionStorage.setItem(
        "iwc:learning-navigation:v1",
        JSON.stringify({ feedback: "/feedback?cycle=private-cycle" }),
      );
    });

    const trigger = page.getByRole("button", { name: /learner@example\.com/i });
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.getByRole("menuitem", { name: /退出登录|sign out/i }).click();
    await expect(page).toHaveURL(/\/signin$/);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.sessionStorage.getItem("iwc:learning-navigation:v1"),
        ),
      )
      .toBeNull();
  });

  test("skip link moves keyboard focus to the main workspace", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "The touch project has no hardware-keyboard contract.",
    );
    await page.goto("/today");

    const skipLink = page.locator('a.skip-link[href="#main-content"]');
    if (testInfo.project.name === "webkit") {
      await page.waitForTimeout(300);
    }
    await skipLink.focus();
    await expect(skipLink).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });
});

test.describe("notification center against the HTTP boundary", () => {
  test.skip(
    deterministicDemo,
    "The deterministic browser demo intentionally does not call notification APIs.",
  );

  test("opens as an anchored popover without resizing the workspace", async ({
    page,
  }) => {
    await signedInSession(page);
    await page.route("**/api/v1/notifications", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ notifications: [] }),
      });
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/today");

    const center = page.locator(".notification-center");
    const topbar = page.locator("header.topbar");
    const main = page.locator("#main-content");
    const summary = center.locator("summary");
    const panel = center.locator(".notification-panel");
    await expect(center).toBeVisible();
    const topbarBefore = await topbar.boundingBox();
    const mainBefore = await main.evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );

    await summary.click();
    await expect(panel).toBeVisible();

    const topbarAfter = await topbar.boundingBox();
    const mainAfter = await main.evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );
    const summaryBox = await summary.boundingBox();
    const panelBox = await panel.boundingBox();
    const panelStyles = await panel.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        overflowY: style.overflowY,
        position: style.position,
      };
    });

    expect(Math.abs(topbarAfter!.height - topbarBefore!.height)).toBeLessThan(
      1,
    );
    expect(Math.abs(mainAfter - mainBefore)).toBeLessThan(1);
    expect(panelBox!.width).toBeGreaterThanOrEqual(300);
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(1264);
    expect(panelBox!.y).toBeGreaterThanOrEqual(
      summaryBox!.y + summaryBox!.height,
    );
    expect(panelStyles).toEqual({
      overflowY: "auto",
      position: "absolute",
    });
  });

  test("shows unread notifications and marks one as read", async ({ page }) => {
    await signedInSession(page);
    await page.route("**/api/v1/notifications", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          notifications: [
            {
              id: "notification-1",
              readAt: null,
              payload: {
                titleZh: "批注已就绪",
                titleEn: "Annotations are ready",
                href: "/feedback?cycle=cycle-demo",
              },
              scheduledAt: "2026-08-22T08:00:00.000Z",
            },
          ],
        }),
      });
    });
    await page.route(
      "**/api/v1/notifications/notification-1/read",
      async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      },
    );

    await page.goto("/today");
    const center = page.locator(".notification-center");
    await expect(center.getByLabel("1 unread")).toBeVisible();
    await center.locator("summary").click();
    await center
      .getByRole("button", { name: /标为已读|mark as read/i })
      .click();
    await expect(center.getByLabel("1 unread")).toHaveCount(0);
    await expect(center).toContainText(/暂无新提醒|no new notifications/i);
  });
});
