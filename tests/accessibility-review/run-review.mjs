import AxeBuilder from "@axe-core/playwright";
import { chromium, devices, firefox, webkit } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3217";
const routes = [
  "/setup",
  "/today",
  "/write",
  "/lesson",
  "/rewrite",
  "/settings",
];
const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const targets = [
  {
    name: "chromium",
    launcher: chromium,
    context: { viewport: { width: 1280, height: 900 } },
  },
  {
    name: "firefox",
    launcher: firefox,
    context: { viewport: { width: 1280, height: 900 } },
  },
  {
    name: "webkit",
    launcher: webkit,
    context: { viewport: { width: 1280, height: 900 } },
  },
  {
    name: "mobile-webkit-iphone-14-emulation",
    launcher: webkit,
    context: { ...devices["iPhone 14"] },
  },
];

async function openReady(page, route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1").waitFor({ state: "visible" });
  // The demo client deliberately resolves data asynchronously. Waiting for the
  // stable heading plus one short quiet period avoids scanning the loading shell.
  await page.waitForTimeout(250);
}

async function semanticSnapshot(page) {
  return page.evaluate(() => {
    const hidden = (element) => {
      const style = getComputedStyle(element);
      return style.display === "none" || style.visibility === "hidden";
    };
    const ids = [...document.querySelectorAll("[id]")].map(
      (element) => element.id,
    );
    return {
      lang: document.documentElement.lang,
      mainElements: [...document.querySelectorAll("main")].map((element) => ({
        id: element.id,
        className: element.className,
      })),
      h1Count: document.querySelectorAll("h1").length,
      skipLinkCount: document.querySelectorAll('a[href="#main-content"]')
        .length,
      duplicateIds: [
        ...new Set(ids.filter((id, index) => ids.indexOf(id) !== index)),
      ],
      unnamedButtons: [...document.querySelectorAll("button")]
        .filter((element) => !hidden(element))
        .filter(
          (element) =>
            !element.textContent?.trim() &&
            !element.getAttribute("aria-label") &&
            !element.getAttribute("aria-labelledby"),
        ).length,
      unlabelledFields: [
        ...document.querySelectorAll("input, select, textarea"),
      ]
        .filter((element) => !hidden(element))
        .filter(
          (element) =>
            element.labels?.length === 0 &&
            !element.getAttribute("aria-label") &&
            !element.getAttribute("aria-labelledby"),
        ).length,
    };
  });
}

