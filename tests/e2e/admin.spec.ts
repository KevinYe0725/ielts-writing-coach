import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  deterministicDemo,
  expectBasicAccessibility,
  expectNoHorizontalOverflow,
  resetDemoState,
} from "./support";

const adminStatusFixtureKey = "iwc.demo.admin-status-fixture";
const exactBackupConfirmation = "CREATE ENCRYPTED INSTANCE BACKUP";

type AdminStatusFixture = {
  access?: "forbidden";
  actorRole?: "owner" | "admin";
  mailState?: "ready" | "missing" | "unverified" | "error";
  migrationsCurrent?: boolean;
};

async function useAdminStatusFixture(
  page: Page,
  fixture: AdminStatusFixture,
): Promise<void> {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, JSON.stringify(value)),
    [adminStatusFixtureKey, fixture] as const,
  );
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
    !deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=true and a demo-mode web server.",
  );

  test.beforeEach(async ({ page }) => resetDemoState(page));

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
    await expect(page.locator('[data-admin-access="denied"]')).toBeVisible();
    await expect(page.getByText("后台任务", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "创建备份" })).toHaveCount(0);
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
        const axe = await new AxeBuilder({ page })
          .disableRules(["color-contrast"])
          .analyze();
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
