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
  introductionMarkdown: "先理解方法，再独立完成一道短句练习。",
  estimatedMinutes: 12,
  sections: [
    {
      titleZh: "把方法用到新句子里",
      titleEn: "Apply the method in a new sentence",
      markdown:
        "先说明变化怎样发生，再写出可以观察的结果。\n\n> Flexible schedules protect focused work.\n\n> 先写清机制，再说明结果。",
    },
  ],
  practicePrompts: [httpPrompt],
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
  inlineTeaching?: boolean;
  restore: ResponseSource;
  submit?: ResponseSource;
  retry?: ResponseSource;
  restoreFailureStatus?: number;
  teachingNeedsRecovery?: boolean;
  paperState?: "pending" | "result";
};

const httpAnswer = "Employees can protect longer periods for demanding work.";

const httpPaperQuestions = Array.from({ length: 8 }, (_, index) => ({
  id: `http-paper-question-${index + 1}`,
  number: index + 1,
  section:
    index < 2
      ? "FOUNDATION"
      : index < 4
        ? "REPAIR"
        : index < 6
          ? "GENERATION"
          : "INTEGRATION",
  titleZh: `第 ${index + 1} 题`,
  titleEn: `Question ${index + 1}`,
  instructionZh: "按题面要求完成本题，写清楚原因、作用过程和结果。",
  promptEn: `Complete focused paper question ${index + 1}.`,
  sourceText: index === 0 ? "A short source sentence." : "",
  responseMode:
    index === 0
      ? "choice"
      : index === 1
        ? "short_text"
        : index >= 6
          ? "paragraph"
          : "sentence",
  options:
    index === 0
      ? [
          { key: "A", labelEn: "A complete mechanism and result." },
          { key: "B", labelEn: "An incomplete claim." },
        ]
      : [],
  suggestedMinutes: index >= 6 ? 10 : 5,
  minimumWords: index === 0 ? 1 : index >= 6 ? 80 : 10,
  maximumWords: index === 0 ? 1 : index >= 6 ? 120 : 40,
  publicCriteria: [],
}));

function httpPaperPayload(state: "pending" | "result") {
  const result =
    state === "result"
      ? {
          totalScore: 75,
          summaryZh: "整卷已完成，只展开需要继续修改或暂时无法评分的题目。",
          itemResults: httpPaperQuestions.map((question, index) => ({
            itemId: question.id,
            status:
              index === 1
                ? "NOT_SCORABLE"
                : index === 2
                  ? "NEEDS_WORK"
                  : "MEETS_STANDARD",
            score: index === 1 ? 0 : index === 2 ? 45 : 100,
            feedbackZh:
              index === 1
                ? "这题暂时没有足够内容用于评分。"
                : index === 2
                  ? "这题还需要补出中间机制。"
                  : "答案达到本题要求。",
            strengthsZh: [],
            problems:
              index === 1 || index === 2
                ? [
                    {
                      criterionLabelZh: "题意完成",
                      explanationZh:
                        index === 1
                          ? "当前内容不足，不能形成可靠判断。"
                          : "原因和结果之间缺少作用过程。",
                      evidence: "",
                    },
                  ]
                : [],
            improvedAnswerEn:
              index === 1 || index === 2
                ? "A complete answer links the cause to a visible result through a clear mechanism."
                : "",
            nextStepZh:
              index === 1 || index === 2 ? "补全答案后再次练习。" : "保持。",
          })),
        }
      : null;
  return {
    paper: {
      titleZh: "HTTP 专项训练卷",
      titleEn: "HTTP focused practice paper",
      objectiveZh: "在60分钟内连续完成八道题。",
      objectiveEn: "Complete all eight questions in 60 minutes.",
      instructionsZh: ["统一交卷。"],
      instructionsEn: ["Submit once."],
      items: httpPaperQuestions,
    },
    answers: Object.fromEntries(
      httpPaperQuestions.map((question) => [question.id, ""]),
    ),
    result,
    submitted_at: "2026-08-23T04:00:00.000Z",
    evaluation_pending: state === "pending",
    runtime: { started_at: "2026-08-23T03:00:00.000Z" },
  };
}

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
        body: JSON.stringify({
          teaching: scenario.inlineTeaching
            ? {
                ...httpTeaching,
                practicePrompts: [{ ...httpPrompt, afterSection: 1 }],
              }
            : httpTeaching,
        }),
      });
      return;
    }
    if (
      url.pathname === "/api/v1/lessons/lesson-http/start" &&
      request.method() === "POST"
    ) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ lesson_id: "lesson-http" }),
      });
      return;
    }
    if (
      url.pathname === "/api/v1/lessons/lesson-http/paper" &&
      request.method() === "GET" &&
      scenario.paperState
    ) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(httpPaperPayload(scenario.paperState)),
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

