import { expect, test, type Page } from "@playwright/test";

import { deterministicDemo, resetDemoState } from "./support";

const fortyFiveWords = `Primary school pupils can benefit from early language lessons because regular exposure makes unfamiliar patterns easier to recognise. Short interactive classes also build confidence without creating an excessive workload. However, schools should protect time for play, exercise and rest, so the programme remains age appropriate and genuinely useful.`;

const httpRewriteUrl =
  "/rewrite?cycle=cycle-http&task=rewrite-snapshot-failure";
const hiddenAbstractTarget = "Check paragraph logic before submitting.";

async function installSnapshotFailureApi(page: Page): Promise<string[]> {
  const requests: string[] = [];
  const question = {
    id: "snapshot-question",
    topic: "Education",
    questionType: "Advantages / Disadvantages",
    prompt:
      "Some experts believe children should learn another language in primary school.",
    instructions: "Discuss whether the advantages outweigh the disadvantages.",
  };
  const attempt = {
    id: "attempt-snapshot-failure",
    kind: "version_2",
    content: "",
    createdAt: "2026-08-23T00:05:00.000Z",
    cycleId: "cycle-http",
    revision: 1,
    draftBeforeSelfCheck: null,
    draftAfterSelfCheck: null,
  };

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    requests.push(`${request.method()} ${pathname}`);

    if (pathname === "/api/v1/auth/get-session") {
      await route.fulfill({ contentType: "application/json", body: "null" });
      return;
    }
    if (
      pathname === "/api/v1/rewrite-tasks/rewrite-snapshot-failure" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          rewrite_task: {
            id: "rewrite-snapshot-failure",
            cycle_id: "cycle-http",
            status: "IN_PROGRESS",
            available_at: "2026-08-22T00:00:00.000Z",
            question,
            abstract_checklist: [hiddenAbstractTarget],
          },
        }),
      });
      return;
    }
    if (pathname === "/api/v1/training-cycles/cycle-http") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          cycle: {
            id: "cycle-http",
            status: "ATTEMPT_2_ACTIVE",
            question,
            writingAttempts: [attempt],
          },
        }),
      });
      return;
    }
    if (
      pathname === "/api/v1/writing-attempts/attempt-snapshot-failure" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        contentType: "application/json",
        headers: { etag: 'W/"1"' },
        body: JSON.stringify({ attempt }),
      });
      return;
    }
    if (
      pathname === "/api/v1/writing-attempts/attempt-snapshot-failure" &&
      request.method() === "PATCH"
    ) {
      await route.fulfill({
        contentType: "application/problem+json",
        status: 503,
        body: JSON.stringify({
          type: "https://coach.test/problems/snapshot-unavailable",
          title: "Snapshot unavailable",
          status: 503,
          detail: "The blind snapshot could not be sealed.",
          code: "SNAPSHOT_UNAVAILABLE",
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "Not found" });
  });
  return requests;
}

