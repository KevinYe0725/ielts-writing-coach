"use client";

import { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookLock,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Info,
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
  const cycleId = singleRouteParam(use(searchParams), "cycle");
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

  const confidenceLabel = (confidence: "high" | "medium" | "low") => {
    if (confidence === "high") return text("高置信", "High confidence");
    if (confidence === "medium") return text("中等置信", "Medium confidence");
    return text("低置信", "Low confidence");
  };

  return (
    <>
      <PageHeader
        actions={
          <Badge tone="neutral">
            <ShieldCheck aria-hidden="true" size={13} />
            {data.languageScored
              ? text(
                  "AI 估分 · 非官方成绩",
                  "AI estimate · not an official score",
                )
              : text(
                  "Mock 演示 · 未评价语言",
                  "Mock demo · language not scored",
                )}
          </Badge>
        }
        eyebrow={text("Version 1 批改完成", "Version 1 feedback ready")}
        title={text(
          "先看最影响分数的三件事",
          "Start with the three things that matter most",
        )}
        description={text(
          "详细报告已经保留，但你现在不需要读完所有修改。系统会把最高优先问题转成主动练习。",
          "The full report is available, but you do not need to read every correction now. High-priority issues become active practice.",
        )}
      />

      <div className="feedback-hero-grid">
        <Card className="overall-score-card">
          <div
            className="score-ring"
            aria-label={
              data.languageScored
                ? `${text("总分估计", "Estimated overall band")} ${data.overallScore}`
                : text("Mock 未评价语言", "Mock did not score language")
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
            <h2>
              {text(
                "结构意识清楚，准确度仍是主要瓶颈",
                "Clear structure; accuracy remains the main constraint",
              )}
            </h2>
            <p>
              {text(
                "这次最值得投入的不是寻找更高级观点，而是把已有观点用自然、完整的英语表达出来。",
                "The highest-return move is not finding more sophisticated ideas, but expressing your existing ideas naturally and completely.",
              )}
            </p>
            <small>
              {data.modelLabel} · {data.rubricVersion}
            </small>
          </div>
        </Card>
        <Card className="strength-card">
          <span className="strength-icon">
            <CheckCircle2 aria-hidden="true" size={22} />
          </span>
          <p className="eyebrow">{text("本篇优势", "What worked")}</p>
          <h2>
            {text(
              "你已经在写一篇真正的议论文",
              "You are already writing a real argument",
            )}
          </h2>
          <p>{text(data.strengthZh, data.strengthEn)}</p>
        </Card>
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
            <Badge tone={score.confidence === "high" ? "green" : "amber"}>
              {confidenceLabel(score.confidence)}
            </Badge>
          </Card>
        ))}
      </div>

      <SectionHeader
        title={text("本篇优先训练目标", "Priority learning targets")}
        description={text(
          "只突出会进入专项课的高收益问题。",
          "Only high-return issues that feed the focused lesson are shown.",
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
                <Badge tone={issue.priority === 1 ? "blue" : "neutral"}>
                  {text(issue.categoryZh, issue.categoryEn)}
                </Badge>
                <h3>{text(issue.titleZh, issue.titleEn)}</h3>
              </div>
              <blockquote lang="en">
                <Quote aria-hidden="true" size={15} />
                {issue.evidence}
              </blockquote>
              <p>{text(issue.explanationZh, issue.explanationEn)}</p>
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
      {!showAll ? (
        <Button
          className="show-more-button"
          onClick={() => setShowAll(true)}
          variant="ghost"
        >
          {text("再看 1 个论证问题", "Show one argument issue")}
          <ChevronDown aria-hidden="true" size={16} />
        </Button>
      ) : null}

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
              "专项训练：让英语按英语的方式组织信息",
              "Focused lesson: organise ideas through a natural English perspective",
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
                  "只有这一课程生成模块失败；已完成的批改与目标不会重做。",
                  "Only this lesson-generation module failed; completed assessment and objectives will not be rerun.",
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
              45–60 {messages.common.minutes}
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
                        "The lesson-generation retry finished without a canonical lesson ID.",
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
                            "课程模块仍未生成，请稍后再试。",
                            "The lesson module is still unavailable. Try again later.",
                          ),
                    ),
                  )
                  .finally(() => setRetryingGeneration(false));
              }}
              size="lg"
            >
              {text("只重试课程生成模块", "Retry lesson module only")}
            </Button>
          ) : (
            <ActionLink
              href={learningRouteHref("/lesson", {
                cycleId: data.cycleId,
                lessonId: data.lessonId,
              })}
              size="lg"
            >
              {text("先做 3 分钟热身", "Do a 3-minute warm-up")}
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