async function expectTrackUsesToken(
  locator: Locator,
  token:
    | "--desk-amber"
    | "--desk-blue"
    | "--desk-evidence-muted"
    | "--desk-green",
): Promise<void> {
  const colors = await locator.evaluate((element, cssToken) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${cssToken})`;
    element.ownerDocument.body.append(probe);
    const expected = window.getComputedStyle(probe).color;
    probe.remove();
    return {
      expected,
      track: window.getComputedStyle(element, "::before").backgroundColor,
    };
  }, token);
  expect(colors.track).toBe(colors.expected);
}

async function expectColorUsesToken(
  locator: Locator,
  token: "--desk-amber" | "--desk-blue" | "--desk-green",
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

async function navigationLink(
  page: import("@playwright/test").Page,
  name: string,
) {
  const label =
    name === "批改报告" ? "批改" : name === "专项提升" ? "提升" : name;
  return page
    .locator("[data-workspace-header]")
    .getByRole("link", { name: label, exact: true });
}

test.describe("feedback, focused teaching and complete practice paper", () => {
  test.skip(
    !deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=true and a demo-mode web server.",
  );

  test.beforeEach(async ({ page }) => resetDemoState(page));

  test("feedback uses the workspace and preserves optional lesson identity", async ({
    page,
  }) => {
    await page.goto(feedbackUrl);

    await expect(page.locator("main")).toHaveAttribute(
      "data-page-layout",
      "workspace",
    );
    const workbench = page.locator("[data-feedback-workbench]");
    await expect(workbench).toBeVisible();
    await expect(
      workbench.locator('[data-feedback-evidence][aria-hidden="true"]').first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /专项教学/ }).first(),
    ).toHaveAttribute("href", /lesson=lesson-collocation-perspective/);
  });

  test("opens a priority and recovers an original-text link after filtering suggestions", async ({
    page,
  }) => {
    await page.goto(feedbackUrl);
    const priorities = page.getByRole("region", {
      name: "这篇作文，先看这几处",
    });
    await expect(priorities).toBeVisible();
    await priorities.getByRole("button").first().click();
    await expect(
      page.locator("[data-feedback-issue][aria-expanded='true']"),
    ).toBeVisible();
    const filters = page.getByRole("group", { name: "筛选修改建议" });
    await filters.getByRole("button", { name: /可选润色/ }).click();
    await expect(
      page.getByText("这里是可选的表达建议，不代表原句有错。", { exact: true }),
    ).toBeVisible();
    const sourceTab = page.getByRole("tab", { name: "原文", exact: true });
    if (await sourceTab.isVisible()) await sourceTab.click();
    const highlight = page.locator("[data-feedback-highlight]").first();
    const issueId = await highlight.getAttribute("data-feedback-highlight");
    await highlight.click();
    await expect(filters.getByRole("button", { name: /全部/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page.locator(`[data-feedback-issue="${issueId}"]`),
    ).toHaveAttribute("aria-expanded", "true");
  });

  test("makes the tutorial goal readable and opens active practice from the contents", async ({
    page,
  }) => {
    await page.goto(lessonUrl);
    await expect(
      page.getByText("本节只练一种能力", { exact: true }),
    ).toBeVisible();
    const toggle = page.locator("[data-teaching-toc-toggle]");
    if (await toggle.isVisible()) await toggle.click();
    await page
      .locator("[data-teaching-toc]")
      .getByRole("link", { name: /随堂练习/ })
      .click();
    await expect(
      page.locator("#teaching-practice-prompts h3").first(),
    ).toBeFocused();
    await expect(page.locator("#teaching-practice-prompts")).toBeInViewport();
  });

  test("offers resizable feedback columns only when the report has enough content space", async ({
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
    await expectLeftOf(essay, suggestions);
    await expect(essay).toHaveCSS("position", "sticky");
    await expect(
      page.getByRole("separator", { name: /调整.*宽度|resize/i }),
    ).toBeVisible();

    await page.setViewportSize({ width: 760, height: 900 });
    await expect(page.getByRole("separator")).toBeHidden();
    await expect(suggestions).toBeVisible();
    await expect(essay).toBeHidden();
    await page.getByRole("tab", { name: "原文", exact: true }).click();
    await expect(essay).toBeVisible();
    await expect(suggestions).toBeHidden();
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

    // Compare activation geometry using the same loaded font. A fallback-to-
    // Apple New York swap can change glyph boxes and wrapping without any hover
    // or selection layout change.
    await page.evaluate(() => document.fonts.ready);

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
    await suggestionsTab.evaluate((element) => {
      document.documentElement.style.scrollBehavior = "auto";
      const top = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top + 200);
    });
    const stickyTabBox = await suggestionsTab.boundingBox();
    expect(stickyTabBox).not.toBeNull();
    expect(stickyTabBox!.y).toBeGreaterThanOrEqual(66);

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
      "build-the-mechanism-one-step-at-a-time",
      "transfer-the-method-to-a-new-topic",
    ]);
    await expect(contents.locator("ol a")).toHaveCount(sectionAnchors.length);
    await expect(
      contents.getByRole("link", { name: /随堂练习/ }),
    ).toHaveAttribute("href", "#teaching-practice-prompts");

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
    const heading = page.locator(
      "#build-the-mechanism-one-step-at-a-time-heading",
    );
    await expect(heading).toBeFocused();
    await expect
      .poll(() =>
        heading.evaluate((element) => element.getBoundingClientRect().top),
      )
      .toBeGreaterThanOrEqual(64);
  });

  test("uses the full reading width under the workspace header", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(lessonUrl);

    const shell = page.locator("[data-app-shell]");
    const layout = page.locator("[data-teaching-layout]");
    await expect(shell).toHaveAttribute("data-sidebar-state", "collapsed");
    await expect(layout).toHaveCSS("display", "grid");
    await expect(page.locator("[data-sidebar-toggle]")).toHaveCount(0);
    await expect(page.locator("[data-teaching-toc-toggle]")).toBeHidden();
    await expect(page.locator("[data-teaching-toc]")).toBeVisible();
    const articleBox = (await page
      .locator("[data-teaching-article]")
      .boundingBox())!;
    expect(articleBox.width).toBeGreaterThanOrEqual(1000);
  });

  test("does not expose backend vocabulary in feedback or focused teaching", async ({
    context,
  }) => {
    for (const [url, readySelector] of [
      [feedbackUrl, "[data-feedback-workbench]"],
      [lessonUrl, "article[data-teaching-article]"],
    ] as const) {
      // Keep each route's hydration lifecycle on its own page. A cold Feedback
      // render may still reload while settling, but it cannot interrupt the
      // Lesson navigation or let either vocabulary scan pass on a skeleton.
      const surfacePage = await context.newPage();
      try {
        await surfacePage.goto(url);
        await expect(
          surfacePage.locator(readySelector),
          `${url} rendered surface`,
        ).toBeVisible();
        await expect(surfacePage.getByRole("main")).not.toContainText(
          backendVocabulary,
        );
      } finally {
        await surfacePage.close();
      }
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
    const markdownBlocks = article.locator('[data-teaching-block="MARKDOWN"]');
    await expect(markdownBlocks).toHaveCount(3);
    await expect(markdownBlocks.nth(0)).toContainText(
      "机制说明中间发生了什么变化",
    );
    await expect(markdownBlocks.nth(1)).toContainText(
      "Separated cycle lanes can make short journeys feel safer",
    );
    await expect(markdownBlocks.nth(2)).toContainText("因果链当作万能结构");
    await expect(
      article.locator('[data-teaching-block="PRACTICE"]'),
    ).toHaveCount(3);
    // Practice is inside the section that teaches its prerequisite, not one final pile.
    for (const section of await article
      .locator("[data-teaching-section]")
      .all()) {
      await expect(section.locator("[data-teaching-practice]")).toHaveCount(1);
      await expect(section.locator("[data-teaching-continue]")).toBeVisible();
    }
    await expect(article.locator("[data-teaching-practice]")).toHaveCount(3);
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
    const markdownBlocks = article.locator('[data-teaching-block="MARKDOWN"]');
    await expect(markdownBlocks).toHaveCount(2);
    await expect(markdownBlocks.nth(0)).toContainText("pose a risk to");
    await expect(markdownBlocks.nth(1)).toContainText("用三个问题管住搭配选择");
    await expect(article).toContainText(
      "Untreated industrial waste poses a serious risk to river ecosystems.",
    );
    await expect(article).toContainText(
      "Housing costs have a substantial influence on where young adults choose to live.",
    );
    await expect(article.getByText("只给结论", { exact: true })).toHaveCount(0);
    await expect(article.locator("[data-teaching-practice]")).toHaveCount(3);
    await expect(article.locator('input[type="radio"]')).toHaveCount(3);
    await expect(article.locator("textarea")).toHaveCount(2);
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
    await expect(submit).toHaveAccessibleName("看看我的思路");
    await submit.click();

    const review = first.locator("[data-teaching-answer-review]");
    await expect(review).toBeVisible();
    await expect(review.getByRole("heading", { level: 4 })).toBeFocused();
    await expect(first.locator("[data-teaching-submitted-answer]")).toHaveText(
      httpAnswer,
    );
    const referenceDisclosure = first.locator(
      "[data-teaching-reference-disclosure]",
    );
    await expect(
      first.locator("[data-teaching-reference-answer]"),
    ).toBeHidden();
    await referenceDisclosure.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(
      first.locator("[data-teaching-reference-answer]"),
    ).toBeVisible();
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
      restored.locator("[data-teaching-reference-answer]"),
    ).toBeHidden();
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
    await expect(
      prompt.locator("[data-teaching-reference-answer]"),
    ).toBeHidden();
    await prompt
      .locator("[data-teaching-reference-disclosure] summary")
      .click();
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
      stackedRects.analysis.top + 2,
    );
    expect(stackedRects.reference.bottom).toBeLessThanOrEqual(
      stackedRects.reasoning.top + 2,
    );
    expect(stackedRects.analysis.bottom).toBeLessThanOrEqual(
      stackedRects.reference.top + 2,
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
    await expect(prompt).toContainText("答案仍在本页");
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

  test("practice paper keeps all utilities and exposes eight question anchors", async ({
    page,
  }) => {
    await page.goto(paperUrl);

    const navigation = page.locator("[data-paper-question-nav]");
    await expect(page.locator(".practice-paper-question")).toHaveCount(8);
    await expect(
      page.getByRole("link", { name: "返回专项教学" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "查看详细批改" }),
    ).toBeVisible();
    await expect(navigation.getByRole("link")).toHaveCount(8);

    for (let questionNumber = 1; questionNumber <= 8; questionNumber += 1) {
      const question = page.locator(
        `#paper-question-demo-paper-question-${questionNumber}`,
      );
      await expect(question).toHaveClass(/practice-paper-question/);
      await expect(
        navigation.getByRole("link", { name: String(questionNumber) }),
      ).toHaveAttribute(
        "href",
        `#paper-question-demo-paper-question-${questionNumber}`,
      );
    }

    await expectBasicAccessibility(page);
    const axe = await new AxeBuilder({ page })
      .include(".practice-paper-page")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
  });

  test("practice paper question navigation only scrolls and preserves the draft", async ({
    page,
  }) => {
    await page.goto(paperUrl);
    const answer = page.getByRole("textbox", { name: "第 2 题 answer" });
    const draft =
      "Early practice makes recurring sentence patterns familiar before the learner faces a demanding writing task.";
    await answer.fill(draft);

    await page
      .locator("[data-paper-question-nav]")
      .getByRole("link", { name: "8" })
      .click();

    await expect(page).toHaveURL(/#paper-question-demo-paper-question-8$/);
    await expect(answer).toHaveValue(draft);
    await expect(
      page.locator("#paper-question-demo-paper-question-8"),
    ).toBeInViewport();
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
      page.getByRole("heading", { name: "看懂问题，学会修改" }),
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

  test("opens report and paper from their real workspace destinations", async ({
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

  test("restores workspace destinations when the paper is opened directly", async ({
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

  test("submits once and keeps the Demo paper explicitly unscored", async ({
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

    const demoNotice = page.locator("[data-demo-language-evidence]");
    await expect(demoNotice).toContainText(
      "虚构演示数据 · Fictional demo data",
    );
    await expect(demoNotice).toContainText(
      "不是语言评估 · Not a language evaluation",
    );
    await expect(
      page.getByText("交卷流程已完成", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("未进行语言评估", { exact: true })).toHaveCount(
      8,
    );
    await expect(page.getByText("已达标", { exact: true })).toHaveCount(0);
    await expect(page.locator(".practice-paper-summary")).not.toContainText(
      /\b(?:45|100)\b/u,
    );
    await expect(page.locator(".practice-paper-page .badge-green")).toHaveCount(
      0,
    );
    const submittedAnswers = await page.evaluate(() =>
      JSON.parse(
        window.localStorage.getItem("iwc:practice-paper-answers") ?? "{}",
      ),
    );
    expect(Object.keys(submittedAnswers)).toHaveLength(8);
    expect(submittedAnswers["demo-paper-question-8"]).toBe("");
  });

  test("final review semantics: Demo paper records the saved submission in both locales", async ({
    page,
  }) => {
    await page.goto(paperUrl);
    await page.getByText("A", { exact: true }).last().click();
    await page.getByRole("button", { name: "交卷" }).click();

    await expect(
      page.getByText("交卷记录已保存", { exact: true }),
    ).toBeVisible();
    const demoNotice = page.locator("[data-demo-language-evidence]");
    await expect(
      demoNotice.locator('[lang="zh-CN"]').getByText("不是语言评估", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      demoNotice
        .locator('[lang="en"]')
        .getByText("Not a language evaluation", { exact: true }),
    ).toBeVisible();
    const switcher = page.locator(".locale-switch:visible");
    await expect(switcher).toHaveAccessibleName("切换到英文界面");
    await switcher.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByText("Submission saved", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Review saved", { exact: true })).toHaveCount(
      0,
    );
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
      window.localStorage.setItem(
        "iwc:practice-paper:lesson-collocation-perspective",
        JSON.stringify({
          "demo-paper-question-2": "A retained answer at the deadline.",
        }),
      );
    });
    await page.goto(paperUrl);

    const retainedAnswer = page.getByRole("textbox", {
      name: "第 2 题 answer",
    });
    await expect(retainedAnswer).toBeDisabled();
    await expect(retainedAnswer).toHaveValue(
      "A retained answer at the deadline.",
    );
    await expect(
      page.getByRole("button", { name: "时间到，交卷" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "时间到，交卷" }).click();
    const submittedAnswers = await page.evaluate(() =>
      JSON.parse(
        window.localStorage.getItem("iwc:practice-paper-answers") ?? "{}",
      ),
    );
    expect(Object.keys(submittedAnswers)).toHaveLength(8);
    expect(submittedAnswers["demo-paper-question-1"]).toBe("");
    expect(submittedAnswers["demo-paper-question-2"]).toBe(
      "A retained answer at the deadline.",
    );
  });
});

async function installHttpTransferApi(
  page: Page,
  state: "processing" | "pass" | "fail" | "no-opportunity" | "evaluation-error",
) {
  const taskId = `transfer-${state}`;
  const task = {
    id: taskId,
    source_cycle_id: "cycle-http-transfer",
    status:
      state === "pass" || state === "fail" || state === "no-opportunity"
        ? "COMPLETED"
        : "READY",
    available_at: "2026-08-23T00:00:00.000Z",
    expires_at: "2026-08-25T00:00:00.000Z",
    target_hint_hidden: true,
    question: {
      id: "question-http-transfer",
      topic: "Public transport",
      questionType: "Opinion",
      prompt: "Cities should make public transport free for all residents.",
      instructions: "To what extent do you agree or disagree?",
    },
    ...(state === "processing"
      ? { pending_job_id: "transfer-job-processing" }
      : {}),
    ...(state === "evaluation-error"
      ? {
          evaluation_error: {
            code: "PROVIDER_UNAVAILABLE",
            safe_message: "The configured evaluator is unavailable.",
          },
        }
      : {}),
    ...(state === "pass" || state === "fail" || state === "no-opportunity"
      ? {
          result: {
            outcome:
              state === "no-opportunity"
                ? "NO_OPPORTUNITY"
                : state.toUpperCase(),
            confidence: state === "no-opportunity" ? null : 0.91,
            feedback_zh:
              state === "pass"
                ? "服务端证据通过。"
                : state === "no-opportunity"
                  ? "本次没有自然迁移机会。"
                  : "服务端证据尚未通过。",
            feedback_en:
              state === "pass"
                ? "The server evidence passed."
                : state === "no-opportunity"
                  ? "No natural transfer opportunity was available."
                  : "The server evidence did not pass.",
            evidence:
              state === "no-opportunity" ? "" : "A frozen first-answer span.",
            status:
              state === "pass"
                ? "QUALIFYING"
                : state === "no-opportunity"
                  ? "NO_OPPORTUNITY"
                  : "INSUFFICIENT",
            transferred: state === "pass",
            gate_missing: state === "fail" ? ["independent use"] : [],
            mock_language_scoring: false,
          },
        }
      : {}),
  };

  await page.route("**/api/v1/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/v1/auth/get-session") {
      await route.fulfill({ contentType: "application/json", body: "null" });
      return;
    }
    if (pathname === "/api/v1/transfer-tasks") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ transfer_tasks: [task] }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "Not found" });
  });

  return `/transfer?cycle=cycle-http-transfer&task=${taskId}`;
}

async function installHttpMissingComparisonApi(page: Page) {
  const scoringVersion = {
    schemaVersion: "1.0.0",
    promptVersion: "1.0.0",
    rubricVersion: "iwc-task2-rubric-1.0.0",
    model: "frozen-model",
  };
  const assessment = (overallBand: number, issue = false) => ({
    schemaVersion: scoringVersion.schemaVersion,
    overallBand,
    criterionScores: {
      taskResponse: overallBand,
      coherenceCohesion: overallBand,
      lexicalResource: overallBand,
      grammar: overallBand,
    },
    issues: issue
      ? [
          {
            id: "issue-missing-span",
            skillId: "comparison_target",
            excerpt: "better than the older",
          },
        ]
      : [],
    versionSnapshot: {
      task: "ielts_assessment",
      promptVersion: scoringVersion.promptVersion,
      rubricVersion: scoringVersion.rubricVersion,
      model: scoringVersion.model,
    },
  });

  await page.route("**/api/v1/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/v1/auth/get-session") {
      await route.fulfill({ contentType: "application/json", body: "null" });
      return;
    }
    if (pathname === "/api/v1/training-cycles/cycle-missing-evidence") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          cycle: {
            id: "cycle-missing-evidence",
            question: { prompt: "A canonical missing-evidence comparison." },
            transferTasks: [{ id: "transfer-missing-evidence" }],
            writingAttempts: [
              {
                id: "attempt-v1-missing",
                kind: "version_1",
                content: "Version one.",
                wordCount: 250,
                assessment: assessment(6, true),
              },
              {
                id: "attempt-v2-missing",
                kind: "version_2",
                content: "Version two.",
                wordCount: 270,
                assessment: assessment(6.5),
              },
            ],
            comparisonEvidence: {
              valid: false,
              payload: {
                comparisonMetrics: {
                  scoringVersion,
                  overall: { v1: 6, v2: 6.5, delta: 0.5 },
                  criteria: {
                    TR: { v1: 6, v2: 6.5, delta: 0.5 },
                    CC: { v1: 6, v2: 6.5, delta: 0.5 },
                    LR: { v1: 6, v2: 6.5, delta: 0.5 },
                    GRA: { v1: 6, v2: 6.5, delta: 0.5 },
                  },
                  wordCounts: { v1: 250, v2: 270 },
                  coreIssueRecurrence: {
                    v1Occurrences: 1,
                    v2Occurrences: 0,
                    v1Per100Words: 0.4,
                    v2Per100Words: 0,
                    deltaPer100Words: -0.4,
                    recurred: false,
                    evidenceVerified: false,
                  },
                },
              },
            },
          },
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "Not found" });
  });
}

