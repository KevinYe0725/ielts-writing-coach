import { expect, test } from "@playwright/test";

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
