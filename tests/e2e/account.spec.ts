import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { expectBasicAccessibility } from "./support";

async function expectAllVisibleFontsAtLeast(
  locator: import("@playwright/test").Locator,
  state: string,
  minimumPixels = 12,
) {
  await expect(locator.first()).toBeVisible();
  await expect
    .poll(
      () =>
        locator.evaluateAll(
          (elements, minimum) =>
            elements
              .map((element) => ({
                fontSize: Number.parseFloat(
                  window.getComputedStyle(element).fontSize,
                ),
                text:
                  element.getAttribute("aria-label") ||
                  element.textContent?.trim().slice(0, 80) ||
                  element.tagName.toLowerCase(),
              }))
              .filter(
                ({ fontSize }) =>
                  !Number.isFinite(fontSize) || fontSize < minimum,
              ),
          minimumPixels,
        ),
      { message: state },
    )
    .toEqual([]);
}

async function expectVisibleTextFloor(
  root: import("@playwright/test").Locator,
  state: string,
) {
  await expect(root).toBeVisible();
  const violations = await root.evaluate((container) => {
    const visible = (element: Element) => {
      if (
        element.closest(
          "[aria-hidden='true'], .sr-only, input[type='hidden'], svg",
        )
      )
        return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity || "1") > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const candidates = Array.from(container.querySelectorAll("*"));
    return candidates.flatMap((element) => {
      if (!visible(element)) return [];
      const explicitControl = element.matches(
        "label, input, select, button, small, .badge, [role='tab'], progress, [role='progressbar']",
      );
      const ownText = Array.from(element.childNodes).some(
        (node) =>
          node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
      );
      const hasVisibleTextChild = Array.from(element.children).some(
        (child) => visible(child) && Boolean(child.textContent?.trim()),
      );
      if (!explicitControl && (!ownText || hasVisibleTextChild)) return [];

      const fontSize = Number.parseFloat(
        window.getComputedStyle(element).fontSize,
      );
      if (fontSize >= 12) return [];
      const field = element as HTMLInputElement;
      const text =
        field.labels?.[0]?.textContent?.trim() ||
        element.getAttribute("aria-label") ||
        field.placeholder ||
        element.textContent?.trim() ||
        element.tagName.toLowerCase();
      return [
        {
          fontSize,
          selector: `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).trim().replace(/\s+/g, ".")}` : ""}`,
          text: text.slice(0, 80),
        },
      ];
    });
  });

  expect(
    violations,
    `${state}: ${JSON.stringify(violations, null, 2)}`,
  ).toEqual([]);
}

async function expectAxeRoute(
  page: import("@playwright/test").Page,
  route: string,
) {
  await expect(async () => {
    if (new URL(page.url()).pathname !== route) await page.goto(route);
    await expectBasicAccessibility(page);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      scan.violations,
      `${route}: ${JSON.stringify(scan.violations, null, 2)}`,
    ).toEqual([]);
  }).toPass({ timeout: 15_000 });
}

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

async function enterSignInCredentials(
  page: import("@playwright/test").Page,
  email: string,
) {
  const emailInput = page.locator("#signin-email");
  const passwordInput = page.locator("#signin-password");
  await expect
    .poll(
      () =>
        emailInput.evaluate((element) =>
          Object.keys(element).some((key) => key.startsWith("__reactProps$")),
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
  await emailInput.evaluate(
    () =>
      new Promise<void>((resolve) =>
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => resolve()),
        ),
      ),
  );
  await emailInput.fill(email);
  await passwordInput.fill("secure-password");
  await expect(emailInput).toHaveValue(email);
  await expect(passwordInput).toHaveValue("secure-password");
  await expect(
    page.getByRole("button", { name: /继续|continue/i }),
  ).toBeEnabled();
}

test.describe("account controls", () => {
  test("opens sign-in first for an anonymous visit to the root page", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/signin$/);
  });

  test("uses the visible form to create a personal account and keeps its local return path", async ({
    page,
  }) => {
    await signedInSession(page);
    await page.route("**/api/v1/account-entry", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          outcome: "REGISTERED",
          redirect_to: "/write?cycle=cycle-demo",
        }),
      });
    });

    await page.goto("/signin?next=/write?cycle=cycle-demo");
    await enterSignInCredentials(page, "new@example.test");
    await page.getByRole("button", { name: /继续|continue/i }).click();

    await expect(page).toHaveURL(/\/write\?cycle=cycle-demo$/);
  });

  test("keeps a shared-space unknown email on sign-in with an invitation message", async ({
    page,
  }) => {
    await page.route("**/api/v1/account-entry", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/problem+json",
        body: JSON.stringify({
          code: "INVITE_REQUIRED",
          detail: "Invitation required",
        }),
      });
    });

    await page.goto("/signin");
    await enterSignInCredentials(page, "new@example.test");
    await page.getByRole("button", { name: /继续|continue/i }).click();

    await expect(page).toHaveURL(/\/signin$/);
    await expect(page.locator(".setup-form-card [role='alert']")).toContainText(
      /邀请|invitation/i,
    );
    await expect(page.locator("#signin-email")).toHaveValue("new@example.test");
  });

  test("never follows an unsafe account-entry redirect", async ({ page }) => {
    await signedInSession(page);
    await page.route("**/api/v1/account-entry", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          outcome: "SIGNED_IN",
          redirect_to: "https://evil.example/",
        }),
      });
    });

    await page.goto("/signin?next=https://evil.example/");
    await enterSignInCredentials(page, "learner@example.test");
    await page.getByRole("button", { name: /继续|continue/i }).click();

    await expect(page).toHaveURL(/\/today$/);
  });

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
    await expect(page.locator("[data-account-desk='focus']")).toBeVisible();
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
    await expect(page.getByLabel(/^新密码$|^new password$/i)).toHaveAttribute(
      "minlength",
      "12",
    );
    await expect(page.getByLabel(/^新密码$|^new password$/i)).toHaveAttribute(
      "maxlength",
      "128",
    );
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

  for (const viewport of [
    { label: "desktop", width: 1440, height: 960 },
    { label: "390px mobile", width: 390, height: 844 },
  ]) {
    test(`entry, account, and settings surfaces pass axe at ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);

      for (const route of ["/signin", "/setup"]) {
        await page.goto(route);
        await expectAxeRoute(page, route);
      }

      await signedInSession(page);
      for (const route of ["/settings", "/account"]) {
        await page.goto(route);
        await expectAxeRoute(page, route);
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
      }
    });

    test(`all visible Entry, Settings, and Account text stays at least 12px on ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);

      await page.goto("/signin");
      await expectVisibleTextFloor(page.getByRole("main"), "/signin");

      await page.goto("/join?token=font-floor-token");
      await expectVisibleTextFloor(page.getByRole("main"), "/join form");

      await page.goto("/recover?error=INVALID_TOKEN");
      await expectVisibleTextFloor(
        page.getByRole("main"),
        "/recover invalid-token state",
      );

      await page.goto("/setup");
      await expectVisibleTextFloor(page.getByRole("main"), "/setup mode");
      const setupProgressLabels = page.locator(
        ".setup-steps li > span:visible, .setup-steps li strong:visible",
      );
      await expectAllVisibleFontsAtLeast(
        setupProgressLabels,
        "/setup progress labels",
      );

      await signedInSession(page);
      await page.goto("/settings");
      await expectVisibleTextFloor(
        page.getByRole("main"),
        "/settings learning",
      );
      await page.getByRole("button", { name: "计划与提醒" }).click();
      await expectVisibleTextFloor(
        page.getByRole("main"),
        "/settings schedule",
      );
      await page.getByRole("button", { name: "AI 服务" }).click();
      const badges = page.getByRole("main").locator(".badge:visible");
      await expectAllVisibleFontsAtLeast(badges, "/settings badges");
      await page.getByText("按学习步骤选择模型", { exact: true }).click();
      await expect(
        page.getByText(
          "Model-route administration is unavailable in the browser-only demo.",
        ),
      ).toBeVisible();
      const routeInputs = page.locator(".route-editor-row .text-input:visible");
      await expect(routeInputs).toHaveCount(9);
      await expectAllVisibleFontsAtLeast(
        routeInputs,
        "/settings route editor inputs",
      );
      await page.getByRole("button", { name: "新增或切换 AI 服务" }).click();
      await page.getByLabel("服务商预设").selectOption("custom");
      await expectVisibleTextFloor(
        page.getByRole("main"),
        "/settings AI advanced",
      );

      await page.getByRole("button", { name: "数据与隐私" }).click();
      const dataFileInput = page.locator(
        '.import-data-action input[type="file"]',
      );
      await expect(dataFileInput).toBeVisible();
      await expectAllVisibleFontsAtLeast(
        dataFileInput,
        "/settings data file input",
      );
      await expectVisibleTextFloor(page.getByRole("main"), "/settings data");

      await page.goto("/account");
      await expectVisibleTextFloor(page.getByRole("main"), "/account");
    });

    test(`primary controls retain the body-size type scale on ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);

      await page.goto("/signin");
      await expectAllVisibleFontsAtLeast(
        page.locator("#signin-email"),
        "/signin email input",
        14.5,
      );
      await expectAllVisibleFontsAtLeast(
        page.getByRole("button", { name: "继续", exact: true }),
        "/signin primary button",
        14.5,
      );

      await page.goto("/setup");
      await expectAllVisibleFontsAtLeast(
        page.getByRole("button", { name: "继续", exact: true }),
        "/setup primary button",
        14.5,
      );

      await signedInSession(page);
      await page.goto("/settings");
      await page.getByRole("button", { name: "计划与提醒" }).click();
      await expectAllVisibleFontsAtLeast(
        page.getByLabel("时区"),
        "/settings standard select",
        14.5,
      );
      await expectAllVisibleFontsAtLeast(
        page.getByLabel("常用学习时间"),
        "/settings standard text input",
        14.5,
      );

      await page.goto("/account");
      await expectAllVisibleFontsAtLeast(
        page.getByLabel("当前密码"),
        "/account password input",
        14.5,
      );
    });
  }
});