test.describe("compare, transfer, and growth evidence records", () => {
  test.skip(
    !deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=true and a demo-mode web server.",
  );

  test.beforeEach(async ({ page }) => resetDemoState(page));

  test("compare preserves authoritative evidence and the exact next-task href", async ({
    page,
  }) => {
    await page.goto("/compare?cycle=cycle-demo");

    const record = page.locator('[data-evidence-record="comparison"]');
    const demoNotice = record.locator("[data-demo-language-evidence]");
    await expect(demoNotice).toContainText(
      "虚构演示数据 · Fictional demo data",
    );
    await expect(demoNotice).toContainText(
      "不是语言评估 · Not a language evaluation",
    );
    await expect(record).toContainText("Version 1");
    await expect(record).toContainText("Version 2");
    await expect(
      record.locator('[data-evidence-state="verified"]'),
    ).toHaveCount(0);
    await expect(record.locator(".badge-green")).toHaveCount(0);
    await expect(record.locator(".version-score strong")).toHaveText([
      "—",
      "—",
    ]);
    await expect(record).toContainText("四项估分变化");
    await expect(record.locator(".criterion-delta")).toHaveCount(4);
    await expect(record).toContainText("每 100 词");
    await expect(record.getByText("未评价", { exact: true })).toHaveCount(3);
    for (const state of ["已消失", "已改善"]) {
      await expect(record.getByText(state, { exact: true })).toHaveCount(0);
    }
    await expect(record).toContainText("证据不足时不声称掌握");
    await expect(page.getByRole("link", { name: /查看安排/ })).toHaveAttribute(
      "href",
      "/transfer?cycle=cycle-demo&task=transfer-task",
    );
    await expect(
      page.getByRole("button", { name: /Mock flow reference/ }),
    ).toBeVisible();
  });

  test("growth keeps fictional Demo scores and mastery states unavailable", async ({
    page,
  }) => {
    await page.goto("/growth");

    const record = page.locator('[data-evidence-record="growth"]');
    const demoNotice = record.locator("[data-demo-language-evidence]");
    await expect(demoNotice).toContainText(
      "虚构演示数据 · Fictional demo data",
    );
    await expect(demoNotice).toContainText(
      "不是语言评估 · Not a language evaluation",
    );
    await expect(
      record.locator('[data-evidence-state="verified"]'),
    ).toHaveCount(0);
    await expect(record.locator(".badge-green")).toHaveCount(0);
    await expect(
      record.getByText("暂无可比较的同量表估分，不生成趋势。"),
    ).toBeVisible();
    await expect(record.locator(".chart-bar-track")).toHaveCount(0);
    await expect(record.getByText("已保持", { exact: true })).toHaveCount(0);
    await expect(record.getByText("已迁移", { exact: true })).toHaveCount(0);
  });

  test("transfer keeps the closed-book protocol and every server outcome explicit", async ({
    page,
  }) => {
    await page.goto("/transfer?cycle=cycle-demo&task=transfer-task");

    const record = page.locator('[data-evidence-record="transfer"]');
    await expect(record).toHaveAttribute("data-poll-interval-ms", "1500");
    await expect(record).toContainText("8 分钟");
    await expect(record).toContainText("90–140 词");
    await expect(record).toContainText("只提示篇幅，不参与本地判分");
    await expect(record).toContainText("目标技能、提示和原题答案均已隐藏");
    const protocolStart = record
      .locator("[data-transfer-protocol] li")
      .first()
      .locator("[data-evidence-state]");
    await expect(protocolStart).toHaveAttribute(
      "data-evidence-state",
      "active",
    );
    await expectColorUsesToken(protocolStart, "--desk-blue");
    for (const state of ["PROCESSING", "PASS", "FAIL", "NO_OPPORTUNITY"]) {
      await expect(record.getByText(state, { exact: true })).toBeVisible();
    }
    await expect(record).toContainText("评估失败：答案已保存，不是学习失败");
    await expect(record).toContainText("Mock 只演示流程，不评分语言");
  });

  test("transfer freezes the first answer and records mock without a language verdict", async ({
    page,
  }) => {
    const firstAnswer =
      "Technology can reduce routine workload because automated tools handle repetitive checks, so teachers can spend more time responding to individual learning needs.";
    await page.goto("/transfer?cycle=cycle-demo&task=transfer-task");
    await page.getByLabel("你的英文答案").fill(firstAnswer);
    await page.getByRole("button", { name: /提交给服务器评估/ }).click();

    await expect(
      page.locator('[data-transfer-state="mock-result"]'),
    ).toBeVisible();
    const mockResult = page.locator('[data-transfer-state="mock-result"]');
    await expect(mockResult).toHaveAttribute(
      "data-evidence-state",
      "unavailable",
    );
    await expectTrackUsesToken(mockResult, "--desk-evidence-muted");
    await expect(page.getByLabel("你的英文答案")).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("iwc.demo.transfer-answer"),
      ),
    ).toBe(firstAnswer);
    await expect(
      page.getByText("Mock：仅演示流程，不是语言评分"),
    ).toBeVisible();
  });

  test("transfer records no natural opportunity without creating failure evidence", async ({
    page,
  }) => {
    await page.goto("/transfer?cycle=cycle-demo&task=transfer-task");
    await page.getByRole("button", { name: "这道题没有自然机会" }).click();

    const result = page.locator('[data-transfer-state="no-opportunity"]');
    await expect(result).toHaveAttribute("data-evidence-state", "unavailable");
    await expectTrackUsesToken(result, "--desk-evidence-muted");
    await expect(result).toContainText("NO_OPPORTUNITY");
    await expect(result).toContainText("不会计为失败");
  });

  test("an expired transfer window can be rescheduled without failure evidence", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const fixtureKey = "iwc.test.transfer-window-expired-installed";
      if (sessionStorage.getItem(fixtureKey)) return;
      localStorage.setItem("iwc.demo.transfer-window-expired", "true");
      sessionStorage.setItem(fixtureKey, "true");
    });
    await page.goto("/transfer?cycle=cycle-demo&task=transfer-task");

    const expired = page.locator('[data-transfer-state="expired"]');
    await expect(expired).toContainText("错过窗口不会产生失败证据");
    await page.getByRole("button", { name: "重新安排迁移窗口" }).click();
    await expect(page).toHaveURL(/\/today$/);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("iwc.demo.transfer-window-expired"),
      ),
    ).toBeNull();
  });
});