async function keyboardReview(page, targetName) {
  const result = { target: targetName, checks: [] };

  await openReady(page, "/setup");
  await page.keyboard.press(targetName === "webkit" ? "Alt+Tab" : "Tab");
  const skipFocused = await page
    .locator('a[href="#main-content"]')
    .evaluate((element) => element === document.activeElement);
  await page.keyboard.press("Enter");
  const setupMainFocused = await page
    .getByRole("main")
    .evaluate((element) => element === document.activeElement);
  result.checks.push({
    name: "setup-skip-link",
    pass: skipFocused && setupMainFocused,
  });

  await openReady(page, "/write");
  const editor = page.getByRole("textbox", { name: "你的作文" });
  await editor.fill(`${"independent writing ".repeat(24)}ends here.`);
  const submit = page.getByRole("button", { name: "提交作文" });
  await submit.click();
  const submitDialog = page.getByRole("dialog", { name: "确认提交这份版本？" });
  await submitDialog.waitFor({ state: "visible" });
  await page.waitForTimeout(50);
  const keepChecking = page.getByRole("button", { name: "继续检查" });
  const submitNow = page.getByRole("button", { name: "确认提交" });
  const writeInitial = await keepChecking.evaluate(
    (element) => element === document.activeElement,
  );
  await page.keyboard.press("Shift+Tab");
  const writeReverseWrap = await submitNow.evaluate(
    (element) => element === document.activeElement,
  );
  await page.keyboard.press("Escape");
  await submitDialog.waitFor({ state: "hidden" });
  await page.waitForTimeout(50);
  const writeRestore = await submit.evaluate(
    (element) => element === document.activeElement,
  );
  result.checks.push({
    name: "write-dialog-focus-contract",
    pass: writeInitial && writeReverseWrap && writeRestore,
  });

  await openReady(page, "/lesson");
  const pause = page.getByRole("button", { name: "暂停" });
  await pause.click();
  const pauseDialog = page.getByRole("dialog", { name: "需要离开一下？" });
  await pauseDialog.waitFor({ state: "visible" });
  await page.waitForTimeout(50);
  const continueLesson = page.getByRole("button", { name: "继续当前练习" });
  const returnToToday = page.getByRole("button", {
    name: "保存并返回今日计划",
  });
  const lessonInitial = await continueLesson.evaluate(
    (element) => element === document.activeElement,
  );
  await page.keyboard.press("Shift+Tab");
  const lessonReverseWrap = await returnToToday.evaluate(
    (element) => element === document.activeElement,
  );
  await page.keyboard.press("Escape");
  await pauseDialog.waitFor({ state: "hidden" });
  await page.waitForTimeout(50);
  const lessonRestore = await pause.evaluate(
    (element) => element === document.activeElement,
  );
  result.checks.push({
    name: "lesson-dialog-focus-contract",
    pass: lessonInitial && lessonReverseWrap && lessonRestore,
  });

  await openReady(page, "/settings");
  await page.getByRole("button", { name: "数据与隐私" }).click();
  const deleteInvoker = page.getByRole("button", { name: "删除…" });
  await deleteInvoker.click();
  const deleteDialog = page.getByRole("dialog", {
    name: "永久删除学习数据？",
  });
  await deleteDialog.waitFor({ state: "visible" });
  await page.waitForTimeout(50);
  const confirmation = page.locator("#delete-learning-data-confirmation");
  const cancelDelete = page.getByRole("button", { name: "取消" });
  const deleteInitial = await confirmation.evaluate(
    (element) => element === document.activeElement,
  );
  await page.keyboard.press("Shift+Tab");
  const deleteReverseWrap = await cancelDelete.evaluate(
    (element) => element === document.activeElement,
  );
  const forwardTab = targetName === "webkit" ? "Alt+Tab" : "Tab";
  await page.keyboard.press(forwardTab);
  await page.keyboard.press(forwardTab);
  await page.keyboard.press(forwardTab);
  const deleteForwardWrap = await confirmation.evaluate(
    (element) => element === document.activeElement,
  );
  await page.keyboard.press("Escape");
  await deleteDialog.waitFor({ state: "hidden" });
  await page.waitForTimeout(50);
  const deleteRestore = await deleteInvoker.evaluate(
    (element) => element === document.activeElement,
  );
  result.checks.push({
    name: "settings-delete-dialog-focus-contract",
    pass:
      deleteInitial && deleteReverseWrap && deleteForwardWrap && deleteRestore,
  });

  return result;
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  scans: [],
  keyboard: [],
  cdpAccessibilityTrees: [],
  reflow: [],
  reducedMotion: null,
  blockingFindings: [],
};

