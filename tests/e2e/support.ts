import { expect, type Locator, type Page } from "@playwright/test";

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

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const size = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.client);
}

export async function expectVisibleTextFloor(
  root: Locator,
  state: string,
  minimumPixels = 12,
): Promise<void> {
  await expect(root, `${state}: root must be visible`).toBeVisible();
  const report = await root.evaluate((container, minimum) => {
    const visible = (element: Element) => {
      if (
        element.closest(
          "[aria-hidden='true'], .sr-only, input[type='hidden'], svg, [hidden]",
        )
      )
        return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity || "1") > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const candidates = [container, ...container.querySelectorAll("*")];
    const covered: Array<{
      fontSize: number;
      selector: string;
      text: string;
    }> = [];

    for (const element of candidates) {
      if (!visible(element)) continue;
      const explicitTextControl = element.matches(
        "a, button, label, input, select, textarea, output, small, time, summary, .badge, [role='tab'], [role='status'], [role='progressbar']",
      );
      const ownText = Array.from(element.childNodes).some(
        (node) =>
          node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
      );
      const hasVisibleTextChild = Array.from(element.children).some(
        (child) => visible(child) && Boolean(child.textContent?.trim()),
      );
      if (!explicitTextControl && (!ownText || hasVisibleTextChild)) continue;

      const field = element as HTMLInputElement;
      const text =
        field.labels?.[0]?.textContent?.trim() ||
        element.getAttribute("aria-label") ||
        field.placeholder ||
        element.textContent?.trim() ||
        element.tagName.toLowerCase();
      if (!text) continue;
      covered.push({
        fontSize: Number.parseFloat(window.getComputedStyle(element).fontSize),
        selector: `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).trim().replace(/\s+/g, ".")}` : ""}`,
        text: text.slice(0, 100),
      });
    }

    return {
      covered: covered.length,
      violations: covered.filter(
        ({ fontSize }) => !Number.isFinite(fontSize) || fontSize < minimum,
      ),
    };
  }, minimumPixels);

  expect(
    report.covered,
    `${state}: visible text/control coverage`,
  ).toBeGreaterThan(0);
  expect(
    report.violations,
    `${state}: ${JSON.stringify(report.violations, null, 2)}`,
  ).toEqual([]);
}

export async function expectPageLayout(
  page: Page,
  variant: "focus" | "workspace" | "reading",
): Promise<void> {
  await expect(page.locator("main")).toHaveAttribute(
    "data-page-layout",
    variant,
  );
}
