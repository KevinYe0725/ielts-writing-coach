"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  LoaderCircle,
  RotateCcw,
  Send,
} from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import {
  ActionLink,
  Badge,
  Button,
  Card,
  LoadingButtonContent,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { useDemoResource } from "@/components/use-demo-resource";
import {
  LearningClientError,
  learningClient,
  type PracticePaperQuestion,
} from "@/lib/client";
import {
  learningRouteHref,
  singleRouteParam,
  type LearningSearchParams,
} from "@/lib/client/learning-route";

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
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
      <fieldset className="practice-paper-options" disabled={disabled}>
        <legend className="sr-only">{question.titleZh}</legend>
        {question.options.map((option) => (
          <label
            className={answer === option.key ? "selected" : ""}
            key={option.key}
          >
            <input
              checked={answer === option.key}
              name={question.id}
              onChange={() => onChange(option.key)}
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
    <div className="practice-paper-answer">
      <textarea
        aria-label={`${question.titleZh} answer`}
        disabled={disabled}
        lang="en"
        onChange={(event) => onChange(event.target.value)}
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
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [replacementState, setReplacementState] = useState<
    "PREPARING" | "CONTINUING_SAFELY" | "UNAVAILABLE" | null
  >(null);
  const feedbackHref = cycleId
    ? learningRouteHref("/feedback", { cycleId })
    : "/today";

  const startReplacement = () => {
    if (!lessonId) return;
    setReplacing(true);
    setSubmitError("");
    void learningClient
      .replaceLegacyLesson(lessonId)
      .then((result) => {
        if (result.state === "READY") {
          setReplacementState(null);
          retry();
          router.refresh();
          return;
        }
        setReplacementState(result.state);
      })
      .catch(() => setReplacementState("UNAVAILABLE"))
      .finally(() => setReplacing(false));
  };

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

  if (loading) return <Skeleton label={messages.common.loading} />;
  if (error || !data) {
    const legacy =
      error instanceof LearningClientError &&
      error.code === "PRACTICE_PAPER_REPLACEMENT_REQUIRED";
    return (
      <Card className="practice-paper-replace" role="alert">
        {legacy ? (
          <FileText aria-hidden="true" size={42} />
        ) : (
          <AlertTriangle aria-hidden="true" size={42} />
        )}
        <h1>
          {legacy
            ? text(
                "旧版专项训练已停止使用",
                "The old practice format has been retired",
              )
            : text("专项训练卷暂不可用", "Practice paper unavailable")}
        </h1>
        <p>
          {replacementState === "PREPARING"
            ? text(
                "新版训练正在准备中。你的原有训练记录已保留；你可以先返回批改报告，稍后再回来查看。",
                "Your updated practice is being prepared. Your earlier record is safe; you can return to feedback and check again later.",
              )
            : replacementState === "UNAVAILABLE"
              ? text(
                  "你的原有训练记录已保留。新版训练暂时无法生成；你可以稍后重试，或返回批改报告。",
                  "Your earlier practice record is safe. The updated practice is unavailable for now; try again later or return to feedback.",
                )
              : legacy
                ? text(
                    "系统会保留原有训练记录，并根据可用信息生成一份完整的60分钟专项训练卷。",
                    "Your earlier practice record will be preserved while one complete 60-minute paper is prepared.",
                  )
                : error?.message}
        </p>
        <div className="completion-actions">
          {legacy && lessonId ? (
            <Button disabled={replacing} onClick={startReplacement}>
              {replacing ? (
                <LoadingButtonContent
                  label={text("正在生成新版试卷", "Creating the new paper")}
                />
              ) : (
                <>
                  {replacementState === "PREPARING"
                    ? text("检查是否已准备好", "Check whether it is ready")
                    : text(
                        "生成新的专项教学和训练卷",
                        "Create updated teaching and paper",
                      )}
                </>
              )}
            </Button>
          ) : (
            <Button onClick={retry} variant="secondary">
              <RotateCcw aria-hidden="true" size={17} />
              {text("重试", "Try again")}
            </Button>
          )}
          <ActionLink href={feedbackHref} variant="secondary">
            {text("返回批改报告", "Return to feedback")}
          </ActionLink>
        </div>
        {submitError ? <p role="alert">{submitError}</p> : null}
      </Card>
    );
  }

  if (data.evaluationPending) {
    return (
      <Card className="practice-paper-processing">
        <LoaderCircle className="spin" aria-hidden="true" size={42} />
        <h1>
          {text("AI正在批改整张试卷", "AI is reviewing the complete paper")}
        </h1>
        <p>
          {text(
            "八道题会使用交卷前公开的评分点统一批改，完成后只展开需要改进的题目。",
            "All eight answers are marked against the criteria shown before submission.",
          )}
        </p>
        <Button onClick={retry} variant="secondary">
          {text("查看是否完成", "Check progress")}
        </Button>
      </Card>
    );
  }

  return (
    <div className="practice-paper-page">
      <PageHeader
        actions={
          <div className="practice-paper-header-actions">
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
            {data.submittedAt ? (
              <Badge tone="green">
                <FileCheck2 aria-hidden="true" size={14} />
                {text("已交卷", "Submitted")}
              </Badge>
            ) : (
              <div
                className="practice-paper-clock"
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

      {data.result ? (
        <Card className="practice-paper-summary">
          <div>
            <strong>{Math.round(data.result.totalScore)}</strong>
            <span>/ 100</span>
          </div>
          <div>
            <p className="eyebrow">{text("整卷结果", "Paper result")}</p>
            <h2>{text("先看未达标题", "Review only what needs work")}</h2>
            <p>{data.result.summaryZh}</p>
          </div>
        </Card>
      ) : (
        <Card className="practice-paper-instructions">
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

      <div className="practice-paper-questions">
        {data.questions.map((question) => {
          const result = resultById.get(question.id);
          const needsWork = result?.status !== "MEETS_STANDARD";
          return (
            <Card className="practice-paper-question" key={question.id}>
              <header>
                <div>
                  <Badge
                    tone={result ? (needsWork ? "amber" : "green") : "blue"}
                  >
                    {result
                      ? needsWork
                        ? text("需要解析", "Needs review")
                        : text("已达标", "Meets standard")
                      : `${question.number}`}
                  </Badge>
                </div>
                <span>
                  <Clock3 aria-hidden="true" size={14} />
                  {question.suggestedMinutes} {messages.common.minutes}
                </span>
              </header>
              {!/^第\s*\d+\s*题$/u.test(question.titleZh) ? (
                <h2>{text(question.titleZh, question.titleEn)}</h2>
              ) : null}
              <p className="practice-paper-instruction">
                {question.instructionZh}
              </p>
              {question.sourceText ? (
                <blockquote lang="en">{question.sourceText}</blockquote>
              ) : null}
              {question.promptEn !== question.sourceText ? (
                <p className="practice-paper-prompt" lang="en">
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
              {result && needsWork ? (
                <div className="practice-paper-analysis">
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
                    <div className="practice-paper-example">
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

      {submitError ? (
        <p className="practice-paper-error" role="alert">
          {submitError}
        </p>
      ) : null}
      <footer className="practice-paper-submit">
        {data.result ? (
          <>
            <div>
              <strong>{text("解析已保存", "Review saved")}</strong>
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
