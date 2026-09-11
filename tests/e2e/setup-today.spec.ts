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
        name: "今天，从这里继续。",
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
    await expect
      .poll(() =>
        page.evaluate(() => {
          const value = localStorage.getItem(
            "iwc.demo.question-recommendation-active",
          );
          return value ? JSON.parse(value).status : null;
        }),
      )
      .toBe("STARTED");
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
        name: "Continue from here today.",
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
      if (route.request().method() === "DELETE") {
        await route.fulfill({ status: 405, body: "" });
        return;
      }
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
  let standaloneDeletes = 0;
  const cycleBodies: Array<Record<string, unknown>> = [];
  const customBodies: Array<Record<string, unknown>> = [];

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
      if (route.request().method() === "DELETE") {
        standaloneDeletes += 1;
        await route.fulfill({ status: 405, body: "" });
        return;
      }
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
      customBodies.push(input);
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
    customBodies,
    polls: () => polls,
    releasePoll,
    standaloneDeletes: () => standaloneDeletes,
  };
}

async function routeSwapPreparingFallbackFixture(page: Page) {
  await routeTodayHttpFixture(page, "mixed-review");
  let releasePoll!: () => void;
  let releaseCycle!: () => void;
  const pollRelease = new Promise<void>((resolve) => {
    releasePoll = resolve;
  });
  const cycleRelease = new Promise<void>((resolve) => {
    releaseCycle = resolve;
  });
  let polls = 0;
  const cycleBodies: Array<Record<string, unknown>> = [];
  const customBodies: Array<Record<string, unknown>> = [];
  let standaloneDeletes = 0;
  const recommendationActions: string[] = [];

  await page.route("**/api/v1/question-recommendations", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const input = route.request().postDataJSON();
    recommendationActions.push(input.action);
    if (input.action === "SWAP") {
      await route.fulfill({
        contentType: "application/json",
        status: 202,
        body: JSON.stringify({
          recommendation: {
            id: "recommendation-swap-preparing",
            status: "PENDING",
            retry_after_seconds: 1,
          },
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        recommendation: {
          id: "recommendation-swap-source",
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
    "**/api/v1/question-recommendations/recommendation-swap-preparing",
    async (route) => {
      if (route.request().method() === "DELETE") {
        standaloneDeletes += 1;
        await route.fulfill({ status: 405, body: "" });
        return;
      }
      polls += 1;
      await pollRelease;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          recommendation: {
            id: "recommendation-swap-preparing",
            status: "READY",
            question: {
              id: "stale-swap-question",
              prompt: "STALE SWAP RESULT MUST NOT REPLACE THE FALLBACK",
              type: "discussion",
              topic: "technology",
              ielts_track: "academic",
              visibility: "public",
            },
          },
        }),
      });
    },
  );
  await page.route(
    "**/api/v1/question-recommendations/recommendation-swap-source",
    async (route) => {
      standaloneDeletes += 1;
      await route.fulfill({ status: 405, body: "" });
    },
  );
  await page.route("**/api/v1/training-cycles", async (route) => {
    cycleBodies.push(route.request().postDataJSON());
    await cycleRelease;
    await route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({ cycle: { id: "cycle-swap-fallback" } }),
    });
  });
  await page.route("**/api/v1/questions", async (route) => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      customBodies.push(input);
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          question: {
            id: "custom-swap-fallback-question",
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
    customBodies,
    polls: () => polls,
    recommendationActions,
    releaseCycle,
    releasePoll,
    standaloneDeletes: () => standaloneDeletes,
  };
}

async function routeDelayedRecommendationFallbackFixture(page: Page) {
  await routeTodayHttpFixture(page, "mixed-review");
  let releasePost!: () => void;
  const postRelease = new Promise<void>((resolve) => {
    releasePost = resolve;
  });
  let markPostStarted!: () => void;
  const postStarted = new Promise<void>((resolve) => {
    markPostStarted = resolve;
  });
  const cycleBodies: Array<Record<string, unknown>> = [];

  await page.route("**/api/v1/question-recommendations", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    markPostStarted();
    await postRelease;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        recommendation: {
          id: "recommendation-delayed-post",
          status: "READY",
          question: {
            id: "stale-delayed-question",
            prompt: "STALE DELAYED READY MUST NEVER RENDER",
            type: "discussion",
            topic: "technology",
            ielts_track: "academic",
            visibility: "public",
          },
        },
      }),
    });
  });
  await page.route(
    "**/api/v1/question-recommendations/recommendation-delayed-post",
    async (route) => {
      expect(route.request().method()).toBe("GET");
      await route.fallback();
    },
  );
  await page.route("**/api/v1/training-cycles", async (route) => {
    cycleBodies.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({ cycle: { id: "cycle-delayed-fallback" } }),
    });
  });

  return { cycleBodies, postStarted, releasePost };
}