test.describe("timed writing rooms", () => {
  test.skip(
    !deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=true and a demo-mode web server.",
  );

  test.beforeEach(async ({ page }) => resetDemoState(page));

  test("writing workspace keeps rules visible on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/write?cycle=cycle-demo");

    await expect(page.getByText(/40 分钟/)).toBeVisible();
    await expect(page.getByText(/至少写 250 词/)).toBeVisible();
    await expect(page.locator("main")).toHaveAttribute(
      "data-page-layout",
      "workspace",
    );
  });

  test("supports the primary keyboard save and submit flow", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "The touch project has no hardware-keyboard shortcut contract.",
    );
    await page.goto("/write?cycle=cycle-demo");

    const editor = page.getByRole("textbox", { name: "你的作文" });
    await expect(editor).toBeEditable();
    await editor.fill(fortyFiveWords);
    await editor.press("Control+s");
    await expect(page.getByText("已自动保存", { exact: true })).toBeVisible();

    await editor.press("Control+Enter");
    const dialog = page.getByRole("dialog", { name: "确认提交这份版本？" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/48 词/)).toBeVisible();
    await dialog.getByRole("button", { name: "确认提交" }).click();

    const submissionToast = page
      .getByRole("status")
      .filter({ hasText: "作文提交成功，正在生成批改…" });
    await expect(submissionToast).toBeVisible();
    await expect(submissionToast).toHaveCSS(
      "background-color",
      "rgb(29, 86, 160)",
    );
    await expect(submissionToast).not.toHaveCSS(
      "background-color",
      "rgb(47, 109, 90)",
    );

    await expect(page).toHaveURL(/\/feedback\?cycle=cycle-demo$/);
  });

  test("keeps personal targets absent for 35 minutes and reveals only abstract checks in the final five", async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto("/rewrite?cycle=cycle-demo&task=rewrite-primary-language");

    await expect(
      page.getByText("为保留闭卷证据，剩余 5 分钟时才会显示。"),
    ).toBeVisible();
    await expect(page.getByText("检查比较对象是否完整")).toHaveCount(0);
    await expect(
      page.getByText(
        "The pressure from the courses in primary school is much slighter.",
      ),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        "Primary-school pupils face less academic pressure than secondary-school students.",
      ),
    ).toHaveCount(0);

    await expect(page.getByRole("timer")).toContainText("40:00");
    // The room starts its deadline in a zero-delay hydration effect. Advance
    // that effect first, then jump to the final-five window; otherwise a busy
    // WebKit/mobile run can start the 40-minute clock after the jump.
    await page.clock.fastForward("00:01");
    await page.clock.fastForward("34:59");

    await expect(page.getByRole("timer")).toContainText("05:00");
    await expect(page.getByText("检查比较对象是否完整")).toBeVisible();
    await expect(page.getByText("用自然搭配表达学业压力")).toBeVisible();
    await expect(page.getByText("主体段补足机制和长期意义")).toBeVisible();
  });

  test("offers an explicit choice when IndexedDB contains an unsynced draft", async ({
    page,
  }) => {
    await page.goto("/write?cycle=cycle-demo");
    const editor = page.getByRole("textbox", { name: "你的作文" });
    await expect(editor).toBeEditable();
    const attemptId = await editor.evaluate((element) => {
      const key = element.closest("main")?.querySelector("textarea")?.id;
      return key ? "attempt-v1" : "attempt-v1";
    });
    await page.evaluate(
      ({ id, content }) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("ielts-writing-coach", 1);
          request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains("writing-drafts"))
              request.result.createObjectStore("writing-drafts", {
                keyPath: "attemptId",
              });
          };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const transaction = request.result.transaction(
              "writing-drafts",
              "readwrite",
            );
            transaction.objectStore("writing-drafts").put({
              attemptId: id,
              content,
              syncState: "pending",
              updatedAt: new Date().toISOString(),
            });
            transaction.oncomplete = () => {
              request.result.close();
              resolve();
            };
            transaction.onerror = () => reject(transaction.error);
          };
        }),
      { id: attemptId, content: fortyFiveWords },
    );

    await page.reload();
    const dialog = page.getByRole("dialog", {
      name: "发现未同步的本地草稿",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "恢复本地草稿" }).click();
    await expect(editor).toHaveValue(fortyFiveWords);
  });

  test("keeps explicit cycle and task identity across learning-page navigation", async ({
    page,
  }) => {
    await page.goto("/today");
    const rewriteLink = page.getByRole("link", { name: "开始重写" });
    await expect(rewriteLink).toHaveAttribute(
      "href",
      "/rewrite?cycle=cycle-demo&task=rewrite-primary-language",
    );
    await rewriteLink.click();
    await expect(page).toHaveURL(
      /\/rewrite\?cycle=cycle-demo&task=rewrite-primary-language$/,
    );

    await page.goto("/feedback?cycle=cycle-demo");
    await expect(
      page.getByRole("link", { name: "进入专项教学" }),
    ).toHaveAttribute(
      "href",
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );

    await page.goto("/compare?cycle=cycle-demo");
    await expect(page.getByRole("link", { name: "查看安排" })).toHaveAttribute(
      "href",
      "/transfer?cycle=cycle-demo&task=transfer-task",
    );
  });

  test("offers reachable server-authoritative reschedule actions for missed windows", async ({
    page,
  }) => {
    await page.goto("/api/v1/health/live");
    await page.evaluate(() => {
      window.localStorage.setItem("iwc.demo.rewrite-window-expired", "true");
    });
    await page.goto("/rewrite?cycle=cycle-demo&task=rewrite-primary-language");
    await expect(
      page.getByRole("button", { name: "重新安排闭卷重写" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "重新安排闭卷重写" }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.localStorage.getItem("iwc.demo.rewrite-window-expired"),
        ),
      )
      .toBeNull();

    await page.evaluate(() => {
      window.localStorage.setItem("iwc.demo.transfer-window-expired", "true");
    });
    await page.goto("/transfer?cycle=cycle-demo&task=transfer-task");
    await expect(
      page.getByRole("button", { name: "重新安排迁移窗口" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "重新安排迁移窗口" }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.localStorage.getItem("iwc.demo.transfer-window-expired"),
        ),
      )
      .toBeNull();
  });
});

test.describe("blind snapshot failure over the public HTTP contract", () => {
  test.skip(
    deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=false and an HTTP-mode web server.",
  );

  test("keeps abstract goals hidden when the blind snapshot cannot be sealed", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-08-23T00:40:00.000Z") });
    const requests = await installSnapshotFailureApi(page);

    await page.goto(httpRewriteUrl);

    const snapshotError = page.getByText(
      "闭卷草稿尚未安全锁定，请检查连接后重试。",
    );
    await expect(snapshotError).toBeVisible();
    await expect(snapshotError).toHaveCSS("color", "rgb(180, 71, 76)");
    await expect(page.getByText(hiddenAbstractTarget)).toHaveCount(0);
    expect(
      requests.filter(
        (request) =>
          request === "PATCH /api/v1/writing-attempts/attempt-snapshot-failure",
      ),
    ).toHaveLength(1);
  });
});
