import { expect, test } from "@playwright/test";
import { DATABASE_SCHEMA_VERSION } from "../../packages/db/src/schema-version";

const owner = {
  email: "compose-e2e-owner@example.invalid",
  name: "Compose E2E Owner",
  password: "compose-e2e-owner-password-2026",
} as const;

async function setupOrResetIsolatedInstance(
  page: import("@playwright/test").Page,
): Promise<void> {
  const status = await page.request.get("/api/v1/setup/status");
  expect(status.ok()).toBe(true);
  const setupRequired = ((await status.json()) as { setup_required?: boolean })
    .setup_required;

  if (setupRequired) {
    const setupToken = process.env.IWC_E2E_SETUP_TOKEN;
    expect(
      setupToken,
      "The production workflow requires the token from the isolated Compose secrets volume.",
    ).toBeTruthy();
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
    expect(baseUrl).toBeTruthy();
    // Bootstrap the owner outside Playwright's traced browser/network layer so
    // a failure artifact cannot contain the one-time token. The visible UI is
    // still used below for authenticated provider testing and persistence.
    const setup = await fetch(`${baseUrl}/api/v1/setup`, {
      body: JSON.stringify({
        setup_token: setupToken,
        name: owner.name,
        email: owner.email,
        password: owner.password,
        deployment_mode: "personal",
        locale: "zh-CN",
        timezone: "UTC",
      }),
      headers: {
        "content-type": "application/json",
        origin: baseUrl!,
      },
      method: "POST",
    });
    expect(setup.status).toBe(201);
    const signIn = await page.request.post("/api/v1/auth/sign-in/email", {
      data: {
        email: owner.email,
        password: owner.password,
        rememberMe: true,
      },
      headers: { origin: baseUrl! },
    });
    expect(signIn.ok()).toBe(true);

    await page.goto("/setup");
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await page.getByLabel("你的名字").fill(owner.name);
    await page.getByLabel("登录邮箱").fill(owner.email);
    await page.getByLabel("密码").fill(owner.password);
    await page.getByRole("button", { name: "连接 AI" }).click();
    await page.getByLabel("供应商").selectOption("mock");
    await page.getByRole("button", { name: "测试连接" }).click();
    await expect(page.getByText("可正常使用", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "保存并完成" }).click();
    await expect(
      page.getByRole("heading", { name: "可以开始第一篇写作了" }),
    ).toBeVisible();
    return;
  }

  const signIn = await page.request.post("/api/v1/auth/sign-in/email", {
    data: {
      email: owner.email,
      password: owner.password,
      rememberMe: true,
    },
    headers: { origin: new URL(page.url() || "http://127.0.0.1").origin },
  });
  expect(signIn.ok()).toBe(true);

  // Retries run against the same disposable Compose project. Clear only the
  // test learner's learning records so the journey is repeatable; provider and
  // owner configuration intentionally remain in place.
  const reset = await page.request.delete("/api/v1/data", {
    data: { confirmation: "DELETE MY LEARNING DATA" },
    headers: {
      "Idempotency-Key": crypto.randomUUID(),
      origin: new URL(page.url() || "http://127.0.0.1").origin,
    },
  });
  expect(reset.ok()).toBe(true);
}

async function waitForLessonAction(
  page: import("@playwright/test").Page,
): Promise<{ cycleId: string; lessonId: string }> {
  await expect
    .poll(
      async () => {
        const response = await page.request.get("/api/v1/today");
        if (!response.ok()) return "HTTP_ERROR";
        const data = (await response.json()) as {
          cycle?: { id?: string } | null;
          next_action?: { entityId?: string; kind?: string };
        };
        return [
          data.next_action?.kind ?? "",
          data.cycle?.id ?? "",
          data.next_action?.entityId ?? "",
        ].join(":");
      },
      { intervals: [500, 1_000, 2_000], timeout: 90_000 },
    )
    .toMatch(/^(?:START_LESSON|CONTINUE_LESSON):[0-9a-f-]+:[0-9a-f-]+$/u);

  const response = await page.request.get("/api/v1/today");
  const data = (await response.json()) as {
    cycle: { id: string };
    next_action: { entityId: string };
  };
  return {
    cycleId: data.cycle.id,
    lessonId: data.next_action.entityId,
  };
}

test("the production Compose image opens setup in a real browser", async ({
  page,
  request,
}) => {
  const readiness = await request.get("/api/v1/health/ready");
  expect(readiness.ok()).toBe(true);
  expect(await readiness.json()).toMatchObject({
    checks: {
      configuration: true,
      database: true,
      migrations: true,
      task_executor: true,
    },
    status: "ready",
  });

  const version = await request.get("/api/version");
  expect(version.ok()).toBe(true);
  expect(await version.json()).toMatchObject({
    application: "1.0.0",
    database_schema: DATABASE_SCHEMA_VERSION,
    exchange_schema: "1.0.0",
  });

  const response = await page.goto("/setup");
  expect(response?.ok()).toBe(true);
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /欢迎使用 IELTS Writing|Welcome to IELTS Writing/u,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /继续|Continue/u }),
  ).toBeEnabled();
  await expect(page.locator("body")).not.toContainText(
    /Internal server error|Application error/u,
  );
});

test("the production image creates focused teaching and its complete practice paper", async ({
  page,
}) => {
  test.skip(
    process.env.IWC_COMPOSE_FULL_E2E !== "true",
    "The full stateful journey runs once on the native Compose image; cross-architecture jobs keep the setup smoke.",
  );
  test.setTimeout(5 * 60_000);

  await page.goto("/");
  await setupOrResetIsolatedInstance(page);
  await page.goto("/today");

  await expect(
    page.getByRole("heading", { name: /今天只做这一件事/u }),
  ).toBeVisible();
  await expect(page.getByLabel("题库")).toBeVisible();
  await page.getByRole("button", { name: "用这道题开始" }).click();
  await expect(page).toHaveURL(/\/write\?cycle=[0-9a-f-]+$/u);

  const essay = [
    "A regular pattern of short language lessons can help young pupils become familiar with new sounds and common structures before later academic work becomes more demanding.",
    ...Array.from(
      { length: 24 },
      () =>
        "Schools should keep these lessons interactive because stories, games, and purposeful communication build confidence without adding excessive homework or pressure.",
    ),
  ].join(" ");
  await page.getByRole("textbox", { name: "你的作文" }).fill(essay);
  await expect(page.getByText("已自动保存", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "提交作文" }).click();
  await page
    .getByRole("dialog", { name: "确认提交这份版本？" })
    .getByRole("button", { name: "确认提交" })
    .click();

  await expect(page).toHaveURL(/\/feedback\?cycle=[0-9a-f-]+$/u, {
    timeout: 90_000,
  });
  await expect(
    page.getByRole("heading", { name: "对照原文，把每一处问题改明白" }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("示例报告 · 未评价语言")).toBeVisible();

  const lesson = await waitForLessonAction(page);
  await page.goto(
    `/lesson?cycle=${encodeURIComponent(lesson.cycleId)}&lesson=${encodeURIComponent(lesson.lessonId)}`,
  );

  await expect(page.locator("article[data-teaching-article]")).toBeVisible({
    timeout: 90_000,
  });
  await expect(
    page.getByRole("link", { name: "开始60分钟训练卷" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "开始60分钟训练卷" }).click();
  await expect(page).toHaveURL(
    /\/lesson\/paper\?cycle=[0-9a-f-]+&lesson=[0-9a-f-]+$/u,
  );
  await expect(page.locator(".practice-paper-question")).toHaveCount(8, {
    timeout: 90_000,
  });
});
