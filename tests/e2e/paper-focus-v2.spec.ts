import { expect, test } from "@playwright/test";

import { deterministicDemo, expectNoHorizontalOverflow } from "./support";

const paperUrl =
  "/lesson/paper?cycle=cycle-demo&lesson=lesson-collocation-perspective";

test.describe("focused practice paper modes", () => {
  test.skip(!deterministicDemo, "Requires the isolated demo preview.");

  test("defaults to one-question focus mode", async ({ page }) => {
    await page.goto(paperUrl);

    await expect(page.locator("[data-paper-view=focus]")).toBeVisible();
    await expect(page.locator("[data-paper-question-id]")).toHaveCount(1);
    await expect(
      page.locator("[data-paper-view-toggle=focus]"),
    ).toHaveAttribute("aria-pressed", "true");
    await expectNoHorizontalOverflow(page);
  });

  test("keeps the focus question clear of the submit bar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(paperUrl);

    await expect(
      page.locator("[data-paper-view=focus] .practice-paper-submit"),
    ).toHaveCSS("position", "sticky");
  });

  test("switches to overview without changing the paper identity", async ({
    page,
  }) => {
    await page.goto(paperUrl);

    await page.locator("[data-paper-view-toggle=overview]").click();
    await expect(page).toHaveURL(/view=overview$/);
    await expect(page.locator("[data-paper-view=overview]")).toBeVisible();
    await expect(page.locator("[data-paper-question-id]")).toHaveCount(8);

    await page.locator("[data-paper-view-toggle=focus]").click();
    await expect(page).toHaveURL(/view=focus&question=1$/);
    await expect(page.locator("[data-paper-question-id]")).toHaveCount(1);
  });

  test("pages through questions and keeps drafts when changing modes", async ({
    page,
  }) => {
    await page.goto(paperUrl);
    const firstAnswer = page.getByRole("radio", {
      name: /Early exposure builds a foundation/,
    });
    await firstAnswer.check();

    await page.locator("[data-paper-question-next]").click();
    await expect(page).toHaveURL(/view=focus&question=2$/);
    await expect(page.locator("[data-paper-question-id]")).toHaveCount(1);

    await page.locator("[data-paper-view-toggle=overview]").click();
    await expect(page.locator("[data-paper-question-id]")).toHaveCount(8);
    await expect(
      page.locator(
        "#paper-question-demo-paper-question-1 input[type=radio]:checked",
      ),
    ).toHaveCount(1);
  });
});
