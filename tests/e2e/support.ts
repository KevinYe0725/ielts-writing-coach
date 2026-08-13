import { expect, type Page } from "@playwright/test";

export const deterministicDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export async function resetDemoState(page: Page): Promise<void> {
  // Clear once, before the test starts. A persistent addInitScript would run on
  // every reload and erase the deliberately injected recovery draft.
  await page.goto("/api/v1/health/live");
  await page.evaluate(async () => {
    window.localStorage.clear();
    for (const database of [
      "ielts-writing-coach",
      "ielts-writing-coach-lessons",
    ]) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("IndexedDB reset blocked"));
      });
    }
  });
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
