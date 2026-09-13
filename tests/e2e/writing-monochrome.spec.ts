import { expect, test } from "@playwright/test";

import { deterministicDemo, expectNoHorizontalOverflow } from "./support";

test.describe("monochrome writing room", () => {
  test.skip(!deterministicDemo, "Requires the isolated demo preview.");

  test("uses the same monochrome roles as the public home", async ({
    page,
  }) => {
    await page.goto("/write?cycle=cycle-demo");
    await expect(page.locator('[data-writing-mode="first"]')).toBeVisible();
    const colors = await page.locator("[data-app-shell]").evaluate((shell) => {
      const topbar = shell.querySelector("[data-workspace-header]");
      const prompt = shell.querySelector("[data-writing-mode] .writing-prompt");
      const editor = shell.querySelector("[data-writing-mode] .writing-editor");
      const submit = shell.querySelector("[data-writing-mode] .button-primary");
      const root = getComputedStyle(shell);
      return {
        shellBackground: root.backgroundColor,
        shellColor: root.color,
        topbarBackground: topbar
          ? getComputedStyle(topbar).backgroundColor
          : null,
        promptBackground: prompt
          ? getComputedStyle(prompt).backgroundColor
          : null,
        editorBackground: editor
          ? getComputedStyle(editor).backgroundColor
          : null,
        submitBackground: submit
          ? getComputedStyle(submit).backgroundColor
          : null,
      };
    });
    expect(colors).toEqual({
      shellBackground: "rgb(247, 247, 247)",
      shellColor: "rgb(17, 17, 17)",
      topbarBackground: "rgb(255, 255, 255)",
      promptBackground: "rgb(255, 255, 255)",
      editorBackground: "rgb(255, 255, 255)",
      submitBackground: "rgb(17, 17, 17)",
    });
  });

  test("keeps the writing room readable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/write?cycle=cycle-demo");
    await expect(page.locator('[data-writing-mode="first"]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(
      page.getByRole("textbox", { name: "你的作文", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("timer")).toBeVisible();
  });

  test("removes secondary rule copy and toggles immersive writing", async ({
    page,
  }) => {
    await page.goto("/write?cycle=cycle-demo");
    await expect(page.locator('[data-writing-mode="first"]')).toBeVisible();
    await expect(page.locator(".exam-rules")).toHaveCount(0);
    const toggle = page.locator("[data-immersive-toggle]");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-writing-immersive="true"]')).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });
});
