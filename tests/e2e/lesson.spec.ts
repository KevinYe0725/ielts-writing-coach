import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";

import {
  deterministicDemo,
  expectBasicAccessibility,
  resetDemoState,
} from "./support";

const lessonUrl =
  "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective";
const feedbackUrl =
  "/feedback?cycle=cycle-demo&lesson=lesson-collocation-perspective";
const paperUrl =
  "/lesson/paper?cycle=cycle-demo&lesson=lesson-collocation-perspective";

const backendVocabulary =
  /mechanism_chain|generated:\d|schema_version|prompt_version|rubric_version|route_version|model_id|provider_connection_id|job_id|attempt_id|lesson_id|deterministic demo|评分要点|置信度|模型版本|提示词版本|评分规则版本|后台字段|\bAI\b|\bAPI\b|\bMock\b|provider|model|job|queue|WAITING_FOR_CONSENT|ANALYSIS_PENDING|DEMO_ONLY|confidence|threshold|low-confidence|retry count|task kind|internal ID/i;

const httpLessonUrl = "/lesson?cycle=cycle-http&lesson=lesson-http";
const httpPaperUrl = "/lesson/paper?cycle=cycle-http&lesson=lesson-http";
const httpPrompt = {
  id: "workplace-link",
  instructionZh: "用一句英文补出灵活工作与生产力之间的机制。",
  instructionEn: "Link flexible work to productivity in one sentence.",
  promptEn: "Flexible schedules can improve employee productivity because …",
  responseMode: "SHORT_TEXT",
  context: "SAME_TOPIC",
  optionsEn: [],
  referenceAnswerEn:
    "Employees can reserve demanding tasks for the hours when they concentrate best.",
  referenceReasoningZh:
    "这种写法先说明灵活时间怎样改变任务安排，再落到工作效率。",
  referenceReasoningEn:
    "This version shows how flexible time changes task scheduling before reaching productivity.",
} as const;
const httpTeaching = {
  id: "lesson-http",
  cycleId: "cycle-http",
  format: "ADAPTIVE_ARTICLE_V1",
  titleZh: "把因果链中间的一步写清楚",
  titleEn: "Make the middle of a causal chain clear",
  introductionZh: "先理解方法，再独立完成一道短句练习。",
  introductionEn: "Understand the method, then complete one short exercise.",
  estimatedMinutes: 12,
  sections: [
    {
      anchor: "apply-the-link",
      titleZh: "把方法用到新句子里",
      titleEn: "Apply the method in a new sentence",
      blocks: [
        {
          kind: "PRACTICE",
          titleZh: "独立补出机制",
          titleEn: "Supply the mechanism independently",
          prompts: [httpPrompt],
        },
      ],
    },
  ],
} as const;

type PublicPracticeResponse = {
  id: string;
  promptId: string;
  submittedAnswer: string;
  responseMode: "CHOICE" | "SHORT_TEXT";
  analysisState:
    | "REFERENCE_READY"
    | "ANALYSIS_PENDING"
    | "ANALYSIS_READY"
    | "ANALYSIS_UNAVAILABLE"
    | "DEMO_ONLY";
  analysis: null | Record<string, unknown>;
};

type ResponseSource =
  | PublicPracticeResponse
  | null
  | (() =>
      | PublicPracticeResponse
      | null
      | Promise<PublicPracticeResponse | null>);

type HttpTeachingScenario = {
  restore: ResponseSource;
  submit?: ResponseSource;
  retry?: ResponseSource;
  restoreFailureStatus?: number;
  teachingNeedsRecovery?: boolean;
};

const httpAnswer = "Employees can protect longer periods for demanding work.";

function demoPractice(page: Page, prompt: string): Locator {
  return page.locator("[data-teaching-practice]").filter({ hasText: prompt });
}

const personalizedAnalysis = {
  kind: "PERSONALIZED_ATOMS_V1",
  strengths: [
    {
      code: "SPECIFIC_MECHANISM",
      evidence: "protect longer periods",
    },
  ],
  comparisons: [
    {
      code: "VALID_ALTERNATIVE_PATH",
      evidence: "protect longer periods",
    },
  ],
  improvements: [{ code: "MAKE_OUTCOME_SPECIFIC", evidence: "demanding work" }],
  uncertainty: "NONE",
};

function practiceResponse(
  analysisState: PublicPracticeResponse["analysisState"],
  analysis: PublicPracticeResponse["analysis"] = null,
  submittedAnswer = httpAnswer,
): PublicPracticeResponse {
  return {
    id: "response-http",
    promptId: httpPrompt.id,
    submittedAnswer,
    responseMode: "SHORT_TEXT",
    analysisState,
    analysis,
  };
}

async function resolveSource(
  source: ResponseSource | undefined,
): Promise<PublicPracticeResponse | null> {
  return typeof source === "function" ? source() : (source ?? null);
}

async function fulfillPracticeResponse(
  route: Route,
  response: PublicPracticeResponse | null,
): Promise<void> {
  if (!response) {
    await route.fulfill({
      contentType: "application/problem+json",
      status: 404,
      body: JSON.stringify({
        title: "Not found",
        status: 404,
        detail: "No saved tutorial answer.",
        code: "TEACHING_PRACTICE_RESPONSE_NOT_FOUND",
      }),
    });
    return;
  }
  await route.fulfill({
    contentType: "application/json",
    status: response.analysisState === "ANALYSIS_PENDING" ? 202 : 200,
    body: JSON.stringify({ response }),
  });
}

async function installHttpTeachingApi(
  page: Page,
  scenario: HttpTeachingScenario,
): Promise<string[]> {
  const requests: string[] = [];
  let recoveryStarted = false;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push(`${request.method()} ${url.pathname}`);

    if (url.pathname === "/api/v1/training-cycles/cycle-http") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          cycle: {
            id: "cycle-http",
            status: "LESSON_READY",
            lessonPlans: [{ id: "lesson-http" }],
          },
        }),
      });
      return;
    }
    if (url.pathname === "/api/v1/lessons/lesson-http/teaching") {
      if (scenario.teachingNeedsRecovery && !recoveryStarted) {
        await route.fulfill({
          contentType: "application/problem+json",
          status: 409,
          body: JSON.stringify({
            title: "Focused teaching needs recovery",
            status: 409,
            detail: "An earlier focused package needs replacement.",
            code: "FOCUSED_TEACHING_REPLACEMENT_REQUIRED",
          }),
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ teaching: httpTeaching }),
      });
      return;
    }
    if (
      url.pathname === "/api/v1/lessons/lesson-http/replace" &&
      request.method() === "POST"
    ) {
      recoveryStarted = true;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          replacement_started: true,
          lesson_id: "lesson-http",
          job_id: null,
          job_status: "SUCCEEDED",
        }),
      });
      return;
    }
    if (
      url.pathname ===
      "/api/v1/lessons/lesson-http/teaching-practice/workplace-link/responses"
    ) {
      if (
        request.method() === "GET" &&
        scenario.restoreFailureStatus !== undefined
      ) {
        await route.fulfill({
          contentType: "application/problem+json",
          status: scenario.restoreFailureStatus,
          body: JSON.stringify({
            title: "Temporarily unavailable",
            status: scenario.restoreFailureStatus,
            detail: "The saved tutorial response cannot be read right now.",
            code: "TEMPORARILY_UNAVAILABLE",
          }),
        });
        return;
      }
      const source =
        request.method() === "POST" ? scenario.submit : scenario.restore;
      await fulfillPracticeResponse(route, await resolveSource(source));
      return;
    }
    if (
      url.pathname ===
        "/api/v1/teaching-practice-responses/response-http/retry" &&
      request.method() === "POST"
    ) {
      await fulfillPracticeResponse(route, await resolveSource(scenario.retry));
      return;
    }
    await route.fulfill({ status: 404, body: "Not found" });
  });
  return requests;
}

