import { expect, test } from "@playwright/test";
import { deterministicDemo, resetDemoState } from "./support";

test.describe("document-first workspace", () => {
  test.skip(!deterministicDemo, "Requires the isolated demo preview.");
  test.beforeEach(async ({ page }) => {
    await resetDemoState(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  test("shows the original essay before the first desktop fold without shrinking reading text", async ({
    page,
  }) => {
    await page.goto("/feedback?cycle=cycle-demo");
    const essay = page.locator("[data-feedback-essay]");
    await expect(essay).toBeVisible();
    const reading = await essay.evaluate((node) => ({
      top: node.getBoundingClientRect().top,
      fontSize: parseFloat(getComputedStyle(node).fontSize),
    }));
    expect(reading.top).toBeLessThan(880);
    expect(reading.fontSize).toBeGreaterThanOrEqual(17);
  });

  test("resizes the report by keyboard without losing the original or selected correction", async ({
    page,
  }) => {
    await page.goto("/feedback?cycle=cycle-demo");
    const essay = page.locator("[data-feedback-essay]");
    await expect(essay).toBeVisible();
    const original = await essay.textContent();
    const highlight = page.locator("[data-feedback-highlight]").first();
    const issue = await highlight.getAttribute("data-feedback-highlight");
    await highlight.click();
    const selected = page.locator(`[data-feedback-issue="${issue}"]`);
    await expect(selected).toHaveAttribute("aria-expanded", "true");
    const separator = page.getByRole("separator", {
      name: /调整.*宽度|resize/i,
    });
    await expect(separator).toBeVisible();
    const before = (await essay.boundingBox())!.width;
    await separator.focus();
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(async () => (await essay.boundingBox())!.width)
      .toBeLessThan(before - 1);
    expect(await essay.textContent()).toBe(original);
    await expect(selected).toHaveAttribute("aria-expanded", "true");
    await expect(highlight).toHaveAttribute("aria-pressed", "true");
    await expect(separator).toBeFocused();
  });

  test("uses one report document on mobile with a readable diagnosis", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/feedback?cycle=cycle-demo");

    await expect(page.locator("[data-essay-pane]")).toHaveCount(1);
    await expect(page.locator("[data-suggestion-panel]")).toHaveCount(1);
    await expect(page.getByRole("separator")).toBeHidden();
    await expect(page.locator("[data-suggestion-panel]")).toBeVisible();
    await page.getByRole("tab", { name: "原文", exact: true }).click();
    await expect(page.locator("[data-essay-pane]")).toBeVisible();
    await expect(page.locator("[data-suggestion-panel]")).toBeHidden();
    const summarySize = await page
      .locator("#feedback-assessment-heading")
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(summarySize).toBeGreaterThanOrEqual(16);
  });

  test("keeps the focused-target rationale available as optional guidance", async ({
    page,
  }) => {
    await page.goto("/feedback?cycle=cycle-demo");
    const target = page.locator("[data-feedback-issue]", {
      hasText: "本次专项重点",
    });
    await target.click();
    const disclosure = page.getByText("为什么把这处作为专项重点", {
      exact: true,
    });
    await expect(disclosure).toBeVisible();
    await disclosure.click();
    await expect(page.getByText(/编号表示本篇的纠错顺序/)).toBeVisible();
  });

  test("fills narrow report widths and preserves the selected issue across layout changes", async ({
    page,
  }) => {
    await page.goto("/feedback?cycle=cycle-demo");
    const highlight = page.locator("[data-feedback-highlight]").first();
    const issue = await highlight.getAttribute("data-feedback-highlight");
    await highlight.click();

    for (const width of [390, 768, 820, 900]) {
      await page.setViewportSize({ width, height: 900 });
      const workbench = page.locator("[data-feedback-workbench]");
      const suggestions = page.locator("[data-suggestion-panel]");
      await expect(page.getByRole("separator")).toHaveCount(0);
      await expect(suggestions).toBeVisible();
      const [workbenchBox, suggestionBox] = await Promise.all([
        workbench.boundingBox(),
        suggestions.boundingBox(),
      ]);
      expect(workbenchBox).not.toBeNull();
      expect(suggestionBox).not.toBeNull();
      expect(
        Math.abs(suggestionBox!.width - workbenchBox!.width),
      ).toBeLessThanOrEqual(2);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      ).toBe(true);
      await expect(
        page.locator(`[data-feedback-issue="${issue}"]`),
      ).toHaveAttribute("aria-expanded", "true");
    }

    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(
      page.getByRole("separator", { name: /调整.*宽度|resize/i }),
    ).toBeVisible();
    const [sourceBox, suggestionBox] = await Promise.all([
      page.locator("[data-essay-pane]").boundingBox(),
      page.locator("[data-suggestion-panel]").boundingBox(),
    ]);
    expect(sourceBox).not.toBeNull();
    expect(suggestionBox).not.toBeNull();
    expect(sourceBox!.width).toBeGreaterThanOrEqual(420);
    expect(suggestionBox!.width).toBeGreaterThanOrEqual(340);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    await expect(highlight).toHaveAttribute("aria-pressed", "true");
  });

  test("keeps the tutorial title on the same reading axis as its prose", async ({
    page,
  }) => {
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );
    const header = page.locator("[data-teaching-article] > header");
    const body = page.locator("[data-teaching-content]");
    await expect(header).toBeVisible();
    const titleBox = (await header.boundingBox())!;
    const bodyBox = (await body.boundingBox())!;
    expect(Math.abs(titleBox.x - bodyBox.x)).toBeLessThanOrEqual(2);
    expect(titleBox.width).toBeLessThanOrEqual(800);
    const practice = page
      .locator("[data-teaching-toc]")
      .getByRole("link", { name: /随堂练习/ });
    await practice.click();
    await expect(
      page.getByRole("heading", { name: "现在，换你试一试" }),
    ).toBeFocused();
  });
});
