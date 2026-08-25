import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  deterministicDemo,
  expectBasicAccessibility,
  expectNoHorizontalOverflow,
  expectVisibleTextFloor,
  resetDemoState,
} from "./support";

const exactBackupConfirmation = "CREATE ENCRYPTED INSTANCE BACKUP";

type AdminStatusFixture = {
  access?: "failed" | "forbidden";
  actorRole?: "owner" | "admin";
  mailState?: "ready" | "missing" | "unverified" | "error";
  migrationsCurrent?: boolean;
};

const adminFixtures = new WeakMap<Page, AdminStatusFixture>();

type CssColor = {
  alpha: number;
  blue: number;
  green: number;
  red: number;
};

function parseCssColor(value: string): CssColor {
  const rgb = value.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/u,
  );
  if (rgb) {
    return {
      red: Number(rgb[1]),
      green: Number(rgb[2]),
      blue: Number(rgb[3]),
      alpha: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  }

  const srgb = value.match(
    /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/u,
  );
  if (srgb) {
    return {
      red: Number(srgb[1]) * 255,
      green: Number(srgb[2]) * 255,
      blue: Number(srgb[3]) * 255,
      alpha: srgb[4] === undefined ? 1 : Number(srgb[4]),
    };
  }

  throw new Error(`Unsupported CSS color: ${value}`);
}

function composite(foreground: CssColor, background: CssColor): CssColor {
  const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
  const channel = (front: number, back: number) =>
    (front * foreground.alpha +
      back * background.alpha * (1 - foreground.alpha)) /
    alpha;
  return {
    red: channel(foreground.red, background.red),
    green: channel(foreground.green, background.green),
    blue: channel(foreground.blue, background.blue),
    alpha,
  };
}

function relativeLuminance(color: CssColor): number {
  const linear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (
    linear(color.red) * 0.2126 +
    linear(color.green) * 0.7152 +
    linear(color.blue) * 0.0722
  );
}

function contrastRatio(first: CssColor, second: CssColor): number {
  const [lighter, darker] = [
    relativeLuminance(first),
    relativeLuminance(second),
  ].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

async function useAdminStatusFixture(
  page: Page,
  fixture: AdminStatusFixture,
): Promise<void> {
  adminFixtures.set(page, { ...adminFixtures.get(page), ...fixture });
}

async function installAdminHttpFixtures(page: Page): Promise<void> {
  adminFixtures.set(page, {});
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const fixture = adminFixtures.get(page) ?? {};

    if (pathname === "/api/v1/auth/get-session") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          session: { token: "test-only-admin-session" },
          user: {
            id: `fixture-${fixture.actorRole ?? "owner"}`,
            email: `${fixture.actorRole ?? "owner"}@example.test`,
            name: "Fixture operator",
            role: fixture.actorRole ?? "owner",
          },
        }),
      });
      return;
    }

    if (pathname === "/api/v1/providers") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ providers: [] }),
      });
      return;
    }

    if (pathname === "/api/v1/admin/status") {
      if (fixture.access === "forbidden") {
        await route.fulfill({
          status: 403,
          contentType: "application/problem+json",
          body: JSON.stringify({
            code: "FORBIDDEN",
            detail: "Administrator access is required.",
            status: 403,
            title: "Forbidden",
          }),
        });
        return;
      }
      if (fixture.access === "failed") {
        await route.fulfill({
          status: 503,
          contentType: "application/problem+json",
          body: JSON.stringify({
            code: "STATUS_UNAVAILABLE",
            detail: "System status is temporarily unavailable.",
            status: 503,
            title: "Status unavailable",
          }),
        });
        return;
      }
      const mailState = fixture.mailState ?? "ready";
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          actor_role: fixture.actorRole ?? "owner",
          audit_event_count: 18,
          database: {
            healthy: true,
            migrations_current: fixture.migrationsCurrent ?? true,
          },
          deployment_mode: "personal",
          jobs: { FAILED: 0, QUEUED: 2, RUNNING: 1 },
          pending_invitations: 1,
          question_supply: {
            eligible_question_count: 121,
            recommendations: { READY: 8, PENDING: 2, UNAVAILABLE: 1 },
            latest_batch: {
              status: "FAILED",
              mode: "WEB_RESEARCH",
              accepted_count: 7,
              rejected_count: 2,
              safe_failure_code: "SEARCH_UNAVAILABLE",
              triggered_by_user_id: "must-not-render-user-id",
              prompt: "must-not-render-private-prompt",
              research_sources: [
                {
                  url: "https://must-not-render.example.test",
                  snippet: "must-not-render-source-snippet",
                },
              ],
              provider_response: "must-not-render-provider-response",
              encrypted_api_key: "must-not-render-encrypted-key",
            },
          },
          recent_audit: [
            {
              action: "provider.test",
              id: "fixture-audit-1",
              occurred_at: "2026-08-12T12:00:00.000Z",
              result: "success",
              target_id: "fixture-provider",
              target_type: "provider_connection",
            },
          ],
          smtp_configured: mailState !== "missing",
          smtp_state:
            mailState === "ready"
              ? "verified"
              : mailState === "unverified"
                ? "configured_unverified"
                : mailState === "error"
                  ? "verification_failed"
                  : "missing",
          task_executor: { healthy: true },
          users: 4,
          versions: { application: "1.0.0-test" },
        }),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Not found" });
  });
}

