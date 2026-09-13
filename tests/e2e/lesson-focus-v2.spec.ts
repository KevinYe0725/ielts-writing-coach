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

  test("puts a clear try-now cue directly before each inline practice", async ({
    page,
  }) => {
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );

    const section = page.locator("[data-teaching-section]").first();
    const cue = section.locator("[data-teaching-practice-cue]");
    const practice = section.locator("[data-teaching-practice]").first();
    await expect(cue).toBeVisible();
    await expect(cue).toContainText("马上用一次");
    const [cueBox, practiceBox] = await Promise.all([
      cue.boundingBox(),
      practice.boundingBox(),
    ]);
    expect(cueBox).not.toBeNull();
    expect(practiceBox).not.toBeNull();
    expect(cueBox!.y + cueBox!.height).toBeLessThanOrEqual(practiceBox!.y + 8);
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
    await expect(progress).toHaveAttribute("aria-valuemax", "4");
    await expect(progress).toHaveAttribute("aria-valuenow", "1");

    await page
      .locator("[data-teaching-section]")
      .nth(1)
      .scrollIntoViewIfNeeded();
    await expect(progress).toHaveAttribute("aria-valuenow", "2");
    await expect(
      page.locator('[data-teaching-section][data-active="true"]'),
    ).toHaveCount(1);
  });
});
