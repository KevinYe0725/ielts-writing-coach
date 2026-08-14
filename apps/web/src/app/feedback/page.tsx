"use client";

import {
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookLock,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Info,
  Languages,
  LocateFixed,
  LockKeyhole,
  PenLine,
  ShieldCheck,
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
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { useDemoResource } from "@/components/use-demo-resource";
import { LearningClientError, learningClient } from "@/lib/client";
import { buildFeedbackSegments } from "@/lib/client/feedback-annotations";
import {
  learningRouteHref,
  singleRouteParam,
  type LearningSearchParams,
} from "@/lib/client/learning-route";

import styles from "./feedback.module.css";

type MobilePane = "source" | "suggestions";

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

function isSmallScreen() {
  return window.matchMedia("(max-width: 760px)").matches;
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
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<MobilePane>("suggestions");
  const [locationMessage, setLocationMessage] = useState("");
  const [retryingGeneration, setRetryingGeneration] = useState(false);
  const [generationRetryError, setGenerationRetryError] = useState("");
  const highlightRefs = useRef<Record<string, HTMLElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  const issues = useMemo(() => data?.issues ?? [], [data?.issues]);
  const selectedIssueId =
    activeIssueId && issues.some((issue) => issue.id === activeIssueId)
      ? activeIssueId
      : (issues[0]?.id ?? null);
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
      setActiveIssueId(issueId);
      if (panesAreSideBySide() && highlightableIds.has(issueId)) {
        scrollToRef(highlightRefs, issueId);
        announceIssue(issueId, "source");
      }
    },
    [announceIssue, highlightableIds, scrollToRef],
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
      setActiveIssueId(issueId);
      if (isSmallScreen()) setMobilePane("suggestions");
      scrollToRef(cardRefs, issueId);
      announceIssue(issueId, "suggestions");
    },
    [announceIssue, scrollToRef],
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

  const targetIssue = data.targetIssueId
    ? data.issues.find((issue) => issue.id === data.targetIssueId)
    : null;
  const targetDiffersFromFirst =
    Boolean(targetIssue) && data.issues[0]?.id !== targetIssue?.id;
  const grammarLeaks = data.issues.filter((issue) =>
    ["GRAMMAR", "SPELLING", "WORD_FORM"].includes(issue.issueType),
  );

  return (
    <div className={styles.page}>
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
                <ArrowRight
                  aria-hidden="true"
                  size={17}
                  style={{ transform: "rotate(180deg)" }}
                />
                {text("进入专项教学", "Open focused teaching")}
              </ActionLink>
            ) : null}
            <Badge tone="neutral">
              <ShieldCheck aria-hidden="true" size={13} />
              {data.languageScored
                ? text(
                    "学习用估分 · 非官方成绩",
                    "Learning estimate · not an official score",
                  )
                : text(
                    "示例报告 · 未评价语言",
                    "Example report · language not scored",
                  )}
            </Badge>
          </div>
        }
        eyebrow={text("第1步 · 详细批改与改正", "Step 1 · Detailed correction")}
        title={text(
          "对照原文，把每一处问题改明白",
          "Correct each issue against your original essay",
        )}
        description={text(
          "点击右侧建议即可回到对应原句；先理解为什么，再记住可以迁移到下一篇的改法。",
          "Select a suggestion to locate its exact source, understand why it matters, and retain the transferable revision rule.",
        )}
      />

      <Card className={styles.overviewCard}>
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
            <p className="eyebrow">{text("本篇诊断", "Essay diagnosis")}</p>
            <h2>{text(data.overallSummaryZh, data.overallSummaryEn)}</h2>
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
      </Card>

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
          <span>{data.issues.length}</span>
        </button>
      </div>

      <p aria-atomic="true" aria-live="polite" className="sr-only">
        {locationMessage}
      </p>

      <div
        className={styles.workbench}
        data-feedback-workbench
        data-testid="feedback-workbench"
      >
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
            <div>
              <p className="eyebrow">
                {text("Version 1 原文", "Version 1 original")}
              </p>
              <h2>{text("逐句定位", "Source document")}</h2>
            </div>
            <span>
              <LockKeyhole aria-hidden="true" size={14} />
              {text("原样保留", "Preserved")}
            </span>
          </div>

          <div className={styles.taskBlock}>
            <span>{text("原题", "Original task")}</span>
            <p lang="en">{data.prompt}</p>
          </div>

          <div className={styles.essay} data-feedback-essay lang="en">
            {segments.map((segment, index) =>
              segment.kind === "text" ? (
                <span key={`text-${index}`}>{segment.text}</span>
              ) : (
                <mark
                  aria-label={text(
                    `查看“${
                      data.issues.find((issue) => issue.id === segment.issueId)
                        ?.titleZh ?? "这处问题"
                    }”的修改建议`,
                    "Open the suggestion for this source text",
                  )}
                  aria-pressed={selectedIssueId === segment.issueId}
                  data-active={
                    selectedIssueId === segment.issueId ? "true" : "false"
                  }
                  data-annotation-kind={annotationKind(
                    data.issues.find((issue) => issue.id === segment.issueId)
                      ?.issueType ?? "OPTIONAL_POLISH",
                    data.issues.find((issue) => issue.id === segment.issueId)
                      ?.severity ?? "polish",
                  )}
                  data-feedback-highlight={segment.issueId}
                  data-issue-highlight={segment.issueId}
                  id={`feedback-highlight-${segment.issueId}`}
                  key={`${segment.issueId}-${index}`}
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
              ),
            )}
          </div>

          <div className={styles.paragraphReview}>
            <h3>{text("逐段诊断", "Paragraph review")}</h3>
            {data.paragraphFeedback.length > 0 ? (
              data.paragraphFeedback.map((paragraph) => (
                <details key={paragraph.paragraphIndex}>
                  <summary>
                    <span>{paragraph.paragraphIndex}</span>
                    <b>{text(paragraph.roleZh, paragraph.roleEn)}</b>
                    <ChevronDown aria-hidden="true" size={15} />
                  </summary>
                  <blockquote lang="en">{paragraph.excerpt}</blockquote>
                  <p>{text(paragraph.diagnosisZh, paragraph.diagnosisEn)}</p>
                  <div>
                    <PenLine aria-hidden="true" size={15} />
                    <span>
                      <strong>{text("怎么改：", "Revision action: ")}</strong>
                      {text(paragraph.actionZh, paragraph.actionEn)}
                    </span>
                  </div>
                </details>
              ))
            ) : (
              <p className={styles.emptyCopy}>
                {text(
                  "本轮暂未生成段落诊断。",
                  "Paragraph-level feedback is not available for this attempt.",
                )}
              </p>
            )}
          </div>
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
            <div>
              <p className="eyebrow">
                {text("逐句修改", "Sentence corrections")}
              </p>
              <h2>{text("修改建议", "Suggestions")}</h2>
            </div>
            <span>{data.issues.length}</span>
          </div>

          {targetDiffersFromFirst ? (
            <div className={styles.targetNote}>
              <Target aria-hidden="true" size={16} />
              <p>
                {text(
                  "编号表示本篇的纠错顺序；“本次专项重点”则选择最值得带到其他题目继续练的能力。",
                  "Numbers show the correction order for this essay; the focused teaching target is the skill most worth transferring to other tasks.",
                )}
              </p>
            </div>
          ) : null}

          <div className={styles.issueList}>
            {data.issues.length > 0 ? (
              data.issues.map((issue) => {
                const active = selectedIssueId === issue.id;
                const isTarget = data.targetIssueId === issue.id;
                const canLocate = highlightableIds.has(issue.id);
                return (
                  <article
                    className={styles.issueCard}
                    data-active={active ? "true" : "false"}
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
                          <span data-tone={issue.severity}>
                            {issue.severity === "must_fix"
                              ? text("需要改正", "Fix this")
                              : issue.severity === "naturalness"
                                ? text("表达更自然", "More natural")
                                : text("可以更好", "Could improve")}
                          </span>
                          {isTarget ? (
                            <span className={styles.focusTarget}>
                              <Sparkles aria-hidden="true" size={12} />
                              {text("本次专项重点", "Focused teaching target")}
                            </span>
                          ) : null}
                        </span>
                        <strong>{text(issue.titleZh, issue.titleEn)}</strong>
                        <small lang="en">{issue.evidence}</small>
                      </span>
                      <ChevronDown aria-hidden="true" size={17} />
                    </button>

                    <div
                      className={styles.issueDetails}
                      hidden={!active}
                      id={`feedback-issue-details-${issue.id}`}
                    >
                      <div className={styles.detailBlock}>
                        <span>
                          <Languages aria-hidden="true" size={15} />
                          {text("为什么要改", "Why it needs revision")}
                        </span>
                        <p>{text(issue.explanationZh, issue.explanationEn)}</p>
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
                    "本轮没有逐句修改建议。",
                    "No sentence-level suggestions for this attempt.",
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
      </div>

      <Card className={styles.nextStepCard}>
        <span className={styles.nextStepIcon}>
          <BrainCircuit aria-hidden="true" size={23} />
        </span>
        <div>
          <p className="eyebrow">{text("下一步", "Next step")}</p>
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
          <span className={styles.duration}>
            <Clock3 aria-hidden="true" size={15} />
            15–25 {messages.common.minutes}
          </span>
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
        <Badge tone="violet">Version 2 {text("后开放", "required")}</Badge>
      </Card>
    </div>
  );
}