async function expectPaperLinkAvailable(page: Page): Promise<void> {
  const paper = page.getByRole("link", { name: "开始60分钟训练卷" });
  await expect(paper).toBeVisible();
  await expect(paper).toBeEnabled();
  await expect(paper).not.toHaveAttribute("aria-disabled", "true");
  await expect(paper).toHaveAttribute("href", /\/lesson\/paper\?/);
  await paper.focus();
  await expect(paper).toBeFocused();
}

async function expectPaperLinkNavigable(
  page: Page,
  expectedUrl: RegExp = /\/lesson\/paper\?/,
): Promise<void> {
  const paper = page.getByRole("link", { name: "开始60分钟训练卷" });
  await expect(paper).toBeVisible();
  await expect(paper).toBeEnabled();
  await expect(paper).not.toHaveAttribute("aria-disabled", "true");
  await paper.focus();
  await expect(paper).toBeFocused();
  await Promise.all([
    page.waitForURL(expectedUrl),
    page.keyboard.press("Enter"),
  ]);
}

async function gridColumnCount(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const columns = window.getComputedStyle(element).gridTemplateColumns.trim();
    if (!columns || columns === "none") return 0;
    return columns.split(/\s+/).filter(Boolean).length;
  });
}

async function expectLeftOf(left: Locator, right: Locator): Promise<void> {
  const leftBox = await left.boundingBox();
  const rightBox = await right.boundingBox();
  expect(leftBox).not.toBeNull();
  expect(rightBox).not.toBeNull();
  expect(leftBox!.x + leftBox!.width).toBeLessThanOrEqual(rightBox!.x + 2);
  expect(Math.abs(leftBox!.y - rightBox!.y)).toBeLessThan(4);
}

async function expectAbove(first: Locator, second: Locator): Promise<void> {
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  expect(firstBox!.y + firstBox!.height).toBeLessThanOrEqual(secondBox!.y + 2);
}

async function navigationLink(
  page: import("@playwright/test").Page,
  name: string,
) {
  const link = page.getByRole("link", { name });
  if ((page.viewportSize()?.width ?? 1_000) < 700) {
    if (!(await link.isVisible())) {
      await page.locator(".mobile-menu > summary").click();
    }
  }
  return link;
}