test.describe("evidence states over the public HTTP contract", () => {
  test.skip(
    deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=false and an HTTP-mode web server.",
  );

  test("transfer keeps the immutable answer pending while the server processes it", async ({
    page,
  }) => {
    const url = await installHttpTransferApi(page, "processing");
    await page.goto(url);
    const state = page.locator('[data-transfer-state="processing"]');
    await expect(state).toHaveAttribute("aria-busy", "true");
    await expect(state).toContainText("首答已封存，等待服务器评估");
  });

  for (const outcome of ["pass", "fail"] as const) {
    test(`transfer renders the authoritative ${outcome.toUpperCase()} result`, async ({
      page,
    }) => {
      const url = await installHttpTransferApi(page, outcome);
      await page.goto(url);
      const state = page.locator(`[data-transfer-state="${outcome}"]`);
      await expect(state).toHaveAttribute(
        "data-evidence-state",
        outcome === "pass" ? "verified" : "revision",
      );
      await expectTrackUsesToken(
        state,
        outcome === "pass" ? "--desk-green" : "--desk-amber",
      );
      await expect(state.locator(".badge")).toHaveClass(
        outcome === "pass" ? /badge-green/ : /badge-amber/,
      );
      await expect(state).toContainText(`服务器结果：${outcome.toUpperCase()}`);
      await expect(state).toContainText("A frozen first-answer span.");
    });
  }

  test("transfer keeps NO_OPPORTUNITY neutral instead of verifying migration", async ({
    page,
  }) => {
    const url = await installHttpTransferApi(page, "no-opportunity");
    await page.goto(url);
    const state = page.locator('[data-transfer-state="no-opportunity"]');
    await expect(state).toHaveAttribute("data-evidence-state", "unavailable");
    await expectTrackUsesToken(state, "--desk-evidence-muted");
    await expect(state.locator(".badge").first()).toHaveClass(/badge-neutral/);
  });

  test("transfer says a saved answer with evaluation failure is not learning failure", async ({
    page,
  }) => {
    const url = await installHttpTransferApi(page, "evaluation-error");
    await page.goto(url);
    const state = page.locator('[data-transfer-state="evaluation-error"]');
    await expect(state).toContainText("首答已保存，但服务器评估未完成");
    await expect(state).toContainText(
      "这不是学习表现失败，也不会产生 FAIL 证据",
    );
  });

  test("growth does not invent a score trend when the server has no history", async ({
    page,
  }) => {
    await page.route("**/api/v1/**", async (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === "/api/v1/auth/get-session") {
        await route.fulfill({ contentType: "application/json", body: "null" });
        return;
      }
      if (pathname === "/api/v1/growth") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            score_history: [],
            skills: [],
            summary: {
              current_estimated_band: null,
              essays_completed: 0,
              independent_non_recurrence_rate: null,
              recorded_learning_minutes: 0,
              target_band: 7,
            },
          }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: "Not found" });
    });

    await page.goto("/growth");
    await expect(
      page.getByText("暂无可比较的同量表估分，不生成趋势。"),
    ).toBeVisible();
    await expect(page.locator(".chart-column")).toHaveCount(0);
  });

  test("growth keeps ordinary learning time and score movement blue", async ({
    page,
  }) => {
    await page.route("**/api/v1/**", async (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === "/api/v1/auth/get-session") {
        await route.fulfill({ contentType: "application/json", body: "null" });
        return;
      }
      if (pathname === "/api/v1/growth") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            score_history: [{ score: 5.5 }, { score: 6 }],
            skills: [],
            summary: {
              current_estimated_band: 6,
              essays_completed: 2,
              independent_non_recurrence_rate: 25,
              recorded_learning_minutes: 45,
              target_band: 7,
            },
          }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: "Not found" });
    });

    await page.goto("/growth");
    const timeIcon = page
      .getByText("已记录学习", { exact: true })
      .locator("..")
      .locator("..")
      .locator(".stat-icon");
    await expectColorUsesToken(timeIcon, "--desk-blue");
    const movement = page.locator(".score-trend-card .badge");
    await expect(movement).toHaveClass(/badge-blue/);
    await expectColorUsesToken(movement, "--desk-blue");
    await expectColorUsesToken(page.locator(".north-star-icon"), "--desk-blue");
  });

  test("compare with missing canonical span evidence never awards retained", async ({
    page,
  }) => {
    await installHttpMissingComparisonApi(page);
    await page.goto("/compare?cycle=cycle-missing-evidence");

    const record = page.locator('[data-evidence-record="comparison"]');
    await expect(record).toContainText("跨度证据待复核");
    await expect(record).toContainText("本次只记录完成，不授予 retained");
    await expect(record).not.toContainText("闭卷证据达到保留门槛");
    await expect(record).not.toContainText("已保持");
    await expect(page.getByRole("link", { name: "查看安排" })).toHaveAttribute(
      "href",
      "/transfer?cycle=cycle-missing-evidence&task=transfer-missing-evidence",
    );
  });
});

