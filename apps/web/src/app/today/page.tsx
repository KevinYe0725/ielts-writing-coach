"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  Clock3,
  CloudOff,
  Gauge,
  LibraryBig,
  LoaderCircle,
  PenLine,
  Sparkles,
  Target,
} from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import {
  ActionLink,
  Badge,
  Button,
  Card,
  PageHeader,
  SectionHeader,
  Skeleton,
} from "@/components/ui";
import { useDemoResource } from "@/components/use-demo-resource";
import { EssayWorkspace } from "@/components/essay-workspace";
import { PageLayout } from "@/components/layout/page-layout";
import { cn } from "@/components/utils";
import { learningClient, LearningClientError } from "@/lib/client";
import type {
  QuestionOption,
  QuestionRecommendation,
  QuestionTopic,
  QuestionType,
} from "@/lib/client";
import { learningRouteHref } from "@/lib/client/learning-route";
import { saveLearningDestinations } from "@/lib/client/learning-navigation";

import styles from "./today.module.css";

const questionTypes: Array<{ id: QuestionType; zh: string; en: string }> = [
  { id: "opinion", zh: "同意 / 不同意", en: "Opinion" },
  { id: "discussion", zh: "讨论双方", en: "Discussion" },
  {
    id: "advantages_disadvantages",
    zh: "优缺点",
    en: "Advantages / disadvantages",
  },
  { id: "problems_solutions", zh: "问题 / 对策", en: "Problem / solution" },
  { id: "two_part", zh: "双问题", en: "Two-part" },
];

const topics: Array<{ id: QuestionTopic; zh: string; en: string }> = [
  { id: "education", zh: "教育", en: "Education" },
  { id: "technology", zh: "科技", en: "Technology" },
  { id: "environment", zh: "环境", en: "Environment" },
  { id: "health", zh: "健康", en: "Health" },
  { id: "government", zh: "政府", en: "Government" },
  { id: "work_economy", zh: "工作与经济", en: "Work & economy" },
  { id: "society_culture", zh: "社会与文化", en: "Society & culture" },
  { id: "urban_transport", zh: "城市与交通", en: "Cities & transport" },
];

function optionLabel<T extends string>(
  values: Array<{ id: T; zh: string; en: string }>,
  id: T,
  locale: "zh-CN" | "en",
): string {
  const value = values.find((candidate) => candidate.id === id);
  return locale === "zh-CN" ? (value?.zh ?? id) : (value?.en ?? id);
}

function subscribeToLocation(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function newEssaySnapshot() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("new-essay") === "1";
}

function feedbackWaitingNoticeSnapshot() {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get("notice") ===
    "feedback-waiting-ai"
  );
}

const MAX_RECOMMENDATION_POLLS = 5;