async function routeRetryCycleFenceFixture(page: Page) {
  await routeTodayHttpFixture(page, "mixed-review");
  let releaseCycle!: () => void;
  const cycleRelease = new Promise<void>((resolve) => {
    releaseCycle = resolve;
  });
  let recommendationGets = 0;
  const cycleBodies: Array<Record<string, unknown>> = [];
  const customBodies: Array<Record<string, unknown>> = [];

  await page.route("**/api/v1/question-recommendations", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      contentType: "application/json",
      status: 202,
      body: JSON.stringify({
        recommendation: {
          id: "recommendation-retry-cycle-fence",
          status: "PENDING",
          retry_after_seconds: 1,
        },
      }),
    });
  });
  await page.route(
    "**/api/v1/question-recommendations/recommendation-retry-cycle-fence",
    async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({ status: 405, body: "" });
        return;
      }
      recommendationGets += 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          recommendation: {
            id: "recommendation-retry-cycle-fence",
            status: "PENDING",
            retry_after_seconds: 1,
          },
        }),
      });
    },
  );
  await page.route("**/api/v1/training-cycles", async (route) => {
    cycleBodies.push(route.request().postDataJSON());
    await cycleRelease;
    await route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({ cycle: { id: "cycle-retry-fence" } }),
    });
  });
  await page.route("**/api/v1/questions", async (route) => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      customBodies.push(input);
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          question: {
            id: "custom-retry-fence-question",
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
    customBodies,
    recommendationGets: () => recommendationGets,
    releaseCycle,
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

  test("a committed recommended STARTED cycle replays on the next user click with the same logical key", async ({
    page,
  }) => {
    const idempotencyKeys: string[] = [];
    const cycleBodies: Array<Record<string, unknown>> = [];
    const storedCycles = new Map<string, string>();
    let createdCycles = 0;
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    await routeTodayHttpFixture(page, "mixed-review");
    await page.route("**/api/v1/training-cycles", async (route) => {
      const key = route.request().headers()["idempotency-key"] ?? "missing";
      idempotencyKeys.push(key);
      cycleBodies.push(route.request().postDataJSON());
      if (!storedCycles.has(key)) {
        createdCycles += 1;
        storedCycles.set(key, "cycle-committed-started");
      }
      if (idempotencyKeys.length <= 6) {
        await route.abort("timedout");
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        headers: { "idempotency-replayed": "true" },
        body: JSON.stringify({ cycle: { id: storedCycles.get(key) } }),
      });
    });
    await page.goto("/today?mixed-review=1");
    const start = page.getByRole("button", { name: "用这道题开始写作" });
    await expect(start).toBeVisible();

    await start.click();

    await expect.poll(() => idempotencyKeys.length).toBe(6);
    await expect(
      page.getByText("The IELTS Writing server could not be reached.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(start).toBeEnabled();
    const firstOperationKey = idempotencyKeys[0];
    expect(new Set(idempotencyKeys.slice(0, 6))).toEqual(
      new Set([firstOperationKey as string]),
    );
    expect(firstOperationKey).not.toBe("missing");

    await start.click();

    await expect.poll(() => idempotencyKeys.length).toBe(7);
    await expect(page).toHaveURL(/\/write\?cycle=cycle-committed-started$/);
    const secondOperationKey = idempotencyKeys[6];
    expect(new Set(idempotencyKeys.slice(6))).toEqual(
      new Set([secondOperationKey as string]),
    );
    expect(secondOperationKey).toBe(firstOperationKey);
    expect(secondOperationKey).not.toBe("missing");
    expect(createdCycles).toBe(1);
    expect(new Set(storedCycles.values())).toEqual(
      new Set(["cycle-committed-started"]),
    );
    expect(cycleBodies).toHaveLength(7);
    expect(cycleBodies).toEqual(
      Array(7).fill(
        expect.objectContaining({
          question_id: "http-question-education",
          recommendation_id: "recommendation-http",
        }),
      ),
    );
    expect(pageErrors).toEqual([]);
  });

  test("a committed fallback ABANDONED cycle replays without a duplicate or conflict", async ({
    page,
  }) => {
    const idempotencyKeys: string[] = [];
    const cycleBodies: Array<Record<string, unknown>> = [];
    const storedCycles = new Map<string, string>();
    let createdCycles = 0;
    await routeTodayHttpFixture(page, "mixed-review");
    await page.route("**/api/v1/training-cycles", async (route) => {
      const key = route.request().headers()["idempotency-key"] ?? "missing";
      idempotencyKeys.push(key);
      cycleBodies.push(route.request().postDataJSON());
      if (!storedCycles.has(key)) {
        createdCycles += 1;
        storedCycles.set(key, "cycle-committed-abandoned");
      }
      if (idempotencyKeys.length <= 6) {
        await route.abort("timedout");
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        headers: { "idempotency-replayed": "true" },
        body: JSON.stringify({ cycle: { id: storedCycles.get(key) } }),
      });
    });
    await page.goto("/today?mixed-review=1");
    await page.getByText("浏览全部题库").click();
    await page.getByLabel("题库").selectOption("http-question-education");
    const fallbackStart = page
      .getByLabel("题库")
      .locator("..")
      .locator("..")
      .getByRole("button", { name: "用这道题开始写作" });

    await fallbackStart.click();
    await expect.poll(() => idempotencyKeys.length).toBe(6);
    await expect(
      page.getByText("未能安全关闭当前推荐题，请重试后再开始写作。", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(fallbackStart).toBeEnabled();
    await fallbackStart.click();

    await expect.poll(() => idempotencyKeys.length).toBe(7);
    await expect(page).toHaveURL(/\/write\?cycle=cycle-committed-abandoned$/);
    expect(new Set(idempotencyKeys)).toEqual(new Set([idempotencyKeys[0]]));
    expect(idempotencyKeys[0]).not.toBe("missing");
    expect(createdCycles).toBe(1);
    expect(cycleBodies).toEqual(
      Array(7).fill(
        expect.objectContaining({
          question_id: "http-question-education",
          abandon_recommendation_id: "recommendation-http",
        }),
      ),
    );
    expect(cycleBodies[0]).not.toHaveProperty("recommendation_id");
  });

  test("a committed initial recommendation reuses its exposure key through the actionable UI retry", async ({
    page,
  }) => {
    const idempotencyKeys: string[] = [];
    const storedRecommendations = new Map<string, string>();
    let createdExposures = 0;
    await routeTodayHttpFixture(page, "mixed-review");
    await page.route("**/api/v1/question-recommendations", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const key = route.request().headers()["idempotency-key"] ?? "missing";
      idempotencyKeys.push(key);
      if (!storedRecommendations.has(key)) {
        createdExposures += 1;
        storedRecommendations.set(key, "recommendation-committed-initial");
      }
      if (idempotencyKeys.length <= 6) {
        await route.abort("timedout");
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        headers: { "idempotency-replayed": "true" },
        body: JSON.stringify({
          recommendation: {
            id: storedRecommendations.get(key),
            status: "READY",
            question: {
              id: "question-committed-initial",
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
    await page.goto("/today?mixed-review=1");

    await expect.poll(() => idempotencyKeys.length).toBe(6);
    await expect(
      page.getByText("The IELTS Writing server could not be reached.", {
        exact: true,
      }),
    ).toBeVisible();
    const retryInitial = page.getByRole("button", {
      name: "重新获取推荐题",
    });
    await expect(retryInitial).toBeVisible();
    await retryInitial.click();

    await expect.poll(() => idempotencyKeys.length).toBe(7);
    await expect(page.locator("[data-recommendation-prompt]")).toBeVisible();
    expect(new Set(idempotencyKeys)).toEqual(new Set([idempotencyKeys[0]]));
    expect(idempotencyKeys[0]).not.toBe("missing");
    expect(createdExposures).toBe(1);
    expect(new Set(storedRecommendations.values())).toEqual(
      new Set(["recommendation-committed-initial"]),
    );
  });

  test("cross-tab sign-out and sign-in abort an old mutation with an identity-free boundary message", async ({
    page: accountA,
  }) => {
    const accountB = await accountA.context().newPage();
    const accountAKeys: string[] = [];
    const accountBKeys: string[] = [];
    const pageErrors: Error[] = [];
    let releaseAccountA!: () => void;
    const accountAHold = new Promise<void>((resolve) => {
      releaseAccountA = resolve;
    });
    accountA.on("pageerror", (error) => pageErrors.push(error));
    await accountA.addInitScript(() => {
      const messages: unknown[] = [];
      const channel = new BroadcastChannel("iwc:account-boundary:v1");
      channel.addEventListener("message", (event) => messages.push(event.data));
      Object.assign(window, {
        __iwcAccountBoundaryMessages: messages,
        __iwcAccountBoundaryObserver: channel,
      });
    });
    await routeTodayHttpFixture(accountA, "mixed-review");
    await routeTodayHttpFixture(accountB, "mixed-review");
    await accountA.route("**/api/v1/training-cycles", async (route) => {
      accountAKeys.push(
        route.request().headers()["idempotency-key"] ?? "missing",
      );
      await accountAHold;
      await route
        .fulfill({
          contentType: "application/json",
          status: 201,
          body: JSON.stringify({ cycle: { id: "stale-account-a-cycle" } }),
        })
        .catch(() => undefined);
    });
    await accountB.route("**/api/v1/training-cycles", async (route) => {
      accountBKeys.push(
        route.request().headers()["idempotency-key"] ?? "missing",
      );
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({ cycle: { id: "account-b-cycle" } }),
      });
    });
    await accountB.route("**/api/v1/auth/sign-out", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });
    await accountB.route("**/api/v1/account-entry", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          outcome: "SIGNED_IN",
          redirect_to: "/today?mixed-review=1",
        }),
      });
    });

    await accountA.goto("/today?mixed-review=1");
    const accountAStart = accountA.getByRole("button", {
      name: "用这道题开始写作",
    });
    await accountAStart.click();
    await expect.poll(() => accountAKeys.length).toBe(1);

    await accountB.goto("/today?mixed-review=1");
    const accountBMobileMenu = accountB.locator(".mobile-menu > summary");
    if (await accountBMobileMenu.isVisible()) await accountBMobileMenu.click();
    await accountB
      .getByRole("button", { name: /learner@example\.com/i })
      .first()
      .click();
    await accountB
      .getByRole("menuitem", { name: /退出登录|sign out/i })
      .click();
    await expect(accountB).toHaveURL(/\/signin$/);
    await expect(
      accountA.getByText(
        "The account changed before this operation finished. Retry in the current account.",
        { exact: true },
      ),
    ).toBeVisible();
    releaseAccountA();

    await accountB.locator("#signin-email").fill("account-b@example.test");
    await accountB.locator("#signin-password").fill("secure-password");
    await accountB.getByRole("button", { name: /继续|continue/i }).click();
    await expect(accountB).toHaveURL(/\/today\?mixed-review=1$/);
    await accountB.getByRole("button", { name: "用这道题开始写作" }).click();
    await expect(accountB).toHaveURL(/\/write\?cycle=account-b-cycle$/);

    await expect.poll(() => accountBKeys.length).toBe(1);
    expect(accountAKeys[0]).not.toBe("missing");
    expect(accountBKeys[0]).not.toBe("missing");
    expect(accountBKeys[0]).not.toBe(accountAKeys[0]);
    await accountA.waitForTimeout(100);
    expect(accountAKeys).toHaveLength(1);
    const boundaryMessages = await accountA.evaluate(
      () =>
        (
          window as typeof window & {
            __iwcAccountBoundaryMessages?: unknown[];
          }
        ).__iwcAccountBoundaryMessages ?? [],
    );
    expect(boundaryMessages.length).toBeGreaterThanOrEqual(2);
    for (const message of boundaryMessages) {
      expect(message).toEqual({ kind: "ACCOUNT_BOUNDARY", version: 1 });
      expect(JSON.stringify(message)).not.toMatch(
        /account-b@example|email|identity|token|user[_-]?id/iu,
      );
    }
    expect(pageErrors).toEqual([]);
    await accountB.close();
  });

  test("cross-tab learning-data deletion cancels an unresolved cycle before a distinct new operation", async ({
    page: accountA,
  }) => {
    test.skip(
      !(await accountA.evaluate(() => typeof BroadcastChannel === "function")),
      "This browser does not support BroadcastChannel.",
    );
    const accountB = await accountA.context().newPage();
    const accountAKeys: string[] = [];
    const accountBKeys: string[] = [];
    const deletionKeys: string[] = [];
    const pageErrors: Error[] = [];
    let createdCyclesAfterDeletion = 0;
    let dataDeleted = false;
    let releaseAccountA!: () => void;
    const accountAHold = new Promise<void>((resolve) => {
      releaseAccountA = resolve;
    });
    accountA.on("pageerror", (error) => pageErrors.push(error));
    await accountA.addInitScript(() => {
      const messages: unknown[] = [];
      const channel = new BroadcastChannel("iwc:account-boundary:v1");
      channel.addEventListener("message", (event) => messages.push(event.data));
      Object.assign(window, {
        __iwcAccountBoundaryMessages: messages,
        __iwcAccountBoundaryObserver: channel,
      });
    });
    await routeTodayHttpFixture(accountA, "mixed-review");
    await routeTodayHttpFixture(accountB, "mixed-review");
    await accountA.route("**/api/v1/training-cycles", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      accountAKeys.push(
        route.request().headers()["idempotency-key"] ?? "missing",
      );
      await accountAHold;
      await route.abort("failed").catch(() => undefined);
    });
    await accountB.route("**/api/v1/preferences", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          email: "learner@example.com",
          preferences: {},
          slots: [],
          smtp_configured: false,
          timezone: "Asia/Shanghai",
        }),
      });
    });
    await accountB.route("**/api/v1/data", async (route) => {
      expect(route.request().method()).toBe("DELETE");
      expect(route.request().postDataJSON()).toEqual({
        confirmation: "DELETE MY LEARNING DATA",
      });
      deletionKeys.push(
        route.request().headers()["idempotency-key"] ?? "missing",
      );
      dataDeleted = true;
      await route.fulfill({ status: 204, body: "" });
    });
    await accountB.route("**/api/v1/training-cycles**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ cycles: [] }),
        });
        return;
      }
      accountBKeys.push(
        route.request().headers()["idempotency-key"] ?? "missing",
      );
      expect(dataDeleted).toBe(true);
      createdCyclesAfterDeletion += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({ cycle: { id: "cycle-after-cross-tab-delete" } }),
      });
    });

    await accountA.goto("/today?mixed-review=1");
    await accountA.getByRole("button", { name: "用这道题开始写作" }).click();
    await expect.poll(() => accountAKeys.length).toBe(1);

    await accountB.goto("/settings");
    await accountB.getByRole("button", { name: "数据与隐私" }).click();
    await accountB.getByRole("button", { name: "删除…" }).click();
    await accountB.getByLabel("确认短语").fill("DELETE MY LEARNING DATA");
    await accountB.getByRole("button", { name: "永久删除" }).click();

    await expect.poll(() => deletionKeys.length).toBe(1);
    await expect(
      accountB.getByText("全部学习数据已删除；账户和 AI 连接仍保留。", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      accountA.getByText(
        "The account changed before this operation finished. Retry in the current account.",
        { exact: true },
      ),
    ).toBeVisible();
    releaseAccountA();

    await accountB.goto("/today?mixed-review=1");
    await accountB.getByRole("button", { name: "用这道题开始写作" }).click();
    await expect(accountB).toHaveURL(
      /\/write\?cycle=cycle-after-cross-tab-delete$/,
    );

    await expect.poll(() => accountBKeys.length).toBe(1);
    expect(accountAKeys[0]).not.toBe("missing");
    expect(deletionKeys[0]).not.toBe("missing");
    expect(accountBKeys[0]).not.toBe("missing");
    expect(accountBKeys[0]).not.toBe(accountAKeys[0]);
    expect(createdCyclesAfterDeletion).toBe(1);
    await accountA.waitForTimeout(100);
    expect(accountAKeys).toHaveLength(1);
    const boundaryMessages = await accountA.evaluate(
      () =>
        (
          window as typeof window & {
            __iwcAccountBoundaryMessages?: unknown[];
          }
        ).__iwcAccountBoundaryMessages ?? [],
    );
    expect(boundaryMessages).toEqual([
      { kind: "ACCOUNT_BOUNDARY", version: 1 },
    ]);
    expect(JSON.stringify(boundaryMessages)).not.toMatch(
      /learner@example|email|identity|token|user[_-]?id/iu,
    );
    expect(pageErrors).toEqual([]);
    await accountB.close();
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
      expect.objectContaining({
        question_id: "http-question-education",
        abandon_recommendation_id: "recommendation-preparing-fallback",
      }),
    ]);
    expect(fixture.cycleBodies[0]).not.toHaveProperty("recommendation_id");
    expect(fixture.standaloneDeletes()).toBe(0);
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
      expect.objectContaining({
        question_id: "custom-fallback-question",
        abandon_recommendation_id: "recommendation-preparing-fallback",
      }),
    ]);
    expect(fixture.cycleBodies[0]).not.toHaveProperty("recommendation_id");
    expect(fixture.standaloneDeletes()).toBe(0);
    await page.waitForTimeout(100);
    expect(fixture.cycleBodies).toHaveLength(1);
  });

  test("READY swap polling does not block a double-event manual bank fallback", async ({
    page,
  }) => {
    const fixture = await routeSwapPreparingFallbackFixture(page);
    await page.goto("/today?new-essay=1");
    await expect(page.getByRole("button", { name: "换一题" })).toBeVisible();
    await page.getByText("浏览全部题库").click();
    await page.getByLabel("题库").selectOption("http-question-education");
    const manualStart = page
      .getByLabel("题库")
      .locator("..")
      .locator("..")
      .getByRole("button", { name: "用这道题开始写作" });

    await page.getByRole("button", { name: "换一题" }).click();
    await expect.poll(fixture.polls, { timeout: 5_000 }).toBe(1);
    await expect(manualStart).toBeEnabled();
    await manualStart.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });

    await expect.poll(() => fixture.cycleBodies.length).toBe(1);
    fixture.releasePoll();
    await expect(
      page.getByText("STALE SWAP RESULT MUST NOT REPLACE THE FALLBACK"),
    ).toHaveCount(0);
    fixture.releaseCycle();
    await expect(page).toHaveURL(/\/write\?cycle=cycle-swap-fallback$/);
    expect(fixture.cycleBodies).toEqual([
      expect.objectContaining({
        question_id: "http-question-education",
        abandon_recommendation_id: "recommendation-swap-preparing",
      }),
    ]);
    expect(fixture.cycleBodies[0]).not.toHaveProperty("recommendation_id");
    expect(fixture.standaloneDeletes()).toBe(0);
  });

  test("READY swap polling does not block a double-event custom create/start fallback", async ({
    page,
  }) => {
    const fixture = await routeSwapPreparingFallbackFixture(page);
    await page.goto("/today?new-essay=1");
    await expect(page.getByRole("button", { name: "换一题" })).toBeVisible();
    await page.getByText("粘贴我自己的题目").click();
    await page
      .getByLabel("完整英文题目")
      .fill(
        "Some people believe every city should provide free public libraries. To what extent do you agree or disagree?",
      );
    const customStart = page.getByRole("button", {
      name: "保存并开始写作",
    });

    await page.getByRole("button", { name: "换一题" }).click();
    await expect.poll(fixture.polls, { timeout: 5_000 }).toBe(1);
    await expect(customStart).toBeEnabled();
    await customStart.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });

    await expect.poll(() => fixture.cycleBodies.length).toBe(1);
    fixture.releasePoll();
    await expect(
      page.getByText("STALE SWAP RESULT MUST NOT REPLACE THE FALLBACK"),
    ).toHaveCount(0);
    fixture.releaseCycle();
    await expect(page).toHaveURL(/\/write\?cycle=cycle-swap-fallback$/);
    expect(fixture.cycleBodies).toEqual([
      expect.objectContaining({
        question_id: "custom-swap-fallback-question",
        abandon_recommendation_id: "recommendation-swap-preparing",
      }),
    ]);
    expect(fixture.cycleBodies[0]).not.toHaveProperty("recommendation_id");
    expect(fixture.standaloneDeletes()).toBe(0);
  });

  test("manual fallback waits for an unresolved recommendation POST, abandons its READY id, then starts exactly once", async ({
    page,
  }) => {
    const fixture = await routeDelayedRecommendationFallbackFixture(page);
    await page.goto("/today?new-essay=1");
    await page.getByText("浏览全部题库").click();
    await page.getByLabel("题库").selectOption("http-question-education");
    await fixture.postStarted;

    await page
      .getByLabel("题库")
      .locator("..")
      .locator("..")
      .getByRole("button", { name: "用这道题开始写作" })
      .click();
    await page.waitForTimeout(100);
    expect(fixture.cycleBodies).toHaveLength(0);

    fixture.releasePost();
    await expect.poll(() => fixture.cycleBodies.length).toBe(1);
    await expect(page).toHaveURL(/\/write\?cycle=cycle-delayed-fallback$/);
    expect(fixture.cycleBodies[0]).not.toHaveProperty("recommendation_id");
    expect(fixture.cycleBodies[0]).toMatchObject({
      abandon_recommendation_id: "recommendation-delayed-post",
    });
    await expect(
      page.getByText("STALE DELAYED READY MUST NEVER RENDER"),
    ).toHaveCount(0);
  });

  test("failed abandonment keeps manual fallback actionable and creates no cycle", async ({
    page,
  }) => {
    const fixture = await routePreparingFallbackFixture(page);
    const failedCycleBodies: Array<Record<string, unknown>> = [];
    await page.route("**/api/v1/training-cycles", async (route) => {
      failedCycleBodies.push(route.request().postDataJSON());
      await route.fulfill({
        contentType: "application/problem+json",
        status: 503,
        body: JSON.stringify({
          code: "CYCLE_RECOMMENDATION_COUPLING_UNAVAILABLE",
          detail: "server detail must remain hidden",
          status: 503,
        }),
      });
    });
    await page.goto("/today?new-essay=1");
    await page.getByText("浏览全部题库").click();
    await page.getByLabel("题库").selectOption("http-question-education");
    await expect.poll(fixture.polls, { timeout: 5_000 }).toBe(1);

    await page
      .getByLabel("题库")
      .locator("..")
      .locator("..")
      .getByRole("button", { name: "用这道题开始写作" })
      .click();

    const abandonmentError = page.getByText(
      "未能安全关闭当前推荐题，请重试后再开始写作。",
      { exact: true },
    );
    await expect(abandonmentError).toBeVisible();
    expect(failedCycleBodies).toEqual([
      expect.objectContaining({
        question_id: "http-question-education",
        abandon_recommendation_id: "recommendation-preparing-fallback",
      }),
    ]);
    expect(fixture.cycleBodies).toHaveLength(0);
    expect(fixture.standaloneDeletes()).toBe(0);
    await expect(abandonmentError).not.toContainText(
      "server detail must remain hidden",
    );
    fixture.releasePoll();
  });

  test("failed coupled custom cycle keeps the saved question actionable without a standalone reset", async ({
    page,
  }) => {
    const fixture = await routePreparingFallbackFixture(page);
    const failedCycleBodies: Array<Record<string, unknown>> = [];
    await page.route("**/api/v1/training-cycles", async (route) => {
      failedCycleBodies.push(route.request().postDataJSON());
      await route.fulfill({
        contentType: "application/problem+json",
        status: 503,
        body: JSON.stringify({
          code: "CYCLE_RECOMMENDATION_COUPLING_UNAVAILABLE",
          detail: "server detail must remain hidden",
          status: 503,
        }),
      });
    });
    await page.goto("/today?new-essay=1");
    await page.getByText("粘贴我自己的题目").click();
    await page
      .getByLabel("完整英文题目")
      .fill(
        "Some people believe every city should provide free public libraries. To what extent do you agree or disagree?",
      );
    await expect.poll(fixture.polls, { timeout: 5_000 }).toBe(1);

    await page.getByRole("button", { name: "保存并开始写作" }).click();

    await expect(
      page.getByText(
        "自己的题目已保存，但未能安全关闭当前推荐题。请从题库中选择该题后重试。",
        { exact: true },
      ),
    ).toBeVisible();
    expect(fixture.customBodies).toHaveLength(1);
    expect(failedCycleBodies).toEqual([
      expect.objectContaining({
        question_id: "custom-fallback-question",
        abandon_recommendation_id: "recommendation-preparing-fallback",
      }),
    ]);
    expect(fixture.standaloneDeletes()).toBe(0);
    await expect(page).toHaveURL(/\/today\?new-essay=1$/);
    fixture.releasePoll();
  });

  test("manual start synchronously fences a following swap before React renders", async ({
    page,
  }) => {
    const fixture = await routeSwapPreparingFallbackFixture(page);
    await page.goto("/today?new-essay=1");
    await expect(page.getByRole("button", { name: "换一题" })).toBeVisible();
    await page.getByText("浏览全部题库").click();
    await page.getByLabel("题库").selectOption("http-question-education");

    await page.evaluate(() => {
      const bank =
        document.querySelector<HTMLSelectElement>("#question-choice");
      const manualStart = bank
        ?.closest(".form-grid")
        ?.querySelector<HTMLButtonElement>("button");
      const swap = [...document.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("换一题"),
      );
      manualStart?.click();
      swap?.click();
    });

    await expect.poll(() => fixture.cycleBodies.length).toBe(1);
    expect(fixture.recommendationActions).toEqual(["INITIAL"]);
    expect(fixture.polls()).toBe(0);
    await expect(page).toHaveURL(/\/today\?new-essay=1$/);
    fixture.releasePoll();
    fixture.releaseCycle();
    await expect(page).toHaveURL(/\/write\?cycle=cycle-swap-fallback$/);
    expect(fixture.cycleBodies[0]).not.toHaveProperty("recommendation_id");
    expect(fixture.cycleBodies[0]).toMatchObject({
      abandon_recommendation_id: "recommendation-swap-source",
    });
    expect(fixture.standaloneDeletes()).toBe(0);
  });

  test("custom create/start synchronously fences a following swap and creates once", async ({
    page,
  }) => {
    const fixture = await routeSwapPreparingFallbackFixture(page);
    await page.goto("/today?new-essay=1");
    await expect(page.getByRole("button", { name: "换一题" })).toBeVisible();
    await page.getByText("粘贴我自己的题目").click();
    await page
      .getByLabel("完整英文题目")
      .fill(
        "Some people believe every city should provide free public libraries. To what extent do you agree or disagree?",
      );

    await page.evaluate(() => {
      const customStart = [...document.querySelectorAll("button")].find(
        (button) => button.textContent?.includes("保存并开始写作"),
      );
      const swap = [...document.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("换一题"),
      );
      customStart?.click();
      swap?.click();
    });

    await expect.poll(() => fixture.cycleBodies.length).toBe(1);
    expect(fixture.customBodies).toHaveLength(1);
    expect(fixture.recommendationActions).toEqual(["INITIAL"]);
    expect(fixture.polls()).toBe(0);
    await expect(page).toHaveURL(/\/today\?new-essay=1$/);
    fixture.releasePoll();
    fixture.releaseCycle();
    await expect(page).toHaveURL(/\/write\?cycle=cycle-swap-fallback$/);
    expect(fixture.cycleBodies[0]).not.toHaveProperty("recommendation_id");
    expect(fixture.cycleBodies[0]).toMatchObject({
      abandon_recommendation_id: "recommendation-swap-source",
    });
    expect(fixture.standaloneDeletes()).toBe(0);
  });

  test("recommended start synchronously fences a following swap and keeps its attribution", async ({
    page,
  }) => {
    const fixture = await routeSwapPreparingFallbackFixture(page);
    await page.goto("/today?new-essay=1");
    const recommendedStart = page.getByRole("button", {
      name: "用这道题开始写作",
    });
    await expect(recommendedStart).toBeVisible();

    await page.evaluate(() => {
      const recommended = [...document.querySelectorAll("button")].find(
        (button) => button.textContent?.includes("用这道题开始写作"),
      );
      const swap = [...document.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("换一题"),
      );
      recommended?.click();
      swap?.click();
    });

    await expect.poll(() => fixture.cycleBodies.length).toBe(1);
    expect(fixture.recommendationActions).toEqual(["INITIAL"]);
    expect(fixture.polls()).toBe(0);
    await expect(page).toHaveURL(/\/today\?new-essay=1$/);
    fixture.releasePoll();
    fixture.releaseCycle();
    await expect(page).toHaveURL(/\/write\?cycle=cycle-swap-fallback$/);
    expect(fixture.cycleBodies).toEqual([
      expect.objectContaining({
        question_id: "http-question-education",
        recommendation_id: "recommendation-swap-source",
      }),
    ]);
  });

  test("custom create/start synchronously fences a following retry", async ({
    page,
  }) => {
    const fixture = await routeRetryCycleFenceFixture(page);
    await page.goto("/today?new-essay=1");
    await page.getByText("粘贴我自己的题目").click();
    await page
      .getByLabel("完整英文题目")
      .fill(
        "Some people believe every city should provide free public libraries. To what extent do you agree or disagree?",
      );
    const retry = page.getByRole("button", { name: "再试一次" });
    await expect(retry).toBeVisible({ timeout: 8_000 });
    const completedWindowGets = fixture.recommendationGets();

    await page.evaluate(() => {
      const customStart = [...document.querySelectorAll("button")].find(
        (button) => button.textContent?.includes("保存并开始写作"),
      );
      const retryRecommendation = [...document.querySelectorAll("button")].find(
        (button) => button.textContent?.includes("再试一次"),
      );
      customStart?.click();
      retryRecommendation?.click();
    });

    await expect.poll(() => fixture.cycleBodies.length).toBe(1);
    expect(fixture.customBodies).toHaveLength(1);
    await page.waitForTimeout(1_200);
    expect(fixture.recommendationGets()).toBe(completedWindowGets);
    await expect(page).toHaveURL(/\/today\?new-essay=1$/);
    fixture.releaseCycle();
    await expect(page).toHaveURL(/\/write\?cycle=cycle-retry-fence$/);
    expect(fixture.cycleBodies[0]).not.toHaveProperty("recommendation_id");
    expect(fixture.cycleBodies[0]).toMatchObject({
      abandon_recommendation_id: "recommendation-retry-cycle-fence",
    });
  });

  test("failed cycle creation releases the cycle lock for a later swap", async ({
    page,
  }) => {
    await routeTodayHttpFixture(page, "mixed-review");
    let swaps = 0;
    await page.route("**/api/v1/training-cycles", async (route) => {
      await route.fulfill({
        contentType: "application/problem+json",
        status: 503,
        body: JSON.stringify({
          code: "CYCLE_UNAVAILABLE",
          detail: "Cycle creation is temporarily unavailable.",
          status: 503,
        }),
      });
    });
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().endsWith("/api/v1/question-recommendations") &&
        request.postDataJSON()?.action === "SWAP"
      )
        swaps += 1;
    });
    await page.goto("/today?new-essay=1");

    await page.getByRole("button", { name: "用这道题开始写作" }).click();
    await expect(page.locator(".inline-probe[role='alert']")).toBeVisible();
    await page.getByRole("button", { name: "换一题" }).click();

    await expect.poll(() => swaps).toBe(1);
  });

  test("failed swap releases the recommendation lock for a later swap", async ({
    page,
  }) => {
    await routeTodayHttpFixture(page, "mixed-review");
    let swaps = 0;
    await page.route("**/api/v1/question-recommendations", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const input = route.request().postDataJSON();
      if (input.action === "SWAP") {
        swaps += 1;
        if (swaps === 1) {
          await route.fulfill({
            contentType: "application/problem+json",
            status: 503,
            body: JSON.stringify({
              code: "QUESTION_SUPPLY_UNAVAILABLE",
              detail: "A swap is temporarily unavailable.",
              status: 503,
            }),
          });
          return;
        }
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          recommendation: {
            id: "recommendation-after-failure",
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
    await page.goto("/today?new-essay=1");
    const swap = page.getByRole("button", { name: "换一题" });

    await swap.click();
    await expect(page.locator(".inline-probe[role='alert']")).toBeVisible();
    await expect(swap).toBeEnabled();
    await swap.click();

    await expect.poll(() => swaps).toBe(2);
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
