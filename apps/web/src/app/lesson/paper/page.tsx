"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, FileCheck2, FileText, LoaderCircle, Send } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { cn } from "@/components/utils";
import {
  ActionLink,
  Badge,
  Button,
  Card,
  DemoLanguageEvidenceNotice,
  LoadingButtonContent,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { useDemoResource } from "@/components/use-demo-resource";
import { useFocusedPackageRecovery } from "@/components/use-focused-package-recovery";
import {
  LearningClientError,
  learningClient,
  learningClientDemoMode,
  type PracticePaperQuestion,
} from "@/lib/client";
import {
  learningRouteHref,
  singleRouteParam,
  type LearningSearchParams,
} from "@/lib/client/learning-route";

import styles from "./paper.module.css";

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

type PaperView = "focus" | "overview";

function parseQuestionIndex(value: string | null | undefined): number {
  const parsed = value ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed - 1 : 0;
}

function keepFocusedControlAboveSubmitBar(control: HTMLElement): void {
  window.requestAnimationFrame(() => {
    const submitBar = document.querySelector<HTMLElement>(
      "[data-paper-submit-bar]",
    );
    if (!submitBar) return;

    const visibleControl = control.closest("label") ?? control;
    const controlRect = visibleControl.getBoundingClientRect();
    const submitRect = submitBar.getBoundingClientRect();
    const rootStyle = window.getComputedStyle(document.documentElement);
    const safeGap =
      Number.parseFloat(rootStyle.getPropertyValue("--desk-space-4")) || 16;
    const overlap = controlRect.bottom + safeGap - submitRect.top;
    if (overlap > 0) window.scrollBy({ top: overlap, behavior: "auto" });
  });
}

function AnswerField({
  question,
  answer,
  disabled,
  onChange,
}: {
  question: PracticePaperQuestion;
  answer: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  if (question.responseMode === "choice") {
    return (
      <fieldset
        className={cn("practice-paper-options", styles.options)}
        disabled={disabled}
      >
        <legend className="sr-only">{question.titleZh}</legend>
        {question.options.map((option) => (
          <label
            className={answer === option.key ? styles.selected : undefined}
            key={option.key}
          >
            <input
              checked={answer === option.key}
              name={question.id}
              onChange={() => onChange(option.key)}
              onFocus={(event) =>
                keepFocusedControlAboveSubmitBar(event.currentTarget)
              }
              type="radio"
              value={option.key}
            />
            <span>{option.key}</span>
            <strong lang="en">{option.labelEn}</strong>
          </label>
        ))}
      </fieldset>
    );
  }
  const count = wordCount(answer);
  return (
    <div className={cn("practice-paper-answer", styles.answer)}>
      <textarea
        aria-label={`${question.titleZh} answer`}
        disabled={disabled}
        lang="en"
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) =>
          keepFocusedControlAboveSubmitBar(event.currentTarget)
        }
        placeholder="Write your answer here."
        rows={question.responseMode === "paragraph" ? 8 : 4}
        spellCheck={false}
        value={answer}
      />
      <span>
        {count} words · {question.minimumWords}–{question.maximumWords}
      </span>
    </div>
  );
}

