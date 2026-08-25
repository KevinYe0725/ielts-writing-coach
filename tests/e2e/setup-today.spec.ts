import { expect, test, type Page } from "@playwright/test";

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
    // The setup panel is server-rendered first. Wait for its client handler to
    // hydrate before exercising the first state transition on a busy mobile
    // browser, rather than treating a pre-hydration click as a user action.
    await page.waitForTimeout(300);
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

  test("setup keeps provider failure actionable inside the entry surface", async ({
    page,
  }) => {
    await page.goto("/setup");
    await expect(page.locator("[data-entry-surface='setup']")).toBeVisible();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await page.getByLabel("你的名字").fill("Simon");
    await page.getByLabel("登录邮箱").fill("simon@example.com");
    await page.getByLabel("密码").fill("a-secure-demo-password");
    await page.getByRole("button", { name: "连接 AI" }).click();
    await page.getByLabel("供应商").selectOption("custom");
    await page.getByLabel("Base URL").fill("https://provider.example/v1");
    await page.getByLabel("模型 ID").fill("provider-model");

    await page.getByRole("button", { name: "测试连接" }).click();
    await expect(page.getByText("需要修复", { exact: true })).toBeVisible();
    await expect(
      page.getByText("连接信息不完整，请检查 API Key 和模型。"),
    ).toBeVisible();
    await expect(page.getByLabel("Base URL")).toHaveValue(
      "https://provider.example/v1",
    );
    await expect(page.getByLabel("API Key")).toHaveValue("");
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
    await expect(page.locator("[data-essay-workspace]")).toBeVisible();
    await expect(page.locator("main .button-primary:visible")).toHaveCount(1);
    await expect(
      page.locator(".next-task-card").getByRole("link", { name: "开始重写" }),
    ).toBeVisible();
    await expectBasicAccessibility(page);
  });

  test("Today has one primary action and retains every existing utility", async ({
    page,
  }) => {
    await page.goto("/today");

    await expect(page.locator(".next-task-card")).toHaveCount(1);
    const evidence = page.getByRole("list", {
      name: "本周学习证据",
    });
    await expect(evidence.getByText("已记录学习时长")).toBeVisible();
    await expect(evidence.getByText("已提交首稿")).toBeVisible();
    await expect(evidence.getByText("独立复测未复发")).toBeVisible();
    await expect(page.getByRole("button", { name: "刷新计划" })).toBeVisible();
  });

  test("new-essay recommends one prompt and keeps manual routes inside disclosures", async ({
    page,
  }) => {
    await page.goto("/today?new-essay=1");

    await expect(page).toHaveURL(/\/today\?new-essay=1$/);
    await expect(page.getByText("为你推荐", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "用这道题开始写作" }),
    ).toHaveCount(1);
    await expect(page.getByText("已为你平衡近期题型与话题")).toBeVisible();
    const recommendation = page.getByLabel("今天就写这一题");
    await expect(
      recommendation.getByText("题型", { exact: true }),
    ).toBeVisible();
    await expect(
      recommendation.getByText("话题", { exact: true }),
    ).toBeVisible();
    await expect(
      recommendation.getByText("考试类别", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("浏览全部题库")).toBeVisible();
    await expect(page.getByText("粘贴我自己的题目")).toBeVisible();
    await expect(page.getByLabel("题库")).not.toBeVisible();
    await page.getByText("粘贴我自己的题目").click();
    await expect(page.getByLabel("完整英文题目")).toBeVisible();
    await expect(page.getByLabel("题型")).toBeVisible();
    await expect(page.getByLabel("话题")).toBeVisible();
    await expect(
      page.getByLabel("IELTS").locator('option[value="academic"]'),
    ).toHaveCount(1);
    await expect(
      page.getByLabel("IELTS").locator('option[value="general_training"]'),
    ).toHaveCount(1);
  });

  test("swap replaces the recommendation and returns keyboard focus to its start action", async ({
    page,
  }) => {
    await page.goto("/today?new-essay=1");
    const prompt = page.locator("[data-recommendation-prompt]");
    const before = await prompt.textContent();

    await page.getByRole("button", { name: "换一题" }).click();

    await expect(
      page.getByRole("button", { name: "用这道题开始写作" }),
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: "换一题" })).toBeDisabled();

    await expect(prompt).not.toHaveText(before ?? "");
    await expect(
      page.getByRole("button", { name: "用这道题开始写作" }),
    ).toBeFocused();
  });

  test("preparing and unavailable recommendation states retain the private-question fallback", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem("iwc.demo.question-recommendation-state"))
        localStorage.setItem(
          "iwc.demo.question-recommendation-state",
          "PREPARING",
        );
    });
    await page.goto("/today?new-essay=1");
    await expect(page.getByRole("status")).toContainText("正在为你准备");
    await page.getByText("粘贴我自己的题目").click();
    await expect(page.getByLabel("完整英文题目")).toBeVisible();

    await page.evaluate(() => {
      localStorage.setItem(
        "iwc.demo.question-recommendation-state",
        "UNAVAILABLE",
      );
    });
    await page.reload();
    await expect(
      page.locator("[data-today-primary]").getByRole("alert"),
    ).toContainText("暂时无法准备新题");
    await expect(
      page.getByRole("button", { name: "用这道题开始写作" }),
    ).toHaveCount(0);
    await expect(page.getByText("粘贴我自己的题目")).toBeVisible();
  });

  test("a bounded preparing window becomes a local retry without leaking its detail", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "iwc.demo.question-recommendation-state",
        "PREPARING_TIMEOUT",
      );
    });
    await page.goto("/today?new-essay=1");

    await expect(page.getByRole("button", { name: "再试一次" })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("[data-today-primary]")).not.toContainText(
      "server-supplied detail must never render",
    );
    await page.evaluate(() => {
      localStorage.setItem("iwc.demo.question-recommendation-state", "READY");
    });
    await page.getByRole("button", { name: "再试一次" }).click();
    await expect(page.locator("[data-recommendation-prompt]")).toBeVisible();
  });

  test("the safe action dock keeps the complete prompt and start action visible", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/today?new-essay=1");
      const prompt = page.locator("[data-recommendation-prompt]");
      const start = page.getByRole("button", { name: "用这道题开始写作" });
      await expect(prompt).toBeVisible();
      await expect(start).toBeVisible();
      const [promptBox, startBox] = await Promise.all([
        prompt.boundingBox(),
        start.boundingBox(),
      ]);
      expect(promptBox).not.toBeNull();
      expect(startBox).not.toBeNull();
      expect(promptBox!.y + promptBox!.height).toBeLessThan(startBox!.y - 8);
      expect(startBox!.y + startBox!.height).toBeLessThanOrEqual(
        viewport.height - 8,
      );
      if (viewport.width === 390) {
        const accountBox = await page
          .getByRole("button", { name: "Open Next.js Dev Tools" })
          .boundingBox();
        expect(accountBox).not.toBeNull();
        expect(startBox!.x).toBeGreaterThan(
          accountBox!.x + accountBox!.width + 8,
        );
      }
    }
  });

  test("starting a recommendation records its recommendation id and avoids backend vocabulary", async ({
    page,
  }) => {
    await page.goto("/today?new-essay=1");
    await page.getByRole("button", { name: "用这道题开始写作" }).click();
    await expect(page).toHaveURL(/\/write\?cycle=cycle-demo-selected$/);
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem("iwc.demo.selected-recommendation"),
        ),
      )
      .not.toBeNull();
    await expect(page.locator("main")).not.toContainText(
      /provider|job id|ranking|score|候选|供应商/i,
    );
  });

  test("the whole interface switches language without translating the task", async ({
    page,
  }) => {
    await page.goto("/today");
    const taskPrompt = "Closed-book rewrite: early language learning";

    const header =
      (page.viewportSize()?.width ?? 1_000) < 700
        ? page.locator(".mobile-header")
        : page.locator(".topbar");
    const localeSwitch = header.getByRole("button", {
      name: "切换到英文界面",
      exact: true,
    });
    await localeSwitch.click();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("heading", {
        name: "Good evening, Simon. There is only one thing to do today.",
      }),
    ).toBeVisible();
    await expect(page.getByText(taskPrompt, { exact: true })).toBeVisible();
    await expect(
      header.getByRole("button", {
        name: "Switch to Chinese interface",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("mobile navigation fits the viewport and keeps its controls named", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Mobile-only smoke check.");
    await page.goto("/today?new-essay=1");

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

    const promptBox = await page
      .locator("[data-recommendation-prompt]")
      .boundingBox();
    const startBox = await page
      .getByRole("button", { name: "用这道题开始写作" })
      .boundingBox();
    expect(promptBox).not.toBeNull();
    expect(startBox).not.toBeNull();
    expect(startBox!.y + startBox!.height).toBeLessThanOrEqual(
      page.viewportSize()!.height - 8,
    );
  });
});

type TodayHttpState = "mixed-review" | "feedback-waiting";

async function routeTodayHttpFixture(page: Page, state: TodayHttpState) {
  await page.route("**/api/v1/auth/get-session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session: { token: "today-http-fixture" },
        user: {
          id: "today-http-user",
          email: "learner@example.com",
          name: "Learner",
          role: "learner",
        },
      }),
    });
  });
  await page.route("**/api/v1/notifications", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ notifications: [] }),
    });
  });
  await page.route("**/api/v1/providers", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ providers: [{ enabled: true }] }),
    });
  });
  await page.route("**/api/v1/growth", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        summary: {
          essays_completed: 4,
          independent_non_recurrence_rate: 43,
          recorded_learning_minutes: 126,
        },
      }),
    });
  });
  await page.route("**/api/v1/essays", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ active_count: 0, active_limit: 8, essays: [] }),
    });
  });
  await page.route("**/api/v1/questions", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        questions: [
          {
            externalId: "http-question-education",
            prompt:
              "Some people believe schools should teach financial literacy. To what extent do you agree or disagree?",
            questionType: "opinion",
            topic: "education",
            ieltsTrack: "academic",
            visibility: "public",
          },
        ],
      }),
    });
  });
  await page.route("**/api/v1/question-recommendations", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        recommendation: {
          id: "recommendation-http",
          status: "READY",
          question: {
            id: "http-question-education",
            prompt:
              "Some people believe schools should teach financial literacy. To what extent do you agree or disagree?",
            type: "opinion",
            topic: "education",
            ielts_track: "academic",
            visibility: "public",
          },
        },
      }),
    });
  });
  await page.route(
    "**/api/v1/question-recommendations/recommendation-http",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          recommendation: {
            id: "recommendation-http",
            status: "READY",
            question: {
              id: "http-question-education",
              prompt:
                "Some people believe schools should teach financial literacy. To what extent do you agree or disagree?",
              type: "opinion",
              topic: "education",
              ielts_track: "academic",
              visibility: "public",
            },
          },
        }),
      });
    },
  );
  await page.route("**/api/v1/today", async (route) => {
    const cycle = {
      id: "cycle-http-fixture",
      status: state === "mixed-review" ? "CORE_CYCLE_COMPLETED" : "ANALYZING",
      question: {
        prompt: "HTTP-boundary Today fixture",
        type: "opinion",
        topic: "education",
      },
      resources: {
        writing_available: true,
        feedback_available: false,
        lesson_id: null,
        rewrite_task_id: null,
        comparison_available: false,
        transfer_task_id: null,
        pending_job:
          state === "feedback-waiting"
            ? {
                id: "job-http-feedback",
                status: "RUNNING",
                task_kind: "ielts_assessment",
                error_code: null,
                error_safe_message: null,
              }
            : null,
      },
    };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        cycle,
        next_action:
          state === "mixed-review"
            ? {
                kind: "START_MIXED_REVIEW",
                entityId: "mixed-review-http",
                dueAt: null,
              }
            : {
                kind: "WAIT_FOR_ASSESSMENT",
                entityId: "cycle-http-fixture",
                dueAt: null,
              },
        queue: [],
      }),
    });
  });
}

