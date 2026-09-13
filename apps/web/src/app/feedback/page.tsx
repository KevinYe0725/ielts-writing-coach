"use client";

import {
  Fragment,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookLock,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Info,
  Languages,
  LocateFixed,
  LockKeyhole,
  PenLine,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import {
  ActionLink,
  Badge,
  Button,
  Card,
  EvidenceLink,
  LoadingButtonContent,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { PageLayout } from "@/components/layout/page-layout";
import { useDemoResource } from "@/components/use-demo-resource";
import {
  LearningClientError,
  learningClient,
  type FeedbackData,
} from "@/lib/client";
import { buildFeedbackSegments } from "@/lib/client/feedback-annotations";
import {
  feedbackGroup,
  priorityFeedback,
  type FeedbackGroup,
} from "@/lib/client/feedback-priorities";
import {
  learningRouteHref,
  singleRouteParam,
  type LearningSearchParams,
} from "@/lib/client/learning-route";

import styles from "./feedback.module.css";
import { SINGLE_PANE_REPORT_QUERY } from "./report-layout";
import { ResponsiveReport } from "./responsive-report";

type MobilePane = "source" | "suggestions";
type ReportMode = "quick" | "full";

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

function usesSinglePaneReport() {
  return window.matchMedia(SINGLE_PANE_REPORT_QUERY).matches;
}

function panesAreSideBySide() {
  const source = document.querySelector<HTMLElement>("[data-essay-pane]");
  const suggestions = document.querySelector<HTMLElement>(
    "[data-suggestion-panel]",
  );
  if (!source || !suggestions) return false;
  const sourceRect = source.getBoundingClientRect();
  const suggestionRect = suggestions.getBoundingClientRect();
  return (
    Math.abs(sourceRect.top - suggestionRect.top) < 4 &&
    sourceRect.right <= suggestionRect.left + 2
  );
}

function annotationKind(issueType: string, severity: string) {
  if (["LOGIC", "COHESION", "TASK_RESPONSE"].includes(issueType)) {
    return "development";
  }
  if (
    severity === "naturalness" ||
    ["COLLOCATION", "NATURALNESS", "OPTIONAL_POLISH"].includes(issueType)
  ) {
    return "naturalness";
  }
  return "correction";
}

export default function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<LearningSearchParams>;
}) {
  const query = use(searchParams);
  const cycleId = singleRouteParam(query, "cycle");
  const lessonId = singleRouteParam(query, "lesson");
  const { text, messages } = useLocale();
  const router = useRouter();
  const loader = useCallback(
    () =>
      cycleId
        ? learningClient.getFeedback(cycleId)
        : Promise.reject(
            new LearningClientError(
              "This feedback report is missing its cycle identity. Open it from Today.",
              { status: 400, code: "LEARNING_ROUTE_IDENTITY_REQUIRED" },
            ),
          ),
    [cycleId],
  );
  const { data, error, loading, retry } = useDemoResource(loader);
  const [activeIssueId, setActiveIssueId] = useState<string | null | undefined>(
    undefined,
  );
  const [issueFilter, setIssueFilter] = useState<FeedbackGroup | "all">("all");
  const [mobilePane, setMobilePane] = useState<MobilePane>("suggestions");
  const [reportMode, setReportMode] = useState<ReportMode>("quick");
  const [locationMessage, setLocationMessage] = useState("");
  const [retryingGeneration, setRetryingGeneration] = useState(false);
  const [generationRetryError, setGenerationRetryError] = useState("");
  const [retryingIssues, setRetryingIssues] = useState(false);
  const [issueRetryError, setIssueRetryError] = useState("");
  const highlightRefs = useRef<Record<string, HTMLElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  const issues = useMemo(() => data?.issues ?? [], [data?.issues]);
  const visibleIssues = useMemo(
    () =>
      issues.filter(
        (issue) =>
          issueFilter === "all" || feedbackGroup(issue) === issueFilter,
      ),
    [issues, issueFilter],
  );
  const priorities = useMemo(
    () => priorityFeedback(issues, data?.targetIssueId),
    [issues, data?.targetIssueId],
  );
  const priorityIds = useMemo(
    () => new Set(priorities.map((issue) => issue.id)),
    [priorities],
  );
  const reportIssues = useMemo(() => {
    if (reportMode === "full") return visibleIssues;
    const prioritized = visibleIssues.filter((issue) =>
      priorityIds.has(issue.id),
    );
    return prioritized.length > 0 ? prioritized : visibleIssues.slice(0, 3);
  }, [priorityIds, reportMode, visibleIssues]);
  const selectedIssueId =
    activeIssueId === undefined
      ? (reportIssues[0]?.id ?? null)
      : activeIssueId === null
        ? null
        : reportIssues.some((issue) => issue.id === activeIssueId)
          ? activeIssueId
          : (reportIssues[0]?.id ?? null);
  const segments = useMemo(
    () => buildFeedbackSegments(data?.originalEssay ?? "", issues),
    [data?.originalEssay, issues],
  );
  const highlightableIds = useMemo(
    () =>
      new Set(
        segments.flatMap((segment) =>
          segment.kind === "issue" ? [segment.issueId] : [],
        ),
      ),
    [segments],
  );

  /**
   * Splits the immutable essay into its paragraphs (1-based, matching the AI
   * paragraph feedback indices) together with their absolute offsets so the
   * sentence-level highlights can be re-anchored per paragraph and each
   * paragraph's diagnosis can sit directly below its own text.
   */
  const paragraphLayout = useMemo(() => {
    const source = data?.originalEssay ?? "";
    const chunks: Array<{
      index: number;
      text: string;
      leading: string;
      start: number;
    }> = [];
    let textOffset = 0;
    let pendingLeading = "";
    let paragraphIndex = 0;
    for (const part of source.split(/(\n+)/u)) {
      if (part === "") continue;
      if (part.trim() === "") {
        pendingLeading += part;
        textOffset += part.length;
        continue;
      }
      paragraphIndex += 1;
      chunks.push({
        index: paragraphIndex,
        text: part,
        leading: pendingLeading,
        start: textOffset,
      });
      textOffset += part.length;
      pendingLeading = "";
    }
    return { chunks, trailing: pendingLeading };
  }, [data?.originalEssay]);

  const paragraphFeedbackByIndex = useMemo(() => {
    const map = new Map<number, FeedbackData["paragraphFeedback"][number]>();
    for (const paragraph of data?.paragraphFeedback ?? []) {
      map.set(paragraph.paragraphIndex, paragraph);
    }
    return map;
  }, [data?.paragraphFeedback]);

  const issueForSegment = useCallback(
    (issueId: string) => issues.find((issue) => issue.id === issueId),
    [issues],
  );

  const issuesInChunk = useCallback(
    (chunk: { index: number; text: string; leading: string; start: number }) =>
      issues
        .filter((issue) => {
          if (issue.startOffset !== null && issue.endOffset !== null) {
            return (
              issue.endOffset > chunk.start &&
              issue.startOffset < chunk.start + chunk.text.length
            );
          }
          return Boolean(issue.evidence && chunk.text.includes(issue.evidence));
        })
        .map((issue) => ({
          ...issue,
          startOffset:
            issue.startOffset === null ? null : issue.startOffset - chunk.start,
          endOffset:
            issue.endOffset === null ? null : issue.endOffset - chunk.start,
        })),
    [issues],
  );

  const announceIssue = useCallback(
    (issueId: string, destination: MobilePane) => {
      const issue = issues.find((candidate) => candidate.id === issueId);
      if (!issue) return;
      setLocationMessage(
        destination === "source"
          ? text(
              `已在原文中定位：${issue.titleZh}`,
              `Located in the original essay: ${issue.titleEn}`,
            )
          : text(
              `已打开修改建议：${issue.titleZh}`,
              `Opened suggestion: ${issue.titleEn}`,
            ),
      );
    },
    [issues, text],
  );

  const scrollToRef = useCallback(
    (refs: RefObject<Record<string, HTMLElement | null>>, issueId: string) => {
      window.requestAnimationFrame(() => {
        refs.current[issueId]?.scrollIntoView({
          behavior: scrollBehavior(),
          block: "center",
        });
      });
    },
    [],
  );

  const activateSuggestion = useCallback(
    (issueId: string) => {
      setActiveIssueId((current) => {
        const selected = current === undefined ? reportIssues[0]?.id : current;
        return selected === issueId ? null : issueId;
      });
      if (panesAreSideBySide() && highlightableIds.has(issueId)) {
        scrollToRef(highlightRefs, issueId);
        announceIssue(issueId, "source");
      }
    },
    [announceIssue, highlightableIds, reportIssues, scrollToRef],
  );

  const showIssueInSource = useCallback(
    (issueId: string) => {
      setActiveIssueId(issueId);
      setMobilePane("source");
      scrollToRef(highlightRefs, issueId);
      announceIssue(issueId, "source");
    },
    [announceIssue, scrollToRef],
  );

  const activateFromHighlight = useCallback(
    (issueId: string) => {
      setIssueFilter("all");
      if (reportMode === "quick" && !priorityIds.has(issueId)) {
        setReportMode("full");
      }
      setActiveIssueId(issueId);
      if (usesSinglePaneReport()) setMobilePane("suggestions");
      scrollToRef(cardRefs, issueId);
      announceIssue(issueId, "suggestions");
    },
    [announceIssue, priorityIds, reportMode, scrollToRef],
  );

  const renderSourceSegment = useCallback(
    (segment: (typeof segments)[number], segmentIndex: number): ReactNode => {
      if (segment.kind === "text") {
        return <span key={`text-${segmentIndex}`}>{segment.text}</span>;
      }
      const issue = issueForSegment(segment.issueId);
      return (
        <mark
          aria-label={text(
            `查看“${issue?.titleZh ?? "这处问题"}”的修改建议`,
            "Open the suggestion for this source text",
          )}
          aria-pressed={selectedIssueId === segment.issueId}
          data-active={selectedIssueId === segment.issueId ? "true" : "false"}
          data-annotation-kind={annotationKind(
            issue?.issueType ?? "OPTIONAL_POLISH",
            issue?.severity ?? "polish",
          )}
          data-feedback-highlight={segment.issueId}
          data-issue-highlight={segment.issueId}
          id={`feedback-highlight-${segment.issueId}`}
          key={`${segment.issueId}-${segmentIndex}`}
          onClick={() => activateFromHighlight(segment.issueId)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              activateFromHighlight(segment.issueId);
            }
          }}
          ref={(node) => {
            highlightRefs.current[segment.issueId] = node;
          }}
          role="button"
          tabIndex={0}
        >
          {segment.text}
        </mark>
      );
    },
    [activateFromHighlight, issueForSegment, selectedIssueId, text],
  );

  if (loading || !data) {
    if (error) {
      return (
        <Card className="transfer-result-card">
          <TriangleAlert aria-hidden="true" size={36} />
          <h1>{text("批改暂不可用", "Feedback unavailable")}</h1>
          <p>{error.message}</p>
          <div className="completion-actions">
            <Button onClick={retry} variant="secondary">
              {text("重试", "Try again")}
            </Button>
            <ActionLink href="/today">
              {text("返回今日计划", "Return to Today")}
            </ActionLink>
          </div>
        </Card>
      );
    }
    return <Skeleton label={messages.common.loading} />;
  }

  const grammarLeaks = data.issues.filter((issue) =>
    ["GRAMMAR", "SPELLING", "WORD_FORM"].includes(issue.issueType),
  );

  return (
    <PageLayout variant="workspace" className={styles.page!}>
      <div data-feedback-report data-feedback-report-mode={reportMode}>
        <PageHeader
          actions={
            <div className={styles.headerActions}>
              {cycleId && (lessonId ?? data.lessonId) ? (
                <ActionLink
                  href={learningRouteHref("/lesson", {
                    cycleId,
                    lessonId: lessonId ?? data.lessonId,
                  })}
                  trailing={false}
                  variant="secondary"
                >
                  <ArrowRight aria-hidden="true" size={17} />
                  {text("进入专项教学", "Open focused teaching")}
                </ActionLink>
              ) : null}
            </div>
          }
          title={text(
            "看懂问题，学会修改",
            "Understand the issue. Learn the revision.",
          )}
        />

        {data.issueClassificationRetry ? (
          <div className="status-banner status-banner-warning" role="status">
            <Info aria-hidden="true" size={21} />
            <div>
              <strong>
                {text(
                  "总体批改已完成，逐句建议还未准备好",
                  "The overall review is ready; sentence suggestions are still unavailable",
                )}
              </strong>
              <p>
                {text(
                  "可以先阅读总体反馈。点击下方按钮补全逐句建议，已保存的作文和批改会保留。",
                  "Read the overall feedback first, then request the remaining suggestions. Your essay and existing feedback are saved.",
                )}
              </p>
              {issueRetryError ? <p role="alert">{issueRetryError}</p> : null}
            </div>
            <Button
              disabled={retryingIssues}
              onClick={() => {
                setRetryingIssues(true);
                setIssueRetryError("");
                void learningClient
                  .retryAiJob(data.issueClassificationRetry!.jobId)
                  .then(() => retry())
                  .catch((retryError) =>
                    setIssueRetryError(
                      retryError instanceof Error
                        ? retryError.message
                        : text(
                            "问题归类仍未完成，请稍后再试。",
                            "Issue classification is still unavailable. Try again later.",
                          ),
                    ),
                  )
                  .finally(() => setRetryingIssues(false));
              }}
              variant="secondary"
            >
              {retryingIssues ? (
                <LoadingButtonContent label={text("正在重试…", "Retrying…")} />
              ) : (
                text("补全逐句建议", "Complete sentence suggestions")
              )}
            </Button>
          </div>
        ) : null}

        <section
          aria-labelledby="feedback-assessment-heading"
          className={styles.assessmentSummary}
          data-feedback-summary
        >
          <div className={styles.overallScore}>
            <div
              className={styles.scoreBadge}
              aria-label={
                data.languageScored
                  ? `${text("总分估计", "Estimated overall band")} ${data.overallScore}`
                  : text("当前未评价语言", "Language has not been scored")
              }
            >
              <strong>
                {data.languageScored ? data.overallScore.toFixed(1) : "—"}
              </strong>
              <span>
                {data.languageScored
                  ? data.scoreRange
                  : text("未估分", "Not scored")}
              </span>
            </div>
            <div>
              <h2 id="feedback-assessment-heading">
                {text(data.overallSummaryZh, data.overallSummaryEn)}
              </h2>
              <p className={styles.strengthLine}>
                <CheckCircle2 aria-hidden="true" size={17} />
                <span>
                  <strong>{text("已经做对：", "Already working: ")}</strong>
                  {text(data.strengthZh, data.strengthEn)}
                </span>
              </p>
            </div>
          </div>
          <div
            className={styles.criteriaGrid}
            aria-label={text("IELTS 四项估分", "IELTS criterion estimates")}
          >
            {data.scores.map((score) => (
              <details className={styles.criterionCard} key={score.criterion}>
                <summary>
                  <span>
                    <b>{score.criterion}</b>
                    {text(score.labelZh, score.labelEn)}
                  </span>
                  <strong>
                    {data.languageScored ? score.score.toFixed(1) : "—"}
                  </strong>
                </summary>
                <p>{text(score.summaryZh, score.summaryEn)}</p>
              </details>
            ))}
          </div>
        </section>

        {priorities.length > 0 ? (
          <section
            className={styles.priorityPlan}
            aria-labelledby="feedback-priorities-title"
          >
            <div className={styles.priorityHeading}>
              <div>
                <h2 id="feedback-priorities-title">
                  {text("这篇作文，先看这几处", "Start with these changes")}
                </h2>
              </div>
            </div>
            <ol className={styles.priorityList}>
              {priorities.map((issue) => (
                <li key={issue.id}>
                  <button
                    type="button"
                    onClick={() => activateFromHighlight(issue.id)}
                  >
                    <span className={styles.priorityLabel}>
                      {feedbackGroup(issue) === "must_fix"
                        ? text("需要改正", "Correction")
                        : text("表达提升", "Expression")}
                    </span>
                    <strong>{text(issue.titleZh, issue.titleEn)}</strong>
                    <span className={styles.priorityLink}>
                      {text("看原文与改法", "See the example and revision")}{" "}
                      <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <div
          aria-label={text("报告视图", "Report view")}
          className={styles.mobileSwitcher}
          role="tablist"
        >
          <button
            aria-controls="feedback-source-panel"
            aria-selected={mobilePane === "source"}
            onClick={() => setMobilePane("source")}
            role="tab"
            type="button"
          >
            {text("原文", "Original")}
          </button>
          <button
            aria-controls="feedback-suggestion-panel"
            aria-selected={mobilePane === "suggestions"}
            onClick={() => setMobilePane("suggestions")}
            role="tab"
            type="button"
          >
            {text("修改建议", "Suggestions")}
            <span>{reportIssues.length}</span>
          </button>
        </div>

        <p aria-atomic="true" aria-live="polite" className="sr-only">
          {locationMessage}
        </p>

        <ResponsiveReport>
          <section
            aria-label={text("原题与作文原文", "Task and original essay")}
            className={`${styles.sourcePane} ${
              mobilePane === "source" ? styles.mobileActive : ""
            }`}
            data-essay-pane
            data-testid="feedback-source-pane"
            id="feedback-source-panel"
          >
            <div className={styles.documentHeader}>
              <h2>{text("原文", "Original essay")}</h2>
            </div>

            <div className={styles.taskBlock}>
              <p lang="en">{data.prompt}</p>
            </div>

            <div className={styles.essay} data-feedback-essay lang="en">
              {paragraphLayout.chunks.map((chunk) => {
                const paragraphFeedback = paragraphFeedbackByIndex.get(
                  chunk.index,
                );
                const chunkSegments = buildFeedbackSegments(
                  chunk.text,
                  issuesInChunk(chunk),
                );
                return (
                  <Fragment key={`paragraph-${chunk.index}`}>
                    {chunk.leading ? <span>{chunk.leading}</span> : null}
                    {chunkSegments.map((segment, index) =>
                      renderSourceSegment(segment, index),
                    )}
                    {paragraphFeedback ? (
                      <div
                        className={`${styles.paragraphReview} ${styles.inlineParagraphReview}`}
                      >
                        <details>
                          <summary>
                            <span>{paragraphFeedback.paragraphIndex}</span>
                            <b>
                              {text(
                                paragraphFeedback.roleZh,
                                paragraphFeedback.roleEn,
                              )}
                            </b>
                            <ChevronDown aria-hidden="true" size={15} />
                          </summary>
                          {paragraphFeedback.revisionZh ||
                          paragraphFeedback.revisionEn ? (
                            <div className={styles.paragraphRevision}>
                              <p className="eyebrow">
                                {text("参考改写", "Polished revision")}
                              </p>
                              <blockquote lang="en">
                                {text(
                                  paragraphFeedback.revisionZh ??
                                    paragraphFeedback.excerpt,
                                  paragraphFeedback.revisionEn ??
                                    paragraphFeedback.excerpt,
                                )}
                              </blockquote>
                            </div>
                          ) : (
                            <blockquote lang="en">
                              {paragraphFeedback.excerpt}
                            </blockquote>
                          )}
                          <p>
                            {text(
                              paragraphFeedback.diagnosisZh,
                              paragraphFeedback.diagnosisEn,
                            )}
                          </p>
                          <div>
                            <PenLine aria-hidden="true" size={15} />
                            <span>
                              <strong>
                                {text("怎么改：", "Revision action: ")}
                              </strong>
                              {text(
                                paragraphFeedback.actionZh,
                                paragraphFeedback.actionEn,
                              )}
                            </span>
                          </div>
                        </details>
                      </div>
                    ) : null}
                  </Fragment>
                );
              })}
              {paragraphLayout.trailing ? (
                <span>{paragraphLayout.trailing}</span>
              ) : null}
            </div>

            {data.paragraphFeedback.length === 0 ? (
              <div className={styles.paragraphReview}>
                <h3>{text("逐段诊断", "Paragraph review")}</h3>
                <p className={styles.emptyCopy}>
                  {text(
                    "本轮暂未生成段落诊断。",
                    "Paragraph-level feedback is not available for this attempt.",
                  )}
                </p>
              </div>
            ) : null}
          </section>
          <aside
            aria-label={text("逐句修改建议", "Sentence-level suggestions")}
            className={`${styles.suggestionPane} ${
              mobilePane === "suggestions" ? styles.mobileActive : ""
            }`}
            data-suggestion-panel
            data-testid="feedback-suggestion-pane"
            id="feedback-suggestion-panel"
          >
            <div className={styles.suggestionHeader}>
              <h2>{text("修改建议", "Suggestions")}</h2>
              <span>{reportIssues.length}</span>
            </div>

            <div
              aria-label={text("报告模式", "Report mode")}
              className={styles.reportModeSwitch}
              role="tablist"
            >
              <button
                aria-selected={reportMode === "quick"}
                data-feedback-mode="quick"
                onClick={() => setReportMode("quick")}
                role="tab"
                type="button"
              >
                {text("快速修改", "Quick fixes")}
              </button>
              <button
                aria-selected={reportMode === "full"}
                data-feedback-mode="full"
                onClick={() => setReportMode("full")}
                role="tab"
                type="button"
              >
                {text("完整报告", "Full report")}
              </button>
            </div>

            <div
              className={styles.issueFilters}
              role="group"
              aria-label={text("筛选修改建议", "Filter suggestions")}
            >
              {(["all", "must_fix", "naturalness", "polish"] as const).map(
                (filter) => {
                  const labels = {
                    all: text("全部", "All"),
                    must_fix: text("需要改正", "Corrections"),
                    naturalness: text("表达提升", "Expression"),
                    polish: text("可选润色", "Optional polish"),
                  };
                  const count =
                    filter === "all"
                      ? issues.length
                      : issues.filter(
                          (issue) => feedbackGroup(issue) === filter,
                        ).length;
                  return (
                    <button
                      key={filter}
                      type="button"
                      aria-pressed={issueFilter === filter}
                      onClick={() => setIssueFilter(filter)}
                    >
                      {labels[filter]} <span>{count}</span>
                    </button>
                  );
                },
              )}
            </div>
            {issueFilter === "polish" ? (
              <p className={styles.filterHelp}>
                {text(
                  "这里是可选的表达建议，不代表原句有错。",
                  "These are optional choices; the original wording is not necessarily wrong.",
                )}
              </p>
            ) : null}

            <div className={styles.issueList}>
              {reportIssues.length > 0 ? (
                reportIssues.map((issue) => {
                  const active = selectedIssueId === issue.id;
                  const isTarget = data.targetIssueId === issue.id;
                  const canLocate = highlightableIds.has(issue.id);
                  return (
                    <article
                      className={styles.issueCard}
                      data-active={active ? "true" : "false"}
                      data-feedback-issue-card={issue.id}
                      id={`feedback-issue-card-${issue.id}`}
                      key={issue.id}
                      ref={(node) => {
                        cardRefs.current[issue.id] = node;
                      }}
                    >
                      <button
                        aria-controls={`feedback-issue-details-${issue.id}${
                          canLocate ? ` feedback-highlight-${issue.id}` : ""
                        }`}
                        aria-current={active ? "true" : undefined}
                        aria-expanded={active}
                        className={styles.issueTrigger}
                        data-issue-card={issue.id}
                        data-feedback-issue={issue.id}
                        onClick={() => activateSuggestion(issue.id)}
                        type="button"
                      >
                        <span className={styles.issueNumber}>
                          {issue.priority}
                        </span>
                        <span className={styles.issueSummary}>
                          <span className={styles.issueLabels}>
                            <span data-tone={feedbackGroup(issue)}>
                              {feedbackGroup(issue) === "must_fix"
                                ? text("需要改正", "Fix this")
                                : feedbackGroup(issue) === "naturalness"
                                  ? text("表达更自然", "More natural")
                                  : text("可选润色", "Optional polish")}
                            </span>
                            {isTarget ? (
                              <span className={styles.focusTarget}>
                                <Sparkles aria-hidden="true" size={12} />
                                {text(
                                  "本次专项重点",
                                  "Focused teaching target",
                                )}
                              </span>
                            ) : null}
                          </span>
                          <strong>{text(issue.titleZh, issue.titleEn)}</strong>
                          <span
                            aria-hidden="true"
                            className={styles.evidenceRelation}
                            data-feedback-evidence
                          >
                            <EvidenceLink
                              label={text("修改建议", "Suggestion")}
                              state="revision"
                            >
                              <span lang="en">{issue.evidence}</span>
                            </EvidenceLink>
                          </span>
                          <small className="sr-only" lang="en">
                            {issue.evidence}
                          </small>
                        </span>
                        <ChevronDown aria-hidden="true" size={17} />
                      </button>

                      <div
                        className={styles.issueDetails}
                        data-feedback-issue-details={issue.id}
                        hidden={!active}
                        id={`feedback-issue-details-${issue.id}`}
                      >
                        <div className={styles.detailBlock}>
                          <span>
                            <Languages aria-hidden="true" size={15} />
                            {feedbackGroup(issue) === "polish"
                              ? text(
                                  "这项建议的作用",
                                  "What this suggestion offers",
                                )
                              : text("为什么要改", "Why it needs revision")}
                          </span>
                          <p>
                            {text(issue.explanationZh, issue.explanationEn)}
                          </p>
                        </div>
                        <div className={styles.revisionBlock}>
                          <span>{text("参考改法", "Improved version")}</span>
                          <p lang="en">{issue.correctedVersion}</p>
                        </div>
                        <div className={styles.detailBlock}>
                          <span>
                            <Info aria-hidden="true" size={15} />
                            {text("记住这个知识点", "Knowledge to retain")}
                          </span>
                          <p>{issue.knowledgePointZh}</p>
                        </div>
                        <div className={styles.transferBlock}>
                          <Target aria-hidden="true" size={15} />
                          <p>
                            <strong>
                              {text("下次这样用：", "Use it next time: ")}
                            </strong>
                            {text(issue.transferRuleZh, issue.transferRuleEn)}
                          </p>
                        </div>
                        {isTarget ? (
                          <details className={styles.focusReason}>
                            <summary>
                              <Sparkles aria-hidden="true" size={15} />
                              {text(
                                "为什么把这处作为专项重点",
                                "Why this is the focused teaching target",
                              )}
                            </summary>
                            <p>
                              {text(
                                "编号表示本篇的纠错顺序；“本次专项重点”则选择最值得带到其他题目继续练的能力。",
                                "Numbers show the correction order for this essay; the focused teaching target is the skill most worth transferring to other tasks.",
                              )}
                            </p>
                          </details>
                        ) : null}
                        {canLocate ? (
                          <button
                            className={styles.locateButton}
                            onClick={() => showIssueInSource(issue.id)}
                            type="button"
                          >
                            <LocateFixed aria-hidden="true" size={15} />
                            {text("在原文中查看", "View in original")}
                          </button>
                        ) : (
                          <p className={styles.unlocatedNote}>
                            {text(
                              "这条建议来自整段分析，原文中没有可安全标出的单一位置。",
                              "This suggestion comes from paragraph-level analysis, so there is no single source span to highlight safely.",
                            )}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className={styles.emptySuggestions}>
                  <CheckCircle2 aria-hidden="true" size={22} />
                  <p>
                    {text(
                      "这里没有需要查看的建议，可以切换分类或继续阅读。",
                      "There are no suggestions in this view. Choose another category or keep reading.",
                    )}
                  </p>
                </div>
              )}
            </div>

            <div className={styles.leakCheck}>
              <h3>{text("基础漏洞速查", "Basic accuracy check")}</h3>
              {grammarLeaks.length > 0 ? (
                <ul>
                  {grammarLeaks.map((issue) => (
                    <li key={`leak-${issue.id}`}>
                      <CheckCircle2 aria-hidden="true" size={14} />
                      <span>
                        <b lang="en">{issue.evidence}</b>
                        {issue.knowledgePointZh}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  {text(
                    "本轮未识别出需要单独列出的基础语法或拼写问题。",
                    "No foundational grammar or spelling issue needs a separate note this time.",
                  )}
                </p>
              )}
            </div>
          </aside>
        </ResponsiveReport>

        <Card className={styles.nextStepCard} data-feedback-next-step>
          <span className={styles.nextStepIcon}>
            <BrainCircuit aria-hidden="true" size={23} />
          </span>
          <div>
            <h2>
              {text(
                "先完成专项教学，再进入60分钟训练卷",
                "Complete focused teaching before the 60-minute paper",
              )}
            </h2>
            <p>
              {text(data.lessonScheduledLabelZh, data.lessonScheduledLabelEn)}
            </p>
            {data.lessonGenerationRetry ? (
              <div className={styles.retryNote}>
                <Info aria-hidden="true" size={16} />
                <span>
                  {text(
                    "试卷暂时没有生成；已完成的作文批改会保留。",
                    "The paper was not generated; your completed essay feedback remains available.",
                  )}
                </span>
              </div>
            ) : null}
            {generationRetryError ? (
              <p role="alert">{generationRetryError}</p>
            ) : null}
          </div>
          <div className={styles.nextStepActions}>
            <ActionLink href="/today" size="lg" variant="secondary">
              {text("稍后学习", "Study later")}
            </ActionLink>
            {data.lessonGenerationRetry ? (
              <Button
                disabled={retryingGeneration}
                onClick={() => {
                  setRetryingGeneration(true);
                  setGenerationRetryError("");
                  void learningClient
                    .retryLessonGeneration(data.lessonGenerationRetry!.jobId)
                    .then(() => learningClient.getFeedback(data.cycleId))
                    .then((refreshed) => {
                      if (!refreshed.lessonId) {
                        throw new LearningClientError(
                          "新版专项训练卷尚未生成成功，请稍后再试。",
                          {
                            status: 500,
                            code: "LESSON_GENERATION_RESULT_MISSING",
                          },
                        );
                      }
                      router.push(
                        learningRouteHref("/lesson", {
                          cycleId: refreshed.cycleId,
                          lessonId: refreshed.lessonId,
                        }),
                      );
                    })
                    .catch((retryError) =>
                      setGenerationRetryError(
                        retryError instanceof Error
                          ? retryError.message
                          : text(
                              "专项训练卷仍未生成，请稍后再试。",
                              "The practice paper is still unavailable. Try again later.",
                            ),
                      ),
                    )
                    .finally(() => setRetryingGeneration(false));
                }}
                size="lg"
              >
                {text(
                  "重新生成专项教学与试卷",
                  "Generate teaching and paper again",
                )}
              </Button>
            ) : (
              <ActionLink
                href={learningRouteHref("/lesson", {
                  cycleId: data.cycleId,
                  lessonId: data.lessonId,
                })}
                size="lg"
              >
                {text("开始专项教学", "Start focused teaching")}
              </ActionLink>
            )}
          </div>
        </Card>

        <Card className={styles.lockedModelCard}>
          <BookLock aria-hidden="true" size={19} />
          <div>
            <strong>
              {text(
                "Band 7 / 7.5 范文暂时锁定",
                "Band 7 / 7.5 model essay is locked",
              )}
            </strong>
            <p>
              {text(
                "完整范文会在 Version 2 提交后开放，避免提前看到答案影响重写。",
                "The complete model opens after Version 2 so it cannot influence your rewrite in advance.",
              )}
            </p>
          </div>
          <Badge tone="neutral">Version 2 {text("后开放", "required")}</Badge>
        </Card>
      </div>
    </PageLayout>
  );
}
