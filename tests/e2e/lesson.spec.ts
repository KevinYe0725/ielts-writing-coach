import { expect, test } from "@playwright/test";

import { deterministicDemo, resetDemoState } from "./support";

const lessonUrl =
  "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective";
const paperUrl =
  "/lesson/paper?cycle=cycle-demo&lesson=lesson-collocation-perspective";

async function navigationLink(
  page: import("@playwright/test").Page,
  name: string,
) {
  const link = page.getByRole("link", { name });
  if ((page.viewportSize()?.width ?? 1_000) < 700) {
    if (!(await link.isVisible())) {
      await page.locator(".mobile-menu > summary").click();
    }
  }
  return link;
}

test.describe("feedback, focused teaching and complete practice paper", () => {
  test.skip(
    !deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=true and a demo-mode web server.",
  );

  test.beforeEach(async ({ page }) => resetDemoState(page));

  test("teaches the diagnosed ability before opening timed practice", async ({
    page,
  }) => {
    await page.goto(lessonUrl);

    await expect(
      page.getByRole("heading", {
        name: "用原因—机制—结果完整表达观点",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("观点不等于论证", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("可以直接迁移的表达库", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("跟着思路改一遍", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "开始60分钟训练卷" }),
    ).toBeVisible();
    await expect(page.getByText("60:00", { exact: true })).toHaveCount(0);
  });

  test("shows all eight questions with concise, complete instructions", async ({
    page,
  }) => {
    await page.goto(paperUrl);

    await expect(page.getByText("本题评分点")).toHaveCount(0);
    await expect(page.getByText("基础判断", { exact: true })).toHaveCount(0);
    await expect(page.getByText("修改重写", { exact: true })).toHaveCount(0);
    await expect(page.locator(".practice-paper-question")).toHaveCount(8);
    await expect(
      page.getByText(
        "用20至35个英文词解释为什么早期接触能降低以后的学习难度；必须写出作用过程和结果。",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "交卷" })).toBeVisible();
  });

  test("keeps the source report available and preserves the paper draft", async ({
    page,
  }) => {
    await page.goto(paperUrl);
    const answer = page.getByRole("textbox", { name: "第 2 题 answer" });
    await answer.fill(
      "Regular exposure helps children recognise common language patterns early, so they face fewer difficulties when formal study becomes more demanding later.",
    );

    await page.getByRole("link", { name: "查看详细批改" }).click();
    await expect(page).toHaveURL(
      /\/feedback\?cycle=cycle-demo&lesson=lesson-collocation-perspective$/,
    );
    await expect(
      page.getByRole("heading", { name: "先把这篇作文真正改明白" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "进入专项教学" }).click();
    await page.getByRole("link", { name: "开始60分钟训练卷" }).click();

    await expect(page).toHaveURL(
      /\/lesson\/paper\?cycle=cycle-demo&lesson=lesson-collocation-perspective$/,
    );
    await expect(answer).toHaveValue(
      "Regular exposure helps children recognise common language patterns early, so they face fewer difficulties when formal study becomes more demanding later.",
    );
  });

  test("opens report and paper from their real sidebar destinations", async ({
    page,
  }) => {
    await page.goto("/today");
    await (await navigationLink(page, "批改报告")).click();
    await expect(page).toHaveURL(/\/feedback\?cycle=cycle-demo$/);

    await (await navigationLink(page, "专项提升")).click();
    await expect(page).toHaveURL(
      /\/lesson\?cycle=cycle-demo&lesson=lesson-collocation-perspective$/,
    );
    await page.getByRole("link", { name: "开始60分钟训练卷" }).click();
    await expect(page).toHaveURL(
      /\/lesson\/paper\?cycle=cycle-demo&lesson=lesson-collocation-perspective$/,
    );
  });

  test("restores sidebar destinations when the paper is opened directly", async ({
    page,
  }) => {
    await page.goto(paperUrl);

    await (await navigationLink(page, "批改报告")).click();
    await expect(page).toHaveURL(/\/feedback\?cycle=cycle-demo$/);
  });

  test("restores focused-learning navigation when the report is opened directly", async ({
    page,
  }) => {
    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        message.text().includes("Hydration failed")
      ) {
        hydrationErrors.push(message.text());
      }
    });
    await page.goto(
      "/feedback?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );

    await (await navigationLink(page, "专项提升")).click();
    await expect(page).toHaveURL(
      /\/lesson\?cycle=cycle-demo&lesson=lesson-collocation-perspective$/,
    );
    expect(hydrationErrors).toEqual([]);
  });

  test("submits once and expands teaching analysis only for missed answers", async ({
    page,
  }) => {
    await page.goto(paperUrl);
    await page.getByText("A", { exact: true }).last().click();
    await page
      .getByRole("textbox", { name: "第 2 题 answer" })
      .fill(
        "Regular exposure helps children recognise common language patterns early, so they face fewer difficulties when formal study becomes more demanding later.",
      );
    await page.getByRole("button", { name: "交卷" }).click();

    await expect(page.getByText("整卷结果", { exact: true })).toBeVisible();
    await expect(page.getByText("已达标", { exact: true })).toHaveCount(2);
    await expect(
      page.getByRole("heading", { name: "这题为什么没有达标" }),
    ).toHaveCount(6);
    await expect(page.getByText("参考改法", { exact: true })).toHaveCount(6);
  });

  test("locks editing at the time limit but retains an incomplete sheet for submission", async ({
    page,
  }) => {
    await page.goto("/api/v1/health/live");
    await page.evaluate(() => {
      window.localStorage.setItem(
        "iwc:practice-paper-started",
        new Date(Date.now() - 3_601_000).toISOString(),
      );
    });
    await page.goto(paperUrl);

    await expect(page.getByRole("textbox").first()).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "时间到，交卷" }),
    ).toBeEnabled();
  });
});