for (const target of targets) {
  const browser = await target.launcher.launch();
  try {
    const context = await browser.newContext(target.context);
    const page = await context.newPage();
    for (const route of routes) {
      await openReady(page, route);
      const semantics = await semanticSnapshot(page);
      const mainRoleCount = await page.getByRole("main").count();
      const axe = await new AxeBuilder({ page }).withTags(axeTags).analyze();
      const result = {
        target: target.name,
        route,
        mainRoleCount,
        semantics,
        axeViolations: axe.violations.map(({ id, impact, nodes, tags }) => ({
          id,
          impact,
          nodeCount: nodes.length,
          tags,
        })),
        axeIncomplete: axe.incomplete.map(({ id, impact, nodes }) => ({
          id,
          impact,
          nodeCount: nodes.length,
        })),
      };
      report.scans.push(result);
      if (
        mainRoleCount !== 1 ||
        semantics.h1Count !== 1 ||
        semantics.skipLinkCount !== 1 ||
        semantics.duplicateIds.length > 0 ||
        semantics.unnamedButtons > 0 ||
        semantics.unlabelledFields > 0 ||
        result.axeViolations.length > 0
      ) {
        report.blockingFindings.push({
          kind: "semantic-or-axe",
          target: target.name,
          route,
        });
      }
    }
    if (target.name !== "mobile-webkit-iphone-14-emulation") {
      const keyboard = await keyboardReview(page, target.name);
      report.keyboard.push(keyboard);
      for (const check of keyboard.checks.filter((item) => !item.pass)) {
        report.blockingFindings.push({
          kind: "keyboard-focus-contract",
          target: target.name,
          check: check.name,
        });
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Accessibility.enable");
  for (const route of routes) {
    await openReady(page, route);
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const controls = new Set([
      "button",
      "checkbox",
      "combobox",
      "link",
      "switch",
      "textbox",
    ]);
    const nodeRole = (node) => node.role?.value ?? "";
    const nodeName = (node) => node.name?.value?.trim() ?? "";
    report.cdpAccessibilityTrees.push({
      route,
      nodeCount: nodes.length,
      mainLandmarks: nodes
        .filter((node) => nodeRole(node) === "main")
        .map(nodeName),
      statusCount: nodes.filter((node) => nodeRole(node) === "status").length,
      unnamedControls: nodes
        .filter((node) => controls.has(nodeRole(node)) && !nodeName(node))
        .map((node) => ({ role: nodeRole(node), nodeId: node.nodeId })),
    });
  }
  for (const width of [640, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/setup",
      "/write",
      "/lesson",
      "/rewrite",
      "/settings",
    ]) {
      await openReady(page, route);
      const metrics = await page.evaluate(() => ({
        innerWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.scrollingElement?.scrollWidth ?? 0,
        scrollbarGutter: innerWidth - document.documentElement.clientWidth,
        horizontalOverflow:
          (document.scrollingElement?.scrollWidth ?? 0) - innerWidth,
      }));
      report.reflow.push({ width, route, ...metrics });
      if (width === 320 && metrics.horizontalOverflow > 1) {
        report.blockingFindings.push({
          kind: "400-percent-equivalent-horizontal-overflow",
          route,
          pixels: metrics.horizontalOverflow,
        });
      }
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openReady(page, "/lesson");
  report.reducedMotion = await page.evaluate(() => ({
    mediaMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
    nonTrivialVisibleMotion: [...document.querySelectorAll("*")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const duration = [
          ...style.animationDuration.split(","),
          ...style.transitionDuration.split(","),
        ].some((value) => Number.parseFloat(value) > 0.02);
        return duration && rect.width > 0 && rect.height > 0;
      })
      .map((element) => ({
        tag: element.tagName,
        className: String(element.className),
      }))
      .slice(0, 20),
  }));
  await context.close();
} finally {
  await browser.close();
}

const output =
  process.env.IWC_A11Y_SUMMARY === "true"
    ? {
        generatedAt: report.generatedAt,
        baseUrl: report.baseUrl,
        scanCount: report.scans.length,
        axeViolationCount: report.scans.reduce(
          (total, scan) => total + scan.axeViolations.length,
          0,
        ),
        axeIncomplete: report.scans.flatMap((scan) =>
          scan.axeIncomplete.map((item) => ({
            target: scan.target,
            route: scan.route,
            ...item,
          })),
        ),
        keyboard: report.keyboard,
        reducedMotion: report.reducedMotion,
        blockingFindings: report.blockingFindings,
      }
    : report;
console.log(JSON.stringify(output, null, 2));
if (report.blockingFindings.length > 0) process.exitCode = 1;
