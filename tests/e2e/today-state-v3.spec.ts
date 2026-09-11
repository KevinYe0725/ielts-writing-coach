import { expect, test } from "@playwright/test";
import { deterministicDemo } from "./support";

test.describe("learner-safe Today status", () => {
  test.skip(deterministicDemo, "Exercises the live HTTP contract.");

  for (const serviceState of [
    "configured",
    "needs_setup",
    "expires",
  ] as const) {
    test(`renders ${serviceState} for a learner without requesting privileged configuration`, async ({
      page,
    }) => {
      let ready = false;
      let failOnce = false;
      let expired = false;
      let transientFailures = 0;
      const requests: string[] = [];
      await page.route("**/api/v1/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        requests.push(path);
        let body: unknown = {};
        if (path.endsWith("/auth/get-session")) body = null;
        if (path.endsWith("/notifications")) body = { notifications: [] };
        if (path.endsWith("/essays"))
          body = { active_count: 0, active_limit: 8, essays: [] };
        if (path.endsWith("/providers")) {
          await route.fulfill({ status: 403, json: { code: "FORBIDDEN" } });
          return;
        }
        if (path.endsWith("/today")) {
          if (expired) {
            await route.fulfill({
              status: 401,
              json: { code: "UNAUTHENTICATED" },
            });
            return;
          }
          if (failOnce) {
            failOnce = false;
            transientFailures++;
            await route.fulfill({
              status: 503,
              json: { code: "TEMPORARILY_UNAVAILABLE" },
            });
            return;
          }
          body = {
            ai_service: {
              state: serviceState === "expires" ? "configured" : serviceState,
              can_manage: false,
            },
            next_action: {
              kind: ready ? "REVIEW_FEEDBACK" : "WAIT_FOR_ASSESSMENT",
              entityId: "cycle-status",
              reason: "Continue this essay",
              dueAt: null,
              overdue: false,
            },
            cycle: {
              id: "cycle-status",
              status: ready ? "FEEDBACK_READY" : "ANALYZING",
              question: { prompt: "Should schools provide free meals?" },
              resources: {
                writing_available: true,
                feedback_available: ready,
                lesson_id: null,
                pending_job:
                  ready || serviceState === "needs_setup"
                    ? null
                    : {
                        id: "job-status",
                        status: "RUNNING",
                        task_kind: "ielts_assessment",
                        error_code: null,
                        error_safe_message: null,
                      },
              },
            },
            queue: [],
          };
        }
        await route.fulfill({ json: body });
      });
      await page.goto("/today");
      await expect(
        page.getByRole("heading", { name: "今天，从这里继续。" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /配置 AI|检查 AI 连接/ }),
      ).toHaveCount(0);
      if (serviceState === "expires") {
        expired = true;
        await expect(
          page.getByRole("link", { name: "重新登录", exact: true }),
        ).toBeVisible({ timeout: 10000 });
        await expect(page.locator("[data-today-primary]")).toHaveCount(0);
        const readsAfterExpiry = requests.filter((path) =>
          path.endsWith("/today"),
        ).length;
        // Observe longer than the five-second polling interval to prove it stopped.
        await page.waitForTimeout(5500);
        expect(requests.filter((path) => path.endsWith("/today"))).toHaveLength(
          readsAfterExpiry,
        );
      } else if (serviceState === "needs_setup") {
        await expect(
          page.getByText(/请联系管理员完成批改服务配置/),
        ).toBeVisible();
      } else {
        await expect(
          page
            .getByText("Should schools provide free meals?", { exact: true })
            .first(),
        ).toBeVisible();
        await expect(
          page.getByText(/正在处理，准备好后这里会自动更新/),
        ).toBeVisible();
        failOnce = true;
        await expect.poll(() => transientFailures, { timeout: 10000 }).toBe(1);
        await expect(
          page.getByRole("heading", { name: "今天，从这里继续。" }),
        ).toBeVisible();
        await expect(page.locator("[data-today-primary]")).toBeVisible();
        ready = true;
        await expect(
          page.locator(
            '[data-today-primary] a[href="/feedback?cycle=cycle-status"]',
          ),
        ).toBeVisible({ timeout: 10000 });
        await expect(
          page.getByText(/正在处理，准备好后这里会自动更新/),
        ).toHaveCount(0);
      }
      expect(requests).not.toContain("/api/v1/providers");
    });
  }
});
