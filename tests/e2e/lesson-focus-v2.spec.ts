import { expect, test } from "@playwright/test";

import { deterministicDemo } from "./support";

test.describe("focused teaching entry", () => {
  test.skip(!deterministicDemo, "Requires the isolated demo preview.");

  test("foregrounds one skill and one first action in the lesson header", async ({
    page,
  }) => {
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );

    const focus = page.locator("[data-teaching-focus]");
    await expect(focus).toBeVisible();
    await expect(focus).toContainText("本节只练一种能力");
    await expect(page.getByText("专项能力教程", { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText(/约 \d+ 分钟/, { exact: true })).toHaveCount(0);
    await expect(page.locator("[data-teaching-primary-action]")).toBeVisible();
    await expect(page.locator("[data-teaching-entry-actions] a")).toHaveCount(
      1,
    );
    await expect(
      page.locator("[data-teaching-entry-actions] [data-teaching-paper-entry]"),
    ).toHaveCount(0);
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective&step=10",
    );
    await expect(
      page.getByRole("link", { name: "开始60分钟训练卷", exact: true }),
    ).toBeVisible();

    await expect(page.locator("[data-app-shell]")).toHaveCSS(
      "background-color",
      "rgb(247, 247, 247)",
    );
    await expect(page.locator("[data-teaching-toc-column]")).toHaveAttribute(
      "data-teaching-toc-density",
      "compact",
    );
  });

  test("puts each practice on its own focused step", async ({ page }) => {
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );

    await expect(
      page.locator("[data-teaching-step='1'] [data-teaching-practice]"),
    ).toHaveCount(0);
    await page.locator("[data-teaching-primary-action]").click();
    const practice = page
      .locator("[data-teaching-step='3'] [data-teaching-practice]")
      .first();
    await expect(practice).toBeVisible();
    await expect(practice.locator("[data-teaching-practice-cue]")).toHaveCount(
      0,
    );
    await expect(
      practice.locator("[data-teaching-practice-submit]"),
    ).toBeVisible();
  });

  test("keeps a compact progress indicator synchronized with the active section", async ({
    page,
  }) => {
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );

    const progress = page.locator("[data-teaching-progress]");
    await expect(progress).toBeVisible();
    await expect(progress).toHaveAttribute("role", "progressbar");
    await expect(progress).toHaveAttribute("aria-valuemax", "10");
    await expect(progress).toHaveAttribute("aria-valuenow", "1");

    await page.locator("[data-teaching-step-next]").click();
    await expect(progress).toHaveAttribute("aria-valuenow", "2");
    await expect(
      page.locator('[data-teaching-section][data-active="true"]'),
    ).toHaveCount(1);
  });

  test("uses the Apple system stack for tutorial UI while preserving the serif evidence role", async ({
    page,
  }) => {
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );

    const [headingFamily, proseFamily, evidenceFamily] = await Promise.all([
      page
        .locator("[data-teaching-step='1'] h2")
        .evaluate((element) => window.getComputedStyle(element).fontFamily),
      page
        .locator("[data-teaching-prose] p")
        .first()
        .evaluate((element) => window.getComputedStyle(element).fontFamily),
      page
        .locator('[data-teaching-block="MARKDOWN"] blockquote[lang="en"]')
        .first()
        .evaluate((element) => window.getComputedStyle(element).fontFamily),
    ]);

    for (const family of [headingFamily, proseFamily]) {
      expect(family).toContain("SF Pro Text");
      expect(family).toContain("PingFang SC");
      expect(family).not.toContain("New York");
    }
    expect(evidenceFamily).toContain("New York");
    expect(evidenceFamily).not.toContain("SF Pro Text");
  });

  test("shows one teaching step at a time and resumes it from the URL", async ({
    page,
  }) => {
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );

    const player = page.locator("[data-teaching-player]");
    await expect(player).toBeVisible();
    await expect(player.locator("[data-teaching-step='1']")).toBeVisible();
    await expect(player.locator("[data-teaching-step='2']")).toHaveCount(0);
    await expect(page.locator("[data-teaching-step-next]")).toBeEnabled();
    expect(
      await page
        .locator("article[data-teaching-article]")
        .evaluate((article) => article.scrollHeight),
    ).toBeLessThan(2200);

    await page.locator("[data-teaching-step-next]").click();
    await expect(player.locator("[data-teaching-step='2']")).toBeVisible();
    await expect(page).toHaveURL(
      /lesson\?cycle=cycle-demo&lesson=[^&]+&step=2$/,
    );

    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective&step=2",
    );
    await expect(player.locator("[data-teaching-step='2']")).toBeVisible();
  });

  test("keeps the final training handoff inside the desktop viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective&step=10",
    );
    await expect(page.locator("#teaching-paper-next")).toBeVisible();

    const bounds = await page.evaluate(() => {
      const footer = document.querySelector<HTMLElement>(
        "#teaching-paper-next",
      );
      const nav = document.querySelector<HTMLElement>(
        "[data-teaching-step-nav]",
      );
      return {
        bodyScrollHeight: document.documentElement.scrollHeight,
        footerBottom: footer?.getBoundingClientRect().bottom ?? Infinity,
        navBottom: nav?.getBoundingClientRect().bottom ?? Infinity,
        viewportHeight: window.innerHeight,
      };
    });

    expect(bounds.footerBottom).toBeLessThanOrEqual(bounds.viewportHeight);
    expect(bounds.navBottom).toBeLessThanOrEqual(bounds.viewportHeight);
    expect(bounds.bodyScrollHeight).toBeLessThanOrEqual(bounds.viewportHeight);
  });

  test("lets the first action reveal the practice on the current step", async ({
    page,
  }) => {
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );

    await page.locator("[data-teaching-primary-action]").click();
    await expect(page.locator("#teaching-practice-prompts")).toBeInViewport();
  });

  test("keeps practice state while moving between teaching steps", async ({
    page,
  }) => {
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );
    await page.locator("[data-teaching-primary-action]").click();
    const practice = page.locator("[data-teaching-practice]").first();
    await practice
      .getByText(
        "Protected lanes reduce perceived danger, so more commuters feel able to cycle regularly.",
        { exact: true },
      )
      .click();
    await practice.locator("[data-teaching-practice-submit]").click();
    await expect(
      practice.locator("[data-teaching-answer-review]"),
    ).toBeVisible();

    await page.locator("[data-teaching-continue]").first().click();
    await expect(page.locator("[data-teaching-step='4']")).toBeVisible();
    await page.locator("[data-teaching-step-prev]").click();
    await expect(page.locator("[data-teaching-step='3']")).toBeVisible();
    await expect(
      page
        .locator("[data-teaching-practice]")
        .first()
        .locator("[data-teaching-answer-review]"),
    ).toBeVisible();
  });

  test("supports keyboard step navigation without losing focus context", async ({
    page,
  }) => {
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );
    const next = page.locator("[data-teaching-step-next]");
    await next.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-teaching-step='2']")).toBeVisible();
    await expect(page.locator("[data-teaching-step='2'] h2")).toBeFocused();
    await page.locator("[data-teaching-step-prev]").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-teaching-step='1']")).toBeVisible();
  });
});
