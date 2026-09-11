import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import {
  deterministicDemo,
  expectBasicAccessibility,
  expectVisibleTextFloor,
} from "./support";

async function expectAllVisibleFontsAtLeast(
  locator: import("@playwright/test").Locator,
  state: string,
  minimumPixels = 12,
) {
  await expect(locator.first()).toBeVisible();
  await expect(async () => {
    const undersized = await locator.evaluateAll(
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
            ({ fontSize }) => !Number.isFinite(fontSize) || fontSize < minimum,
          ),
      minimumPixels,
    );
    expect(undersized, state).toEqual([]);
  }).toPass({ timeout: 10_000 });
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

  test("uses a login-specific composition without an empty viewport scroll", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/signin");

      await expect(page.locator("[data-signin-layout]")).toBeVisible();
      await expect(page.locator("[data-signin-form]")).toBeVisible();
      await expect(page.locator("[data-signin-story]")).toBeVisible();
      await expect(page.getByText("自托管实例")).toHaveCount(0);
      await expect(page.getByText("欢迎回来", { exact: true })).toBeVisible();

      const overflow = await page.evaluate(() => ({
        horizontal:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        vertical:
          document.documentElement.scrollHeight -
          document.documentElement.clientHeight,
      }));
      expect(overflow.horizontal).toBeLessThanOrEqual(1);
      expect(overflow.vertical).toBeLessThanOrEqual(1);
    }
  });

  test("fills the wide entry canvas while keeping the form readable", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/signin");
      await expect(page.locator("[data-signin-layout]")).toBeVisible();

      const geometry = await page.evaluate(() => {
        const topbar = document
          .querySelector(".setup-topbar")
          ?.getBoundingClientRect();
        const layout = document
          .querySelector("[data-signin-layout]")
          ?.getBoundingClientRect();
        const form = document
          .querySelector("[data-signin-form] form")
          ?.getBoundingClientRect();
        return {
          formWidth: form?.width ?? 0,
          layoutWidth: layout?.width ?? 0,
          topbarLeft: topbar?.left ?? -1,
          topbarRight: topbar?.right ?? -1,
        };
      });

      expect(geometry.topbarLeft).toBeLessThanOrEqual(1);
      expect(viewport.width - geometry.topbarRight).toBeLessThanOrEqual(1);
      expect(geometry.layoutWidth).toBeGreaterThanOrEqual(viewport.width - 100);
      expect(geometry.formWidth).toBeGreaterThanOrEqual(360);
      expect(geometry.formWidth).toBeLessThanOrEqual(540);
    }
  });

  test("keeps a short password local and submits a normalized new-account email", async ({
    page,
  }) => {
    await signedInSession(page);
    let submittedBody: unknown = null;
    await page.route("**/api/v1/account-entry", async (route) => {
      submittedBody = route.request().postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          outcome: "REGISTERED",
          redirect_to: "/today",
        }),
      });
    });

    await page.goto("/signin");
    await page.locator("#signin-email").fill("  new@example.test  ");
    await page.locator("#signin-password").fill("12345678901");
    await expect(page.getByText(/至少 12 个字符/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /登录并继续|sign in and continue/i }),
    ).toBeDisabled();

    await page.locator("#signin-password").fill("123456789012");
    await page
      .getByRole("button", { name: /登录并继续|sign in and continue/i })
      .click();

    await expect(page).toHaveURL(/\/today$/);
    expect(submittedBody).toMatchObject({
      email: "new@example.test",
      password: "123456789012",
    });
  });

  test("shows localized credential errors instead of server prose", async ({
    page,
  }) => {
    await page.route("**/api/v1/account-entry", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/problem+json",
        body: JSON.stringify({
          code: "INVALID_CREDENTIALS",
          detail: "The email or password is incorrect.",
        }),
      });
    });

    await page.goto("/signin");
    await enterSignInCredentials(page, "learner@example.test");
    await page
      .getByRole("button", {
        name: /继续|continue|登录并继续|sign in and continue/i,
      })
      .click();

    await expect(
      page.locator("[data-entry-surface='signin'] [role='alert']"),
    ).toHaveText("邮箱或密码不正确。");
    await expect(
      page.getByText("The email or password is incorrect."),
    ).toHaveCount(0);
  });

  test("allows only one account-entry request while the form is busy", async ({
    page,
  }) => {
    let requestCount = 0;
    let releaseRequest!: () => void;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await page.route("**/api/v1/account-entry", async (route) => {
      requestCount += 1;
      await requestGate;
      await route.fulfill({
        status: 401,
        contentType: "application/problem+json",
        body: JSON.stringify({ code: "INVALID_CREDENTIALS" }),
      });
    });

    await page.goto("/signin");
    await enterSignInCredentials(page, "learner@example.test");
    const form = page.locator("[data-entry-surface='signin'] form");
    await form.evaluate((element) => {
      const signInForm = element as HTMLFormElement;
      signInForm.requestSubmit();
      signInForm.requestSubmit();
    });

    try {
      await expect.poll(() => requestCount).toBeGreaterThan(0);
      expect(requestCount).toBe(1);
      await expect(form).toHaveAttribute("aria-busy", "true");
      await expect(page.locator("#signin-email")).toBeDisabled();
      await expect(page.locator("#signin-password")).toBeDisabled();
    } finally {
      releaseRequest();
    }
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

  test("opens from the topbar, restores focus after Escape, and signs out", async ({
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

  test("keeps the same account actions reachable in the mobile topbar", async ({
    page,
  }) => {
    await signedInSession(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/today");

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

  test("uses only the owner-safe HTTP search-connection contract", async ({
    page,
  }) => {
    test.skip(
      process.env.NEXT_PUBLIC_DEMO_MODE === "true",
      "This contract test exercises the non-demo HttpLearningClient.",
    );

    type SearchMode = "MISSING" | "ACTIVE" | "INVALID" | "FORBIDDEN" | "ERROR";
    type SearchPhase = "MISSING" | "ACTIVE" | "INVALID" | "403" | "503";
    let searchMode: SearchMode = "MISSING";
    const searchPhase = (): SearchPhase => {
      if (searchMode === "FORBIDDEN") return "403";
      if (searchMode === "ERROR") return "503";
      return searchMode;
    };
    let testAttempts = 0;
    const mutations: Array<{
      body: string | null;
      headers: Record<string, string>;
      method: string;
      path: string;
      phase?: SearchPhase;
    }> = [];
    const json = (
      route: import("@playwright/test").Route,
      body: unknown,
      status = 200,
    ) =>
      route.fulfill({
        body: JSON.stringify(body),
        contentType: "application/json",
        status,
      });

    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (/^\/api\/v1\/search-connection(?:\/|$)/.test(path)) {
        mutations.push({
          body: request.postData(),
          headers: request.headers(),
          method: request.method(),
          path,
          ...(request.method() === "GET" ? { phase: searchPhase() } : {}),
        });
      }
      if (path.endsWith("/auth/get-session")) {
        await json(route, {
          session: { token: "never-rendered" },
          user: {
            id: "owner-http-fixture",
            email: "owner@example.test",
            name: "Owner",
            role: "owner",
          },
        });
        return;
      }
      if (path.endsWith("/providers")) {
        await json(route, { providers: [] });
        return;
      }
      if (path.endsWith("/preferences")) {
        await json(route, {
          email: "owner@example.test",
          preferences: {},
          slots: [],
          smtp_configured: true,
          timezone: "Asia/Shanghai",
        });
        return;
      }
      if (path.endsWith("/search-connection/test")) {
        testAttempts += 1;
        if (testAttempts === 1) {
          await json(
            route,
            {
              code: "SEARCH_CONNECTION_TEST_FAILED",
              detail: "This temporary key could not be tested.",
              status: 422,
              title: "Search connection test failed",
            },
            422,
          );
          return;
        }
        await json(route, {
          latency_ms: 12,
          ok: true,
          safe_message: "Brave Search connection validated.",
        });
        return;
      }
      if (path.endsWith("/search-connection")) {
        if (request.method() === "GET") {
          if (searchMode === "FORBIDDEN") {
            await json(
              route,
              { code: "FORBIDDEN", detail: "Forbidden", status: 403 },
              403,
            );
            return;
          }
          if (searchMode === "ERROR") {
            await json(
              route,
              {
                code: "SEARCH_CONNECTION_UNAVAILABLE",
                detail: "Question-search status is temporarily unavailable.",
                status: 503,
                title: "Question-search status unavailable",
              },
              503,
            );
            return;
          }
          if (searchMode === "MISSING") {
            await json(route, null);
            return;
          }
          await json(route, {
            kind: "brave",
            status: searchMode,
            tested_at: "2026-08-25T09:30:00.000Z",
          });
          return;
        }
        if (request.method() === "PUT") {
          searchMode = "ACTIVE";
          await json(route, {
            kind: "brave",
            status: "ACTIVE",
            tested_at: "2026-08-25T09:31:00.000Z",
          });
          return;
        }
        if (request.method() === "DELETE") {
          searchMode = "MISSING";
          await route.fulfill({ status: 204 });
          return;
        }
      }
      await json(route, {});
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/settings");
    await page.getByRole("button", { name: "AI 服务" }).click();
    const search = page.getByRole("region", { name: "联网题目检索" });
    const key = search.getByLabel("Brave Search API Key");
    await expect(search.getByText("未连接", { exact: true })).toBeVisible();

    await key.fill("temporary-invalid-key");
    await search.getByRole("button", { name: "测试连接" }).click();
    await expect(search.getByRole("status")).toContainText("temporary key");
    await expect(key).toHaveValue("temporary-invalid-key");

    await key.fill("temporary-valid-key");
    await search.getByRole("button", { name: "测试连接" }).click();
    await expect(search.getByRole("status")).toContainText("已通过测试");
    await expect(key).toHaveValue("temporary-valid-key");

    await search.getByRole("button", { name: "保存并启用" }).click();
    await expect(search.getByText("可正常使用", { exact: true })).toBeVisible();
    await expect(key).toHaveValue("");

    await key.fill("replacement-key");
    await search.getByRole("button", { name: "保存并替换" }).click();
    await expect(search.getByRole("status")).toContainText("最近验证");
    await expect(key).toHaveValue("");

    await page.reload();
    await page.getByRole("button", { name: "AI 服务" }).click();
    await expect(search.getByText("可正常使用", { exact: true })).toBeVisible();

    const activeAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(activeAxe.violations).toEqual([]);

    page.once("dialog", (dialog) => dialog.dismiss());
    await search.getByRole("button", { name: "撤销连接…" }).click();
    await expect(search.getByText("可正常使用", { exact: true })).toBeVisible();
    expect(
      mutations.filter((mutation) => mutation.method === "DELETE"),
    ).toHaveLength(0);

    page.once("dialog", (dialog) => dialog.accept());
    await search.getByRole("button", { name: "撤销连接…" }).click();
    await expect(search.getByText("未连接", { exact: true })).toBeVisible();

    searchMode = "INVALID";
    await page.reload();
    await page.getByRole("button", { name: "AI 服务" }).click();
    const invalidSearch = page.getByRole("region", { name: "联网题目检索" });
    await expect(
      invalidSearch.getByText("需要检查", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expectVisibleTextFloor(invalidSearch, "HTTP invalid search setting");
    const invalidAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(invalidAxe.violations).toEqual([]);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    searchMode = "FORBIDDEN";
    await page.reload();
    await page.getByRole("button", { name: "AI 服务" }).click();
    await expect(
      page.getByRole("heading", { name: "联网题目检索" }),
    ).toHaveCount(0);

    searchMode = "ERROR";
    await page.reload();
    await page.getByRole("button", { name: "AI 服务" }).click();
    await expect(
      page.getByRole("region", { name: "联网题目检索" }),
    ).toContainText("temporarily unavailable");

    const stored = await page.evaluate(() => [
      ...Object.values(localStorage),
      ...Object.values(sessionStorage),
    ]);
    for (const secret of [
      "temporary-invalid-key",
      "temporary-valid-key",
      "replacement-key",
    ])
      expect(stored.join("\n")).not.toContain(secret);

    const testCalls = mutations.filter((mutation) =>
      mutation.path.endsWith("/test"),
    );
    const searchCalls = mutations.filter((mutation) =>
      mutation.path.endsWith("/search-connection"),
    );
    expect(
      mutations
        .map((mutation) => `${mutation.method} ${mutation.path}`)
        .filter(
          (requestLine) =>
            ![
              "GET /api/v1/search-connection",
              "PUT /api/v1/search-connection",
              "DELETE /api/v1/search-connection",
              "POST /api/v1/search-connection/test",
            ].includes(requestLine),
        ),
      "unexpected search-connection method/path combinations",
    ).toEqual([]);
    expect(testCalls).toHaveLength(2);
    expect(testCalls.map((mutation) => mutation.method)).toEqual([
      "POST",
      "POST",
    ]);
    expect(
      testCalls.map((mutation) => JSON.parse(mutation.body ?? "{}")),
    ).toEqual([
      { api_key: "temporary-invalid-key" },
      { api_key: "temporary-valid-key" },
    ]);
    expect(
      testCalls.every(
        (mutation) =>
          mutation.headers["content-type"] === "application/json" &&
          mutation.headers.origin === "http://127.0.0.1:3295" &&
          !mutation.headers["idempotency-key"],
      ),
    ).toBe(true);
    const gets = searchCalls.filter((mutation) => mutation.method === "GET");
    const collapsedGetPhases = gets
      .map((mutation) => mutation.phase)
      .filter(
        (phase, index, phases) => index === 0 || phase !== phases[index - 1],
      );
    expect(collapsedGetPhases, "collapsed GET response phase stream").toEqual([
      "MISSING",
      "ACTIVE",
      "INVALID",
      "403",
      "503",
    ]);
    expect(
      mutations.findIndex(
        (mutation) => mutation.method === "GET" && mutation.phase === "MISSING",
      ),
    ).toBeLessThan(
      mutations.findIndex((mutation) => mutation.method === "POST"),
    );
    expect(
      gets.every(
        (mutation) =>
          mutation.body === null &&
          !mutation.headers.origin &&
          !mutation.headers["content-type"] &&
          !mutation.headers["idempotency-key"],
      ),
    ).toBe(true);
    for (const mutation of mutations) {
      if (mutation.method === "GET") continue;
      expect(mutation.headers.origin).toBe("http://127.0.0.1:3295");
    }
    const saves = mutations.filter((mutation) => mutation.method === "PUT");
    expect(saves).toHaveLength(2);
    expect(saves.map((mutation) => JSON.parse(mutation.body ?? "{}"))).toEqual([
      { api_key: "temporary-valid-key" },
      { api_key: "replacement-key" },
    ]);
    expect(
      saves.every(
        (mutation) =>
          mutation.headers["content-type"] === "application/json" &&
          Boolean(mutation.headers["idempotency-key"]),
      ),
    ).toBe(true);
    const deletes = mutations.filter(
      (mutation) => mutation.method === "DELETE",
    );
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.headers["idempotency-key"]).toBeTruthy();
    expect(deletes[0]?.body).toBeNull();
    expect(deletes[0]?.headers["content-type"]).toBeUndefined();
  });

  for (const viewport of [
    { label: "desktop", width: 1440, height: 960 },
    { label: "390px mobile", width: 390, height: 844 },
  ]) {
    test(`entry, account, and settings surfaces pass axe at ${viewport.label}`, async ({
      page,
    }) => {
      test.skip(
        !deterministicDemo,
        "This visual matrix uses the complete browser-only Demo settings fixtures; non-Demo search/settings Axe coverage runs in the HTTP contract test.",
      );
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
      test.skip(
        !deterministicDemo,
        "This typography matrix uses the complete browser-only Demo settings fixtures.",
      );
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
      await expect(page.locator("[data-settings-desk='focus']")).toBeVisible();
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
      await expect(routeInputs).toHaveCount(10);
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
      await expect(page.locator("[data-account-desk='focus']")).toBeVisible();
      await expectVisibleTextFloor(page.getByRole("main"), "/account");
    });

    test(`primary controls retain the body-size type scale on ${viewport.label}`, async ({
      page,
    }) => {
      test.skip(
        !deterministicDemo,
        "This typography matrix uses the complete browser-only Demo settings fixtures.",
      );
      await page.setViewportSize(viewport);

      await page.goto("/signin");
      await expectAllVisibleFontsAtLeast(
        page.locator("#signin-email"),
        "/signin email input",
        14.5,
      );
      await expectAllVisibleFontsAtLeast(
        page.getByRole("button", { name: "登录并继续", exact: true }),
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
