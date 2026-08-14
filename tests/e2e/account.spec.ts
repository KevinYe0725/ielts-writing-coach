import { expect, test } from "@playwright/test";

import { expectBasicAccessibility } from "./support";

async function signedInSession(page: import("@playwright/test").Page) {
  await page.route("**/api/v1/auth/get-session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session: { token: "never-rendered" },
        user: {
          id: "private-user-id",
          email: "learner@example.com",
          name: "Learner",
          role: "learner",
        },
      }),
    });
  });
}

test.describe("account controls", () => {
  test("shows the signed-in account and updates a confirmed password", async ({
    page,
  }) => {
    await signedInSession(page);
    let passwordBody: unknown = null;
    await page.route("**/api/v1/auth/change-password", async (route) => {
      passwordBody = route.request().postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ status: true }),
      });
    });

    await page.goto("/account");
    await expect(
      page.getByRole("heading", { name: /账户与安全|account and security/i }),
    ).toBeVisible();
    await expectBasicAccessibility(page);
    await expect(
      page
        .locator("[aria-labelledby='signed-in-account']")
        .getByText("learner@example.com", { exact: true }),
    ).toBeVisible();
    const update = page.getByRole("button", {
      name: /更新密码|update password/i,
    });
    await expect(update).toBeDisabled();
    await page
      .getByLabel(/当前密码|current password/i)
      .fill("old-password-123");
    await page.getByLabel(/^新密码$|^new password$/i).fill("new-password-456");
    await page
      .getByLabel(/^确认新密码$|^confirm new password$/i)
      .fill("does-not-match");
    await expect(update).toBeDisabled();
    await page
      .getByLabel(/^确认新密码$|^confirm new password$/i)
      .fill("new-password-456");
    await expect(update).toBeEnabled();
    await update.click();

    await expect(page.getByRole("status")).toContainText(
      /密码已更新|password updated/i,
    );
    expect(passwordBody).toEqual({
      currentPassword: "old-password-123",
      newPassword: "new-password-456",
    });
    await expect(page.getByText(/导出学习数据|删除学习数据/i)).toHaveCount(0);
  });

  test("redirects an absent session away from the account page", async ({
    page,
  }) => {
    await page.route("**/api/v1/auth/get-session", async (route) => {
      await route.fulfill({ status: 401, body: "{}" });
    });

    await page.goto("/account");
    await expect(page).toHaveURL(/\/signin$/);
  });

  test("opens from the sidebar, restores focus after Escape, and signs out", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "The mobile menu has its own account-control flow.",
    );
    await signedInSession(page);
    await page.route("**/api/v1/auth/sign-out", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });
    await page.goto("/today");

    const trigger = page.getByRole("button", { name: /learner@example\.com/i });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("menuitem", { name: /账户与安全|account and security/i }),
    ).toBeVisible();
    await expect(page.getByText(/导出学习数据|删除学习数据/i)).toHaveCount(0);
    await page.getByRole("menuitem", { name: /退出登录|sign out/i }).click();
    await expect(page).toHaveURL(/\/signin$/);
  });

  test("keeps the same account actions reachable inside the mobile navigation", async ({
    page,
  }) => {
    await signedInSession(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/today");

    await page.locator(".mobile-menu > summary").click();
    await page.getByRole("button", { name: /learner@example\.com/i }).click();
    await expect(
      page.getByRole("menuitem", { name: /账户与安全|account and security/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /退出登录|sign out/i }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