async function openBackup(page: Page): Promise<void> {
  await page.goto("/admin/backup");
  await expect(page.getByLabel(/备份口令/)).toBeVisible();
}

async function completeBackupForm(page: Page): Promise<void> {
  await page.getByLabel(/备份口令/).fill("a-secure-passphrase");
  await page.getByLabel(/输入 CREATE ENCRYPTED/).fill(exactBackupConfirmation);
}

test.describe("secure administration surfaces", () => {
  test.skip(
    deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=false and an HTTP-mode web server.",
  );

  test.beforeEach(async ({ page }) => {
    await resetDemoState(page);
    await installAdminHttpFixtures(page);
  });

  test("learner navigation has no administration entry and forbidden status reveals no operations", async ({
    page,
  }) => {
    await page.route("**/api/v1/auth/get-session", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          user: { email: "learner@example.com", role: "learner" },
        }),
      });
    });
    await page.goto("/today");
    await expect(page.locator('nav a[href^="/admin"]')).toHaveCount(0);

    await useAdminStatusFixture(page, { access: "forbidden" });
    await page.goto("/admin");
    const denied = page.locator('[data-admin-access="denied"]');
    await expect(denied).toBeVisible();
    await expect(denied).toHaveAttribute("role", "alert");
    await expect(
      page.getByRole("heading", { name: "无管理权限" }),
    ).toBeVisible();
    await expect(
      page.getByText("当前账户不能查看系统状态或执行管理操作。"),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "返回今日计划" }),
    ).toBeVisible();
    await expect(denied.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByText("后台任务", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "创建备份" })).toHaveCount(0);
  });

  test("recoverable status failures show an error state with retry", async ({
    page,
  }) => {
    await useAdminStatusFixture(page, { access: "failed" });
    await page.goto("/admin");

    const failure = page.locator('[data-admin-access="error"]');
    await expect(failure).toBeVisible();
    await expect(failure).toHaveAttribute("role", "alert");
    await expect(
      page.getByRole("heading", { name: "无法读取系统状态" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "重新检查" })).toBeVisible();
    await expect(failure.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByText("后台任务", { exact: true })).toHaveCount(0);
  });

  test("health copy reflects the canonical migration state", async ({
    page,
  }) => {
    await useAdminStatusFixture(page, { migrationsCurrent: false });
    await page.goto("/admin");

    await expect(page.locator('[data-admin-desk="operations"]')).toBeVisible();
    await expect(
      page.getByText("数据库可连接，但迁移版本不匹配"),
    ).toBeVisible();
    await expect(page.getByText("数据库连接与迁移版本均已核验")).toHaveCount(0);
  });

  test("shows compact aggregate question-supply status without operational internals", async ({
    page,
  }) => {
    await page.goto("/admin");

    const supply = page.locator('[data-question-supply-status="aggregate"]');
    await expect(supply).toBeVisible();
    await expect(supply.getByText("题库补充", { exact: true })).toBeVisible();
    await expect(supply.getByText("121", { exact: true })).toBeVisible();
    await expect(supply.getByText("8 / 2 / 1", { exact: true })).toBeVisible();
    await expect(supply.getByText("联网调研", { exact: true })).toBeVisible();
    await expect(supply.getByText("7 / 2", { exact: true })).toBeVisible();
    await expect(
      supply.getByText("SEARCH_UNAVAILABLE", { exact: true }),
    ).toBeVisible();

    const pageText = await page.getByRole("main").innerText();
    for (const forbidden of [
      "must-not-render-user-id",
      "must-not-render-private-prompt",
      "https://must-not-render.example.test",
      "must-not-render-source-snippet",
      "must-not-render-provider-response",
      "must-not-render-encrypted-key",
    ]) {
      expect(pageText).not.toContain(forbidden);
    }
  });

  test("Owner creates a one-time recovery link from an HTTP fixture", async ({
    page,
  }) => {
    await useAdminStatusFixture(page, {
      actorRole: "owner",
      mailState: "missing",
    });
    let submittedEmail: string | null = null;
    await page.route("**/api/v1/admin/recovery-links", async (route) => {
      const request = route.request();
      submittedEmail = (request.postDataJSON() as { email: string }).email;
      expect(request.method()).toBe("POST");
      expect(request.headers()["idempotency-key"]).toBeTruthy();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          one_time_link: "https://example.test/recover?token=one-time-fixture",
        }),
      });
    });

    await page.goto("/admin");
    await page.getByLabel("账户邮箱").fill("learner@example.com");
    await page.getByRole("button", { name: "生成链接" }).click();

    await expect(page.locator("output")).toHaveText(
      "https://example.test/recover?token=one-time-fixture",
    );
    expect(submittedEmail).toBe("learner@example.com");
  });

  test("SMTP live probe and audit expansion remain interactive", async ({
    page,
  }) => {
    await page.route("**/api/v1/admin/smtp-test", async (route) => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().headers()["idempotency-key"]).toBeTruthy();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ verified: true }),
      });
    });

    await page.goto("/admin");
    await page.getByRole("button", { name: "测试连接" }).click();
    await expect(
      page.getByText("本次 SMTP 连接与认证测试通过。"),
    ).toBeVisible();

    const auditToggle = page.getByRole("button", { name: "查看日志" });
    await expect(auditToggle).toHaveAttribute("aria-expanded", "false");
    await auditToggle.click();
    await expect(
      page.getByRole("button", { name: "收起日志" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByText("provider.test", { exact: true }),
    ).toBeVisible();
  });

  test("administrators can inspect status but cannot open backup export", async ({
    page,
  }) => {
    await useAdminStatusFixture(page, {
      actorRole: "admin",
      mailState: "missing",
    });
    await page.goto("/admin");

    await expect(page.locator('[data-admin-desk="operations"]')).toBeVisible();
    await expect(page.getByText("仅 Owner", { exact: true })).toBeVisible();
    await expect(page.getByLabel("账户邮箱")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "生成链接" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "创建备份" })).toHaveCount(0);

    await page.goto("/admin/backup");
    await expect(page.locator('[data-backup-access="denied"]')).toBeVisible();
    await expect(page.getByLabel(/备份口令/)).toHaveCount(0);
  });

  test("backup requires the exact confirmation and at least 12 characters", async ({
    page,
  }) => {
    await openBackup(page);

    const passphrase = page.getByLabel(/备份口令/);
    const confirmation = page.getByLabel(/输入 CREATE ENCRYPTED/);
    const submit = page.getByRole("button", { name: "创建并下载" });
    await expect(passphrase).toHaveAttribute("minlength", "12");
    await expect(confirmation).toBeVisible();
    await expect(page.getByText(/\.sha256/i)).toBeVisible();

    await passphrase.fill("short");
    await confirmation.fill(exactBackupConfirmation);
    await expect(submit).toBeDisabled();
    await passphrase.fill("a-secure-passphrase");
    await confirmation.fill(`${exactBackupConfirmation} `);
    await expect(submit).toBeDisabled();
    await confirmation.fill(exactBackupConfirmation);
    await expect(submit).toBeEnabled();
  });

  test("backup control boundaries meet WCAG 1.4.11 contrast", async ({
    page,
  }) => {
    await openBackup(page);
    await page.evaluate(() => {
      const fields = document.querySelector(
        '[data-backup-desk="secure-export"] .settings-fields',
      );
      if (!fields) throw new Error("Backup settings fields are unavailable.");
      const select = document.createElement("select");
      select.setAttribute("aria-label", "Test-only backup select");
      select.append(new Option("fixture", "fixture"));
      const textarea = document.createElement("textarea");
      textarea.setAttribute("aria-label", "Test-only backup textarea");
      fields.append(select, textarea);
    });

    const panelBackground = parseCssColor(
      await page
        .locator('[data-backup-desk="secure-export"] .card')
        .evaluate(
          (element) => window.getComputedStyle(element).backgroundColor,
        ),
    );
    const controls = page.locator(
      '[data-backup-desk="secure-export"] input, [data-backup-desk="secure-export"] select, [data-backup-desk="secure-export"] textarea',
    );
    await expect(controls).toHaveCount(4);

    for (const control of await controls.all()) {
      const colors = await control.evaluate((element) => {
        const style = window.getComputedStyle(element);
        return {
          background: style.backgroundColor,
          border: style.borderTopColor,
        };
      });
      const controlBackground = parseCssColor(colors.background);
      const border = parseCssColor(colors.border);
      const ratios = [controlBackground, panelBackground].map((background) =>
        contrastRatio(composite(border, background), background),
      );
      expect(Math.min(...ratios)).toBeGreaterThanOrEqual(3);
    }
  });

  test("failed backup keeps both secrets and uses the error state", async ({
    page,
  }) => {
    await page.route("**/api/v1/admin/backups", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/problem+json",
        body: JSON.stringify({ detail: "归档创建失败，请稍后重试。" }),
      });
    });
    await openBackup(page);
    await completeBackupForm(page);
    await page.getByRole("button", { name: "创建并下载" }).click();

    const error = page.getByText("归档创建失败，请稍后重试。");
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute("data-backup-status", "error");
    await expect(error).toHaveCSS("color", "rgb(180, 71, 76)");
    await expect(page.getByLabel(/备份口令/)).toHaveValue(
      "a-secure-passphrase",
    );
    await expect(page.getByLabel(/输入 CREATE ENCRYPTED/)).toHaveValue(
      exactBackupConfirmation,
    );
  });

  test("successful backup downloads archive then checksum and clears secrets", async ({
    page,
  }) => {
    await page.route("**/api/v1/admin/backups", async (route) => {
      const payload = route.request().postDataJSON() as {
        confirmation: string;
        passphrase: string;
      };
      expect(payload).toEqual({
        confirmation: exactBackupConfirmation,
        passphrase: "a-secure-passphrase",
      });
      await route.fulfill({
        body: "test-only encrypted archive fixture",
        headers: {
          "content-disposition":
            'attachment; filename="ielts-writing-coach.iwc-backup"',
          "content-type": "application/octet-stream",
          "x-iwc-backup-sha256": "a".repeat(64),
        },
      });
    });
    await openBackup(page);
    await completeBackupForm(page);

    const downloads: string[] = [];
    page.on("download", (download) =>
      downloads.push(download.suggestedFilename()),
    );
    await page.getByRole("button", { name: "创建并下载" }).click();
    await expect
      .poll(() => downloads)
      .toEqual([
        "ielts-writing-coach.iwc-backup",
        "ielts-writing-coach.iwc-backup.sha256",
      ]);
    await expect(page.getByLabel(/备份口令/)).toHaveValue("");
    await expect(page.getByLabel(/输入 CREATE ENCRYPTED/)).toHaveValue("");

    const success = page.getByText(/加密实例备份已下载/);
    await expect(success).toHaveAttribute("data-backup-status", "success");
    await expect(success).not.toHaveCSS("color", "rgb(47, 109, 90)");
  });

  for (const viewport of [
    { label: "desktop", width: 1440, height: 960 },
    { label: "390px mobile", width: 390, height: 844 },
  ]) {
    test(`Admin and backup remain readable and accessible at ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      for (const path of ["/admin", "/admin/backup"]) {
        await page.goto(path);
        await expectNoHorizontalOverflow(page);
        await expectBasicAccessibility(page);
        await expectVisibleTextFloor(
          page.getByRole("main"),
          `${path} at ${viewport.label}`,
        );
        const axe = await new AxeBuilder({ page }).analyze();
        expect(axe.violations).toEqual([]);

        const auxiliaryFontSizes = await page
          .locator("[data-admin-auxiliary]")
          .evaluateAll((elements) =>
            elements.map((element) =>
              Number.parseFloat(window.getComputedStyle(element).fontSize),
            ),
          );
        expect(auxiliaryFontSizes.length).toBeGreaterThan(0);
        expect(Math.min(...auxiliaryFontSizes)).toBeGreaterThanOrEqual(12);
      }
    });
  }
});