test.describe("feedback, focused teaching and complete practice paper", () => {
  test.skip(
    !deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=true and a demo-mode web server.",
  );

  test.beforeEach(async ({ page }) => resetDemoState(page));

  test("uses feedback columns only when the report has enough content space", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(feedbackUrl);

    const workbench = page.locator("[data-feedback-workbench]");
    const essay = page.locator("[data-essay-pane]");
    const suggestions = page.locator("[data-suggestion-panel]");
    await expect(workbench).toBeVisible();
    await expect(essay).toBeVisible();
    await expect(suggestions).toBeVisible();
    expect(await gridColumnCount(workbench)).toBe(2);
    await expectLeftOf(essay, suggestions);
    await expect(essay).toHaveCSS("position", "sticky");

    await page.setViewportSize({ width: 1279, height: 900 });
    expect(await gridColumnCount(workbench)).toBe(1);
    await expectAbove(essay, suggestions);
  });

  test("maps every issue card to one source mark and synchronizes both directions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(feedbackUrl);

    const cards = page.locator("button[data-issue-card]");
    const marks = page.locator("[data-issue-highlight]");
    await expect(cards).toHaveCount(3);
    await expect(marks).toHaveCount(3);

    const cardIds = await cards.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-issue-card")).sort(),
    );
    const markIds = await marks.evaluateAll((elements) =>
      elements
        .map((element) => element.getAttribute("data-issue-highlight"))
        .sort(),
    );
    expect(cardIds).toEqual([
      "issue-argument",
      "issue-collocation",
      "issue-comparison",
    ]);
    expect(markIds).toEqual(cardIds);

    const comparisonCard = page.locator(
      'button[data-issue-card="issue-comparison"]',
    );
    const comparisonMark = page.locator(
      '[data-issue-highlight="issue-comparison"]',
    );
    await comparisonCard.click();
    await expect(comparisonCard).toHaveAttribute("aria-expanded", "true");
    await expect(comparisonMark).toHaveAttribute("aria-pressed", "true");

    const argumentCard = page.locator(
      'button[data-issue-card="issue-argument"]',
    );
    const argumentMark = page.locator(
      '[data-issue-highlight="issue-argument"]',
    );
    await argumentMark.click();
    await expect(argumentMark).toHaveAttribute("aria-pressed", "true");
    await expect(argumentCard).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.locator('button[data-issue-card][aria-expanded="true"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-issue-highlight][aria-pressed="true"]'),
    ).toHaveCount(1);
  });

  test("keeps long source annotations inline across every affected line", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(feedbackUrl);

    const essay = page.locator("[data-feedback-essay]");
    const mark = page.locator('[data-feedback-highlight="issue-argument"]');
    await expect(mark).toBeVisible();
    await expect(mark.locator("button")).toHaveCount(0);
    await expect(mark).toHaveAttribute("role", "button");
    await expect(mark).toHaveAttribute("data-annotation-kind", "development");

    const before = await mark.evaluate((element) => {
      const essayRect = element
        .closest("[data-feedback-essay]")!
        .getBoundingClientRect();
      const markRect = element.getBoundingClientRect();
      return {
        bounds: {
          height: Math.round(markRect.height * 10) / 10,
          left: Math.round((markRect.left - essayRect.left) * 10) / 10,
          top: Math.round((markRect.top - essayRect.top) * 10) / 10,
          width: Math.round(markRect.width * 10) / 10,
        },
        display: window.getComputedStyle(element).display,
        essayHeight: essayRect.height,
        rectCount: element.getClientRects().length,
      };
    });
    expect(before.display).toBe("inline");
    expect(before.rectCount).toBeGreaterThan(1);

    await mark.focus();
    await page.keyboard.press("Space");
    await expect(mark).toBeFocused();
    await expect(mark).toHaveAttribute("aria-pressed", "true");

    const after = await mark.evaluate((element) => {
      const essayRect = element
        .closest("[data-feedback-essay]")!
        .getBoundingClientRect();
      const markRect = element.getBoundingClientRect();
      return {
        bounds: {
          height: Math.round(markRect.height * 10) / 10,
          left: Math.round((markRect.left - essayRect.left) * 10) / 10,
          top: Math.round((markRect.top - essayRect.top) * 10) / 10,
          width: Math.round(markRect.width * 10) / 10,
        },
        essayHeight: essayRect.height,
        rectCount: element.getClientRects().length,
      };
    });
    expect(after.rectCount).toBeGreaterThan(1);
    expect(after).toEqual({
      bounds: before.bounds,
      essayHeight: before.essayHeight,
      rectCount: after.rectCount,
    });
    await expect(essay).toContainText("makes children can develop");
  });

  test("activates feedback links by keyboard without moving focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(feedbackUrl);

    const comparisonCard = page.locator(
      'button[data-issue-card="issue-comparison"]',
    );
    const comparisonMark = page.locator(
      '[data-issue-highlight="issue-comparison"]',
    );
    await comparisonCard.focus();
    await page.keyboard.press("Enter");
    await expect(comparisonCard).toBeFocused();
    await expect(comparisonCard).toHaveAttribute("aria-expanded", "true");
    await expect(comparisonMark).toHaveAttribute("aria-pressed", "true");

    const collocationCard = page.locator(
      'button[data-issue-card="issue-collocation"]',
    );
    const collocationMark = page.locator(
      '[data-issue-highlight="issue-collocation"]',
    );
    await collocationMark.focus();
    await page.keyboard.press("Space");
    await expect(collocationMark).toBeFocused();
    await expect(collocationMark).toHaveAttribute("aria-pressed", "true");
    await expect(collocationCard).toHaveAttribute("aria-expanded", "true");
  });

  test("defaults mobile feedback to suggestions and can switch to the essay", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(feedbackUrl);

    const suggestionsTab = page.getByRole("tab", { name: "修改建议" });
    const essayTab = page.getByRole("tab", { name: "原文" });
    const suggestions = page.locator("[data-suggestion-panel]");
    const essay = page.locator("[data-essay-pane]");

    await expect(suggestionsTab).toHaveAttribute("aria-selected", "true");
    await expect(suggestions).toBeVisible();
    await expect(essay).toBeHidden();

    await essayTab.click();
    await expect(essayTab).toHaveAttribute("aria-selected", "true");
    await expect(essay).toBeVisible();
    await expect(suggestions).toBeHidden();

    await suggestionsTab.click();
    await expect(suggestionsTab).toHaveAttribute("aria-selected", "true");
    await expect(suggestions).toBeVisible();
    await expect(essay).toBeHidden();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
  });

  test("renders focused teaching as one adaptive article with a right-hand contents", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(lessonUrl);

    const layout = page.locator("[data-teaching-layout]");
    const article = page.locator("article[data-teaching-article]");
    const articleBody = page.locator("[data-teaching-content]");
    const contents = page.locator("[data-teaching-toc]");

    await expect(page.locator("main main")).toHaveCount(0);
    await expect(article).toHaveCount(1);
    await expect(contents).toBeVisible();
    expect(await gridColumnCount(layout)).toBe(2);
    await expectLeftOf(articleBody, contents);
    await expect(page.locator("[data-teaching-toc-column]")).toHaveCSS(
      "position",
      "sticky",
    );

    const sectionAnchors = await article
      .locator("[data-teaching-section]")
      .evaluateAll((sections) => sections.map((section) => section.id));
    expect(sectionAnchors).toEqual([
      "see-the-missing-link",
      "build-one-step-at-a-time",
      "try-and-check",
    ]);
    await expect(contents.locator("a")).toHaveCount(sectionAnchors.length);

    const proseMetrics = await page
      .locator("[data-teaching-prose]")
      .first()
      .evaluate((element) => {
        const style = window.getComputedStyle(element);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          lineHeight: Number.parseFloat(style.lineHeight),
          width: element.getBoundingClientRect().width,
        };
      });
    expect(proseMetrics.width).toBeGreaterThanOrEqual(680);
    expect(proseMetrics.width).toBeLessThanOrEqual(760);
    expect(proseMetrics.fontSize).toBeGreaterThanOrEqual(16);
    expect(
      proseMetrics.lineHeight / proseMetrics.fontSize,
    ).toBeGreaterThanOrEqual(1.7);

    const secondContentsLink = contents.locator("a").nth(1);
    await secondContentsLink.click();
    await expect(secondContentsLink).toHaveAttribute(
      "aria-current",
      "location",
    );
    await expect(secondContentsLink).toBeFocused();

    await page.evaluate(() => window.scrollTo(0, 1_800));
    const stickyBox = await page
      .locator("[data-teaching-toc-column]")
      .boundingBox();
    expect(stickyBox).not.toBeNull();
    expect(stickyBox!.y).toBeGreaterThanOrEqual(16);
    expect(stickyBox!.y + stickyBox!.height).toBeLessThanOrEqual(900);
  });

  test("uses a collapsed article contents on narrow screens without horizontal overflow", async ({
    page,
  }) => {
    for (const width of [1024, 768, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(lessonUrl);

      const toggle = page.locator("[data-teaching-toc-toggle]");
      const contents = page.locator("[data-teaching-toc]");
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(contents).toBeHidden();
      const firstSectionTop = await page
        .locator("[data-teaching-section]")
        .first()
        .evaluate((element) => element.getBoundingClientRect().top);
      if (width === 390) expect(firstSectionTop).toBeLessThanOrEqual(550);
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(contents).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      ).toBe(true);
    }
  });

  test("moves mobile focus to the selected section after the contents collapses", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lessonUrl);

    await page.locator("[data-teaching-toc-toggle]").click();
    const secondLink = page.locator("[data-teaching-toc] a").nth(1);
    await secondLink.focus();
    await page.keyboard.press("Enter");

    await expect(page.locator("[data-teaching-toc-toggle]")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    const heading = page.locator("#build-one-step-at-a-time-heading");
    await expect(heading).toBeFocused();
    await expect
      .poll(() =>
        heading.evaluate((element) => element.getBoundingClientRect().top),
      )
      .toBeGreaterThanOrEqual(64);
  });

  test("uses the space recovered when the product sidebar is hidden", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(lessonUrl);

    const shell = page.locator("[data-app-shell]");
    const layout = page.locator("[data-teaching-layout]");
    const toggle = page.locator("[data-teaching-toc-toggle]");
    await expect(shell).toHaveAttribute("data-sidebar-state", "expanded");
    await expect(layout).toHaveCSS("display", "flex");
    await expect(toggle).toBeVisible();

    await page.locator("[data-sidebar-toggle]").click();
    await expect(shell).toHaveAttribute("data-sidebar-state", "collapsed");
    await expect(layout).toHaveCSS("display", "grid");
    await expect(toggle).toBeHidden();
    await expect(page.locator("[data-teaching-toc]")).toBeVisible();
  });

  test("does not expose backend vocabulary in feedback or focused teaching", async ({
    page,
  }) => {
    for (const url of [feedbackUrl, lessonUrl]) {
      await page.goto(url);
      await expect(page.getByRole("main")).not.toContainText(backendVocabulary);
    }
  });

  test("teaches one diagnosed ability without locating or quoting the original essay", async ({
    page,
  }) => {
    await page.goto(lessonUrl);

    const article = page.locator("article[data-teaching-article]");
    await expect(
      page.getByRole("heading", {
        name: "别让论证从原因直接跳到结果",
      }),
    ).toBeVisible();
    await expect(article).not.toContainText(
      "children always have a better ability to absorb new knowledges",
    );
    await expect(article).not.toContainText(/你的原文|原文定位|你现在的表达/);
    await expect(
      article.locator('[data-teaching-block="EXPLANATION"]'),
    ).toBeVisible();
    await expect(
      article.locator('[data-teaching-block="REASONING"]'),
    ).toBeVisible();
    await expect(
      article.locator('[data-teaching-block="PRACTICE"]'),
    ).toBeVisible();
    await expect(
      article.locator('[data-teaching-block="SUMMARY"]'),
    ).toBeVisible();
    await expect(article.locator("textarea")).toHaveCount(2);
    await expect(
      page.getByRole("link", { name: "开始60分钟训练卷" }),
    ).toBeVisible();
    await expect(page.getByText("60:00", { exact: true })).toHaveCount(0);
  });

  test("renders a different tutorial shape without adding fixed empty chapters", async ({
    page,
  }) => {
    await page.goto(
      "/lesson?cycle=cycle-collocation-control&lesson=lesson-collocation-control",
    );

    const article = page.locator("article[data-teaching-article]");
    await expect(
      page.getByRole("heading", {
        name: "搭配不是正确单词的随意相加",
      }),
    ).toBeVisible();
    await expect(article.locator("[data-teaching-section]")).toHaveCount(2);
    await expect(
      article.locator('[data-teaching-block="TOOLKIT"]'),
    ).toBeVisible();
    await expect(
      article.locator('[data-teaching-block="PITFALLS"]'),
    ).toBeVisible();
    await expect(
      article.locator('[data-teaching-block="CONTRAST"]'),
    ).toBeVisible();
    await expect(article.getByText("较弱写法", { exact: true })).toBeVisible();
    await expect(
      article.getByText("更合适写法", { exact: true }),
    ).toBeVisible();
    await expect(article.getByText("只给结论", { exact: true })).toHaveCount(0);
    await expect(
      article.locator('[data-teaching-block="REASONING"]'),
    ).toHaveCount(0);
    await expect(article.locator('input[type="radio"]')).toHaveCount(3);
    await expect(article.locator("textarea")).toHaveCount(1);
  });

  test("freezes the first short answer, compares it immediately, and restores it after refresh", async ({
    page,
  }) => {
    await page.goto(lessonUrl);
    const first = demoPractice(
      page,
      "Flexible schedules can improve employee productivity because …",
    );
    const second = demoPractice(
      page,
      "Explain how charging households for excess waste could reduce landfill use.",
    );
    await expect(first.locator("textarea")).toBeVisible();
    await expect(second.locator("textarea")).toBeVisible();
    await expect(first.locator("[data-teaching-answer-review]")).toHaveCount(0);

    await first.locator("textarea").fill(httpAnswer);
    const submit = first.locator("[data-teaching-practice-submit]");
    await expect(submit).toHaveAccessibleName("提交并查看对照");
    await submit.click();

    const review = first.locator("[data-teaching-answer-review]");
    await expect(review).toBeVisible();
    await expect(review.getByRole("heading", { level: 4 })).toBeFocused();
    await expect(first.locator("[data-teaching-submitted-answer]")).toHaveText(
      httpAnswer,
    );
    await expect(first.locator("[data-teaching-reference-answer]")).toHaveText(
      "Employees can reserve their most demanding tasks for the hours when they concentrate best.",
    );
    await expect(
      first.locator("[data-teaching-reference-reasoning]"),
    ).toContainText("灵活时间如何改变任务安排");
    await expect(first.locator("textarea")).toHaveCount(0);
    await expect(second.locator("textarea")).toBeEditable();
    await expect(second.locator("[data-teaching-answer-review]")).toHaveCount(
      0,
    );

    const analysis = first.locator(
      '[data-teaching-analysis][data-state="demo"]',
    );
    await expect(analysis).toBeVisible();
    await expect(analysis).toContainText("不评价你的英文质量");
    await expect(first.locator("[data-teaching-analysis-retry]")).toHaveCount(
      0,
    );
    await expect(first.locator("[data-teaching-rewrite]")).toHaveCount(0);
    await expect(first).not.toContainText(
      /最值得改的一点|和参考思路的差别|正确答案|标准答案|唯一答案|答对|答错/,
    );
    await expect(first).not.toContainText(backendVocabulary);
    await expectBasicAccessibility(page);
    const axe = await new AxeBuilder({ page })
      .include("[data-teaching-practice]")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);

    await page.reload();
    const restored = demoPractice(
      page,
      "Flexible schedules can improve employee productivity because …",
    );
    await expect(
      restored.locator("[data-teaching-answer-review]"),
    ).toBeVisible();
    await expect(
      restored.locator("[data-teaching-submitted-answer]"),
    ).toHaveText(httpAnswer);
    await expect(restored.locator("textarea")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "开始60分钟训练卷" }),
    ).toBeEnabled();
    await expectPaperLinkNavigable(page);
  });

  test("uses an honest deterministic comparison for choice practice without verdict language", async ({
    page,
  }) => {
    await page.goto(
      "/lesson?cycle=cycle-collocation-control&lesson=lesson-collocation-control",
    );
    const choice = page.locator("[data-teaching-practice]").first();
    await expect(
      choice.locator("[data-teaching-practice-submit]"),
    ).toBeDisabled();
    await choice.getByText("pose", { exact: true }).click();
    await choice.locator("[data-teaching-practice-submit]").click();

    await expect(choice.locator("[data-teaching-answer-review]")).toBeVisible();
    await expect(choice.locator("[data-teaching-submitted-answer]")).toHaveText(
      "pose",
    );
    await expect(
      choice.locator('[data-teaching-analysis][data-state="ready"]'),
    ).toBeVisible();
    await expect(choice).not.toContainText(
      /评分|得分|通过|失败|正确答案|标准答案|唯一答案|答对|答错/,
    );
    await expect(choice).not.toContainText(backendVocabulary);
    await expect(choice.locator("[data-teaching-analysis-retry]")).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("link", { name: "开始60分钟训练卷" }),
    ).toBeEnabled();
    await expectPaperLinkNavigable(page);
  });

  test("keeps the paper keyboard-navigable before any tutorial answer", async ({
    page,
  }) => {
    await page.goto(lessonUrl);
    await expect(page.locator("[data-teaching-answer-review]")).toHaveCount(0);
    await expectPaperLinkNavigable(page);
  });

  test("stacks the demo answer comparison in reading order without mobile overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lessonUrl);
    const prompt = demoPractice(
      page,
      "Flexible schedules can improve employee productivity because …",
    );
    await prompt.locator("textarea").fill(httpAnswer);
    await prompt.locator("[data-teaching-practice-submit]").click();
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="demo"]'),
    ).toBeVisible();

    const comparison = prompt.locator("[data-teaching-answer-comparison]");
    expect(await gridColumnCount(comparison)).toBe(1);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    });
    const stackedRects = await prompt.evaluate((element) => {
      const rect = (selector: string) => {
        const target = element.querySelector(selector);
        if (!(target instanceof HTMLElement)) {
          throw new Error(`Missing comparison element: ${selector}`);
        }
        const bounds = target.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom };
      };
      return {
        submitted: rect("[data-teaching-submitted-answer]"),
        reference: rect("[data-teaching-reference-answer]"),
        reasoning: rect("[data-teaching-reference-reasoning]"),
        analysis: rect('[data-teaching-analysis][data-state="demo"]'),
      };
    });
    expect(stackedRects.submitted.bottom).toBeLessThanOrEqual(
      stackedRects.reference.top + 2,
    );
    expect(stackedRects.reference.bottom).toBeLessThanOrEqual(
      stackedRects.reasoning.top + 2,
    );
    expect(stackedRects.reasoning.bottom).toBeLessThanOrEqual(
      stackedRects.analysis.top + 2,
    );
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
  });

  test("stops waiting for a tutorial explanation without blocking the timed paper", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "iwc.demo.teaching-practice-responses",
        JSON.stringify({
          "lesson-collocation-perspective:workplace-mechanism": {
            id: "demo:pending-forever",
            promptId: "workplace-mechanism",
            submittedAnswer:
              "Employees can protect longer periods for demanding work.",
            responseMode: "SHORT_TEXT",
            analysisState: "ANALYSIS_PENDING",
            analysis: null,
          },
        }),
      );
    });
    await page.clock.install();
    await page.goto(lessonUrl);
    const prompt = demoPractice(
      page,
      "Flexible schedules can improve employee productivity because …",
    );
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="pending"]'),
    ).toBeVisible();
    await page.clock.runFor(31_000);
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="unavailable"]'),
    ).toBeVisible();
    await expect(prompt).toContainText("没有足够依据勉强下结论");
    await expectPaperLinkNavigable(page);
  });

  test("shows all eight questions with concise, complete instructions", async ({
    page,
  }) => {
    await page.goto(paperUrl);

    await expect(page.getByText("本题评分点")).toHaveCount(0);
    await expect(page.getByText("基础判断", { exact: true })).toHaveCount(0);
    await expect(page.getByText("修改重写", { exact: true })).toHaveCount(0);
    await expect(page.locator(".practice-paper-question")).toHaveCount(8);
    await expect(
      page.getByText(
        "用20至35个英文词解释为什么早期接触能降低以后的学习难度；必须写出作用过程和结果。",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "交卷" })).toBeVisible();
  });

  test("keeps the source report available and preserves the paper draft", async ({
    page,
  }) => {
    await page.goto(paperUrl);
    const answer = page.getByRole("textbox", { name: "第 2 题 answer" });
    await answer.fill(
      "Regular exposure helps children recognise common language patterns early, so they face fewer difficulties when formal study becomes more demanding later.",
    );

    await page.getByRole("link", { name: "查看详细批改" }).click();
    await expect(page).toHaveURL(
      /\/feedback\?cycle=cycle-demo&lesson=lesson-collocation-perspective$/,
    );
    await expect(
      page.getByRole("heading", { name: "对照原文，把每一处问题改明白" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "进入专项教学" }).click();
    await page.getByRole("link", { name: "开始60分钟训练卷" }).click();

    await expect(page).toHaveURL(
      /\/lesson\/paper\?cycle=cycle-demo&lesson=lesson-collocation-perspective$/,
    );
    await expect(answer).toHaveValue(
      "Regular exposure helps children recognise common language patterns early, so they face fewer difficulties when formal study becomes more demanding later.",
    );
  });

  test("opens report and paper from their real sidebar destinations", async ({
    page,
  }) => {
    await page.goto("/today");
    await (await navigationLink(page, "批改报告")).click();
    await expect(page).toHaveURL(/\/feedback\?cycle=cycle-demo$/);

    await (await navigationLink(page, "专项提升")).click();
    await expect(page).toHaveURL(
      /\/lesson\?cycle=cycle-demo&lesson=lesson-collocation-perspective$/,
    );
    await page.getByRole("link", { name: "开始60分钟训练卷" }).click();
    await expect(page).toHaveURL(
      /\/lesson\/paper\?cycle=cycle-demo&lesson=lesson-collocation-perspective$/,
    );
  });

  test("restores sidebar destinations when the paper is opened directly", async ({
    page,
  }) => {
    await page.goto(paperUrl);

    await (await navigationLink(page, "批改报告")).click();
    await expect(page).toHaveURL(/\/feedback\?cycle=cycle-demo$/);
  });

  test("restores focused-learning navigation when the report is opened directly", async ({
    page,
  }) => {
    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        message.text().includes("Hydration failed")
      ) {
        hydrationErrors.push(message.text());
      }
    });
    await page.goto(
      "/feedback?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    );

    await (await navigationLink(page, "专项提升")).click();
    await expect(page).toHaveURL(
      /\/lesson\?cycle=cycle-demo&lesson=lesson-collocation-perspective$/,
    );
    expect(hydrationErrors).toEqual([]);
  });

  test("submits once and expands teaching analysis only for missed answers", async ({
    page,
  }) => {
    await page.goto(paperUrl);
    await page.getByText("A", { exact: true }).last().click();
    await page
      .getByRole("textbox", { name: "第 2 题 answer" })
      .fill(
        "Regular exposure helps children recognise common language patterns early, so they face fewer difficulties when formal study becomes more demanding later.",
      );
    await page.getByRole("button", { name: "交卷" }).click();

    await expect(page.getByText("整卷结果", { exact: true })).toBeVisible();
    await expect(page.getByText("已达标", { exact: true })).toHaveCount(2);
    await expect(
      page.getByRole("heading", { name: "这题为什么没有达标" }),
    ).toHaveCount(6);
    await expect(page.getByText("参考改法", { exact: true })).toHaveCount(6);
  });

  test("locks editing at the time limit but retains an incomplete sheet for submission", async ({
    page,
  }) => {
    await page.goto("/api/v1/health/live");
    await page.evaluate(() => {
      window.localStorage.setItem(
        "iwc:practice-paper-started",
        new Date(Date.now() - 3_601_000).toISOString(),
      );
    });
    await page.goto(paperUrl);

    await expect(page.getByRole("textbox").first()).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "时间到，交卷" }),
    ).toBeEnabled();
  });
});

