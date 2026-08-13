"use client";

import { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  BookLock,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Info,
  Languages,
  PenLine,
  Quote,
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
  SectionHeader,
  Skeleton,
} from "@/components/ui";
import { useDemoResource } from "@/components/use-demo-resource";
import { LearningClientError, learningClient } from "@/lib/client";
import {
  learningRouteHref,
  singleRouteParam,
  type LearningSearchParams,
} from "@/lib/client/learning-route";

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
  const [showAll, setShowAll] = useState(false);
  const [retryingGeneration, setRetryingGeneration] = useState(false);
  const [generationRetryError, setGenerationRetryError] = useState("");

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

  return (
    <>
      <PageHeader
        actions={
          <div className="feedback-header-actions">
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
          "先把这篇作文真正改明白",
          "Understand and correct this essay first",
        )}
        description={text(
          "从原文逐段、逐句对照问题和改法；语法、拼写、搭配与论证分别讲清，再把最高优先问题带入专项教学。",
          "Compare the original essay with paragraph and sentence-level corrections before moving the priority target into focused teaching.",
        )}
      />

      <Card className="feedback-source-card">
        <div className="feedback-source-section">
          <p className="eyebrow">{text("原题", "Original task")}</p>
          <h2 lang="en">{data.prompt}</h2>
        </div>
        <div className="feedback-source-section">
          <p className="eyebrow">
            {text(
              "你的原文 · 原样保留",
              "Your original Version 1 · preserved verbatim",
            )}
          </p>
          <div className="feedback-original-essay" lang="en">
            {data.originalEssay.split(/\n\s*\n/).map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>
            ))}
          </div>
        </div>
      </Card>

      <div className="feedback-hero-grid">
        <Card className="overall-score-card">
          <div
            className="score-ring"
            aria-label={
              data.languageScored
                ? `${text("总分估计", "Estimated overall band")} ${data.overallScore}`
                : text(
                    "当前仅演示流程，未评价语言",
                    "This is a workflow preview; language was not scored",
                  )
            }
          >
            <strong>
              {data.languageScored ? data.overallScore.toFixed(1) : "—"}
            </strong>
            <span>
              {data.languageScored
                ? data.scoreRange
                : text("仅演示流程", "Workflow only")}
            </span>
          </div>
          <div className="score-copy">
            <p className="eyebrow">
              {text("Overall estimate", "Overall estimate")}
            </p>
            <h2>{text("本篇总体诊断", "Overall diagnosis")}</h2>
            <p>{text(data.overallSummaryZh, data.overallSummaryEn)}</p>
            <small>
              {text(
                "估分只用于定位下一步学习重点",
                "The estimate is used only to identify the next learning priority",
              )}
            </small>
          </div>
        </Card>
        <Card className="strength-card">
          <span className="strength-icon">
            <CheckCircle2 aria-hidden="true" size={22} />
          </span>
          <p className="eyebrow">{text("本篇优势", "What worked")}</p>
          <h2>{text("先保留做对的部分", "Preserve what already works")}</h2>
          <p>{text(data.strengthZh, data.strengthEn)}</p>
        </Card>
      </div>

      <SectionHeader
        title={text(
          "逐段看：每一段完成了什么，还缺什么",
          "Paragraph-by-paragraph review",
        )}
        description={text(
          "先理解段落功能和论证缺口，再处理句子里的语言问题。",
          "Understand paragraph purpose and development before local language corrections.",
        )}
      />
      <div className="paragraph-feedback-list">
        {data.paragraphFeedback.length > 0 ? (
          data.paragraphFeedback.map((paragraph) => (
            <Card
              className="paragraph-feedback-card"
              key={paragraph.paragraphIndex}
            >
              <header>
                <span>{paragraph.paragraphIndex}</span>
                <h3>{text(paragraph.roleZh, paragraph.roleEn)}</h3>
              </header>
              <blockquote lang="en">{paragraph.excerpt}</blockquote>
              <p>{text(paragraph.diagnosisZh, paragraph.diagnosisEn)}</p>
              <div>
                <PenLine aria-hidden="true" size={16} />
                <span>
                  <strong>{text("具体怎么改：", "Revision action: ")}</strong>
                  {text(paragraph.actionZh, paragraph.actionEn)}
                </span>
              </div>
            </Card>
          ))
        ) : (
          <Card>
            <p>
              {text(
                "段落级分析未生成；下方逐句改正仍然可用。",
                "Paragraph analysis is unavailable; sentence-level corrections remain available below.",
              )}
            </p>
          </Card>
        )}
      </div>

      <div
        className="band-grid"
        aria-label={text("IELTS 四项估分", "IELTS criterion estimates")}
      >
        {data.scores.map((score) => (
          <Card className="band-card" key={score.criterion}>
            <div className="band-card-head">
              <span>{score.criterion}</span>
              <strong>
                {data.languageScored ? score.score.toFixed(1) : "—"}
              </strong>
            </div>
            <h3>{text(score.labelZh, score.labelEn)}</h3>
            <p>{text(score.summaryZh, score.summaryEn)}</p>
          </Card>
        ))}
      </div>

      <SectionHeader
        title={text(
          "逐句对照：原句 → 改法 → 知识点",
          "Sentence correction: original → revision → knowledge",
        )}
        description={text(
          "先修必须改的错误，再处理自然度；可选润色不会冒充语法错误。",
          "Fix real errors first, then naturalness. Optional polish is never presented as grammar failure.",
        )}
      />
      <div className="issue-list">
        {data.issues.slice(0, showAll ? data.issues.length : 2).map((issue) => (
          <Card className="issue-card" key={issue.id}>
            <div className="issue-priority">
              <span>{issue.priority}</span>
              <small>{text("优先级", "Priority")}</small>
            </div>
            <div className="issue-main">
              <div className="issue-title-row">
                <Badge
                  tone={
                    issue.severity === "must_fix"
                      ? "amber"
                      : issue.severity === "naturalness"
                        ? "blue"
                        : "neutral"
                  }
                >
                  {issue.severity === "must_fix"
                    ? text("需要改正", "Must fix")
                    : issue.severity === "naturalness"
                      ? text("更自然", "More natural")
                      : text("可选优化", "Optional polish")}
                </Badge>
                <h3>{text(issue.titleZh, issue.titleEn)}</h3>
              </div>
              <div className="sentence-correction-grid">
                <div>
                  <small>{text("原文", "Original")}</small>
                  <blockquote lang="en">
                    <Quote aria-hidden="true" size={15} />
                    {issue.evidence}
                  </blockquote>
                </div>
                <div>
                  <small>{text("参考改法", "Improved version")}</small>
                  <p lang="en">{issue.correctedVersion}</p>
                </div>
              </div>
              <div className="correction-explanation">
                <Languages aria-hidden="true" size={17} />
                <div>
                  <strong>{text("为什么要改", "Why this changes")}</strong>
                  <p>{text(issue.explanationZh, issue.explanationEn)}</p>
                </div>
              </div>
              <div className="knowledge-point">
                <BookOpen aria-hidden="true" size={17} />
                <div>
                  <strong>
                    {text("举一反三知识点", "Transferable knowledge")}
                  </strong>
                  <p>{issue.knowledgePointZh}</p>
                </div>
              </div>
              <div className="transfer-rule">
                <Target aria-hidden="true" size={16} />
                <span>
                  <strong>{text("迁移规则：", "Transfer rule: ")}</strong>
                  {text(issue.transferRuleZh, issue.transferRuleEn)}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {!showAll && data.issues.length > 2 ? (
        <Button
          className="show-more-button"
          onClick={() => setShowAll(true)}
          variant="ghost"
        >
          {text(
            `继续看另外 ${data.issues.length - 2} 个问题`,
            `Show ${data.issues.length - 2} more issues`,
          )}
          <ChevronDown aria-hidden="true" size={16} />
        </Button>
      ) : null}

      <SectionHeader
        title={text("容易漏掉的小问题", "Small but recurring leaks")}
        description={text(
          "这些问题不一定决定整篇立意，却会持续拉低准确度。",
          "These may not define the argument, but repeated local errors reduce accuracy.",
        )}
      />
      <Card className="small-leaks-card">
        {data.issues.filter((issue) =>
          ["GRAMMAR", "SPELLING", "WORD_FORM"].includes(issue.issueType),
        ).length > 0 ? (
          <ul>
            {data.issues
              .filter((issue) =>
                ["GRAMMAR", "SPELLING", "WORD_FORM"].includes(issue.issueType),
              )
              .map((issue) => (
                <li key={`leak-${issue.id}`}>
                  <CheckCircle2 aria-hidden="true" size={16} />
                  <div>
                    <strong lang="en">{issue.evidence}</strong>
                    <span>{issue.knowledgePointZh}</span>
                  </div>
                </li>
              ))}
          </ul>
        ) : (
          <p>
            {text(
              "本轮没有发现高置信的拼写或基础语法漏洞；系统不会为了显得详细而制造错误。",
              "No high-confidence spelling or foundational grammar leak was found; the report will not invent errors for appearance.",
            )}
          </p>
        )}
      </Card>

      <Card className="lesson-schedule-card">
        <span className="lesson-schedule-icon">
          <BrainCircuit aria-hidden="true" size={23} />
        </span>
        <div>
          <p className="eyebrow">
            {text("下一步已自动安排", "Your next step is scheduled")}
          </p>
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
            <div className="adaptive-note">
              <Info aria-hidden="true" size={16} />
              <span>
                {text(
                  "试卷暂时没有生成；已完成的作文批改不会重做。",
                  "The paper was not generated; completed essay feedback will not be rerun.",
                )}
              </span>
            </div>
          ) : null}
          {generationRetryError ? (
            <p role="alert">{generationRetryError}</p>
          ) : null}
          <div className="task-meta">
            <span>
              <Clock3 aria-hidden="true" size={15} />
              15–25 {messages.common.minutes}
            </span>
            <span>
              <CalendarClock aria-hidden="true" size={15} />
              {text("今天 20:00", "Today at 20:00")}
            </span>
          </div>
        </div>
        <div className="lesson-schedule-actions">
          <ActionLink href="/today" size="lg" variant="secondary">
            {text("今天先到这里", "Finish for today")}
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
                  .catch((error) =>
                    setGenerationRetryError(
                      error instanceof Error
                        ? error.message
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

      <Card className="locked-model-card">
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
              "为了保留延迟重写的真实证据，完整范文会在 Version 2 提交后开放。",
              "The complete model remains hidden until Version 2 is submitted, preserving valid delayed-recall evidence.",
            )}
          </p>
        </div>
        <Badge tone="violet">Version 2 {text("后开放", "required")}</Badge>
      </Card>

      <div className="method-note">
        <Info aria-hidden="true" size={16} />
        <span>
          {text(
            "分数只是定位工具。系统真正追踪的是：已经学习的问题，是否在后续独立写作中消失。",
            "Scores are diagnostic tools. The system ultimately tracks whether learned problems disappear in later independent writing.",
          )}
        </span>
      </div>
    </>
  );
}