export default function TodayPage() {
  const router = useRouter();
  const startingNewEssay = useSyncExternalStore(
    subscribeToLocation,
    newEssaySnapshot,
    () => false,
  );
  const feedbackWaitingNotice = useSyncExternalStore(
    subscribeToLocation,
    feedbackWaitingNoticeSnapshot,
    () => false,
  );
  const [retryingJob, setRetryingJob] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const { locale, text, messages } = useLocale();
  const loader = useCallback(() => learningClient.getToday(), []);
  const { data, error, loading, retry, refresh } = useDemoResource(loader);
  const processing = Boolean(
    !error &&
      data?.pendingJob &&
      ["QUEUED", "LEASED", "RUNNING", "RETRY_SCHEDULED"].includes(
        data.pendingJob.status,
      ),
  );
  useEffect(() => {
    if (!processing) return;
    const update = () => {
      if (document.visibilityState !== "hidden") refresh();
    };
    const timer = window.setInterval(update, 5000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [processing, refresh]);
  const [questions, setQuestions] = useState<QuestionOption[]>([]);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [recommendation, setRecommendation] =
    useState<QuestionRecommendation | null>(null);
  const [recommendationBusy, setRecommendationBusy] = useState(false);
  const [recommendationRetryId, setRecommendationRetryId] = useState<
    string | null
  >(null);
  const recommendationCurrent = useRef<QuestionRecommendation | null>(null);
  const recommendationRequestPending =
    useRef<Promise<QuestionRecommendation> | null>(null);
  const focusRecommendationStart = useRef(false);
  const recommendationStartRef = useRef<HTMLButtonElement>(null);
  const recommendationOperation = useRef(0);
  const recommendationTimers = useRef(new Map<number, () => void>());
  const recommendationActionLocked = useRef(false);
  const cycleOperationLocked = useRef(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [customType, setCustomType] = useState<QuestionType>("opinion");
  const [customTopic, setCustomTopic] = useState<QuestionTopic>("education");
  const [customTrack, setCustomTrack] = useState<
    "academic" | "general_training"
  >("academic");
  useEffect(() => {
    if (data) saveLearningDestinations(data.navigation);
  }, [data]);

  const needsQuestion =
    startingNewEssay ||
    data?.nextTask.id === "question-bank" ||
    data?.nextTask.href.startsWith("/today?mixed-review=1");
  const mixedReview = data?.nextTask.href.startsWith("/today?mixed-review=1");

  const setCurrentRecommendation = useCallback(
    (next: QuestionRecommendation | null) => {
      recommendationCurrent.current = next;
      setRecommendation(next);
    },
    [],
  );

  const cancelRecommendationOperation = useCallback(() => {
    recommendationOperation.current += 1;
    for (const [timeout, resolve] of recommendationTimers.current) {
      window.clearTimeout(timeout);
      resolve();
    }
    recommendationTimers.current.clear();
  }, []);

  const waitForRecommendation = useCallback((milliseconds: number) => {
    return new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        recommendationTimers.current.delete(timeout);
        resolve();
      }, milliseconds);
      recommendationTimers.current.set(timeout, resolve);
    });
  }, []);

  const pollRecommendation = useCallback(
    async (
      id: string,
      operation: number,
      initial: QuestionRecommendation | null = recommendationCurrent.current,
    ) => {
      let next = initial;
      for (let attempt = 0; attempt < MAX_RECOMMENDATION_POLLS; attempt += 1) {
        if (recommendationOperation.current !== operation) return;
        const retryAfterSeconds =
          next?.state === "PREPARING" ? next.retryAfterSeconds : 1;
        await waitForRecommendation(retryAfterSeconds * 1_000);
        if (recommendationOperation.current !== operation) return;
        next = await learningClient.getQuestionRecommendation(id);
        if (recommendationOperation.current !== operation) return;
        setCurrentRecommendation(next);
        if (next.state !== "PREPARING") {
          setRecommendationRetryId(null);
          return;
        }
      }
      if (recommendationOperation.current !== operation) return;
      setRecommendationRetryId(id);
    },
    [setCurrentRecommendation, waitForRecommendation],
  );

  const requestRecommendation = useCallback(
    async (
      input: { action: "INITIAL" | "SWAP"; excludedQuestionId?: string },
      focusStart = false,
    ) => {
      if (recommendationActionLocked.current || cycleOperationLocked.current)
        return;
      recommendationActionLocked.current = true;
      cancelRecommendationOperation();
      const operation = recommendationOperation.current;
      setRecommendationBusy(true);
      setRecommendationRetryId(null);
      setQuestionError(null);
      if (focusStart) focusRecommendationStart.current = true;
      try {
        const request = learningClient.requestQuestionRecommendation(input);
        recommendationRequestPending.current = request;
        const next = await request;
        if (recommendationRequestPending.current === request)
          recommendationRequestPending.current = null;
        if (recommendationOperation.current !== operation) return;
        setCurrentRecommendation(next);
        if (next.state === "PREPARING")
          await pollRecommendation(next.id, operation, next);
      } catch (error) {
        if (recommendationOperation.current !== operation) return;
        setQuestionError(
          error instanceof Error
            ? error.message
            : "A question could not be prepared.",
        );
      } finally {
        recommendationRequestPending.current = null;
        if (recommendationOperation.current === operation)
          setRecommendationBusy(false);
        recommendationActionLocked.current = false;
      }
    },
    [
      cancelRecommendationOperation,
      pollRecommendation,
      setCurrentRecommendation,
    ],
  );

  const retryRecommendation = useCallback(async () => {
    if (
      !recommendationRetryId ||
      recommendationBusy ||
      recommendationActionLocked.current ||
      cycleOperationLocked.current
    )
      return;
    recommendationActionLocked.current = true;
    cancelRecommendationOperation();
    const operation = recommendationOperation.current;
    setRecommendationBusy(true);
    setRecommendationRetryId(null);
    try {
      await pollRecommendation(recommendationRetryId, operation);
    } catch (error) {
      if (recommendationOperation.current !== operation) return;
      setQuestionError(
        error instanceof Error
          ? error.message
          : "A question could not be prepared.",
      );
    } finally {
      if (recommendationOperation.current === operation)
        setRecommendationBusy(false);
      recommendationActionLocked.current = false;
    }
  }, [
    cancelRecommendationOperation,
    pollRecommendation,
    recommendationBusy,
    recommendationRetryId,
  ]);

  useEffect(() => {
    if (!needsQuestion) return;
    let cancelled = false;
    void learningClient.getQuestions().then(
      (items) => {
        if (!cancelled) setQuestions(items);
      },
      (error: unknown) => {
        if (!cancelled)
          setQuestionError(
            error instanceof Error
              ? error.message
              : "Questions could not be loaded.",
          );
      },
    );
    void Promise.resolve().then(() => {
      if (!cancelled) return requestRecommendation({ action: "INITIAL" });
    });
    return () => {
      cancelled = true;
      cancelRecommendationOperation();
    };
  }, [cancelRecommendationOperation, needsQuestion, requestRecommendation]);

  const selectedQuestion = questions.find(
    (question) => question.id === selectedQuestionId,
  );

  const resolveRecommendationForFallback = useCallback(async () => {
    const knownRecommendation = recommendationCurrent.current;
    const pendingRequest = recommendationRequestPending.current;
    cancelRecommendationOperation();
    focusRecommendationStart.current = false;
    setRecommendationRetryId(null);
    const target = pendingRequest ? await pendingRequest : knownRecommendation;
    if (target) setCurrentRecommendation(target);
    setRecommendationBusy(false);
    return target?.state === "READY" || target?.state === "PREPARING"
      ? target.id
      : undefined;
  }, [cancelRecommendationOperation, setCurrentRecommendation]);

  useEffect(() => {
    if (recommendation?.state !== "READY" || !focusRecommendationStart.current)
      return;
    focusRecommendationStart.current = false;
    recommendationStartRef.current?.focus();
  }, [recommendation]);

  const beginSelectedQuestion = async (
    question: QuestionOption | undefined,
    recommendationId?: string,
  ) => {
    const recommendedStart = typeof recommendationId === "string";
    if (
      !question ||
      questionLoading ||
      (recommendedStart &&
        (recommendationBusy || recommendationActionLocked.current)) ||
      cycleOperationLocked.current
    )
      return;
    cycleOperationLocked.current = true;
    setQuestionLoading(true);
    setQuestionError(null);
    let abandonRecommendationId: string | undefined;
    try {
      if (!recommendedStart) {
        try {
          abandonRecommendationId = await resolveRecommendationForFallback();
        } catch {
          setRecommendationBusy(false);
          setQuestionError(
            text(
              "未能安全关闭当前推荐题，请重试后再开始写作。",
              "The current recommendation could not be closed safely. Retry before starting to write.",
            ),
          );
          return;
        }
      }
      const cycleId = await learningClient.startTrainingCycle(
        question.id,
        recommendedStart
          ? { recommendationId }
          : abandonRecommendationId
            ? { abandonRecommendationId }
            : {},
      );
      router.push(learningRouteHref("/write", { cycleId }));
    } catch (error) {
      setQuestionError(
        recommendedStart
          ? error instanceof Error
            ? error.message
            : "The cycle could not start."
          : text(
              "未能安全关闭当前推荐题，请重试后再开始写作。",
              "The current recommendation could not be closed safely. Retry before starting to write.",
            ),
      );
    } finally {
      cycleOperationLocked.current = false;
      setQuestionLoading(false);
    }
  };

  const swapRecommendation = async () => {
    if (
      recommendation?.state !== "READY" ||
      recommendationBusy ||
      questionLoading ||
      recommendationActionLocked.current ||
      cycleOperationLocked.current
    )
      return;
    await requestRecommendation(
      {
        action: "SWAP",
        excludedQuestionId: recommendation.question.id,
      },
      true,
    );
  };

  const retryPendingJob = async () => {
    if (!data?.pendingJob || retryingJob) return;
    setRetryingJob(true);
    setRetryError(null);
    try {
      await learningClient.retryAiJob(data.pendingJob.id);
      retry();
      window.history.replaceState({}, "", "/today");
    } catch (error) {
      setRetryError(
        error instanceof Error
          ? error.message
          : "The job could not be retried.",
      );
    } finally {
      setRetryingJob(false);
    }
  };

  const saveCustomQuestion = async () => {
    if (
      customPrompt.trim().length < 30 ||
      questionLoading ||
      cycleOperationLocked.current
    )
      return;
    cycleOperationLocked.current = true;
    setQuestionLoading(true);
    setQuestionError(null);
    let abandonRecommendationId: string | undefined;
    try {
      try {
        abandonRecommendationId = await resolveRecommendationForFallback();
      } catch {
        setRecommendationBusy(false);
        setQuestionError(
          text(
            "未能安全关闭当前推荐题，请重试后再保存自己的题目。",
            "The current recommendation could not be closed safely. Retry before saving your own question.",
          ),
        );
        return;
      }
      const created = await learningClient.createCustomQuestion({
        prompt: customPrompt.trim(),
        type: customType,
        topic: customTopic,
        ieltsTrack: customTrack,
      });
      setQuestions((current) => [created, ...current]);
      setSelectedQuestionId(created.id);
      setCustomOpen(false);
      setCustomPrompt("");
      try {
        const cycleId = await learningClient.startTrainingCycle(
          created.id,
          abandonRecommendationId ? { abandonRecommendationId } : {},
        );
        router.push(learningRouteHref("/write", { cycleId }));
      } catch {
        setQuestionError(
          text(
            "自己的题目已保存，但未能安全关闭当前推荐题。请从题库中选择该题后重试。",
            "Your question was saved, but the current recommendation could not be closed safely. Select the saved question from the bank and retry.",
          ),
        );
      }
    } catch (error) {
      setQuestionError(
        error instanceof Error
          ? error.message
          : "The private question could not be saved.",
      );
    } finally {
      cycleOperationLocked.current = false;
      setQuestionLoading(false);
    }
  };

  if (loading) return <Skeleton label={messages.common.loading} />;
  if (error || !data) {
    const needsSignIn =
      error instanceof LearningClientError &&
      (error.status === 401 || error.status === 403);
    return (
      <Card className="transfer-result-card" role="alert">
        <AlertTriangle aria-hidden="true" size={36} />
        <h1>
          {needsSignIn
            ? text("请重新登录后继续", "Sign in again to continue")
            : text("今日计划暂时无法读取", "Today’s plan is unavailable")}
        </h1>
        <p>
          {needsSignIn
            ? text(
                "当前登录状态已失效或无法访问学习内容。已保存的作文会保留，重新登录后可以继续。",
                "Your session has expired or cannot access this learning content. Saved essays remain available after you sign in again.",
              )
            : (error?.message ??
              text(
                "服务器没有返回可用的计划。",
                "The server did not return a usable plan.",
              ))}
        </p>
        <div className="completion-actions">
          {needsSignIn ? (
            <ActionLink href="/signin?next=%2Ftoday">
              {text("重新登录", "Sign in again")}
            </ActionLink>
          ) : (
            <>
              <Button onClick={retry}>{text("重试", "Try again")}</Button>
              <ActionLink href="/settings" variant="secondary">
                {text("检查设置", "Check settings")}
              </ActionLink>
            </>
          )}
        </div>
      </Card>
    );
  }

  const task = data.nextTask;
  const aiService = data.aiService ?? {
    state:
      data.aiState === "connected"
        ? "configured"
        : data.aiState === "missing"
          ? "needs_setup"
          : "unknown",
    canManage: true,
  };
  return (
    <PageLayout variant="focus">
      <div className={styles.desk} data-today-desk="focus">
        <PageHeader title={text(data.greetingZh, data.greetingEn)} />

        {aiService.state === "needs_setup" ? (
          <div className="status-banner status-banner-warning" role="status">
            <CloudOff aria-hidden="true" size={21} />
            <div>
              <strong>
                {text(
                  "批改服务尚未配置，可以先开始写作",
                  "Feedback is not configured yet; you can still start writing",
                )}
              </strong>
              <p>
                {aiService.canManage
                  ? text(
                      "计时、自动保存与历史记录照常工作；批改可以等待 AI 恢复后再运行。",
                      "Timing, autosave, and history continue to work; feedback can run when AI is restored.",
                    )
                  : text(
                      "计时和草稿保存照常可用。请联系管理员完成批改服务配置，作文不用重新写。",
                      "Timing and draft saving remain available. Ask your administrator to configure feedback; you do not need to rewrite your essay.",
                    )}
              </p>
            </div>
            {aiService.canManage ? (
              <ActionLink href="/settings" size="sm" variant="secondary">
                {text("配置 AI", "Configure AI")}
              </ActionLink>
            ) : null}
          </div>
        ) : null}

        {feedbackWaitingNotice &&
        data.pendingJob &&
        !["FAILED", "AI_BLOCKED"].includes(data.pendingJob.status) ? (
          <div className="status-banner status-banner-warning" role="status">
            <CloudOff aria-hidden="true" size={21} />
            <div>
              <strong>
                {text(
                  "作文已提交并锁定，批改正在排队",
                  "Your essay is submitted and locked; feedback is queued",
                )}
              </strong>
              <p>
                {aiService.state === "configured"
                  ? text(
                      "批改服务已配置，正在处理你的作文；完成后这里会自动更新。",
                      "Feedback is configured and your essay is being processed. This page updates when it is ready.",
                    )
                  : aiService.state === "needs_setup"
                    ? aiService.canManage
                      ? text(
                          "批改需要先配置 AI 连接。在设置中保存可用的 AI 后，批改会自动开始，无需重写作文。",
                          "Feedback starts automatically once a working AI connection is saved in Settings; you do not need to rewrite the essay.",
                        )
                      : text(
                          "请联系管理员配置批改服务；你的作文和提交记录已经保留。",
                          "Ask your administrator to configure feedback. Your essay and submission are saved.",
                        )
                    : text(
                        "作文和提交记录已保留，正在确认最新批改进度。你可以稍后回来查看。",
                        "Your essay and submission are saved. We are checking the latest feedback progress; you can return later.",
                      )}
              </p>
            </div>
            {aiService.state === "needs_setup" && aiService.canManage ? (
              <ActionLink href="/settings" size="sm">
                {text("配置 AI", "Configure AI")}
              </ActionLink>
            ) : null}
          </div>
        ) : null}

        {data.blockedJobNotice ? (
          <div className="status-banner status-banner-warning" role="status">
            <CloudOff aria-hidden="true" size={21} />
            <div>
              <strong>
                {text(
                  "已有内容已保存，后续学习材料还未准备好",
                  "Your completed work is saved; the next learning material is not ready yet",
                )}
              </strong>
              <p>
                {data.blockedJobNotice.errorSafeMessage
                  ? `${data.blockedJobNotice.errorSafeMessage} `
                  : ""}
                {data.blockedJobNotice.status === "AI_BLOCKED"
                  ? text(
                      "更新或更换 AI 密钥后任务会自动恢复。",
                      "Tasks resume automatically after the AI key is updated or replaced.",
                    )
                  : text(
                      "点击重试即可继续；已经完成的批改不会受影响。",
                      "Retry to continue; the completed feedback is unaffected.",
                    )}
              </p>
              {retryError ? <p role="alert">{retryError}</p> : null}
            </div>
            {data.blockedJobNotice.status === "AI_BLOCKED" ? (
              aiService.canManage ? (
                <ActionLink href="/settings" size="sm">
                  {text("检查 AI 连接", "Review AI connection")}
                </ActionLink>
              ) : (
                <p>
                  {text(
                    "请联系管理员检查批改服务。",
                    "Ask your administrator to check the feedback service.",
                  )}
                </p>
              )
            ) : (
              <Button
                disabled={retryingJob}
                onClick={() => void retryPendingJob()}
                size="sm"
              >
                {retryingJob ? (
                  <LoaderCircle aria-hidden="true" className="spin" size={17} />
                ) : (
                  text("重试", "Retry")
                )}
              </Button>
            )}
          </div>
        ) : null}

        {retryError ? (
          <p className="inline-probe error" role="alert">
            {retryError}
          </p>
        ) : null}

        {mixedReview ? (
          <section className={cn("next-task-card", styles.mixedReviewFrame)}>
            <div className="next-task-topline">
              <Badge tone="blue">
                <Sparkles aria-hidden="true" size={13} />
                {text(task.eyebrowZh, task.eyebrowEn)}
              </Badge>
              <span className="due-label">
                <CalendarClock aria-hidden="true" size={15} />
                {text(task.dueLabelZh, task.dueLabelEn)}
              </span>
            </div>
            <h2>{text(task.titleZh, task.titleEn)}</h2>
            <p>{text(task.descriptionZh, task.descriptionEn)}</p>
          </section>
        ) : null}

        {needsQuestion ? (
          <section
            aria-labelledby="recommendation-title"
            className={styles.recommendationSheet}
            data-today-primary
          >
            <div className={styles.sheetHeading}>
              <div>
                <p className={styles.sheetEyebrow}>
                  {text("为你推荐", "Recommended for you")}
                </p>
                <h2 id="recommendation-title">
                  {text("今天就写这一题", "Write this one today")}
                </h2>
              </div>
              <p className={styles.selectionNote}>
                {text(
                  "已为你平衡近期题型与话题",
                  "Balanced across your recent question types and topics",
                )}
              </p>
            </div>
            {recommendationBusy && !recommendation ? (
              <p className={styles.preparing} role="status">
                <LoaderCircle aria-hidden="true" className="spin" size={18} />
                {text("正在为你准备一题…", "Preparing a question for you…")}
              </p>
            ) : !recommendation && questionError ? (
              <div className={styles.unavailable}>
                <p>
                  {text(
                    "上一次请求的结果无法确认。请使用同一次安全操作重新获取推荐题。",
                    "The previous result could not be confirmed. Retry the same safe operation to recover the recommendation.",
                  )}
                </p>
                <Button
                  disabled={recommendationBusy}
                  onClick={() =>
                    void requestRecommendation({ action: "INITIAL" })
                  }
                  type="button"
                  variant="secondary"
                >
                  {text("重新获取推荐题", "Retry recommendation")}
                </Button>
              </div>
            ) : recommendation?.state === "READY" ? (
              <>
                <div className={styles.promptBody}>
                  <div className={styles.promptCopy}>
                    <p className={styles.promptLabel}>IELTS Writing Task 2</p>
                    <p
                      className={styles.promptText}
                      data-recommendation-prompt
                      lang="en"
                    >
                      {recommendation.question.prompt}
                    </p>
                  </div>
                  <dl className={styles.rationaleRail}>
                    <div>
                      <dt>{text("题型", "Type")}</dt>
                      <dd>
                        {optionLabel(
                          questionTypes,
                          recommendation.question.type,
                          locale,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{text("话题", "Topic")}</dt>
                      <dd>
                        {optionLabel(
                          topics,
                          recommendation.question.topic,
                          locale,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{text("考试类别", "Track")}</dt>
                      <dd>
                        {recommendation.question.ieltsTrack === "academic"
                          ? "Academic"
                          : "General Training"}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className={styles.recommendationDock}>
                  <Button
                    disabled={questionLoading || recommendationBusy}
                    onClick={() =>
                      void beginSelectedQuestion(
                        recommendation.question,
                        recommendation.id,
                      )
                    }
                    ref={recommendationStartRef}
                    size="lg"
                  >
                    {questionLoading ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="spin"
                        size={17}
                      />
                    ) : (
                      <PenLine aria-hidden="true" size={17} />
                    )}
                    {text(
                      "用这道题开始写作",
                      "Start writing with this question",
                    )}
                  </Button>
                </div>
                <div className={styles.recommendationActions}>
                  <Button
                    disabled={recommendationBusy || questionLoading}
                    onClick={() => void swapRecommendation()}
                    type="button"
                    variant="secondary"
                  >
                    {text("换一题", "Try another question")}
                  </Button>
                </div>
              </>
            ) : recommendation?.state === "PREPARING" ? (
              recommendationRetryId ? (
                <div className={styles.preparing} role="status">
                  <p>
                    {text(
                      "这一题还没有准备好。你可以再试一次，或使用自己的题目。",
                      "This question is not ready yet. Try again or use your own task.",
                    )}
                  </p>
                  <Button
                    disabled={recommendationBusy}
                    onClick={() => void retryRecommendation()}
                    type="button"
                    variant="secondary"
                  >
                    {text("再试一次", "Try again")}
                  </Button>
                </div>
              ) : (
                <p className={styles.preparing} role="status">
                  <LoaderCircle aria-hidden="true" className="spin" size={18} />
                  {text(
                    "正在为你准备一题；你也可以先使用自己的题目。",
                    "We are preparing a question; you can also use your own task.",
                  )}
                </p>
              )
            ) : (
              <p className={styles.unavailable} role="alert">
                {text(
                  "暂时无法准备新题。你可以浏览题库，或粘贴自己的题目。",
                  "A new question is unavailable. Browse the bank or paste your own task.",
                )}
              </p>
            )}
          </section>
        ) : (
          <section
            className={cn("next-task-card", styles.primaryAction)}
            data-today-primary
          >
            <div className="next-task-topline">
              <Badge tone="blue">
                <Sparkles aria-hidden="true" size={13} />
                {text(task.eyebrowZh, task.eyebrowEn)}
              </Badge>
              <span className="due-label">
                <CalendarClock aria-hidden="true" size={15} />
                {text(task.dueLabelZh, task.dueLabelEn)}
              </span>
            </div>
            <div className="next-task-body">
              <div className="next-task-copy">
                <div className={styles.currentEssay}>
                  <p
                    lang={
                      /\p{Script=Han}/u.test(data.cycleTitle) ? "zh-CN" : "en"
                    }
                  >
                    {data.cycleTitle}
                  </p>
                </div>
                <h2>{text(task.titleZh, task.titleEn)}</h2>
                <p>{text(task.descriptionZh, task.descriptionEn)}</p>
                {!processing ? (
                  <div className="task-meta">
                    <span>
                      <Clock3 aria-hidden="true" size={16} />
                      {task.durationMinutes} {messages.common.minutes}
                    </span>
                    <span>
                      <Target aria-hidden="true" size={16} />
                      {["first-attempt", "rewrite", "transfer"].includes(
                        task.kind,
                      )
                        ? text("闭卷独立输出", "Closed-book production")
                        : text("按自己的节奏继续", "Continue at your own pace")}
                    </span>
                  </div>
                ) : null}
              </div>
              {data.pendingJobAction === "retry" ? (
                <Button
                  disabled={retryingJob}
                  onClick={() => void retryPendingJob()}
                  size="lg"
                >
                  {retryingJob ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="spin"
                      size={17}
                    />
                  ) : (
                    <Sparkles aria-hidden="true" size={17} />
                  )}
                  {text(task.actionZh, task.actionEn)}
                </Button>
              ) : data.pendingJobAction === "review-connection" ? (
                aiService.canManage ? (
                  <ActionLink href="/settings" size="lg">
                    {text("检查 AI 连接", "Review AI connection")}
                  </ActionLink>
                ) : (
                  <ActionLink href="/essays" size="lg">
                    {text("先继续其他作文", "Continue another essay")}
                  </ActionLink>
                )
              ) : (
                <ActionLink href={task.href} size="lg">
                  {text(task.actionZh, task.actionEn)}
                </ActionLink>
              )}
            </div>
            {processing ? (
              <div className={styles.processingNote} role="status">
                <LoaderCircle aria-hidden="true" className="spin" size={16} />
                <span>
                  {text(
                    "正在处理，准备好后这里会自动更新。可以先继续其他作文。",
                    "Processing; this page updates when ready. You can continue another essay meanwhile.",
                  )}
                </span>
                <ActionLink href="/essays" size="sm" variant="secondary">
                  {text("查看其他作文", "Other essays")}
                </ActionLink>
              </div>
            ) : null}
          </section>
        )}

        {needsQuestion ? (
          <section
            aria-labelledby="question-picker-title"
            className={styles.manualRoutes}
          >
            <SectionHeader
              title={text("也可以自己选题", "Or choose your own task")}
              description={text(
                "题库和私有题目始终可用；它们不会替代今天的推荐。",
                "The bank and private tasks remain available without replacing today’s recommendation.",
              )}
            />
            <Card className="setup-form-card">
              <details className={styles.manualDisclosure}>
                <summary>
                  <LibraryBig aria-hidden="true" size={16} />
                  {text("浏览全部题库", "Browse the whole question bank")}
                </summary>
                {questionLoading && questions.length === 0 ? (
                  <p role="status">{messages.common.loading}</p>
                ) : (
                  <div className="form-grid">
                    <div className="form-field form-field-wide">
                      <label htmlFor="question-choice">
                        {text("题库", "Question bank")}
                      </label>
                      <select
                        className="select-input"
                        id="question-choice"
                        onChange={(event) =>
                          setSelectedQuestionId(event.target.value)
                        }
                        value={selectedQuestionId}
                      >
                        <option value="">
                          {text("选择一道题", "Choose a question")}
                        </option>
                        {questions.map((question) => (
                          <option key={question.id} value={question.id}>
                            {optionLabel(topics, question.topic, locale)} ·{" "}
                            {optionLabel(questionTypes, question.type, locale)}{" "}
                            — {question.prompt.slice(0, 110)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedQuestion ? (
                      <div className="form-field form-field-wide">
                        <p className="field-hint" lang="en">
                          {selectedQuestion.prompt}
                        </p>
                        <Button
                          disabled={questionLoading}
                          onClick={() =>
                            void beginSelectedQuestion(selectedQuestion)
                          }
                          type="button"
                        >
                          {text(
                            "用这道题开始写作",
                            "Start writing with this question",
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </details>
              <details
                className={styles.manualDisclosure}
                onToggle={(event) => setCustomOpen(event.currentTarget.open)}
                open={customOpen}
              >
                <summary>
                  <PenLine aria-hidden="true" size={16} />
                  {text("粘贴我自己的题目", "Paste my own task")}
                </summary>
                <div className="form-grid">
                  <div className="form-field form-field-wide">
                    <label htmlFor="custom-question">
                      {text("完整英文题目", "Full English task")}
                    </label>
                    <textarea
                      className="exercise-textarea"
                      id="custom-question"
                      lang="en"
                      minLength={30}
                      onChange={(event) => setCustomPrompt(event.target.value)}
                      placeholder="Paste the complete Task 2 prompt and instruction…"
                      value={customPrompt}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="custom-question-type">
                      {text("题型", "Type")}
                    </label>
                    <select
                      className="select-input"
                      id="custom-question-type"
                      onChange={(event) =>
                        setCustomType(event.target.value as QuestionType)
                      }
                      value={customType}
                    >
                      {questionTypes.map((value) => (
                        <option key={value.id} value={value.id}>
                          {text(value.zh, value.en)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label htmlFor="custom-question-topic">
                      {text("话题", "Topic")}
                    </label>
                    <select
                      className="select-input"
                      id="custom-question-topic"
                      onChange={(event) =>
                        setCustomTopic(event.target.value as QuestionTopic)
                      }
                      value={customTopic}
                    >
                      {topics.map((value) => (
                        <option key={value.id} value={value.id}>
                          {text(value.zh, value.en)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label htmlFor="custom-question-track">IELTS</label>
                    <select
                      className="select-input"
                      id="custom-question-track"
                      onChange={(event) =>
                        setCustomTrack(
                          event.target.value as "academic" | "general_training",
                        )
                      }
                      value={customTrack}
                    >
                      <option value="academic">Academic</option>
                      <option value="general_training">General Training</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <Button
                      disabled={
                        questionLoading || customPrompt.trim().length < 30
                      }
                      onClick={() => void saveCustomQuestion()}
                      type="button"
                    >
                      {text("保存并开始写作", "Save and start writing")}
                    </Button>
                  </div>
                </div>
              </details>
              {questionError ? (
                <p className="inline-probe error" role="alert">
                  {questionError}
                </p>
              ) : null}
            </Card>
          </section>
        ) : null}

        <EssayWorkspace compact />

        <div className={styles.progressPanel} data-today-progress-panel>
          <section className={styles.learningThread} data-today-learning-thread>
            <SectionHeader
              title={text("本篇进度", "Essay progress")}
              description={data.cycleTitle}
            />
            <Card className={cn("cycle-timeline-card", styles.timelineCard)}>
              <ol className="cycle-timeline">
                {data.timeline.map((step, index) => (
                  <li
                    className={cn("cycle-step", `cycle-step-${step.state}`)}
                    key={step.id}
                  >
                    <span className="cycle-node" aria-hidden="true">
                      {step.state === "done" ? <Check size={15} /> : index + 1}
                    </span>
                    <div>
                      <strong>{text(step.labelZh, step.labelEn)}</strong>
                      <span>{step.dateLabel}</span>
                    </div>
                    {index < data.timeline.length - 1 ? (
                      <span className="cycle-line" aria-hidden="true" />
                    ) : null}
                  </li>
                ))}
              </ol>
            </Card>
          </section>

          <section className={styles.evidenceSummary} data-today-evidence>
            <div
              aria-label={text("本周学习证据", "This week’s learning evidence")}
              className={styles.evidenceList}
              role="list"
            >
              <div className={styles.evidenceItem} role="listitem">
                <span className="stat-icon blue">
                  <Clock3 aria-hidden="true" size={19} />
                </span>
                <div>
                  <span>
                    {text("已记录学习时长", "Recorded learning time")}
                  </span>
                  <strong>
                    {data.week.focusedMinutes ?? "—"}
                    {data.week.focusedMinutes === null ? null : (
                      <small> min</small>
                    )}
                  </strong>
                </div>
              </div>
              <div className={styles.evidenceItem} role="listitem">
                <span className="stat-icon blue">
                  <Gauge aria-hidden="true" size={19} />
                </span>
                <div>
                  <span>{text("已提交首稿", "First drafts submitted")}</span>
                  <strong>{data.week.completedActions ?? "—"}</strong>
                </div>
              </div>
              <div className={styles.evidenceItem} role="listitem">
                <span className="stat-icon blue">
                  <Target aria-hidden="true" size={19} />
                </span>
                <div>
                  <span>
                    {text(
                      "独立复测未复发",
                      "No recurrence in independent checks",
                    )}
                  </span>
                  <strong>
                    {data.week.repeatedErrorReduction ?? "—"}
                    {data.week.repeatedErrorReduction === null ? null : (
                      <small>%</small>
                    )}
                  </strong>
                </div>
              </div>
            </div>

            <div className={styles.refreshAction}>
              <Button onClick={retry} size="sm" variant="secondary">
                {text("刷新计划", "Refresh plan")}
                <ArrowRight aria-hidden="true" size={15} />
              </Button>
            </div>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}
