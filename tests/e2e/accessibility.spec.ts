import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import {
  deterministicDemo,
  expectBasicAccessibility,
  resetDemoState,
} from "./support";

const coreRoutes = [
  "/setup",
  "/today",
  "/write?cycle=cycle-demo",
  "/feedback?cycle=cycle-demo",
  "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
  "/rewrite?cycle=cycle-demo&task=rewrite-primary-language",
  "/compare?cycle=cycle-demo",
  "/growth",
  "/settings",
] as const;

async function expectAxeRoute(
  page: import("@playwright/test").Page,
  route: string,
) {
  const expected = new URL(route, "http://playwright.local");
  await expect(async () => {
    const current = new URL(page.url());
    if (
      current.pathname !== expected.pathname ||
      current.search !== expected.search
    ) {
      await page.goto(route);
    }
    await expectBasicAccessibility(page);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(scan.violations, JSON.stringify(scan.violations, null, 2)).toEqual(
      [],
    );
  }).toPass({ timeout: 15_000 });
}

async function switchToEnglish(
  page: import("@playwright/test").Page,
): Promise<void> {
  const switcher = page.locator(".locale-switch:visible");
  await expect(switcher).toHaveAccessibleName("切换到英文界面");
  await switcher.click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}

test.describe("cross-browser accessibility smoke checks", () => {
  test.skip(
    !deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=true and a demo-mode web server.",
  );

  test.beforeEach(async ({ page }) => resetDemoState(page));

  test("Demo language stays explicit across final review surfaces and locales", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const routes = [
      "/compare?cycle=cycle-demo",
      "/growth",
      "/lesson/paper?cycle=cycle-demo&lesson=lesson-collocation-perspective",
      "/signin",
    ] as const;

    for (const locale of ["zh-CN", "en"] as const) {
      if (locale === "en") {
        await page.goto(routes[0]);
        await switchToEnglish(page);
      }

      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);

        const notice = page.locator("[data-demo-language-evidence]");
        if (route.startsWith("/compare") || route === "/growth") {
          await expect(notice).toBeVisible();
          await expect(
            notice.locator('[lang="zh-CN"]').getByText("虚构演示数据", {
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            notice.locator('[lang="en"]').getByText("Fictional demo data", {
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            notice.locator('[lang="zh-CN"]').getByText("不是语言评估", {
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            notice
              .locator('[lang="en"]')
              .getByText("Not a language evaluation", { exact: true }),
          ).toBeVisible();
        }

        await expectAxeRoute(page, route);
      }
    }
  });

  for (const route of coreRoutes) {
    test(`${route} has stable landmarks, names, labels, and IDs`, async ({
      page,
    }) => {
      await page.goto(route);
      await expectAxeRoute(page, route);
    });
  }

  test("the skip link reaches the primary content by keyboard", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "The touch project has no hardware-keyboard contract.",
    );
    await page.goto("/today");

    const skipLink = page.locator('a[href="#main-content"]');
    if (testInfo.project.name === "webkit") {
      // Playwright's WebKit does not emulate Safari's macOS "Press Tab to
      // highlight each item" preference. Let client hydration settle before
      // focusing the link explicitly; otherwise WebKit can replace the
      // server-rendered anchor after the focus call. Activation and destination
      // assertions remain keyboard-driven.
      await page.waitForTimeout(300);
      await skipLink.focus();
    } else {
      await page.keyboard.press("Tab");
    }
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
  });

  test("the setup skip link also places focus on its primary content", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "The touch project has no hardware-keyboard contract.",
    );
    await page.goto("/setup");
    const skipLink = page.locator('a[href="#main-content"]');
    if (testInfo.project.name === "webkit") {
      await page.waitForTimeout(300);
      await skipLink.focus();
    } else {
      await page.keyboard.press("Tab");
    }
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
  });

  test("the writing submission dialog contains and restores keyboard focus", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "The touch project has no hardware-keyboard contract.",
    );
    await page.goto("/write?cycle=cycle-demo");
    const editor = page.getByRole("textbox", { name: "你的作文" });
    await expect(editor).toBeEnabled();
    await editor.fill(`${"independent writing ".repeat(24)}ends here.`);
    const submit = page.getByRole("button", { name: "提交作文" });
    await submit.click();
    const submitDialog = page.getByRole("dialog", {
      name: "确认提交这份版本？",
    });
    await expect(submitDialog).toBeVisible();
    const firstDialogButton = page.getByRole("button", { name: "继续检查" });
    const lastDialogButton = page.getByRole("button", { name: "确认提交" });
    await expect(firstDialogButton).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(lastDialogButton).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(submitDialog).toBeHidden();
    await expect(submit).toBeFocused();
  });
});
