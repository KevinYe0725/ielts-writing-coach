import { expect, type Page } from "@playwright/test";

export const deterministicDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export async function resetDemoState(page: Page): Promise<void> {
  // Playwright creates a fresh, isolated browser context for every test, so its
  // localStorage and IndexedDB are already empty. Keep cookie cleanup defensive,
  // but do not make every test compete for an otherwise unnecessary HTTP page.
  await page.context().clearCookies();
}

export async function expectBasicAccessibility(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", /^(zh-CN|en)$/);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator('a[href="#main-content"]')).toHaveCount(1);

  const violations = await page.evaluate(() => {
    const invisible = (element: Element) => {
      const style = window.getComputedStyle(element);
      return style.display === "none" || style.visibility === "hidden";
    };
    const unnamedButtons = [...document.querySelectorAll("button")]
      .filter((button) => !invisible(button))
      .filter(
        (button) =>
          !button.textContent?.trim() &&
          !button.getAttribute("aria-label") &&
          !button.getAttribute("aria-labelledby"),
      ).length;
    const unlabelledFields = [
      ...document.querySelectorAll("input, select, textarea"),
    ]
      .filter((field) => !invisible(field))
      .filter((field) => {
        const control = field as HTMLInputElement;
        return (
          control.labels?.length === 0 &&
          !field.getAttribute("aria-label") &&
          !field.getAttribute("aria-labelledby")
        );
      }).length;
    const ids = [...document.querySelectorAll("[id]")].map(
      (element) => element.id,
    );
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    return { duplicateIds, unlabelledFields, unnamedButtons };
  });

  expect(violations).toEqual({
    duplicateIds: [],
    unlabelledFields: 0,
    unnamedButtons: 0,
  });
}
