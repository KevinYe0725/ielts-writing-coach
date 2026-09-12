import { expect, test } from "@playwright/test";

import { deterministicDemo, resetDemoState } from "./support";

test.describe("course roadmap preview", () => {
  test.skip(!deterministicDemo, "Requires the isolated demo preview.");

  test.beforeEach(async ({ page }) => {
    await resetDemoState(page);
    await page.goto("/today/roadmap-preview");
    await expect(
      page.locator('[data-roadmap-interactive="true"]'),
    ).toBeVisible();
  });

  test("opens on the current task and lets the learner inspect another stage", async ({
    page,
  }) => {
    const roadmap = page.locator("[data-course-roadmap]");
    await expect(roadmap.locator("[data-roadmap-node]")).toHaveCount(5);
    await expect(
      roadmap.locator('[data-roadmap-node="rewrite"] button'),
    ).toHaveAttribute("aria-current", "step");
    await expect(roadmap.locator("[data-roadmap-details] h2")).toHaveText(
      "延迟重写",
    );
    await expect(
      roadmap.locator('[data-roadmap-node="rewrite"] a'),
    ).toHaveCount(0);

    await roadmap.locator('[data-roadmap-node="feedback"] button').click();
    await expect(roadmap.locator("[data-roadmap-details] h2")).toHaveText(
      "批改",
    );
    await expect(
      roadmap.locator('[data-roadmap-node="feedback"] button'),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      roadmap.locator('[data-roadmap-node="rewrite"] button'),
    ).toHaveAttribute("aria-current", "step");
    await expect(roadmap.locator("[data-roadmap-details] a")).toHaveAttribute(
      "href",
      "/feedback?cycle=cycle-demo",
    );
  });

  test("keeps the path readable on mobile and exposes a real current action", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const roadmap = page.locator("[data-course-roadmap]");
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    await expect(
      roadmap.getByRole("link", { name: "开始重写" }),
    ).toHaveAttribute(
      "href",
      "/rewrite?cycle=cycle-demo&task=rewrite-primary-language",
    );
    await roadmap.locator('[data-roadmap-node="transfer"] button').click();
    await expect(roadmap.locator("[data-roadmap-details] h2")).toHaveText(
      "陌生题迁移",
    );
    await expect(roadmap.locator("[data-roadmap-details] a")).toHaveAttribute(
      "href",
      "/transfer?cycle=cycle-demo&task=transfer-task",
    );
    const rail = roadmap.locator("[data-roadmap-path]");
    const verticalProgress = roadmap.locator(
      '[data-roadmap-progress="vertical"]',
    );
    const railBox = await rail.boundingBox();
    const progressBox = await verticalProgress.boundingBox();
    expect(railBox).not.toBeNull();
    expect(progressBox).not.toBeNull();
    expect(progressBox!.height).toBeGreaterThan(0);
    expect(progressBox!.height).toBeLessThan(railBox!.height * 0.8);
  });

  test("disables JavaScript motion when reduced motion is requested", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/today/roadmap-preview");
    await expect(
      page.locator('[data-roadmap-interactive="true"]'),
    ).toBeVisible();
    const details = page.locator("[data-roadmap-details]");
    await page.locator('[data-roadmap-node="feedback"] button').click();
    await expect(details).toHaveAttribute("data-roadmap-motion", "reduced");
    await expect(details).toHaveCSS("transform", "none");
  });
});
