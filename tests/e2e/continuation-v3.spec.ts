import { expect, test, type Page } from "@playwright/test";

import { deterministicDemo, resetDemoState } from "./support";

const httpPaperUrl = "/lesson/paper?cycle=cycle-http&lesson=lesson-http";

function pendingPaperPayload() {
  return {
    paper: {
      titleZh: "HTTP 专项训练卷",
      titleEn: "HTTP focused practice paper",
      objectiveZh: "在60分钟内完成整卷。",
      objectiveEn: "Complete the focused paper in 60 minutes.",
      items: Array.from({ length: 8 }, (_, index) => ({
        id: `http-paper-question-${index + 1}`,
        number: index + 1,
        section: "GENERATION",
        titleZh: `第 ${index + 1} 题`,
        titleEn: `Question ${index + 1}`,
        instructionZh: "按题面要求完成本题。",
        promptEn: `Complete focused paper question ${index + 1}.`,
        sourceText: "",
        responseMode: "sentence",
        options: [],
        suggestedMinutes: 5,
        minimumWords: 10,
        maximumWords: 40,
        publicCriteria: [],
      })),
    },
    answers: {},
    result: null,
    submitted_at: "2026-09-11T12:00:00.000Z",
    evaluation_pending: true,
    runtime: { started_at: "2026-09-11T11:00:00.000Z" },
  };
}

async function installPendingPaperApi(page: Page): Promise<void> {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (pathname === "/api/v1/auth/get-session") {
      await route.fulfill({ contentType: "application/json", body: "null" });
      return;
    }
    if (pathname === "/api/v1/notifications") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ notifications: [] }),
      });
      return;
    }
    if (pathname === "/api/v1/training-cycles/cycle-http") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          cycle: {
            id: "cycle-http",
            status: "LESSON_ACTIVE",
            lessonPlans: [{ id: "lesson-http" }],
          },
        }),
      });
      return;
    }
    if (
      pathname === "/api/v1/lessons/lesson-http/paper" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(pendingPaperPayload()),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "Not found" });
  });
}

async function installDueWorkspaceApi(page: Page): Promise<void> {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (pathname === "/api/v1/auth/get-session") {
      await route.fulfill({ contentType: "application/json", body: "null" });
      return;
    }
    if (pathname === "/api/v1/notifications") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ notifications: [] }),
      });
      return;
    }
    if (pathname === "/api/v1/essays" && request.method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          active_count: 2,
          active_limit: 8,
          essays: [
            {
              id: "cycle-overdue",
              prompt: "An overdue rewrite should remain easy to find.",
              topic: "education",
              status: "REWRITE_READY",
              updated_at: "2026-09-11T12:00:00.000Z",
              next_action: {
                kind: "RESCHEDULE_REWRITE",
                entity_id: "rewrite-overdue",
                reason: "The rewrite window was missed.",
                due_at: "2026-09-10T12:00:00.000Z",
                overdue: true,
              },
              resources: {
                cycle_id: "cycle-overdue",
                writing_available: true,
                feedback_available: true,
                lesson_id: "lesson-overdue",
                rewrite_task_id: "rewrite-overdue",
                comparison_available: false,
                transfer_task_id: null,
              },
            },
            {
              id: "cycle-waiting",
              prompt: "A waiting essay should show its next available time.",
              topic: "technology",
              status: "REWRITE_LOCKED",
              updated_at: "2026-09-11T11:00:00.000Z",
              next_action: {
                kind: "WAIT_FOR_REWRITE_UNLOCK",
                entity_id: "rewrite-waiting",
                reason: "The closed-book interval is still running.",
                due_at: "2026-09-12T12:00:00.000Z",
                overdue: false,
              },
              resources: {
                cycle_id: "cycle-waiting",
                writing_available: true,
                feedback_available: true,
                lesson_id: "lesson-waiting",
                rewrite_task_id: "rewrite-waiting",
                comparison_available: false,
                transfer_task_id: null,
              },
            },
          ],
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "Not found" });
  });
}

test.describe("continuation v3 learner paths", () => {
  test.skip(
    deterministicDemo,
    "Run this contract against the public HTTP boundary with NEXT_PUBLIC_DEMO_MODE=false.",
  );

  test.beforeEach(async ({ page }) => resetDemoState(page));

  test("keeps pending paper evaluation navigable with its cycle identity", async ({
    page,
  }) => {
    await installPendingPaperApi(page);
    await page.goto(httpPaperUrl);

    await expect(
      page.getByRole("heading", { name: "AI正在批改整张试卷" }),
    ).toBeVisible();
    const processing = page.locator(".practice-paper-processing");
    await expect(processing).toContainText(
      "会按每道题的要求批改，完成后重点讲解需要改进的地方",
    );
    await expect(processing).not.toContainText(/评分点|criteria/i);
    await expect(
      page.getByRole("button", { name: "查看是否完成" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "返回专项教学" }),
    ).toHaveAttribute("href", "/lesson?cycle=cycle-http&lesson=lesson-http");
    await expect(
      page.getByRole("link", { name: "查看批改报告" }),
    ).toHaveAttribute("href", "/feedback?cycle=cycle-http&lesson=lesson-http");
    await expect(
      page.getByRole("link", { name: "回到今日计划" }),
    ).toHaveAttribute("href", "/today");
  });

  test("shows supplied due and overdue cues on each essay card", async ({
    page,
  }) => {
    await installDueWorkspaceApi(page);
    await page.goto("/essays");

    const cards = page.locator("[data-essay-card]");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0).locator("[data-essay-due]")).toHaveAttribute(
      "data-overdue",
      "true",
    );
    await expect(cards.nth(0).locator("[data-essay-due]")).toContainText(
      /已过期|Overdue/,
    );
    await expect(cards.nth(1).locator("[data-essay-due]")).toHaveAttribute(
      "data-overdue",
      "false",
    );
    await expect(cards.nth(1).locator("[data-essay-due]")).toContainText(
      /9月12日|Sep 12/,
    );
  });
});

test.describe("continuation v3 demo preview", () => {
  test.skip(
    !deterministicDemo,
    "Run this smoke check against the deterministic demo preview.",
  );

  test.beforeEach(async ({ page }) => resetDemoState(page));

  test("keeps due metadata visible on the demo essay cards", async ({
    page,
  }) => {
    await page.goto("/essays");

    const cards = page.locator("[data-essay-card]");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0).locator("[data-essay-due]")).toContainText(
      "随时继续",
    );
    await expect(cards.nth(1).locator("[data-essay-due]")).toContainText(
      "随时开始",
    );
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
  });
});
