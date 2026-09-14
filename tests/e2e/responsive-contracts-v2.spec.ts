import { expect, test } from "@playwright/test";

import { deterministicDemo } from "./support";

const routes = [
  "/today",
  "/essays",
  "/write?cycle=cycle-demo",
  "/rewrite?cycle=cycle-demo&task=task-demo",
  "/feedback?cycle=cycle-demo",
  "/compare?cycle=cycle-demo",
  "/transfer?cycle=cycle-demo&task=transfer-task",
  "/growth",
  "/settings",
  "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
  "/lesson/paper?cycle=cycle-demo&lesson=lesson-collocation-perspective",
] as const;

const viewports = [
  { height: 844, width: 320 },
  { height: 844, width: 390 },
  { height: 900, width: 720 },
  { height: 900, width: 760 },
  { height: 900, width: 768 },
  { height: 900, width: 1024 },
  { height: 900, width: 1280 },
] as const;

test.describe("responsive layout contract", () => {
  test.skip(!deterministicDemo, "Requires the isolated demo preview.");
  test.describe.configure({ mode: "serial" });

  for (const route of routes) {
    test(`${route} stays inside the viewport at common zoom widths`, async ({
      page,
    }) => {
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.goto(route);
        await expect(
          page.locator("[data-app-shell], .setup-shell").first(),
        ).toBeVisible();
        await page.waitForTimeout(100);
        const overflow = await page.evaluate(() => {
          const offenders = [...document.querySelectorAll("body *")]
            .map((element) => ({
              element,
              rect: element.getBoundingClientRect(),
            }))
            .filter(
              ({ rect }) =>
                rect.width > 0 &&
                (rect.right > window.innerWidth + 1 || rect.left < -1),
            )
            .slice(0, 5)
            .map(({ element, rect }) => ({
              className: String(element.className || "").slice(0, 80),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              tag: element.tagName.toLowerCase(),
            }));
          return {
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            overflow: offenders,
          };
        });
        expect(
          overflow.documentWidth,
          `${route} at ${viewport.width}px`,
        ).toBeLessThanOrEqual(overflow.viewportWidth);
        const actionableOverflow = await page.evaluate(() =>
          [...document.querySelectorAll("a, button, input, textarea, select")]
            .filter((element) => {
              const style = window.getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                rect.width > 0 &&
                rect.height > 0 &&
                (rect.left < -1 || rect.right > window.innerWidth + 1)
              );
            })
            .map((element) => ({
              label:
                element.getAttribute("aria-label") ||
                element.textContent?.trim().slice(0, 60) ||
                element.tagName.toLowerCase(),
              left: Math.round(element.getBoundingClientRect().left),
              right: Math.round(element.getBoundingClientRect().right),
            })),
        );
        expect(
          actionableOverflow,
          `${route} at ${viewport.width}px actionable controls`,
        ).toEqual([]);
        const clippedLabels = await page.evaluate(() =>
          [...document.querySelectorAll("a, button, h1, h2, h3, p")]
            .filter((element) => {
              const style = window.getComputedStyle(element);
              return (
                !element.closest(".sr-only, [aria-hidden='true'], [hidden]") &&
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                element.scrollWidth > element.clientWidth + 1 &&
                (style.overflow === "hidden" ||
                  style.textOverflow === "ellipsis" ||
                  style.whiteSpace === "nowrap")
              );
            })
            .map((element) => ({
              label: element.textContent?.trim().slice(0, 60),
              tag: element.tagName.toLowerCase(),
              width: element.clientWidth,
              scrollWidth: element.scrollWidth,
            }))
            .filter(({ label }) => Boolean(label)),
        );
        expect(
          clippedLabels,
          `${route} at ${viewport.width}px clipped labels`,
        ).toEqual([]);
      }
    });
  }

  test("wide reading pages expand without becoming a fixed narrow column", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/growth");
    const width = await page
      .locator("main[data-page-layout='reading']")
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(width).toBeGreaterThanOrEqual(1300);
    expect(width).toBeLessThanOrEqual(1920);
  });

  test("wide focus pages expand while keeping readable side margins", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/today");
    const width = await page
      .locator("main[data-page-layout='focus']")
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(width).toBeGreaterThanOrEqual(1300);
    expect(width).toBeLessThanOrEqual(1920);
  });
});
