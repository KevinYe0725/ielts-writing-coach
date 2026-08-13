import { expect, test } from "@playwright/test";
import { DATABASE_SCHEMA_VERSION } from "../../packages/db/src/schema-version";

const owner = {
  email: "compose-e2e-owner@example.invalid",
  name: "Compose E2E Owner",
  password: "compose-e2e-owner-password-2026",
} as const;

const developedSentence =
  "Primary-school pupils face less academic pressure when language lessons use short, interactive activities instead of heavy homework.";

const developedParagraph = Array.from(
  { length: 4 },
  () =>
    "Regular classroom practice helps pupils use new language patterns accurately because each short task connects meaning, form, and a clear result.",
).join(" ");

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

async function answerCurrentLessonItem(
  page: import("@playwright/test").Page,
): Promise<void> {
  const card = page.locator(".exercise-card");
  const submitButton = card.getByRole("button", {
    name: /^(?:提交|再次提交)$/u,
  });
  await expect(submitButton).toBeVisible({ timeout: 10_000 });
  const spotlight = card.locator(".spotlight-picker button");
  const mappings = card.locator(".expression-map select");
  const choices = card.getByRole("radio");
  const answer = card.getByLabel("你的英文答案");

  if ((await spotlight.count()) > 0) {
    for (let index = 0; index < (await spotlight.count()); index += 1) {
      await spotlight.nth(index).click();
    }
  } else if ((await mappings.count()) > 0) {
    for (let index = 0; index < (await mappings.count()); index += 1) {
      await mappings.nth(index).selectOption({ index: index + 1 });
    }
  } else if ((await choices.count()) > 0) {
    await choices.first().locator("..").click();
  } else {
    const selfChecks = card.locator(".self-check-list input[type=checkbox]");
    if ((await selfChecks.count()) > 0) {
      for (let index = 0; index < (await selfChecks.count()); index += 1) {
        await selfChecks.nth(index).check();
      }
      await expect(answer).not.toHaveValue("", { timeout: 10_000 });
      const baseline = await answer.inputValue();
      await answer.fill(
        `${baseline.trim()} This final sentence makes the causal result clearer.`,
      );
    } else if ((await card.getByText(/80–120/u).count()) > 0) {
      await answer.fill(developedParagraph);
    } else {
      await answer.fill(developedSentence);
    }
  }

  await submitButton.click();
  await expect(
    card.locator(".answer-feedback").filter({
      hasText:
        /仅演示|已记录|答案已封存|本组统一反馈|准确|答案与本题公开的确定性答案规则一致/u,
    }),
  ).toBeVisible({ timeout: 90_000 });
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

test("the production image completes the real PostgreSQL and Mock-provider learning path", async ({
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
    page.getByRole("heading", { name: "先看最影响分数的三件事" }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Mock 演示 · 未评价语言")).toBeVisible();

  const lesson = await waitForLessonAction(page);
  await page.goto(
    `/lesson?cycle=${encodeURIComponent(lesson.cycleId)}&lesson=${encodeURIComponent(lesson.lessonId)}`,
  );

  for (let itemIndex = 0; itemIndex < 10; itemIndex += 1) {
    await expect(page.locator(".exercise-card")).toBeVisible({
      timeout: 90_000,
    });
    await answerCurrentLessonItem(page);
    const complete = page.getByRole("button", { name: "完成本课" });
    if (await complete.isVisible()) {
      await complete.click();
      break;
    }
    await page.getByRole("button", { name: "继续", exact: true }).click();
  }

  await expect(
    page.getByRole("heading", { name: "你已完成核心路径" }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("仅完成练习", { exact: true })).toBeVisible();
  await expect(page.getByText(/不会把能力标记为 applied/u)).toBeVisible();
  await expect(page.getByText("未安排证据重写", { exact: true })).toBeVisible();
});
