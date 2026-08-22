import { expect, test, type Locator } from "@playwright/test";

import {
  deterministicDemo,
  expectNoHorizontalOverflow,
  expectPageLayout,
  resetDemoState,
} from "./support";

const routeMatrix = [
  ["/today", "focus"],
  ["/essays", "focus"],
  ["/write?cycle=cycle-demo", "workspace"],
  ["/feedback?cycle=cycle-demo", "workspace"],
  ["/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective", "reading"],
  [
    "/lesson/paper?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    "workspace",
  ],
] as const;

async function expectFontSizeAtLeast(
  locator: Locator,
  minimumPixels: number,
): Promise<void> {
  await expect(locator).toBeAttached();
  const fontSize = await locator.evaluate((element) =>
    Number.parseFloat(window.getComputedStyle(element).fontSize),
  );
  expect(fontSize).toBeGreaterThanOrEqual(minimumPixels);
}

test.describe("annotation desk redesign contracts", () => {
  test.skip(
    !deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=true and a demo-mode web server.",
  );

  test.beforeEach(async ({ page }) => resetDemoState(page));

  test("declares the annotation desk design system", async ({ page }) => {
    await page.goto("/today");
    await expect(page.locator("[data-app-shell]")).toHaveAttribute(
      "data-design-system",
      "annotation-desk-v1",
    );
    await expect(page.locator("main")).toHaveAttribute(
      "data-page-layout",
      "focus",
    );
  });

  test("entry pages expose their page-layout contract", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.locator("main")).toHaveAttribute(
      "data-page-layout",
      "entry",
    );
  });

  test("Today composes the focus layout as a writing desk", async ({
    page,
  }) => {
    await page.goto("/today");

    const desk = page.locator('[data-today-desk="focus"]');
    await expect(desk).toBeVisible();
    await expect(desk.locator(".next-task-card")).toHaveCount(1);
    await expect(desk.locator("[data-today-learning-thread]")).toBeVisible();
    await expect(desk.locator("[data-today-evidence]")).toBeVisible();
  });

  test("writing desk reserves the prompt paper beside the editor", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/write?cycle=cycle-demo");

    const room = page.locator('[data-writing-mode="first"]');
    const prompt = room.locator(".writing-prompt");
    const editor = room.locator(".writing-editor");
    await expect(room).toBeVisible();
    await expect(prompt).toBeVisible();
    await expect(editor).toBeVisible();

    const [roomBox, promptBox, editorBox] = await Promise.all([
      room.boundingBox(),
      prompt.boundingBox(),
      editor.boundingBox(),
    ]);
    expect(roomBox).not.toBeNull();
    expect(promptBox).not.toBeNull();
    expect(editorBox).not.toBeNull();
    expect(promptBox!.width / roomBox!.width).toBeGreaterThanOrEqual(0.36);
    expect(promptBox!.width / roomBox!.width).toBeLessThanOrEqual(0.4);
    expect(editorBox!.width / roomBox!.width).toBeGreaterThanOrEqual(0.6);
    expect(editorBox!.width / roomBox!.width).toBeLessThanOrEqual(0.64);
  });

  for (const viewport of [
    { label: "desktop", width: 1440, height: 960 },
    { label: "390px mobile", width: 390, height: 844 },
  ]) {
    test(`writing auxiliary text stays at least 12px on ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto(
        "/rewrite?cycle=cycle-demo&task=rewrite-primary-language",
      );

      const rule = page.getByText("构思、写作和检查均计入 40 分钟");
      const save = page.getByText("已自动保存", { exact: true });
      const shortcut = page.getByText(/快捷键：/);
      const finalFive = page.getByText(
        "为保留闭卷证据，剩余 5 分钟时才会显示。",
      );

      await expect(rule).toBeVisible();
      await expect(shortcut).toBeVisible();
      await expect(finalFive).toBeVisible();
      for (const auxiliaryText of [rule, save, shortcut, finalFive]) {
        await expectFontSizeAtLeast(auxiliaryText, 12);
      }
    });
  }

  test("writing states use annotation tokens instead of success or violet decoration", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/rewrite?cycle=cycle-demo&task=rewrite-primary-language");

    await expect(page.getByText("已自动保存", { exact: true })).toHaveCSS(
      "color",
      "rgb(23, 32, 51)",
    );
    await expect(
      page.getByText("Version 2 · 闭卷重写", { exact: true }),
    ).toHaveCSS("color", "rgb(29, 86, 160)");
    await expect(page.locator(".writing-prompt")).toHaveCSS(
      "background-image",
      "none",
    );
    await expect(page.locator(".writing-editor")).toHaveCSS(
      "background-color",
      "rgb(252, 251, 248)",
    );

    await page.goto("/write?cycle=cycle-demo");
    await page
      .getByRole("textbox", { name: "你的作文" })
      .fill(
        Array.from({ length: 250 }, (_, index) => `word${index}`).join(" "),
      );
    await expect(page.getByText("250 词", { exact: true })).toHaveCSS(
      "color",
      "rgb(29, 86, 160)",
    );
  });

  test("feedback evidence and manuscript stay readable in the workspace", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(
      "/feedback?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );

    const essay = page.locator("[data-feedback-essay]");
    const manuscriptMetrics = await essay.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
      };
    });
    expect(manuscriptMetrics.fontSize).toBeGreaterThanOrEqual(17);
    expect(
      manuscriptMetrics.lineHeight / manuscriptMetrics.fontSize,
    ).toBeGreaterThanOrEqual(1.9);

    await expectFontSizeAtLeast(
      page.getByText("需要改正", { exact: true }).first(),
      13,
    );
    const evidence = page
      .locator('[data-feedback-evidence][aria-hidden="true"]')
      .first();
    await expect(evidence).toBeVisible();
    await expect(
      evidence.locator('[data-evidence-state="revision"]'),
    ).toBeVisible();
    const evidenceLabelMetrics = await evidence
      .getByText("修改建议", { exact: true })
      .evaluate((element) => {
        const style = window.getComputedStyle(element);
        return {
          height: element.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(style.lineHeight),
        };
      });
    expect(evidenceLabelMetrics.height).toBeLessThanOrEqual(
      evidenceLabelMetrics.lineHeight * 1.1,
    );
  });

  for (const viewport of [
    { label: "desktop", width: 1440, height: 960 },
    { label: "390px mobile", width: 390, height: 844 },
  ]) {
    test(`teaching prose and auxiliary labels stay readable on ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto(
        "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
      );

      const prose = page.locator("[data-teaching-prose]").first();
      const proseMetrics = await prose.evaluate((element) => {
        const style = window.getComputedStyle(element);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          lineHeight: Number.parseFloat(style.lineHeight),
        };
      });
      expect(proseMetrics.fontSize).toBeGreaterThanOrEqual(17);
      expect(
        proseMetrics.lineHeight / proseMetrics.fontSize,
      ).toBeGreaterThanOrEqual(1.8);

      const articleMeta = page.getByText("专项能力教程", { exact: true });
      await expectFontSizeAtLeast(articleMeta, 12);

      if (viewport.width < 720) {
        await expectFontSizeAtLeast(
          page.locator("[data-teaching-toc-toggle]"),
          12,
        );
      } else {
        await expectFontSizeAtLeast(
          page.locator("[data-teaching-toc] > p"),
          12,
        );
      }
    });
  }

  for (const viewport of [
    { label: "desktop", width: 1440, height: 960 },
    { label: "390px mobile", width: 390, height: 844 },
  ]) {
    test(`feedback eyebrows and badges stay at least 12px on ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto(
        "/feedback?cycle=cycle-demo&lesson=lesson-collocation-perspective",
      );

      const pageHeaderEyebrow = page.getByText("第1步 · 详细批改与改正", {
        exact: true,
      });
      const internalEyebrow = page.getByText("本篇诊断", { exact: true });
      const trustBadge = page.getByText("示例报告 · 未评价语言", {
        exact: true,
      });
      const modelLockBadge = page.getByText("Version 2 后开放", {
        exact: true,
      });

      for (const auxiliaryText of [
        pageHeaderEyebrow,
        internalEyebrow,
        trustBadge,
        modelLockBadge,
      ]) {
        await expectFontSizeAtLeast(auxiliaryText, 12);
      }
    });
  }

  for (const [route, layout] of routeMatrix) {
    test(`${route} uses ${layout}`, async ({ page }) => {
      await page.goto(route);
      await expectPageLayout(page, layout);
    });
  }

  for (const [route] of routeMatrix) {
    test(`${route} has no horizontal overflow at 390×844`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route);
      await expectNoHorizontalOverflow(page);
    });
  }
});
