import { expect, test } from "@playwright/test";

import { deterministicDemo } from "./support";

test.describe("OpenAI monochrome workspace surfaces", () => {
  test.skip(!deterministicDemo, "Requires the isolated demo preview.");

  for (const route of [
    "/rewrite?cycle=cycle-demo&task=task-demo",
    "/compare?cycle=cycle-demo",
    "/growth",
    "/account",
  ]) {
    test(`${route} uses the shared monochrome shell`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("[data-app-shell]")).toHaveCSS(
        "background-color",
        "rgb(247, 247, 247)",
      );
      await expect(page.locator(".topbar")).toHaveCSS(
        "background-color",
        "rgb(255, 255, 255)",
      );
    });
  }
});