async function routePreparingFallbackFixture(page: Page) {
  await routeTodayHttpFixture(page, "mixed-review");
  let releasePoll!: () => void;
  const pollRelease = new Promise<void>((resolve) => {
    releasePoll = resolve;
  });
  let polls = 0;
  const cycleBodies: Array<Record<string, unknown>> = [];

  await page.route("**/api/v1/question-recommendations", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      contentType: "application/json",
      status: 202,
      body: JSON.stringify({
        recommendation: {
          id: "recommendation-preparing-fallback",
          status: "PENDING",
          retry_after_seconds: 1,
        },
      }),
    });
  });
  await page.route(
    "**/api/v1/question-recommendations/recommendation-preparing-fallback",
    async (route) => {
      polls += 1;
      await pollRelease;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          recommendation: {
            id: "recommendation-preparing-fallback",
            status: "READY",
            question: {
              id: "stale-recommended-question",
              prompt:
                "Some people believe public transport should be free. Discuss both views and give your opinion.",
              type: "discussion",
              topic: "urban_transport",
              ielts_track: "academic",
              visibility: "public",
            },
          },
        }),
      });
    },
  );
  await page.route("**/api/v1/training-cycles", async (route) => {
    cycleBodies.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({ cycle: { id: "cycle-manual-fallback" } }),
    });
  });
  await page.route("**/api/v1/questions", async (route) => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          question: {
            id: "custom-fallback-question",
            prompt: input.prompt,
            type: input.type,
            topic: input.topic,
            ielts_track: input.ielts_track,
            visibility: "private",
          },
        }),
      });
      return;
    }
    await route.fallback();
  });

  return {
    cycleBodies,
    polls: () => polls,
    releasePoll,
  };
}

