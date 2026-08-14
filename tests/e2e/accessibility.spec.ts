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

test.describe("cross-browser accessibility smoke checks", () => {
  test.skip(
    !deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=true and a demo-mode web server.",
  );

  test.beforeEach(async ({ page }) => resetDemoState(page));

  for (const route of coreRoutes) {
    test(`${route} has stable landmarks, names, labels, and IDs`, async ({
      page,
    }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await expectBasicAccessibility(page);
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(scan.violations, JSON.stringify(scan.violations, null, 2)).toEqual(
        [],
      );
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
    await page.waitForLoadState("networkidle");

    const skipLink = page.locator('a[href="#main-content"]');
    if (testInfo.project.name === "webkit") {
      // Playwright's WebKit does not emulate Safari's macOS "Press Tab to
      // highlight each item" preference. Start on the link explicitly, then
      // keep the activation and destination assertions keyboard-driven.
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
    await page.waitForLoadState("networkidle");
    const skipLink = page.locator('a[href="#main-content"]');
    if (testInfo.project.name === "webkit") {
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