test.describe("tutorial answer analysis over the public HTTP contract", () => {
  test.skip(
    deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=false and an HTTP-mode web server.",
  );

  test("automatically restores earlier focused teaching without a learner action", async ({
    page,
  }) => {
    const requests = await installHttpTeachingApi(page, {
      restore: null,
      teachingNeedsRecovery: true,
    });

    await page.goto(httpLessonUrl);
    await expect(page.locator("article[data-teaching-article]")).toBeVisible();
    expect(
      requests.filter(
        (request) => request === "POST /api/v1/lessons/lesson-http/replace",
      ),
    ).toHaveLength(1);
    await expect(
      page.getByRole("button", {
        name: /生成专项教学|检查是否已准备好|Generate teaching|Check whether it is ready/,
      }),
    ).toHaveCount(0);
    await expectPaperLinkAvailable(page);
  });

  test("keeps a prompt restoring until the canonical first answer is known", async ({
    page,
  }) => {
    const canonical = "The canonical first answer saved before this page load.";
    let releaseRestore!: (response: PublicPracticeResponse | null) => void;
    const delayedRestore = new Promise<PublicPracticeResponse | null>(
      (resolve) => {
        releaseRestore = resolve;
      },
    );
    const requests = await installHttpTeachingApi(page, {
      restore: () => delayedRestore,
    });

    await page.goto(httpLessonUrl);
    const prompt = page.locator("[data-teaching-practice]");
    await expect(
      prompt.locator("[data-teaching-practice-restoring]"),
    ).toBeVisible();
    await expect(prompt.locator("textarea")).toHaveCount(0);
    await expect(prompt.locator("[data-teaching-practice-submit]")).toHaveCount(
      0,
    );
    await expectPaperLinkAvailable(page);

    releaseRestore(practiceResponse("REFERENCE_READY", null, canonical));
    await expect(prompt.locator("[data-teaching-answer-review]")).toBeVisible();
    await expect(prompt.locator("[data-teaching-submitted-answer]")).toHaveText(
      canonical,
    );
    await expect(prompt.locator("textarea")).toHaveCount(0);
    expect(requests.filter((request) => request.startsWith("POST "))).toEqual(
      [],
    );
    await expectPaperLinkNavigable(page, /\/lesson\/paper\?cycle=cycle-http/);
  });

  test("makes only the restored prompt editable after a missing response", async ({
    page,
  }) => {
    let releaseRestore!: (response: PublicPracticeResponse | null) => void;
    const delayedRestore = new Promise<PublicPracticeResponse | null>(
      (resolve) => {
        releaseRestore = resolve;
      },
    );
    await installHttpTeachingApi(page, { restore: () => delayedRestore });

    await page.goto(httpLessonUrl);
    const prompt = page.locator("[data-teaching-practice]");
    await expect(
      prompt.locator("[data-teaching-practice-restoring]"),
    ).toBeVisible();
    await expect(prompt.locator("textarea")).toHaveCount(0);
    releaseRestore(null);
    await expect(prompt.locator("textarea")).toBeEditable();
    await expect(
      prompt.locator("[data-teaching-practice-restoring]"),
    ).toHaveCount(0);
    await expectPaperLinkAvailable(page);
  });

  test("makes only the affected prompt editable when restore cannot complete", async ({
    page,
  }) => {
    await installHttpTeachingApi(page, {
      restore: null,
      restoreFailureStatus: 503,
    });
    await page.goto(httpLessonUrl);
    const prompt = page.locator("[data-teaching-practice]");
    await expect(prompt.locator("textarea")).toBeEditable();
    await expect(
      prompt.locator("[data-teaching-practice-restoring]"),
    ).toHaveCount(0);
    await expectPaperLinkAvailable(page);
  });

  test("bounds an initial restore that never settles and ignores its late result", async ({
    page,
  }) => {
    await page.clock.install();
    let releaseRestore!: (response: PublicPracticeResponse | null) => void;
    const delayedRestore = new Promise<PublicPracticeResponse | null>(
      (resolve) => {
        releaseRestore = resolve;
      },
    );
    const canonicalSubmit = "The immutable answer returned by submit.";
    await installHttpTeachingApi(page, {
      restore: () => delayedRestore,
      submit: practiceResponse("REFERENCE_READY", null, canonicalSubmit),
    });

    await page.goto(httpLessonUrl);
    const prompt = page.locator("[data-teaching-practice]");
    await expect(
      prompt.locator("[data-teaching-practice-restoring]"),
    ).toBeVisible();
    await expectPaperLinkAvailable(page);

    await page.clock.runFor(6_000);
    await expect(prompt.locator("textarea")).toBeEditable();
    await prompt
      .locator("textarea")
      .fill("A draft written after restore timed out.");
    await prompt.locator("[data-teaching-practice-submit]").click();
    await expect(prompt.locator("[data-teaching-submitted-answer]")).toHaveText(
      canonicalSubmit,
    );

    releaseRestore(
      practiceResponse(
        "REFERENCE_READY",
        null,
        "A stale result from the original restore request.",
      ),
    );
    await page.clock.runFor(1_000);
    await expect(prompt.locator("[data-teaching-submitted-answer]")).toHaveText(
      canonicalSubmit,
    );
    await expect(prompt.locator("textarea")).toHaveCount(0);
    await expectPaperLinkAvailable(page);
  });

  test("reveals the comparison before a delayed submission returns and never reads a generic job resource", async ({
    page,
  }) => {
    let releaseSubmit!: (response: PublicPracticeResponse | null) => void;
    const delayedSubmit = new Promise<PublicPracticeResponse | null>(
      (resolve) => {
        releaseSubmit = resolve;
      },
    );
    let submitted = false;
    const requests = await installHttpTeachingApi(page, {
      restore: () =>
        submitted
          ? practiceResponse("ANALYSIS_READY", personalizedAnalysis)
          : null,
      submit: () => delayedSubmit,
    });
    await page.goto(httpLessonUrl);
    const prompt = page.locator("[data-teaching-practice]");
    await expect(prompt.locator("textarea")).toBeEditable();
    await prompt.locator("textarea").fill(httpAnswer);
    await prompt.locator("[data-teaching-practice-submit]").click();

    await expect(prompt.locator("[data-teaching-answer-review]")).toBeVisible();
    await expect(prompt.locator("[data-teaching-submitted-answer]")).toHaveText(
      httpAnswer,
    );
    await expect(prompt.locator("[data-teaching-reference-answer]")).toHaveText(
      httpPrompt.referenceAnswerEn,
    );
    await expect(
      prompt.locator("[data-teaching-reference-reasoning]"),
    ).toContainText(httpPrompt.referenceReasoningZh);
    const pending = prompt.locator(
      '[data-teaching-analysis][data-state="pending"]',
    );
    await expect(pending).toHaveAttribute("role", "status");
    await expect(pending).toHaveAttribute("aria-live", "polite");
    await expect(pending).toHaveAttribute("aria-atomic", "true");
    await expect(pending).toHaveAttribute("aria-busy", "true");
    await expect(
      page.getByRole("link", { name: "开始60分钟训练卷" }),
    ).toBeEnabled();
    const reviewHeading = prompt.getByRole("heading", { level: 4 });
    await reviewHeading.focus();
    await expect(reviewHeading).toBeFocused();

    submitted = true;
    releaseSubmit(practiceResponse("ANALYSIS_PENDING"));
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="ready"]'),
    ).toBeVisible();
    const readyAnnouncement = prompt.locator(
      '[data-teaching-analysis-announcement][aria-live="polite"]',
    );
    await expect(readyAnnouncement).toHaveText("进一步讲解已整理好。");
    await expect(reviewHeading).toBeFocused();
    expect(requests.some((request) => request.includes("/ai-jobs/"))).toBe(
      false,
    );
  });

  test("preserves the exact first short-text answer while using trimmed text only to reject blanks", async ({
    page,
  }) => {
    const rawAnswer =
      "\n  Flexible schedules reduce commuting fatigue.\nEmployees can then protect their most focused hours.  \n";
    let releaseSubmit!: (response: PublicPracticeResponse | null) => void;
    const delayedSubmit = new Promise<PublicPracticeResponse | null>(
      (resolve) => {
        releaseSubmit = resolve;
      },
    );
    await installHttpTeachingApi(page, {
      restore: null,
      submit: () => delayedSubmit,
    });
    await page.goto(httpLessonUrl);
    const prompt = page.locator("[data-teaching-practice]");
    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname ===
          "/api/v1/lessons/lesson-http/teaching-practice/workplace-link/responses",
    );

    await prompt.locator("textarea").fill(rawAnswer);
    await prompt.locator("[data-teaching-practice-submit]").click();
    const request = await requestPromise;

    expect(request.postDataJSON()).toEqual({ answer: rawAnswer });
    await expect(prompt.locator("[data-teaching-answer-review]")).toBeVisible();
    expect(
      await prompt.locator("[data-teaching-submitted-answer]").textContent(),
    ).toBe(rawAnswer);

    releaseSubmit(practiceResponse("REFERENCE_READY", null, rawAnswer));
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="pending"]'),
    ).toHaveCount(0);
    expect(
      await prompt.locator("[data-teaching-submitted-answer]").textContent(),
    ).toBe(rawAnswer);
  });

  test("reconciles an optimistic draft to the canonical earlier first answer without reopening the editor", async ({
    page,
  }) => {
    const canonical = "An earlier immutable answer from this tutorial.";
    await installHttpTeachingApi(page, {
      restore: null,
      submit: practiceResponse("REFERENCE_READY", null, canonical),
    });
    await page.goto(httpLessonUrl);
    const prompt = page.locator("[data-teaching-practice]");
    await prompt.locator("textarea").fill("A later replacement draft.");
    await prompt.locator("[data-teaching-practice-submit]").click();

    await expect(prompt.locator("[data-teaching-submitted-answer]")).toHaveText(
      canonical,
    );
    await expect(prompt.locator("textarea")).toHaveCount(0);
    await expect(
      prompt.locator("[data-teaching-submitted-answer]"),
    ).toHaveCount(1);
    await expect(prompt).not.toContainText("A later replacement draft.");
  });

  test("keeps a reference-ready answer neutral without unavailable semantics", async ({
    page,
  }) => {
    await installHttpTeachingApi(page, {
      restore: practiceResponse("REFERENCE_READY"),
    });
    await page.goto(httpLessonUrl);
    const prompt = page.locator("[data-teaching-practice]");
    await expect(prompt.locator("[data-teaching-answer-review]")).toBeVisible();
    await expect(prompt.locator("[data-teaching-analysis]")).toHaveCount(0);
    await expect(prompt).not.toContainText(
      /进一步讲解暂时没有生成|没有足够依据勉强下结论/,
    );
    await expectPaperLinkNavigable(page, /\/lesson\/paper\?cycle=cycle-http/);
  });

  test("announces a pending-to-unavailable transition without moving focus", async ({
    page,
  }) => {
    let submitted = false;
    await installHttpTeachingApi(page, {
      restore: () =>
        submitted ? practiceResponse("ANALYSIS_UNAVAILABLE") : null,
      submit: () => {
        submitted = true;
        return practiceResponse("ANALYSIS_PENDING");
      },
    });
    await page.goto(httpLessonUrl);
    const prompt = page.locator("[data-teaching-practice]");
    await prompt.locator("textarea").fill(httpAnswer);
    await prompt.locator("[data-teaching-practice-submit]").click();
    const reviewHeading = prompt.getByRole("heading", { level: 4 });
    await reviewHeading.focus();
    await expect(reviewHeading).toBeFocused();

    await expect(
      prompt.locator('[data-teaching-analysis][data-state="unavailable"]'),
    ).toBeVisible();
    await expect(
      prompt.locator(
        '[data-teaching-analysis-announcement][aria-live="polite"]',
      ),
    ).toHaveText("进一步讲解暂时没有生成。");
    await expect(reviewHeading).toBeFocused();
    await expectPaperLinkAvailable(page);
  });

  test("bounds pending hydration when the saved response disappears", async ({
    page,
  }) => {
    await page.clock.install();
    let submitted = false;
    const requests = await installHttpTeachingApi(page, {
      restore: () => null,
      submit: () => {
        submitted = true;
        return practiceResponse("ANALYSIS_PENDING");
      },
    });
    await page.goto(httpLessonUrl);
    const prompt = page.locator("[data-teaching-practice]");
    await prompt.locator("textarea").fill(httpAnswer);
    await prompt.locator("[data-teaching-practice-submit]").click();
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="pending"]'),
    ).toBeVisible();
    expect(submitted).toBe(true);

    await page.clock.runFor(31_000);
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="unavailable"]'),
    ).toBeVisible();
    await expect(prompt.locator("[data-teaching-submitted-answer]")).toHaveText(
      httpAnswer,
    );
    expect(
      requests.filter((request) => request.endsWith("/responses")).length,
    ).toBeGreaterThan(2);
    await expectPaperLinkAvailable(page);
  });

  test("bounds pending hydration when a safe response request never settles", async ({
    page,
  }) => {
    await page.clock.install();
    let source:
      | PublicPracticeResponse
      | null
      | Promise<PublicPracticeResponse | null> = null;
    let releaseSafeRead!: (response: PublicPracticeResponse | null) => void;
    const neverSettles = new Promise<PublicPracticeResponse | null>(
      (resolve) => {
        releaseSafeRead = resolve;
      },
    );
    const requests = await installHttpTeachingApi(page, {
      restore: () => source,
      submit: practiceResponse("ANALYSIS_PENDING"),
    });
    await page.goto(httpLessonUrl);
    const prompt = page.locator("[data-teaching-practice]");
    await expect(prompt.locator("textarea")).toBeEditable();
    source = neverSettles;
    await prompt.locator("textarea").fill(httpAnswer);
    await prompt.locator("[data-teaching-practice-submit]").click();
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="pending"]'),
    ).toBeVisible();

    await page.clock.runFor(31_000);
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="unavailable"]'),
    ).toBeVisible();
    await expect(prompt.locator("[data-teaching-submitted-answer]")).toHaveText(
      httpAnswer,
    );
    expect(requests.some((request) => request.includes("/ai-jobs/"))).toBe(
      false,
    );
    releaseSafeRead(practiceResponse("ANALYSIS_READY", personalizedAnalysis));
    await page.clock.runFor(3_000);
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="ready"]'),
    ).toHaveCount(0);
    await expectPaperLinkAvailable(page);
  });

  test("polls a fresh retry after local timeout even when the old analysis completed late", async ({
    page,
  }) => {
    await page.clock.install();
    const oldAnalysis = {
      ...personalizedAnalysis,
      improvements: [{ code: "CLARIFY_POSITION", evidence: "demanding work" }],
    };
    const freshAnalysis = {
      ...personalizedAnalysis,
      improvements: [
        { code: "MAKE_OUTCOME_SPECIFIC", evidence: "demanding work" },
      ],
    };
    let lateOldReady = false;
    let retried = false;
    let freshPolls = 0;
    const requests = await installHttpTeachingApi(page, {
      restore: () => {
        if (!retried)
          return lateOldReady
            ? practiceResponse("ANALYSIS_READY", oldAnalysis)
            : practiceResponse("ANALYSIS_PENDING");
        freshPolls += 1;
        return freshPolls === 1
          ? practiceResponse("ANALYSIS_PENDING")
          : practiceResponse("ANALYSIS_READY", freshAnalysis);
      },
      retry: () => {
        retried = true;
        return practiceResponse("ANALYSIS_PENDING");
      },
    });

    await page.goto(httpLessonUrl);
    const prompt = page.locator("[data-teaching-practice]");
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="pending"]'),
    ).toBeVisible();
    await page.clock.runFor(31_000);
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="unavailable"]'),
    ).toBeVisible();

    lateOldReady = true;
    await prompt.locator("[data-teaching-analysis-retry]").click();
    await page.clock.runFor(2_000);
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="ready"]'),
    ).toContainText("把结果写得更具体");
    await expect(prompt).not.toContainText("把立场写得更明确");
    await expect(prompt.locator("[data-teaching-submitted-answer]")).toHaveText(
      httpAnswer,
    );
    expect(freshPolls).toBeGreaterThan(1);
    expect(requests.some((request) => request.includes("/ai-jobs/"))).toBe(
      false,
    );
    await expectPaperLinkAvailable(page);
  });

  test("uses a completed server analysis when retry meets a result that finished after local timeout", async ({
    page,
  }) => {
    await page.clock.install();
    let safeReads = 0;
    const requests = await installHttpTeachingApi(page, {
      restore: () => {
        safeReads += 1;
        return practiceResponse("ANALYSIS_PENDING");
      },
      retry: practiceResponse("ANALYSIS_READY", personalizedAnalysis),
    });

    await page.goto(httpLessonUrl);
    const prompt = page.locator("[data-teaching-practice]");
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="pending"]'),
    ).toBeVisible();
    await page.clock.runFor(31_000);
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="unavailable"]'),
    ).toBeVisible();
    const readsBeforeRetry = safeReads;

    await prompt.locator("[data-teaching-analysis-retry]").click();
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="ready"]'),
    ).toContainText("把结果写得更具体");
    await page.clock.runFor(2_000);

    expect(safeReads).toBe(readsBeforeRetry);
    expect(
      requests.filter((request) =>
        request.includes("/teaching-practice-responses/response-http/retry"),
      ),
    ).toHaveLength(1);
    expect(requests.some((request) => request.includes("/ai-jobs/"))).toBe(
      false,
    );
    await expect(prompt.locator("[data-teaching-submitted-answer]")).toHaveText(
      httpAnswer,
    );
    await expectPaperLinkAvailable(page);
  });

  const accessStates: Array<{
    label: string;
    response: PublicPracticeResponse | null;
    dataState?: "pending" | "unavailable" | "ready";
    expectedText?: string;
  }> = [
    { label: "initial editing", response: null },
    {
      label: "reference ready",
      response: practiceResponse("REFERENCE_READY"),
    },
    {
      label: "analysis pending",
      response: practiceResponse("ANALYSIS_PENDING"),
      dataState: "pending",
    },
    {
      label: "unavailable or unconfigured",
      response: practiceResponse("ANALYSIS_UNAVAILABLE"),
      dataState: "unavailable",
      expectedText: "没有足够依据勉强下结论",
    },
    {
      label: "uncertain without a forced weakness",
      response: practiceResponse("ANALYSIS_UNAVAILABLE"),
      dataState: "unavailable",
      expectedText: "没有足够依据勉强下结论",
    },
    {
      label: "personalized ready",
      response: practiceResponse("ANALYSIS_READY", personalizedAnalysis),
      dataState: "ready",
    },
  ];

  for (const state of accessStates) {
    test(`keeps the timed paper independently navigable during ${state.label}`, async ({
      page,
    }) => {
      const requests = await installHttpTeachingApi(page, {
        restore: state.response,
      });
      await page.goto(httpLessonUrl);
      const prompt = page.locator("[data-teaching-practice]");
      if (state.response) {
        await expect(
          prompt.locator("[data-teaching-answer-review]"),
        ).toBeVisible();
      } else {
        await expect(prompt.locator("textarea")).toBeEditable();
      }
      if (state.dataState) {
        await expect(
          prompt.locator(
            `[data-teaching-analysis][data-state="${state.dataState}"]`,
          ),
        ).toBeVisible();
      }
      if (state.expectedText) {
        await expect(prompt).toContainText(state.expectedText);
      }
      if (state.label === "uncertain without a forced weakness") {
        await expect(
          prompt.locator("[data-teaching-analysis-retry]"),
        ).toBeEnabled();
        await expect(
          prompt.locator("[data-teaching-submitted-answer]"),
        ).toHaveText(httpAnswer);
      }
      await expect(prompt).not.toContainText(backendVocabulary);
      await expectPaperLinkNavigable(page, /\/lesson\/paper\?cycle=cycle-http/);
      expect(requests.some((request) => request.includes("/ai-jobs/"))).toBe(
        false,
      );
    });
  }

  test("renders evidence-based teaching and keeps an optional rewrite separate from the immutable answer", async ({
    page,
  }) => {
    const requests = await installHttpTeachingApi(page, {
      restore: practiceResponse("ANALYSIS_READY", personalizedAnalysis),
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(httpLessonUrl);
    const prompt = page.locator("[data-teaching-practice]");
    const analysis = prompt.locator(
      '[data-teaching-analysis][data-state="ready"]',
    );
    await expect(analysis).toBeVisible();
    await expect(analysis.locator("[data-teaching-strength]")).toHaveCount(1);
    await expect(
      analysis.locator("[data-teaching-key-improvement]"),
    ).toHaveCount(1);
    await expect(
      analysis.locator("[data-teaching-comparison-point]"),
    ).toHaveCount(1);
    const immutable = prompt.locator("[data-teaching-submitted-answer]");
    for (const evidence of await analysis
      .locator("[data-teaching-evidence]")
      .allTextContents()) {
      expect(await immutable.textContent()).toContain(evidence.trim());
    }

    const comparison = prompt.locator("[data-teaching-answer-comparison]");
    expect(await gridColumnCount(comparison)).toBe(2);
    const rewriteToggle = prompt.getByRole("button", {
      name: "现在自己改一次（可选）",
    });
    await rewriteToggle.click();
    const rewrite = prompt.locator("[data-teaching-rewrite]");
    const rewriteDraft = rewrite.getByRole("textbox", {
      name: "你的改写草稿",
    });
    await expect(rewriteDraft).toHaveValue(httpAnswer);
    await rewriteDraft.fill("A private local rewrite that remains optional.");
    await expect(immutable).toHaveText(httpAnswer);
    await prompt.getByRole("button", { name: "收起改写" }).click();
    await prompt
      .getByRole("button", { name: "现在自己改一次（可选）" })
      .click();
    await expect(rewriteDraft).toHaveValue(
      "A private local rewrite that remains optional.",
    );
    expect(
      requests.filter((request) => request.startsWith("POST ")).length,
    ).toBe(0);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await gridColumnCount(comparison)).toBe(1);
    await expectAbove(
      immutable,
      prompt.locator("[data-teaching-reference-answer]"),
    );
    await expectAbove(
      prompt.locator("[data-teaching-reference-answer]"),
      prompt.locator("[data-teaching-reference-reasoning]"),
    );
    await expectAbove(
      prompt.locator("[data-teaching-reference-reasoning]"),
      analysis,
    );
    await expectAbove(analysis, rewrite);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    await expectBasicAccessibility(page);
    const axe = await new AxeBuilder({ page })
      .include("[data-teaching-practice]")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    await expect(prompt).not.toContainText(backendVocabulary);
    await expectPaperLinkNavigable(page, /\/lesson\/paper\?cycle=cycle-http/);
  });

  test("does not invent a weakness or rewrite for an effective alternative", async ({
    page,
  }) => {
    await installHttpTeachingApi(page, {
      restore: practiceResponse("ANALYSIS_READY", {
        kind: "PERSONALIZED_ATOMS_V1",
        strengths: [
          {
            code: "EXPLICIT_CAUSAL_LINK",
            evidence: "protect longer periods",
          },
        ],
        comparisons: [],
        improvements: [],
        uncertainty: "NONE",
      }),
    });
    await page.goto(httpLessonUrl);
    const prompt = page.locator("[data-teaching-practice]");
    await expect(
      prompt.locator('[data-teaching-analysis][data-state="ready"]'),
    ).toBeVisible();
    await expect(prompt.locator("[data-teaching-key-improvement]")).toHaveCount(
      0,
    );
    await expect(prompt.locator("[data-teaching-rewrite]")).toHaveCount(0);
    await expect(
      prompt.getByRole("button", { name: "现在自己改一次（可选）" }),
    ).toHaveCount(0);
    await expect(prompt).not.toContainText("最值得改的一点");
  });

  test("retries the same answer repeatedly without hiding static teaching or showing a cap", async ({
    page,
  }) => {
    const requests = await installHttpTeachingApi(page, {
      restore: practiceResponse("ANALYSIS_UNAVAILABLE"),
      retry: practiceResponse("ANALYSIS_PENDING"),
    });
    await page.goto(httpLessonUrl);
    const prompt = page.locator("[data-teaching-practice]");
    const immutable = prompt.locator("[data-teaching-submitted-answer]");
    const reference = prompt.locator("[data-teaching-reference-answer]");
    const reasoning = prompt.locator("[data-teaching-reference-reasoning]");

    for (let round = 0; round < 3; round += 1) {
      const retry = prompt.locator("[data-teaching-analysis-retry]");
      await expect(retry).toBeEnabled();
      await retry.focus();
      await page.keyboard.press("Enter");
      await expect(retry).toBeFocused();
      await expect(retry).toBeDisabled();
      await expect(retry).toHaveText("正在重新整理…");
      await expect(immutable).toHaveText(httpAnswer);
      await expect(reference).toHaveText(httpPrompt.referenceAnswerEn);
      await expect(reasoning).toContainText(httpPrompt.referenceReasoningZh);
      await expect(
        prompt.locator('[data-teaching-analysis][data-state="unavailable"]'),
      ).toBeVisible();
    }
    await expect(prompt).not.toContainText(
      /次数|第\s*\d+\s*次|上限|maximum|attempt|retry count/i,
    );
    await expect(prompt.locator("textarea")).toHaveCount(0);
    expect(
      requests.filter((request) =>
        request.includes("/teaching-practice-responses/response-http/retry"),
      ).length,
    ).toBe(3);
    expect(requests.some((request) => request.includes("/ai-jobs/"))).toBe(
      false,
    );
    await expectPaperLinkNavigable(page, /\/lesson\/paper\?cycle=cycle-http/);
  });
});