export default function PracticePaperPage({
  searchParams,
}: {
  searchParams: Promise<LearningSearchParams>;
}) {
  const query = use(searchParams);
  const cycleId = singleRouteParam(query, "cycle");
  const lessonId = singleRouteParam(query, "lesson");
  const requestedView = singleRouteParam(query, "view");
  const requestedQuestion = singleRouteParam(query, "question");
  const router = useRouter();
  const { text, messages } = useLocale();
  const loader = useCallback(
    () =>
      cycleId && lessonId
        ? learningClient.getPracticePaper(cycleId, lessonId)
        : Promise.reject(
            new LearningClientError(
              "This practice paper is missing its identity. Open it from Today.",
              { status: 400, code: "LEARNING_ROUTE_IDENTITY_REQUIRED" },
            ),
          ),
    [cycleId, lessonId],
  );
  const { data, error, loading, retry } = useDemoResource(loader);
  const demoMode = learningClientDemoMode;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [paperView, setPaperView] = useState<PaperView>(() =>
    requestedView === "overview" ? "overview" : "focus",
  );
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(() =>
    parseQuestionIndex(requestedQuestion),
  );
  const replace = useCallback(
    (targetLessonId: string) =>
      learningClient.replaceLegacyLesson(targetLessonId),
    [],
  );
  const recoveryState = useFocusedPackageRecovery({
    available: Boolean(data),
    error,
    lessonId,
    refresh: retry,
    replace,
  });
  const feedbackHref = cycleId
    ? learningRouteHref("/feedback", { cycleId })
    : "/today";

  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(() => setAnswers(data.answers), 0);
    return () => window.clearTimeout(timer);
  }, [data]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!data || data.submittedAt) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(
        `iwc:practice-paper:${data.id}`,
        JSON.stringify(answers),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [answers, data]);
  useEffect(() => {
    if (!data || Object.keys(data.answers).length > 0 || data.submittedAt)
      return;
    const cached = window.localStorage.getItem(`iwc:practice-paper:${data.id}`);
    if (!cached) return;
    let timer: number | undefined;
    try {
      const parsed: unknown = JSON.parse(cached);
      if (parsed && typeof parsed === "object")
        timer = window.setTimeout(
          () => setAnswers(parsed as Record<string, string>),
          0,
        );
    } catch {
      window.localStorage.removeItem(`iwc:practice-paper:${data.id}`);
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [data]);

  const answered = data
    ? data.questions.filter((question) => Boolean(answers[question.id]?.trim()))
        .length
    : 0;
  const elapsedSeconds = data?.startedAt
    ? Math.max(0, Math.floor((now - Date.parse(data.startedAt)) / 1_000))
    : 0;
  const remainingSeconds = Math.max(0, 60 * 60 - elapsedSeconds);
  const timedOut = remainingSeconds === 0 && !data?.submittedAt;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const resultById = useMemo(
    () =>
      new Map(
        data?.result?.itemResults.map((item) => [item.itemId, item]) ?? [],
      ),
    [data],
  );
  const currentQuestionIndex = data
    ? Math.min(
        Math.max(activeQuestionIndex, 0),
        Math.max(data.questions.length - 1, 0),
      )
    : activeQuestionIndex;

  const updatePaperLocation = useCallback(
    (nextView: PaperView, questionIndex: number) => {
      const params = new URLSearchParams(window.location.search);
      params.set("view", nextView);
      if (nextView === "focus") {
        params.set("question", String(questionIndex + 1));
      } else {
        params.delete("question");
      }
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}?${params.toString()}`,
      );
    },
    [],
  );

  const selectQuestion = useCallback(
    (questionIndex: number) => {
      if (!data) return;
      const safeIndex = Math.min(
        Math.max(questionIndex, 0),
        Math.max(data.questions.length - 1, 0),
      );
      setActiveQuestionIndex(safeIndex);
      updatePaperLocation("focus", safeIndex);
      window.requestAnimationFrame(() => {
        const target = document.getElementById(
          `paper-question-${data.questions[safeIndex]?.id}`,
        );
        target?.scrollIntoView({ behavior: "auto", block: "start" });
        const activeElement = document.activeElement;
        if (
          target &&
          (!activeElement ||
            activeElement === document.body ||
            activeElement.closest("[data-paper-question-nav]"))
        ) {
          target.focus({ preventScroll: true });
        }
      });
    },
    [data, updatePaperLocation],
  );

  const selectView = useCallback(
    (nextView: PaperView) => {
      setPaperView(nextView);
      updatePaperLocation(nextView, currentQuestionIndex);
      window.requestAnimationFrame(() => {
        if (nextView === "focus") window.scrollTo({ top: 0, behavior: "auto" });
      });
    },
    [currentQuestionIndex, updatePaperLocation],
  );

  if (!data) {
    if (loading && !error && recoveryState === "IDLE")
      return <Skeleton label={messages.common.loading} />;

    const preparing = recoveryState === "PREPARING";
    const writingHref = cycleId
      ? learningRouteHref("/write", { cycleId })
      : "/write";
    return (
      <Card
        className={cn("practice-paper-replace", styles.emptyState)}
        role="status"
      >
        <h1>
          {preparing
            ? text("正在为你准备专项训练卷", "Preparing your focused paper")
            : text(
                "专项训练卷会继续准备",
                "Your focused paper will keep preparing",
              )}
        </h1>
        <p>
          {preparing
            ? text(
                "你的原有学习记录已保留。完成后，这里会自动显示与专项教学对应的完整训练卷。",
                "Your earlier learning record is safe. This page will show the complete paper that matches your focused teaching automatically when it is ready.",
              )
            : text(
                "你的原有学习记录已保留。你可以先查看批改报告或继续写作，稍后回来即可。",
                "Your earlier learning record is safe. You can review feedback or keep writing, then return later.",
              )}
        </p>
        <div className="completion-actions">
          <ActionLink href={feedbackHref}>
            {text("查看批改报告", "View feedback")}
          </ActionLink>
          <ActionLink href={writingHref} variant="secondary">
            {text("继续写作", "Keep writing")}
          </ActionLink>
        </div>
      </Card>
    );
  }

  if (data.evaluationPending) {
    const teachingHref = learningRouteHref("/lesson", {
      cycleId: data.cycleId,
      lessonId: data.id,
    });
    const pendingFeedbackHref = learningRouteHref("/feedback", {
      cycleId: data.cycleId,
      lessonId: data.id,
    });
    return (
      <Card className={cn("practice-paper-processing", styles.processingState)}>
        <LoaderCircle className="spin" aria-hidden="true" size={42} />
        <h1>
          {text("AI正在批改整张试卷", "AI is reviewing the complete paper")}
        </h1>
        <p>
          {text(
            "会按每道题的要求批改，完成后重点讲解需要改进的地方。",
            "Each answer is reviewed against its own task, with extra explanation for anything that needs work.",
          )}
        </p>
        <div className={styles.processingActions}>
          <Button onClick={retry} variant="secondary">
            {text("查看是否完成", "Check progress")}
          </Button>
          <ActionLink href={teachingHref} variant="secondary">
            {text("返回专项教学", "Back to focused teaching")}
          </ActionLink>
          <ActionLink href={pendingFeedbackHref} variant="secondary">
            {text("查看批改报告", "View feedback")}
          </ActionLink>
          <ActionLink href="/today" variant="ghost">
            {text("回到今日计划", "Back to Today")}
          </ActionLink>
        </div>
      </Card>
    );
  }

  return (
    <div
      className={cn("practice-paper-page", styles.page)}
      data-paper-view={paperView}
    >
      <PageHeader
        actions={
          <div
            className={cn(
              "practice-paper-header-actions",
              styles.headerActions,
            )}
          >
            <ActionLink
              href={learningRouteHref("/lesson", {
                cycleId: data.cycleId,
                lessonId: data.id,
              })}
              onClick={() => {
                window.localStorage.setItem(
                  `iwc:practice-paper:${data.id}`,
                  JSON.stringify(answers),
                );
              }}
              trailing={false}
              variant="secondary"
            >
              <FileCheck2 aria-hidden="true" size={17} />
              {text("返回专项教学", "Back to focused teaching")}
            </ActionLink>
            <ActionLink
              href={learningRouteHref("/feedback", {
                cycleId: data.cycleId,
                lessonId: data.id,
              })}
              onClick={() => {
                window.localStorage.setItem(
                  `iwc:practice-paper:${data.id}`,
                  JSON.stringify(answers),
                );
              }}
              trailing={false}
              variant="secondary"
            >
              <FileText aria-hidden="true" size={17} />
              {text("查看详细批改", "View detailed feedback")}
            </ActionLink>
            <div
              aria-label={text("试卷显示方式", "Paper display mode")}
              className={styles.viewToggle}
              role="group"
            >
              <button
                aria-pressed={paperView === "focus"}
                data-paper-view-toggle="focus"
                onClick={() => selectView("focus")}
                type="button"
              >
                {text("逐题", "Focus")}
              </button>
              <button
                aria-pressed={paperView === "overview"}
                data-paper-view-toggle="overview"
                onClick={() => selectView("overview")}
                type="button"
              >
                {text("总览", "Overview")}
              </button>
            </div>
            {data.submittedAt ? (
              <Badge tone={demoMode ? "neutral" : "blue"}>
                <FileCheck2 aria-hidden="true" size={14} />
                {text("已交卷", "Submitted")}
              </Badge>
            ) : (
              <div
                className={cn("practice-paper-clock", styles.clock)}
                aria-label={text("剩余时间", "Time remaining")}
              >
                <Clock3 aria-hidden="true" size={18} />
                <strong>
                  {minutes}:{String(seconds).padStart(2, "0")}
                </strong>
              </div>
            )}
          </div>
        }
        eyebrow={text("60分钟专项训练卷", "60-minute focused practice paper")}
        title={text(data.titleZh, data.titleEn)}
        description={text(data.objectiveZh, data.objectiveEn)}
      />

      {demoMode && data.result ? <DemoLanguageEvidenceNotice /> : null}

      {data.result ? (
        <Card className={cn("practice-paper-summary", styles.resultSummary)}>
          <div>
            <strong>
              {demoMode ? "—" : Math.round(data.result.totalScore)}
            </strong>
            <span>{demoMode ? text("未评分", "Unscored") : "/ 100"}</span>
          </div>
          <div>
            <p className="eyebrow">
              {demoMode
                ? text("演示交卷记录", "Demo submission record")
                : text("整卷结果", "Paper result")}
            </p>
            <h2>
              {demoMode
                ? text("交卷流程已完成", "Submission flow complete")
                : text("先看未达标题", "Review only what needs work")}
            </h2>
            <p>{data.result.summaryZh}</p>
          </div>
        </Card>
      ) : (
        <Card
          className={cn("practice-paper-instructions", styles.instructions)}
        >
          <div>
            <strong>{text("8题 · 60分钟", "8 questions · 60 minutes")}</strong>
            <span>
              {text(
                "完成整卷后统一交卷，交卷前不显示答案或批改。",
                "Submit once after completing the paper. Answers and feedback stay hidden until then.",
              )}
            </span>
          </div>
          <strong>
            {answered} / {data.questions.length}
          </strong>
        </Card>
      )}

      <div className={styles.paperLayout}>
        <nav
          aria-label={text("试卷题目", "Paper questions")}
          className={styles.questionNavigation}
          data-paper-question-nav
        >
          <p>
            <span>{text("试卷题目", "Questions")}</span>
            <strong>
              {answered}/{data.questions.length}
            </strong>
          </p>
          <ol>
            {data.questions.map((question, index) => {
              const isAnswered = Boolean(answers[question.id]?.trim());
              return (
                <li key={question.id}>
                  <a
                    aria-label={text(
                      `第 ${index + 1} 题${isAnswered ? "，已作答" : ""}`,
                      `Question ${index + 1}${isAnswered ? ", answered" : ""}`,
                    )}
                    aria-current={
                      paperView === "focus" && currentQuestionIndex === index
                        ? "step"
                        : undefined
                    }
                    data-answered={isAnswered ? "true" : "false"}
                    href={`#paper-question-${question.id}`}
                    onClick={(event) => {
                      setActiveQuestionIndex(index);
                      if (paperView === "focus") {
                        event.preventDefault();
                        selectQuestion(index);
                        return;
                      }
                      window.requestAnimationFrame(() => {
                        document
                          .getElementById(`paper-question-${question.id}`)
                          ?.focus({ preventScroll: true });
                      });
                    }}
                  >
                    {index + 1}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>

        <div
          className={cn("practice-paper-questions", styles.questions)}
          data-paper-sheet
        >
          {(paperView === "focus"
            ? data.questions.slice(
                currentQuestionIndex,
                currentQuestionIndex + 1,
              )
            : data.questions
          ).map((question) => {
            const result = resultById.get(question.id);
            const needsWork = result?.status !== "MEETS_STANDARD";
            const hasGenericTitle = /^第\s*\d+\s*题$/u.test(question.titleZh);
            return (
              <Card
                className={cn("practice-paper-question", styles.question)}
                data-paper-question-id={question.id}
                id={`paper-question-${question.id}`}
                key={question.id}
                tabIndex={-1}
              >
                <header className={styles.questionHeader}>
                  <div>
                    <Badge
                      tone={
                        result
                          ? demoMode
                            ? "neutral"
                            : needsWork
                              ? "amber"
                              : "blue"
                          : "blue"
                      }
                    >
                      {result
                        ? demoMode
                          ? text("未进行语言评估", "No language evaluation")
                          : needsWork
                            ? text("需要解析", "Needs review")
                            : text("已达标", "Meets standard")
                        : `${question.number}`}
                    </Badge>
                    <span>{text("题", "Question")}</span>
                  </div>
                  <span>
                    <Clock3 aria-hidden="true" size={14} />
                    {question.suggestedMinutes} {messages.common.minutes}
                  </span>
                </header>
                <h2 className={hasGenericTitle ? "sr-only" : undefined}>
                  {text(question.titleZh, question.titleEn)}
                </h2>
                <p
                  className={cn(
                    "practice-paper-instruction",
                    styles.instruction,
                  )}
                >
                  {question.instructionZh}
                </p>
                {question.sourceText ? (
                  <blockquote lang="en">{question.sourceText}</blockquote>
                ) : null}
                {question.promptEn !== question.sourceText ? (
                  <p
                    className={cn("practice-paper-prompt", styles.prompt)}
                    lang="en"
                  >
                    {question.promptEn}
                  </p>
                ) : null}
                <AnswerField
                  answer={answers[question.id] ?? ""}
                  disabled={Boolean(data.submittedAt) || timedOut}
                  onChange={(value) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: value,
                    }))
                  }
                  question={question}
                />
                {result && needsWork && !demoMode ? (
                  <div
                    className={cn("practice-paper-analysis", styles.analysis)}
                  >
                    <h3>
                      {text("这题为什么没有达标", "Why this answer needs work")}
                    </h3>
                    <p>{result.feedbackZh}</p>
                    {result.problems.map((problem, index) => (
                      <div key={`${question.id}-problem-${index}`}>
                        <p>{problem.explanationZh}</p>
                        {problem.evidence ? (
                          <blockquote lang="en">{problem.evidence}</blockquote>
                        ) : null}
                      </div>
                    ))}
                    {result.improvedAnswerEn ? (
                      <div
                        className={cn("practice-paper-example", styles.example)}
                      >
                        <strong>{text("参考改法", "Improved version")}</strong>
                        <p lang="en">{result.improvedAnswerEn}</p>
                      </div>
                    ) : null}
                    <p>
                      <b>{text("下一步：", "Next: ")}</b>
                      {result.nextStepZh}
                    </p>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      </div>

      {paperView === "focus" ? (
        <nav
          aria-label={text("题目分页", "Question pagination")}
          className={styles.pageNavigation}
          data-paper-page-nav
        >
          <button
            data-paper-question-prev
            disabled={currentQuestionIndex <= 0}
            onClick={() => selectQuestion(currentQuestionIndex - 1)}
            type="button"
          >
            <span aria-hidden="true">←</span>
            {text("上一题", "Previous")}
          </button>
          <span aria-live="polite">
            {text(
              `第 ${currentQuestionIndex + 1} / ${data.questions.length} 题`,
              `Question ${currentQuestionIndex + 1} of ${data.questions.length}`,
            )}
          </span>
          <button
            data-paper-question-next
            disabled={currentQuestionIndex >= data.questions.length - 1}
            onClick={() => selectQuestion(currentQuestionIndex + 1)}
            type="button"
          >
            {text("下一题", "Next")}
            <span aria-hidden="true">→</span>
          </button>
        </nav>
      ) : null}

      {submitError ? (
        <p
          className={cn("practice-paper-error", styles.submitError)}
          role="alert"
        >
          {submitError}
        </p>
      ) : null}
      <footer
        className={cn("practice-paper-submit", styles.submitBar)}
        data-paper-submit-bar
      >
        {data.result ? (
          <>
            <div>
              <strong>{text("交卷记录已保存", "Submission saved")}</strong>
              <span>
                {text(
                  "下一步是24小时后的闭卷重写。",
                  "The next step is a closed-book rewrite after 24 hours.",
                )}
              </span>
            </div>
            <Button
              disabled={finishing}
              onClick={() => {
                setFinishing(true);
                void learningClient
                  .completePracticePaper(data.id)
                  .then(() => router.push("/today"))
                  .catch((cause) =>
                    setSubmitError(
                      cause instanceof Error
                        ? cause.message
                        : "Could not continue.",
                    ),
                  )
                  .finally(() => setFinishing(false));
              }}
              size="lg"
            >
              {finishing ? (
                <LoadingButtonContent label={text("正在保存", "Saving")} />
              ) : (
                text("完成复盘并继续", "Finish review")
              )}
            </Button>
          </>
        ) : (
          <>
            <div>
              <strong>
                {answered} / {data.questions.length}{" "}
                {text("题已作答", "answered")}
              </strong>
              <span>
                {timedOut
                  ? text(
                      "时间已到，答案已锁定，请立即交卷。",
                      "Time is up. Your answers are locked; submit the paper now.",
                    )
                  : text(
                      "交卷后才能查看整卷批改。",
                      "Whole-paper feedback appears after submission.",
                    )}
              </span>
            </div>
            <Button
              disabled={submitting}
              onClick={() => {
                setSubmitting(true);
                setSubmitError("");
                const completeAnswerSheet = Object.fromEntries(
                  data.questions.map((question) => [
                    question.id,
                    answers[question.id] ?? "",
                  ]),
                );
                void learningClient
                  .submitPracticePaper(data.id, completeAnswerSheet)
                  .then(() => {
                    window.localStorage.removeItem(
                      `iwc:practice-paper:${data.id}`,
                    );
                    retry();
                  })
                  .catch((cause) =>
                    setSubmitError(
                      cause instanceof Error
                        ? cause.message
                        : "Submission failed.",
                    ),
                  )
                  .finally(() => setSubmitting(false));
              }}
              size="lg"
            >
              {submitting ? (
                <LoadingButtonContent
                  label={text("正在交卷并批改", "Submitting paper")}
                />
              ) : (
                <>
                  <Send aria-hidden="true" size={18} />
                  {timedOut
                    ? text("时间到，交卷", "Time is up — submit")
                    : text("交卷", "Submit paper")}
                </>
              )}
            </Button>
          </>
        )}
      </footer>
    </div>
  );
}
