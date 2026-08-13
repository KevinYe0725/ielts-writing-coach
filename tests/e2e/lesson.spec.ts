import { expect, test, type Page } from "@playwright/test";

import { deterministicDemo, resetDemoState } from "./support";

const lessonUrl =
  "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective";

async function submitChoice(page: Page, label: string): Promise<void> {
  const choice = page.getByRole("radio", { name: label, exact: true });
  await page.getByText(label, { exact: true }).last().click();
  await expect(choice).toBeChecked();
  await page.getByRole("button", { name: "提交", exact: true }).click();
  await expect(page.getByText("仅演示，不计能力证据")).toBeVisible();
  await page.getByRole("button", { name: "继续", exact: true }).click();
}

async function submitSentence(
  page: Page,
  answer: string,
  final = false,
): Promise<void> {
  await page.getByLabel("你的英文答案").fill(answer);
  await page.getByRole("button", { name: "提交", exact: true }).click();
  await expect(page.getByText("仅演示，不计能力证据")).toBeVisible();
  await page
    .getByRole("button", {
      name: final ? "完成本课" : "继续",
      exact: true,
    })
    .click();
}

test.describe("five-stage focused lesson", () => {
  test.skip(
    !deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=true and a demo-mode web server.",
  );

  test.beforeEach(async ({ page }) => resetDemoState(page));

  test("renders and accepts the demo's meaning, contrast, generation, and paragraph controls", async ({
    page,
  }) => {
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );

    await expect(
      page.getByText("含义岔路 · 不计分", { exact: true }),
    ).toBeVisible();
    const meaningChoice = page.getByRole("radio", {
      name: "小学生需要完成的课业较少",
      exact: true,
    });
    await page
      .getByText("小学生需要完成的课业较少", { exact: true })
      .last()
      .click();
    await expect(meaningChoice).toBeChecked();
    await page.getByRole("button", { name: "提交", exact: true }).click();
    await expect(page.getByText("仅演示，不计能力证据")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "继续", exact: true }).click();

    await expect(page.getByText("最小对比", { exact: true })).toBeVisible();
    const contrastChoice = page.getByRole("radio", {
      name: "Primary-school courses are less demanding.",
      exact: true,
    });
    await page
      .getByText("Primary-school courses are less demanding.", { exact: true })
      .last()
      .click();
    await expect(contrastChoice).toBeChecked();
    await page.getByRole("button", { name: "提交", exact: true }).click();
    await expect(page.getByText("仅演示，不计能力证据")).toBeVisible();
    await page.getByRole("button", { name: "继续", exact: true }).click();

    await expect(page.getByText("无提示生成", { exact: true })).toBeVisible();
    const answer = page.getByLabel("你的英文答案");
    await answer.fill(
      "Primary-school pupils face less academic pressure than secondary-school students.",
    );
    await expect(answer).toHaveValue(/pupils face less academic pressure/);
    await page.getByRole("button", { name: "提交", exact: true }).click();
    await expect(page.getByText("仅演示，不计能力证据")).toBeVisible();
    await page.getByRole("button", { name: "继续", exact: true }).click();

    await expect(page.getByText("陌生语境迁移", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Use the academic-pressure perspective naturally."),
    ).toBeVisible();
    await expect(
      page.getByText("Connect the workload cause to its consequence."),
    ).toBeVisible();
    const paragraph = page.getByLabel("你的英文答案");
    const submit = page.getByRole("button", { name: "提交", exact: true });
    await paragraph.fill(Array.from({ length: 79 }, () => "word").join(" "));
    await expect(submit).toBeDisabled();
    await paragraph.fill(Array.from({ length: 80 }, () => "word").join(" "));
    await expect(submit).toBeEnabled();
    await expect(page.getByText("80 词", { exact: false })).toBeVisible();
  });

  test("preserves a resumable, active-output path across all five stages", async ({
    page,
  }) => {
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );
    await expect(page.locator('[aria-current="step"]')).toContainText("诊断");
    await expect(
      page.getByRole("radio", { name: "小学生承受的学业压力较小" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "暂停", exact: true }).click();
    const pauseDialog = page.getByRole("dialog", { name: "需要离开一下？" });
    await expect(pauseDialog).toContainText("1/5 个核心任务");
    await pauseDialog.getByRole("button", { name: "继续当前练习" }).click();

    await submitChoice(page, "小学生承受的学业压力较小");
    await expect(page.locator('[aria-current="step"]')).toContainText("理解");
    await submitChoice(page, "Primary-school courses are less demanding.");
    await expect(page.locator('[aria-current="step"]')).toContainText(
      "独立输出",
    );

    await submitSentence(
      page,
      "Primary-school pupils face less academic pressure than secondary-school students.",
    );
    await expect(page.locator('[aria-current="step"]')).toContainText("应用");
    await expect(page.getByText("80–120", { exact: false })).toBeVisible();
    await expect(
      page.getByText("Use the academic-pressure perspective naturally."),
    ).toBeVisible();
    await submitSentence(
      page,
      Array.from(
        { length: 8 },
        () =>
          "University students face greater academic pressure because independent research requires sustained planning and careful analysis",
      ).join(" "),
    );
    await expect(page.locator('[aria-current="step"]')).toContainText("收尾");
    await submitSentence(
      page,
      "A heavy workload can take up time that children could otherwise spend exercising outdoors.",
      true,
    );

    await expect(
      page.getByRole("heading", { name: "你已完成核心路径" }),
    ).toBeVisible();
    await expect(page.getByText("仅完成练习", { exact: true })).toBeVisible();
    await expect(page.getByText(/不会把能力标记为 applied/)).toBeVisible();
    await expect(page.getByText("发展中", { exact: true })).toBeVisible();
    await expect(page.getByText("尚未安排", { exact: true })).toBeVisible();
    await expect(
      page.getByText("未安排证据重写", { exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "完成并返回今日计划" }).click();
    await expect(
      page.getByRole("heading", { name: "开始新一轮 40 分钟首写" }),
    ).toBeVisible();
    await expect(
      page.getByText(/没有创建 applied、retained、重写或迁移任务/),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "开始重写" })).toHaveCount(0);
  });

  test("restores an unsubmitted answer and hint state after pausing and reloading", async ({
    page,
  }) => {
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );
    const choice = page.getByRole("radio", {
      name: "小学生承受的学业压力较小",
      exact: true,
    });
    await page
      .getByText("小学生承受的学业压力较小", { exact: true })
      .last()
      .click();
    await expect(choice).toBeChecked();
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "需要离开一下？" }),
    ).toBeVisible();
    await page.waitForTimeout(300);
    await page.reload();

    await expect(choice).toBeChecked();
  });

  test("distinguishes ordinary pause, explicit abnormal interruption, and prerequisite-skipped rewrite", async ({
    page,
  }) => {
    await page.goto(lessonUrl);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    const pauseDialog = page.getByRole("dialog", { name: "需要离开一下？" });
    await expect(
      pauseDialog.getByRole("button", { name: "保存并返回今日计划" }),
    ).toBeVisible();
    await expect(
      pauseDialog.getByRole("button", { name: "异常中断并稍后继续" }),
    ).toBeVisible();
    await expect(
      pauseDialog.getByRole("button", {
        name: "跳过专项课并开始不计保持的重写",
      }),
    ).toBeVisible();

    await pauseDialog
      .getByRole("button", {
        name: "跳过专项课并开始不计保持的重写",
      })
      .click();
    await expect(page).toHaveURL(
      /\/rewrite\?cycle=cycle-demo&task=rewrite-skipped-prerequisite$/,
    );
  });

  test("retries only the failed exercise evaluation and preserves the lesson URL identity", async ({
    page,
  }) => {
    await page.goto("/api/v1/health/live");
    await page.evaluate(() =>
      window.localStorage.setItem("iwc.demo.lesson-evaluation-failure", "true"),
    );
    await page.goto(lessonUrl);
    await page
      .getByText("小学生承受的学业压力较小", { exact: true })
      .last()
      .click();
    await page.getByRole("button", { name: "提交", exact: true }).click();
    await expect(page.getByText("评价未完成", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "只重试本题评价", exact: true })
      .click();
    await expect(page.getByText("仅演示，不计能力证据")).toBeVisible();
    await expect(page).toHaveURL(
      /\/lesson\?cycle=cycle-demo&lesson=lesson-collocation-perspective$/,
    );
  });

  test("retries only a failed lesson-generation module from its identity-bound feedback report", async ({
    page,
  }) => {
    await page.goto("/api/v1/health/live");
    await page.evaluate(() =>
      window.localStorage.setItem("iwc.demo.lesson-generation-failure", "true"),
    );
    await page.goto("/feedback?cycle=cycle-demo");
    await expect(
      page.getByText("只有这一课程生成模块失败", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "只重试课程生成模块", exact: true })
      .click();
    await expect(page).toHaveURL(
      /\/lesson\?cycle=cycle-demo&lesson=lesson-collocation-perspective$/,
    );
    await expect(page.getByText("本课只练这一件事")).toBeVisible();
  });

  test("preserves the current input when the 60-minute timebox expires", async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.localStorage.setItem("iwc.demo.lesson-elapsed", "3600");
    });
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );
    const dialog = page.getByRole("dialog", {
      name: "本段 60 分钟已到",
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("当前输入已经保留");
    await expect(
      dialog.getByRole("button", { name: "拆分剩余课程并返回今日计划" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "裁掉 FLEX 并结束练习" }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "拆分剩余课程并返回今日计划" })
      .click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(
      page.getByRole("heading", { name: "先完成短回炉，再继续专项课" }),
    ).toBeVisible();

    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );
    await expect(
      page.getByRole("heading", { name: "先用对比讲解找回规则" }),
    ).toBeVisible();
  });

  test("requires a persisted short refresher before a split lesson resumes", async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.localStorage.setItem("iwc.demo.lesson-split", "ACTIVE");
      window.localStorage.setItem("iwc.demo.lesson-refresher", "REQUIRED");
    });
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );
    await expect(
      page.getByRole("heading", { name: "先用对比讲解找回规则" }),
    ).toBeVisible();
    await page
      .getByLabel("我的回忆")
      .fill("Check who experiences the academic pressure.");
    await page.getByRole("button", { name: "保存并继续剩余课程" }).click();
    await expect(page.getByText("本课只练这一件事")).toBeVisible();
  });
});
