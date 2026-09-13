import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("skip link bypasses the public navigation and reaches a content action", async ({
  page,
}, testInfo) => {
  await page.goto("/signin");
  await expect(
    page.getByRole("button", { name: "开始写作", exact: true }),
  ).toBeEnabled();
  await page.getByRole("link", { name: "跳到主要内容", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  expect(
    await page.evaluate(() =>
      document
        .querySelector("main")
        ?.contains(document.querySelector("[data-public-header]")),
    ),
  ).toBe(false);
  // The touch WebKit profile does not emulate Safari's full keyboard-access
  // preference. Main focus and landmark separation are still verified above.
  if (testInfo.project.name === "mobile") return;
  await page.keyboard.press("Tab");
  // Safari's platform preference can skip buttons during Tab traversal; the
  // invariant is reaching content, never returning through the header.
  expect(
    await page.evaluate(() => ({
      inContent: document
        .querySelector("main")
        ?.contains(document.activeElement),
      inHeader: document
        .querySelector("[data-public-header]")
        ?.contains(document.activeElement),
      interactive: ["A", "BUTTON"].includes(
        document.activeElement?.tagName ?? "",
      ),
    })),
  ).toEqual({ inContent: true, inHeader: false, interactive: true });
});

test("closing pending account entry leaves the public page usable", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/account-entry", async (route) => {
    await gate;
    await route
      .fulfill({
        contentType: "application/json",
        body: JSON.stringify({ outcome: "SIGNED_IN", redirect_to: "/today" }),
      })
      .catch(() => {});
  });
  await page.goto("/signin");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByLabel("邮箱", { exact: true }).fill("sample@example.test");
  await page.getByLabel("密码", { exact: true }).fill("sample-password-123");
  const request = page.waitForRequest("**/api/v1/account-entry");
  await page.getByRole("button", { name: "登录并继续", exact: true }).click();
  await request;
  const canceled = page.waitForEvent("requestfailed", {
    predicate: (request) =>
      new URL(request.url()).pathname === "/api/v1/account-entry",
  });
  await page.getByRole("button", { name: "关闭登录窗口" }).click();
  release();
  await canceled;
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await expect(page.getByLabel("邮箱", { exact: true })).toHaveValue("");
  await expect(page).toHaveURL(/\/signin$/);
});

test("public page leads with the product and opens accessible account entry", async ({
  page,
}) => {
  await page.goto("/signin?next=%2Fwrite%3Fcycle%3Dcycle-demo");
  await expect(page.locator("[data-public-home]")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "邮箱", exact: true }),
  ).toHaveCount(0);
  const login = page.getByRole("button", { name: "登录", exact: true });
  await login.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("欢迎回来");
  await expect(dialog.getByLabel("邮箱", { exact: true })).toBeFocused();
  await expect(
    dialog.getByRole("link", { name: "忘记密码？" }),
  ).toHaveAttribute("href", "/recover");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(login).toBeFocused();
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await expect(dialog).toHaveAccessibleName("创建你的学习账号");
  await expect(
    dialog.getByRole("heading", { name: "创建你的学习账号" }),
  ).toBeVisible();
  await expect(dialog.getByLabel("密码", { exact: true })).toHaveAttribute(
    "autocomplete",
    "new-password",
  );
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
});

test("public page keeps its presentation surface monochrome", async ({
  page,
}) => {
  await page.goto("/signin");
  const colors = await page.locator("[data-public-home]").evaluate((home) => {
    const primary = home.querySelector("[data-public-primary-action]");
    const homeStyle = getComputedStyle(home);
    const primaryStyle = primary ? getComputedStyle(primary) : null;
    return {
      background: homeStyle.backgroundColor,
      color: homeStyle.color,
      primaryBackground: primaryStyle?.backgroundColor,
      primaryColor: primaryStyle?.color,
    };
  });
  expect(colors).toEqual({
    background: "rgb(255, 255, 255)",
    color: "rgb(17, 17, 17)",
    primaryBackground: "rgb(17, 17, 17)",
    primaryColor: "rgb(255, 255, 255)",
  });
});

test("registration uses the existing account contract and preserves the return path", async ({
  page,
}) => {
  let body: unknown;
  let calls = 0;
  await page.route("**/api/v1/account-entry", async (route) => {
    calls++;
    body = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        outcome: "REGISTERED",
        redirect_to: "/write?cycle=cycle-demo",
      }),
    });
  });
  await page.goto("/signin?next=%2Fwrite%3Fcycle%3Dcycle-demo");
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await page.getByLabel("邮箱", { exact: true }).fill("New@Example.test");
  await page.getByLabel("密码", { exact: true }).fill("sample-password-123");
  await page.getByRole("button", { name: "注册并继续", exact: true }).click();
  await expect(page).toHaveURL(/\/write\?cycle=cycle-demo$/);
  expect(body).toEqual({
    email: "new@example.test",
    password: "sample-password-123",
    next: "/write?cycle=cycle-demo",
  });
  expect(calls).toBe(1);
});

for (const width of [375, 768, 1440]) {
  test(`public page and account dialog fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/signin");
    await expect(page.locator("[data-public-home]")).toBeVisible();
    const header = page.locator("[data-public-header]");
    const register = header.getByRole("button", { name: "注册", exact: true });
    await expect(register).toBeInViewport();
    const overflow = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(1);
    await register.click();
    await expect(page.getByLabel("邮箱", { exact: true })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    const box = (await page.getByRole("dialog").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 8);
  });
}
