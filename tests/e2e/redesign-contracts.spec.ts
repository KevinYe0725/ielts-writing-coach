import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  deterministicDemo,
  expectBasicAccessibility,
  expectNoHorizontalOverflow,
  expectPageLayout,
  expectVisibleTextFloor,
  resetDemoState,
} from "./support";

const routeMatrix = [
  ["/today", "focus"],
  ["/essays", "focus"],
  ["/write?cycle=cycle-demo", "workspace"],
  ["/feedback?cycle=cycle-demo", "workspace"],
  ["/compare?cycle=cycle-demo", "workspace"],
  ["/transfer?cycle=cycle-demo&task=transfer-task", "workspace"],
  ["/growth", "reading"],
  ["/admin", "focus"],
  ["/admin/backup", "focus"],
  ["/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective", "reading"],
  [
    "/lesson/paper?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    "workspace",
  ],
] as const;

const visibleTextMatrix = [
  ["Shell", "/today", "[data-app-shell]"],
  ["Today", "/today", "[data-today-desk='focus']"],
  [
    "Compare",
    "/compare?cycle=cycle-demo",
    "[data-evidence-record='comparison']",
  ],
  ["Growth", "/growth", "[data-evidence-record='growth']"],
  [
    "Paper",
    "/lesson/paper?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    "[data-paper-sheet]",
  ],
  ["Feedback", "/feedback?cycle=cycle-demo", "[data-feedback-workbench]"],
  ["Entry", "/signin", "[data-entry-surface='signin']"],
  ["Settings", "/settings", "[data-settings-desk='focus']"],
  [
    "Lesson",
    "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    "[data-teaching-article]",
  ],
  [
    "Transfer",
    "/transfer?cycle=cycle-demo&task=transfer-task",
    "[data-evidence-record='transfer']",
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

async function expectComputedStyles(
  locator: Locator,
  expectedStyles: Record<string, string>,
): Promise<void> {
  await expect(locator).toBeAttached();
  await expect
    .poll(() =>
      locator.evaluate((element, properties) => {
        const style = window.getComputedStyle(element);
        return Object.fromEntries(
          Object.keys(properties).map((property) => [
            property,
            style.getPropertyValue(property),
          ]),
        );
      }, expectedStyles),
    )
    .toEqual(expectedStyles);
}

async function expectColorUsesToken(
  locator: Locator,
  token: "--desk-blue",
): Promise<void> {
  const colors = await locator.evaluate((element, cssToken) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${cssToken})`;
    element.ownerDocument.body.append(probe);
    const expected = window.getComputedStyle(probe).color;
    probe.remove();
    return { actual: window.getComputedStyle(element).color, expected };
  }, token);
  expect(colors.actual).toBe(colors.expected);
}

async function expectNoErrorToken(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const colors = await locator.evaluate((element) => {
    const probe = document.createElement("span");
    element.ownerDocument.body.append(probe);
    const resolveBackground = (value: string) => {
      probe.style.background = value;
      return window.getComputedStyle(probe).backgroundColor;
    };
    const style = window.getComputedStyle(element);
    const result = {
      actualBackground: style.backgroundColor,
      actualImage: style.backgroundImage,
      error: resolveBackground("var(--desk-error)"),
      errorLine: resolveBackground(
        "color-mix(in srgb, var(--desk-error) 18%, transparent)",
      ),
      errorSoft: resolveBackground("var(--desk-error-soft)"),
    };
    probe.remove();
    return result;
  });

  expect(colors.actualBackground).not.toBe(colors.error);
  expect(colors.actualBackground).not.toBe(colors.errorSoft);
  expect(colors.actualImage).not.toContain(colors.error);
  expect(colors.actualImage).not.toContain(colors.errorLine);
  expect(colors.actualImage).not.toContain(colors.errorSoft);
}

async function switchToEnglish(page: Page): Promise<void> {
  if ((await page.locator("html").getAttribute("lang")) !== "en") {
    const switcher = page.locator(
      (page.viewportSize()?.width ?? 1280) <= 960
        ? ".mobile-header .locale-switch"
        : ".topbar .locale-switch",
    );
    await expect(switcher).toBeVisible();
    await expect(switcher).toHaveAccessibleName("切换到英文界面");
    await switcher.click();
  }
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
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

  test("final review semantics: Version 1 comparison never uses Error decoration", async ({
    page,
  }) => {
    await page.goto("/compare?cycle=cycle-demo");

    await expectNoErrorToken(page.locator(".sentence-before").first());
  });

  test("final review semantics: Entry desk decoration never uses Error red", async ({
    page,
  }) => {
    await page.goto("/signin");

    await expectNoErrorToken(page.locator(".setup-shell"));
  });

  test("final review semantics: English Demo keeps every canonical Growth level name", async ({
    page,
  }) => {
    await page.goto("/growth");
    await expect(page.locator('[data-evidence-record="growth"]')).toBeVisible();
    await switchToEnglish(page);

    for (const [state, label] of [
      ["diagnosed", "Diagnosed"],
      ["practicing", "Practising"],
      ["applied", "Applied"],
      ["retained", "Retained"],
      ["transferred", "Transferred"],
    ] as const) {
      const level = page.locator(`[data-growth-level="${state}"]`);
      await expect(level.getByText(label, { exact: true })).toBeVisible();
      await expect(level).toContainText("not evaluated");
    }
  });

  for (const viewport of [
    { label: "desktop", width: 1440, height: 960 },
    { label: "390px", width: 390, height: 844 },
  ]) {
    test(`all learner-visible auxiliary text meets the 12px floor at ${viewport.label}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);

      for (const [surface, route, selector] of visibleTextMatrix) {
        await page.goto(route);
        const root = page.locator(selector);
        await expect(root, `${surface} ready state`).toBeVisible();
        await expectVisibleTextFloor(root, `${surface} at ${viewport.label}`);
      }
    });
  }

  test("keeps frozen hooks attached while modules own their visual surfaces", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/today");
    const mobileHeader = page.locator(".mobile-header");
    const mobileMenu = page.locator(".mobile-menu");
    const nextTask = page.locator(".next-task-card");
    await expect(mobileHeader).toHaveClass(/mobile-header/);
    await expectComputedStyles(mobileHeader, {
      display: "flex",
      position: "sticky",
    });
    await expect(mobileMenu).toHaveClass(/mobile-menu/);
    await expectComputedStyles(mobileMenu, { position: "relative" });
    await expect(nextTask).toHaveClass(/next-task-card/);
    await expectComputedStyles(nextTask, { position: "relative" });

    await page.goto(
      "/lesson/paper?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );
    const paperQuestion = page.locator(".practice-paper-question").first();
    await expect(paperQuestion).toHaveClass(/practice-paper-question/);
    await expectComputedStyles(paperQuestion, {
      "border-radius": "0px",
      "box-shadow": "none",
    });
  });

  test("entry surfaces use the entry layout without leaking one-time tokens", async ({
    page,
  }) => {
    const response = await page.goto("/recover?error=INVALID_TOKEN");

    expect(response?.status()).toBe(200);
    await expect(page.locator("main")).toHaveAttribute(
      "data-page-layout",
      "entry",
    );
    await expect(page.locator("[data-entry-surface='recover']")).toBeVisible();
    await expect(page).toHaveURL(/\/recover$/);
    await expect(page.getByText("恢复链接无效或已过期。")).toBeVisible();
    const storedValues = await page.evaluate(() => [
      ...Object.values(localStorage),
      ...Object.values(sessionStorage),
    ]);
    expect(storedValues.join("\n")).not.toContain("INVALID_TOKEN");
  });

  test("entry pages retain account-mode guidance and state-specific surfaces", async ({
    page,
  }) => {
    await page.goto("/signin");
    await expect(page.locator("[data-entry-surface='signin']")).toBeVisible();
    await expect(
      page.getByText(/个人学习空间会为新邮箱创建账号/),
    ).toBeVisible();
    await expect(page.getByText(/共享空间需要邀请链接/)).toBeVisible();

    await page.goto("/join?token=opaque-entry-token");
    await expect(page.locator("[data-entry-surface='join']")).toBeVisible();
    await expect(page).toHaveURL(/\/join$/);
    await expect(page.getByLabel("姓名")).toBeVisible();
    const joinStorage = await page.evaluate(() => [
      ...Object.values(localStorage),
      ...Object.values(sessionStorage),
    ]);
    expect(joinStorage.join("\n")).not.toContain("opaque-entry-token");
  });

  test("settings keeps technical controls in a visible advanced section", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "AI 服务" }).click();

    const advanced = page.getByRole("group", { name: "高级设置" });
    await expect(advanced).toBeVisible();
    await expect(advanced).toHaveAttribute("open", "");
    await expect(advanced.getByText("供应商", { exact: true })).toBeVisible();
    await expect(advanced.getByText("默认模型", { exact: true })).toBeVisible();
    await expect(advanced.getByText("API Key", { exact: true })).toBeVisible();
    await expect(
      advanced.getByRole("button", { name: "新增或切换 AI 服务" }),
    ).toBeVisible();
    await expect(
      advanced.getByText("按学习步骤选择模型", { exact: true }),
    ).toBeVisible();
    await expect(
      advanced.getByRole("button", { name: /删除当前连接/ }),
    ).toBeVisible();
  });

  test("settings retains every data portability and deletion control", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "数据与隐私" }).click();

    await expect(page.getByLabel("选择交换包")).toBeVisible();
    await expect(page.getByLabel("选择训练轮次")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "下载交换包" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "创建导出" })).toBeVisible();
    await expect(page.getByRole("button", { name: "删除…" })).toBeVisible();
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

  test("Today keeps time and first-draft submission on neutral blue", async ({
    page,
  }) => {
    await page.goto("/today");

    for (const label of ["已记录学习时长", "已提交首稿"]) {
      const icon = page
        .getByText(label, { exact: true })
        .locator("..")
        .locator("..")
        .locator(".stat-icon");
      await expectColorUsesToken(icon, "--desk-blue");
    }
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
    ).toBeGreaterThanOrEqual(1.899);

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

  test("practice paper keeps its focused input above the fixed submit bar at 390px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      "/lesson/paper?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );

    const navigation = page.locator("[data-paper-question-nav]");
    const submitBar = page.locator(".practice-paper-submit");
    await navigation.getByRole("link", { name: "8" }).click();
    const focusedAnswer = page
      .locator("#paper-question-demo-paper-question-8")
      .getByRole("textbox");
    await focusedAnswer.focus();
    await expect(focusedAnswer).toBeFocused();
    await expect(focusedAnswer).toBeInViewport();
    await expect(submitBar).toHaveCSS("position", "fixed");

    await expect
      .poll(async () => {
        const [answerBox, submitBox] = await Promise.all([
          focusedAnswer.boundingBox(),
          submitBar.boundingBox(),
        ]);
        if (!answerBox || !submitBox) return Number.POSITIVE_INFINITY;
        return answerBox.y + answerBox.height - submitBox.y;
      })
      .toBeLessThanOrEqual(0);

    for (const auxiliaryText of [
      page.getByText("8题 · 60分钟", { exact: true }),
      page.getByText(/题已作答/),
      page.getByText(/交卷后才能查看整卷批改/),
      page.locator(".practice-paper-answer > span").first(),
    ]) {
      await expectFontSizeAtLeast(auxiliaryText, 12);
    }
  });

  test("practice paper keeps all mobile question targets below the app header", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      "/lesson/paper?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );

    const mobileHeader = page.locator(".mobile-header");
    const navigation = page.locator("[data-paper-question-nav]");
    const questionEight = page.locator("#paper-question-demo-paper-question-8");
    const links = navigation.getByRole("link");
    await navigation.getByRole("link", { name: "8" }).click();
    await expect(questionEight).toBeFocused();

    await expect
      .poll(async () => {
        const [navigationRect, questionRect] = await Promise.all([
          navigation.boundingBox(),
          questionEight.boundingBox(),
        ]);
        if (!navigationRect || !questionRect) return Number.NEGATIVE_INFINITY;
        return questionRect.y - (navigationRect.y + navigationRect.height);
      })
      .toBeGreaterThanOrEqual(8);

    const focusedAnswer = questionEight.getByRole("textbox");
    await focusedAnswer.focus();
    await expect(focusedAnswer).toBeFocused();
    await expect(focusedAnswer).toBeInViewport();

    await expect
      .poll(async () => {
        const [headerBox, navigationBox] = await Promise.all([
          mobileHeader.boundingBox(),
          navigation.boundingBox(),
        ]);
        if (!headerBox || !navigationBox) return Number.NEGATIVE_INFINITY;
        return navigationBox.y - (headerBox.y + headerBox.height);
      })
      .toBeGreaterThanOrEqual(8);

    const navigationBox = await navigation.boundingBox();
    expect(navigationBox).not.toBeNull();
    await expect(links).toHaveCount(8);
    for (let index = 0; index < 8; index += 1) {
      const target = links.nth(index);
      await expect(target).toBeInViewport();
      const targetBox = await target.boundingBox();
      expect(targetBox).not.toBeNull();
      expect(targetBox!.height).toBeGreaterThanOrEqual(39.5);
      expect(targetBox!.y).toBeGreaterThanOrEqual(navigationBox!.y);
      expect(targetBox!.y + targetBox!.height).toBeLessThanOrEqual(
        navigationBox!.y + navigationBox!.height,
      );
    }
  });

  test("practice paper keeps its desktop question rail below the sticky topbar", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(
      "/lesson/paper?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );

    const topbar = page.locator(".topbar");
    const navigation = page.locator("[data-paper-question-nav]");
    await navigation.getByRole("link", { name: "4" }).click();

    await expect
      .poll(async () => {
        const [topbarBox, navigationBox] = await Promise.all([
          topbar.boundingBox(),
          navigation.boundingBox(),
        ]);
        if (!topbarBox || !navigationBox) return Number.NEGATIVE_INFINITY;
        return navigationBox.y - (topbarBox.y + topbarBox.height);
      })
      .toBeGreaterThanOrEqual(12);
  });

  test("teaching keeps Chinese UI in Noto Sans and reserves Source Serif for English evidence", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );

    const chineseHeading = page.getByRole("heading", {
      name: "别让论证从原因直接跳到结果",
    });
    const chineseProse = page.locator("[data-teaching-prose] p").first();
    const chineseToc = page.locator("[data-teaching-toc] a").first();
    const uiButton = page.locator("[data-teaching-practice-submit]").first();
    const uiTextarea = page
      .locator("[data-teaching-practice] textarea")
      .first();
    const englishExample = page
      .locator('[data-teaching-block="MARKDOWN"] blockquote')
      .first();
    const englishPrompt = page
      .locator("[data-teaching-practice] [lang='en']")
      .first();

    await expect(englishExample).toHaveAttribute("lang", "en");
    for (const chineseText of [
      chineseHeading,
      chineseProse,
      chineseToc,
      uiButton,
      uiTextarea,
    ]) {
      const family = await chineseText.evaluate(
        (element) => window.getComputedStyle(element).fontFamily,
      );
      expect(family).toContain("Noto Sans SC");
      expect(family).not.toContain("Source Serif 4");
    }
    for (const englishText of [englishExample, englishPrompt]) {
      const family = await englishText.evaluate(
        (element) => window.getComputedStyle(element).fontFamily,
      );
      expect(family).toContain("Source Serif 4");
      expect(family).not.toContain("Noto Sans SC");
    }
  });

  test("English locale typography keeps UI roles separate from explicit English evidence", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(
      "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );
    await expect(page.locator("[data-teaching-article]")).toBeVisible();
    await switchToEnglish(page);

    const articleMeta = page.getByText("Focused writing tutorial", {
      exact: true,
    });
    const articleHeading = page.getByRole("heading", {
      name: "Build the missing link in a causal argument",
    });
    const uiButton = page.locator("[data-teaching-practice-submit]").first();
    const englishQuote = page
      .locator('[data-teaching-block="MARKDOWN"] blockquote[lang="en"]')
      .first();
    const englishPrompt = page
      .locator('[data-teaching-practice] p[lang="en"]')
      .first();

    for (const uiText of [articleMeta, articleHeading, uiButton]) {
      const font = await uiText.evaluate((element) => {
        const style = window.getComputedStyle(element);
        return { family: style.fontFamily, weight: style.fontWeight };
      });
      expect(font.family).toContain("Noto Sans SC");
      expect(font.family).not.toContain("Source Serif 4");
      expect(["400", "500", "650", "700"]).toContain(font.weight);
    }

    for (const englishText of [englishQuote, englishPrompt]) {
      const font = await englishText.evaluate((element) => {
        const style = window.getComputedStyle(element);
        return { family: style.fontFamily, weight: style.fontWeight };
      });
      expect(font.family).toContain("Source Serif 4");
      expect(font.family).not.toContain("Noto Sans SC");
      expect(["400", "600"]).toContain(font.weight);
    }
  });

  test("reading shell leaves generic page typography in the body UI family", async ({
    page,
  }) => {
    await page.goto("/growth");

    const main = page.getByRole("main");
    await expect(main).toHaveAttribute("data-page-layout", "reading");
    const family = await main.evaluate(
      (element) => window.getComputedStyle(element).fontFamily,
    );
    expect(family).toContain("Noto Sans SC");
    expect(family).not.toContain("Source Serif 4");
  });

  test("typography authority keeps UI, reading, and utility families distinct", async ({
    page,
  }) => {
    await page.route("**/api/v1/auth/get-session", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          user: { email: "learner@example.com", role: "learner" },
        }),
      });
    });

    await page.goto("/account");
    const accountHeadingFamily = await page
      .getByRole("heading", { name: "账户与安全" })
      .evaluate((element) => window.getComputedStyle(element).fontFamily);
    expect(accountHeadingFamily).toContain("Noto Sans SC");
    expect(accountHeadingFamily).not.toContain("Source Serif 4");

    await page.goto(
      "/feedback?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );
    const manuscriptFamily = await page
      .locator("[data-feedback-essay]")
      .evaluate((element) => window.getComputedStyle(element).fontFamily);
    expect(manuscriptFamily).toContain("Source Serif 4");
    expect(manuscriptFamily).not.toContain("Noto Sans SC");

    const evidenceLabelFamily = await page
      .locator("[data-feedback-evidence] [data-evidence-state]")
      .first()
      .locator(":scope > span")
      .last()
      .evaluate((element) => window.getComputedStyle(element).fontFamily);
    expect(evidenceLabelFamily).toContain("IBM Plex Sans");
  });

  test("growth displays every level without overstating evidence", async ({
    page,
  }) => {
    await page.goto("/growth");

    for (const [status, label, evidenceState] of [
      ["diagnosed", "诊断级别（未评价）", "unavailable"],
      ["practicing", "练习级别（未评价）", "unavailable"],
      ["applied", "应用级别（未评价）", "unavailable"],
      ["retained", "保留级别（未评价）", "unavailable"],
      ["transferred", "迁移级别（未评价）", "unavailable"],
    ] as const) {
      const level = page.locator(`[data-growth-level="${status}"]`);
      await expect(level).toContainText(label);
      await expect(level.locator("[data-evidence-state]")).toHaveAttribute(
        "data-evidence-state",
        evidenceState,
      );
    }
  });

  test("compare keeps the mobile evidence subject readable above its note", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/compare?cycle=cycle-demo");

    const evidence = page
      .locator("[data-evidence-state='unavailable']")
      .first();
    const subject = evidence.getByText("本次证据", { exact: true });
    const note = evidence.getByText(/虚构改写示例/);
    const [subjectBox, noteBox] = await Promise.all([
      subject.boundingBox(),
      note.boundingBox(),
    ]);
    expect(subjectBox).not.toBeNull();
    expect(noteBox).not.toBeNull();
    expect(subjectBox!.width).toBeGreaterThan(50);
    expect(subjectBox!.y).toBeLessThan(noteBox!.y);
  });

  test("growth keeps status evidence on readable lines at 1440px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/growth");

    const table = page.getByRole("table", { name: "能力状态表" });
    const demoStates = table.getByText("未评价", { exact: true });
    await expect(demoStates).toHaveCount(4);
    for (const subject of [demoStates.nth(0), demoStates.nth(1)]) {
      const evidence = subject.locator("..");
      const evidenceLabel = evidence.locator(":scope > span").last();
      const geometry = await Promise.all(
        [subject, evidenceLabel].map((locator) =>
          locator.evaluate((element) => {
            const style = window.getComputedStyle(element);
            const fontSize = Number.parseFloat(style.fontSize);
            const parsedLineHeight = Number.parseFloat(style.lineHeight);
            const lineHeight = Number.isFinite(parsedLineHeight)
              ? parsedLineHeight
              : fontSize * 1.5;
            return {
              height: element.getBoundingClientRect().height,
              lineHeight,
            };
          }),
        ),
      );
      for (const item of geometry) {
        expect(item.height).toBeLessThanOrEqual(item.lineHeight * 1.25);
      }
      const evidenceBox = await evidence.boundingBox();
      expect(evidenceBox).not.toBeNull();
      expect(evidenceBox!.width).toBeGreaterThanOrEqual(170);
    }
  });

  test("growth supporting score suffixes stay at least 12px", async ({
    page,
  }) => {
    await page.goto("/growth");

    const suffixes = page.locator(".growth-stat-grid .card strong small");
    await expect(suffixes.first()).toBeVisible();
    const sizes = await suffixes.evaluateAll((elements) =>
      elements.map((element) =>
        Number.parseFloat(window.getComputedStyle(element).fontSize),
      ),
    );
    expect(sizes.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });

  for (const viewport of [
    { label: "desktop", width: 1440, height: 960 },
    { label: "390px mobile", width: 390, height: 844 },
  ]) {
    test(`evidence records stay legible and overflow-free on ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      for (const route of [
        "/compare?cycle=cycle-demo",
        "/transfer?cycle=cycle-demo&task=transfer-task",
        "/growth",
      ]) {
        await page.goto(route);
        await expect(
          page.locator("[data-evidence-record]").first(),
        ).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await expectBasicAccessibility(page);
        for (const auxiliary of await page
          .locator("[data-evidence-record] [data-auxiliary]")
          .all()) {
          await expectFontSizeAtLeast(auxiliary, 12);
        }
        for (const evidenceLabel of await page
          .locator(
            "[data-evidence-record] span[data-evidence-state] > span:last-child",
          )
          .all()) {
          await expectFontSizeAtLeast(evidenceLabel, 12);
        }
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

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    test(`teaching has no horizontal overflow at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(
        "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
      );
      await expectNoHorizontalOverflow(page);
    });
  }

  test("settings keeps all four categories fully visible at 390px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/settings");

    const navigation = page.getByRole("navigation", {
      name: "设置类别",
    });
    await expect(navigation.getByRole("button")).toHaveCount(4);
    const data = navigation.getByRole("button", { name: "数据与隐私" });
    await expect(data).toBeVisible();
    await expect(data).toHaveText("数据与隐私");
    const geometry = await navigation.evaluate((element) => {
      const dataButton = [...element.querySelectorAll("button")].at(-1);
      const dataRect = dataButton?.getBoundingClientRect();
      const navRect = element.getBoundingClientRect();
      return {
        navClientWidth: element.clientWidth,
        navScrollWidth: element.scrollWidth,
        dataLeft: dataRect?.left ?? Number.NEGATIVE_INFINITY,
        dataRight: dataRect?.right ?? Number.POSITIVE_INFINITY,
        navLeft: navRect.left,
        navRight: navRect.right,
      };
    });
    expect(geometry.navScrollWidth).toBeLessThanOrEqual(
      geometry.navClientWidth,
    );
    expect(geometry.dataLeft).toBeGreaterThanOrEqual(geometry.navLeft);
    expect(geometry.dataRight).toBeLessThanOrEqual(geometry.navRight);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("essay workspace limit over the public HTTP contract", () => {
  test.skip(
    deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=false and an HTTP-mode web server.",
  );

  test("keeps all eight active essays and requires completion before another", async ({
    page,
  }) => {
    await page.route("**/api/v1/auth/get-session", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          session: { token: "essay-limit-http-fixture" },
          user: {
            id: "essay-limit-user",
            email: "learner@example.com",
            name: "Learner",
            role: "learner",
          },
        }),
      });
    });
    await page.route("**/api/v1/essays", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          active_count: 8,
          active_limit: 8,
          essays: Array.from({ length: 8 }, (_, index) => {
            const cycleId = `cycle-limit-${index + 1}`;
            return {
              id: cycleId,
              prompt: `HTTP boundary essay ${index + 1}`,
              topic: "education",
              status: "QUESTION_READY",
              updated_at: "2026-08-22T08:00:00.000Z",
              next_action: {
                kind: "START_ATTEMPT_1",
                entity_id: cycleId,
                reason: "The first timed draft is ready.",
                due_at: null,
                overdue: false,
              },
              resources: {
                cycle_id: cycleId,
                writing_available: false,
                feedback_available: false,
                lesson_id: null,
                rewrite_task_id: null,
                comparison_available: false,
                transfer_task_id: null,
              },
            };
          }),
        }),
      });
    });

    await page.goto("/essays");

    const workspace = page.locator('[data-essay-workspace="full"]');
    await expect(workspace).toHaveAttribute("data-active-limit", "8");
    await expect(workspace).toContainText("进行中 8 / 8 篇");
    await expect(workspace.locator("[data-essay-card]")).toHaveCount(8);
    await expect(
      workspace.getByText(
        "已达到同时进行上限；完成其中一篇后可再开始新的作文。",
      ),
    ).toBeVisible();
    await expect(
      workspace.getByRole("link", { name: "开始新作文" }),
    ).toHaveCount(0);
  });
});