test.describe("Today query states at the HTTP boundary", () => {
  test.skip(
    deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=false and an isolated HTTP-mode server.",
  );

  test("mixed-review keeps D14 framing while showing the recommended question", async ({
    page,
  }) => {
    await routeTodayHttpFixture(page, "mixed-review");
    await page.goto("/today?mixed-review=1");

    await expect(page).toHaveURL(/\/today\?mixed-review=1$/);
    await expect(
      page.getByRole("heading", {
        name: "完成新作文并被动复测旧目标",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "旧目标保持隐藏；系统只根据这篇新作文中自然出现的证据判断保持情况。",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "用这道题开始写作" }),
    ).toBeVisible();
  });

  test("synchronously dispatched start events create one training cycle", async ({
    page,
  }) => {
    let starts = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().endsWith("/api/v1/training-cycles")
      )
        starts += 1;
    });
    await routeTodayHttpFixture(page, "mixed-review");
    await page.route("**/api/v1/training-cycles", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ cycle: { id: "cycle-double-start" } }),
      });
    });
    await page.goto("/today?mixed-review=1");
    await expect(
      page.getByRole("button", { name: "用这道题开始写作" }),
    ).toBeVisible();

    await page.evaluate(() => {
      const start = [...document.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("用这道题开始写作"),
      );
      start?.click();
      start?.click();
    });

    await expect.poll(() => starts).toBe(1);
  });

  test("synchronously dispatched swap events create one recommendation request", async ({
    page,
  }) => {
    let swaps = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().endsWith("/api/v1/question-recommendations") &&
        request.postDataJSON()?.action === "SWAP"
      )
        swaps += 1;
    });
    await routeTodayHttpFixture(page, "mixed-review");
    await page.goto("/today?mixed-review=1");
    await expect(page.getByRole("button", { name: "换一题" })).toBeVisible();

    await page.evaluate(() => {
      const swap = [...document.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("换一题"),
      );
      swap?.click();
      swap?.click();
    });

    await expect.poll(() => swaps).toBe(1);
  });

  test("PREPARING lets a manual bank question start one cycle and ignores the stale poll", async ({
    page,
  }) => {
    const fixture = await routePreparingFallbackFixture(page);
    await page.goto("/today?new-essay=1");
    await page.getByText("浏览全部题库").click();
    await page.getByLabel("题库").selectOption("http-question-education");
    await expect.poll(fixture.polls, { timeout: 5_000 }).toBe(1);

    await page.evaluate(() => {
      const bank =
        document.querySelector<HTMLSelectElement>("#question-choice");
      const button = bank
        ?.closest(".form-grid")
        ?.querySelector<HTMLButtonElement>("button");
      button?.click();
      button?.click();
    });
    await expect.poll(() => fixture.cycleBodies.length).toBe(1);
    fixture.releasePoll();
    await expect(page).toHaveURL(/\/write\?cycle=cycle-manual-fallback$/);
    expect(fixture.cycleBodies).toEqual([
      expect.objectContaining({ question_id: "http-question-education" }),
    ]);
    expect(fixture.cycleBodies[0]).not.toHaveProperty("recommendation_id");
    await page.waitForTimeout(100);
    expect(fixture.cycleBodies).toHaveLength(1);
  });

  test("PREPARING lets a custom question create and start one cycle without recommendation attribution", async ({
    page,
  }) => {
    const fixture = await routePreparingFallbackFixture(page);
    await page.goto("/today?new-essay=1");
    await page.getByText("粘贴我自己的题目").click();
    await page
      .getByLabel("完整英文题目")
      .fill(
        "Some people believe every city should provide free public libraries. To what extent do you agree or disagree?",
      );
    await expect.poll(fixture.polls, { timeout: 5_000 }).toBe(1);

    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.includes("保存并开始写作"),
      );
      button?.click();
      button?.click();
    });
    await expect.poll(() => fixture.cycleBodies.length).toBe(1);
    fixture.releasePoll();
    await expect(page).toHaveURL(/\/write\?cycle=cycle-manual-fallback$/);
    expect(fixture.cycleBodies).toEqual([
      expect.objectContaining({ question_id: "custom-fallback-question" }),
    ]);
    expect(fixture.cycleBodies[0]).not.toHaveProperty("recommendation_id");
    await page.waitForTimeout(100);
    expect(fixture.cycleBodies).toHaveLength(1);
  });

  test("feedback-waiting notice keeps the queued state and refresh action", async ({
    page,
  }) => {
    await routeTodayHttpFixture(page, "feedback-waiting");
    await page.goto("/today?notice=feedback-waiting-ai");

    await expect(page).toHaveURL(/\/today\?notice=feedback-waiting-ai$/);
    await expect(
      page.getByText("作文已提交并锁定，批改正在排队", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".next-task-card").getByRole("link", {
        name: "刷新状态",
      }),
    ).toHaveAttribute("href", "/today");
  });
});
