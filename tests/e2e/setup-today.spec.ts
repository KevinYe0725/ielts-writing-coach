import { expect, test } from "@playwright/test";

import {
  deterministicDemo,
  expectBasicAccessibility,
  resetDemoState,
} from "./support";

test.describe("deterministic setup and Today experience", () => {
  test.skip(
    !deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=true and a demo-mode web server.",
  );

  test.beforeEach(async ({ page }) => resetDemoState(page));

  test("first setup remains low-decision and verifies the AI connection", async ({
    page,
  }) => {
    await page.goto("/setup");

    await expect(
      page.getByRole("heading", { name: "欢迎使用 IELTS Writing" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /仅我使用/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await expectBasicAccessibility(page);
    await page.getByRole("button", { name: "继续", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "创建首位管理员" }),
    ).toBeVisible();
    await page.getByLabel("你的名字").fill("Simon");
    await page.getByLabel("登录邮箱").fill("simon@example.com");
    await page.getByLabel("密码").fill("a-secure-demo-password");
    await page.getByRole("button", { name: "连接 AI" }).click();

    await page.getByLabel("供应商").selectOption("mock");
    await expect(page.getByLabel("模型 ID")).toHaveValue("mock-ielts-demo");
    await page.getByRole("button", { name: "测试连接" }).click();
    await expect(page.getByText("可正常使用", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "保存并完成" }).click();

    await expect(
      page.getByRole("heading", { name: "可以开始第一篇写作了" }),
    ).toBeVisible();
    await expect(page.getByText("系统已就绪", { exact: true })).toBeVisible();
  });

  test("Today exposes exactly one primary next action", async ({ page }) => {
    await page.goto("/today");

    await expect(
      page.getByRole("heading", {
        name: "晚上好，Simon。今天只做这一件事。",
      }),
    ).toBeVisible();
    await expect(page.locator(".next-task-card")).toHaveCount(1);
    await expect(page.locator(".next-task-card a.button")).toHaveCount(1);
    await expect(
      page.locator(".next-task-card").getByRole("link", { name: "开始重写" }),
    ).toBeVisible();
    await expectBasicAccessibility(page);
  });

  test("the whole interface switches language without translating the task", async ({
    page,
  }) => {
    await page.goto("/today");
    const taskPrompt = "Closed-book rewrite: early language learning";

    await page
      .getByRole("button", { name: "切换到英文界面", exact: true })
      .click();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("heading", {
        name: "Good evening, Simon. There is only one thing to do today.",
      }),
    ).toBeVisible();
    await expect(page.getByText(taskPrompt, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Switch to Chinese interface",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("mobile navigation fits the viewport and keeps its controls named", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Mobile-only smoke check.");
    await page.goto("/today");

    await page.locator('summary[aria-label="打开导航"]').click();
    await expect(
      page.getByRole("navigation", { name: "主导航" }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