test.describe("tutorial answer analysis over the public HTTP contract", () => {
  test.skip(
    deterministicDemo,
    "Run with NEXT_PUBLIC_DEMO_MODE=false and an HTTP-mode web server.",
  );

  for (const state of ["improve", "effective", "unavailable"] as const) {
    test(`inline teaching prioritizes ${state} answer feedback without a learning gate`, async ({
      page,
    }) => {
      const response =
        state === "unavailable"
          ? practiceResponse("ANALYSIS_UNAVAILABLE")
          : practiceResponse("ANALYSIS_READY", {
              ...personalizedAnalysis,
              improvements:
                state === "effective" ? [] : personalizedAnalysis.improvements,
            });
      const requests = await installHttpTeachingApi(page, {
        inlineTeaching: true,
        restore: response,
      });
      await page.goto(httpLessonUrl);
      const section = page.locator("[data-teaching-section]");
      const prompt = section.locator("[data-teaching-practice]");
      await expect(
        prompt.locator("[data-teaching-submitted-answer]"),
      ).toHaveText(httpAnswer);
      const reference = prompt.locator("[data-teaching-reference-answer]");
      await expect(reference).toBeHidden();
      if (state !== "unavailable") {
        await expect(
          prompt.locator("[data-teaching-key-improvement]"),
        ).toHaveCount(state === "improve" ? 1 : 0);
        for (const evidence of await prompt
          .locator("[data-teaching-evidence]")
          .allTextContents()) {
          expect(httpAnswer).toContain(evidence.trim());
        }
        if (state === "effective")
          await expect(
            prompt.getByRole("button", { name: "现在自己改一次（可选）" }),
          ).toHaveCount(0);
      } else {
        await expect(
          prompt.locator("[data-teaching-analysis-retry]"),
        ).toBeEnabled();
      }
      const disclosure = prompt.locator(
        "[data-teaching-reference-disclosure] summary",
      );
      await disclosure.focus();
      await page.keyboard.press("Enter");
      await expect(reference).toBeVisible();
      await expectAbove(
        prompt.locator("[data-teaching-analysis][data-state]"),
        reference,
      );
      await expect(
        prompt.locator("[data-teaching-submitted-answer]"),
      ).toHaveText(httpAnswer);
      await section.locator("[data-teaching-continue]").click();
      await expect(page.locator("#teaching-paper-next h2")).toBeFocused();
      expect(
        requests.filter((request) => request.startsWith("POST ")),
      ).toHaveLength(0);
      await expectPaperLinkNavigable(page, /\/lesson\/paper\?cycle=cycle-http/);
    });
  }

  test("dynamic Markdown assigns English only to deterministically English quotes", async ({
    page,
  }) => {
    await installHttpTeachingApi(page, { restore: null });
    await page.goto(httpLessonUrl);

    const quotes = page.locator('[data-teaching-block="MARKDOWN"] blockquote');
    const englishQuote = quotes.filter({
      hasText: "Flexible schedules protect focused work.",
    });
    const chineseQuote = quotes.filter({ hasText: "先写清机制，再说明结果。" });
    await expect(englishQuote).toHaveAttribute("lang", "en");
    await expect(chineseQuote).not.toHaveAttribute("lang");
  });

  test("practice paper pending evaluation keeps the explicit progress check", async ({
    page,
  }) => {
    await installHttpTeachingApi(page, {
      restore: null,
      paperState: "pending",
    });

    await page.goto(httpPaperUrl);
    await expect(
      page.getByRole("heading", { name: "AI正在批改整张试卷" }),
    ).toBeVisible();
    const checkProgress = page.getByRole("button", { name: "查看是否完成" });
    await expect(checkProgress).toBeVisible();
    await checkProgress.click();
    await expect(checkProgress).toBeVisible();
  });

  test("practice paper result expands only needs-work and not-scorable answers", async ({
    page,
  }) => {
    await installHttpTeachingApi(page, {
      restore: null,
      paperState: "result",
    });

    await page.goto(httpPaperUrl);
    await expect(page.getByText("已交卷", { exact: true })).toHaveClass(
      /badge-blue/,
    );
    await expect(
      page.locator(".practice-paper-question .badge-green"),
    ).toHaveCount(0);
    await expect(
      page.locator(".practice-paper-question .badge-blue"),
    ).toHaveCount(6);
    await expect(page.getByText("已达标", { exact: true })).toHaveCount(6);
    await expect(page.getByText("需要解析", { exact: true })).toHaveCount(2);
    await expect(
      page.getByRole("heading", { name: "这题为什么没有达标" }),
    ).toHaveCount(2);
    await expect(
      page.getByText("这题暂时没有足够内容用于评分。"),
    ).toBeVisible();
    await expect(page.getByText("这题还需要补出中间机制。")).toBeVisible();
    await expect(page.getByRole("textbox").first()).toBeDisabled();
  });

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
      expectedText: "答案仍在本页",
    },
    {
      label: "uncertain without a forced weakness",
      response: practiceResponse("ANALYSIS_UNAVAILABLE"),
      dataState: "unavailable",
      expectedText: "答案仍在本页",
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
    const evidence = analysis.locator("[data-teaching-evidence]").first();
    const [headingFamily, answerFamily, evidenceFamily] = await Promise.all([
      page
        .getByRole("heading", { name: "把因果链中间的一步写清楚" })
        .evaluate((element) => window.getComputedStyle(element).fontFamily),
      immutable.evaluate(
        (element) => window.getComputedStyle(element).fontFamily,
      ),
      evidence.evaluate(
        (element) => window.getComputedStyle(element).fontFamily,
      ),
    ]);
    expect(headingFamily).toContain("SF Pro Text");
    expect(headingFamily).toContain("PingFang SC");
    expect(headingFamily).not.toContain("New York");
    expect(headingFamily).not.toContain("New York");
    for (const family of [answerFamily, evidenceFamily]) {
      expect(family).toContain("New York");
      expect(family).not.toContain("SF Pro Text");
    }
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
