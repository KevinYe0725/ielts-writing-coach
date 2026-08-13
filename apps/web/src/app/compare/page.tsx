"use client";

import { use, useCallback, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileDiff,
  Sparkles,
  Target,
  TrendingUp,
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
  singleRouteParam,
  type LearningSearchParams,
} from "@/lib/client/learning-route";

export default function ComparePage({
  searchParams,
}: {
  searchParams: Promise<LearningSearchParams>;
}) {
  const query = use(searchParams);
  const cycleId = singleRouteParam(query, "cycle");
  const { text, messages } = useLocale();
  const loader = useCallback(
    () =>
      cycleId
        ? learningClient.getComparison(cycleId)
        : Promise.reject(
            new LearningClientError(
              "This comparison is missing its cycle identity. Open it from Today.",
              { status: 400, code: "LEARNING_ROUTE_IDENTITY_REQUIRED" },
            ),
          ),
    [cycleId],
  );
  const { data, error, loading, retry } = useDemoResource(loader);
  const [modelOpen, setModelOpen] = useState(false);

  if (loading || !data) {
    if (error) {
      return (
        <Card className="transfer-result-card">
          <TriangleAlert aria-hidden="true" size={36} />
          <h1>{text("对比暂不可用", "Comparison unavailable")}</h1>
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
  const retained = data.retained ?? false;
  const ScoreDeltaIcon = data.overallDelta >= 0 ? TrendingUp : FileDiff;
  const signed = (value: number, digits = 1) =>
    `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;

  const statePresentation = {
    resolved: {
      zh: "已消失",
      en: "Resolved",
      tone: "green" as const,
      icon: CheckCircle2,
    },
    improved: {
      zh: "已改善",
      en: "Improved",
      tone: "blue" as const,
      icon: TrendingUp,
    },
    watch: {
      zh: "继续观察",
      en: "Keep watching",
      tone: "amber" as const,
      icon: TriangleAlert,
    },
  };

  return (
    <>
      <PageHeader
        actions={
          <Badge tone={retained ? "green" : "amber"}>
            {retained ? (
              <CheckCircle2 aria-hidden="true" size={13} />
            ) : (
              <TriangleAlert aria-hidden="true" size={13} />
            )}
            {retained
              ? text("闭卷证据达到保留门槛", "Retention gate passed")
              : text(
                  "闭卷重写完成 · 继续观察",
                  "Rewrite complete · keep watching",
                )}
          </Badge>
        }
        eyebrow={text("Version 1 / Version 2", "Version 1 / Version 2")}
        title={text(
          retained
            ? "目标能力正在稳定，但仍需迁移证据"
            : "重写完成，但系统不会把不足的证据算作掌握",
          retained
            ? "The target is stabilising, but transfer evidence is still needed"
            : "The rewrite is complete, but insufficient evidence is not counted as mastery",
        )}
        description={data.promptTitle}
      />

      <Card className="comparison-hero">
        <div className="version-score before">
          <span>Version 1</span>
          <strong>{data.v1Score.toFixed(1)}</strong>
          <small>
            {data.v1Words} {text("词", "words")}
          </small>
        </div>
        <div className="score-bridge">
          <ScoreDeltaIcon aria-hidden="true" size={20} />
          <strong>{signed(data.overallDelta)}</strong>
          <span>{text("同量表 AI 估分变化", "Same-rubric AI change")}</span>
        </div>
        <div className="version-score after">
          <span>Version 2</span>
          <strong>{data.v2Score.toFixed(1)}</strong>
          <small>
            {data.v2Words} {text("词", "words")}
          </small>
        </div>
        <div className="comparison-interpretation">
          <p className="eyebrow">
            {text("最重要的结论", "Most important finding")}
          </p>
          <h2>
            {text(
              retained
                ? "闭卷证据通过 retained 门槛"
                : "本次只记录完成，不授予 retained",
              retained
                ? "The blind draft passed the retained evidence gate"
                : "Completion is recorded, but retained is not awarded",
            )}
          </h2>
          <p>
            {text(
              data.summaryZh ?? "系统只根据自检前快照更新能力证据。",
              data.summaryEn ??
                "Skill evidence is updated only from the pre-self-check snapshot.",
            )}
          </p>
        </div>
      </Card>

      <Card className="comparison-metrics-card">
        <div className="comparison-metrics-heading">
          <div>
            <p className="eyebrow">
              {text("同一评分版本", "Same scoring version")}
            </p>
            <h2>{text("四项估分变化", "Four-criterion score changes")}</h2>
          </div>
          <Badge tone="blue">
            {text("同一评分标准", "Same marking standard")}
          </Badge>
        </div>
        <div className="criterion-delta-grid">
          {data.criterionDeltas.map((criterion) => (
            <div className="criterion-delta" key={criterion.criterion}>
              <span>
                <strong>{criterion.criterion}</strong>
                {text(criterion.labelZh, criterion.labelEn)}
              </span>
              <span>
                {criterion.v1.toFixed(1)} → {criterion.v2.toFixed(1)}
              </span>
              <strong className={criterion.delta < 0 ? "negative" : ""}>
                {signed(criterion.delta)}
              </strong>
            </div>
          ))}
        </div>
        <div className="recurrence-metric">
          <div>
            <span>{text("核心问题频率", "Core-issue frequency")}</span>
            <strong>
              {data.recurrence.v1Per100Words.toFixed(2)} →{" "}
              {data.recurrence.v2Per100Words.toFixed(2)}
            </strong>
            <small>{text("每 100 词", "per 100 words")}</small>
          </div>
          <Badge
            tone={
              !data.recurrence.evidenceVerified || data.recurrence.recurred
                ? "amber"
                : "green"
            }
          >
            {!data.recurrence.evidenceVerified
              ? text("跨度证据待复核", "Span evidence unverified")
              : data.recurrence.recurred
                ? text(
                    `仍复发 ${data.recurrence.v2Occurrences} 次`,
                    `Recurred ${data.recurrence.v2Occurrences} time(s)`,
                  )
                : text("未检测到复发", "No recurrence detected")}
          </Badge>
        </div>
      </Card>

      <SectionHeader
        title={text("关键变化", "Key changes")}
        description={text(
          "只比较本轮训练目标，不用满屏红线制造噪音。",
          "The comparison stays focused on this cycle’s targets rather than covering the page in red marks.",
        )}
      />
      <div className="comparison-list">
        {data.points.map((point) => {
          const presentation = statePresentation[point.state];
          const Icon = presentation.icon;
          return (
            <Card className="comparison-card" key={point.id}>
              <div className="comparison-card-title">
                <Badge tone={presentation.tone}>
                  <Icon aria-hidden="true" size={13} />
                  {text(presentation.zh, presentation.en)}
                </Badge>
                <h3>{text(point.titleZh, point.titleEn)}</h3>
              </div>
              <div className="sentence-diff-grid">
                <div className="sentence-before">
                  <span>Version 1</span>
                  <p lang="en">{point.before}</p>
                </div>
                <div className="diff-arrow" aria-hidden="true">
                  <ArrowRight size={17} />
                </div>
                <div className="sentence-after">
                  <span>Version 2</span>
                  <p lang="en">{point.after}</p>
                </div>
              </div>
              <div className="comparison-note">
                <Target aria-hidden="true" size={15} />
                <span>{text(point.noteZh, point.noteEn)}</span>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="next-evidence-card">
        <span className="next-evidence-icon">
          <Sparkles aria-hidden="true" size={22} />
        </span>
        <div>
          <p className="eyebrow">
            {text(data.nextTask.eyebrowZh, data.nextTask.eyebrowEn)}
          </p>
          <h2>{text(data.nextTask.titleZh, data.nextTask.titleEn)}</h2>
          <p>
            {text(data.nextTask.descriptionZh, data.nextTask.descriptionEn)}
          </p>
          <span>
            <Clock3 aria-hidden="true" size={14} />
            {text(data.nextTask.dueLabelZh, data.nextTask.dueLabelEn)} ·{" "}
            {data.nextTask.durationMinutes} {messages.common.minutes}
          </span>
        </div>
        <ActionLink href={data.nextTask.href} size="lg">
          {text(data.nextTask.actionZh, data.nextTask.actionEn)}
        </ActionLink>
      </Card>

      <SectionHeader
        title={text(
          data.modelEssay
            ? "现在可以查看任务对应的 AI 参考范文"
            : "本轮没有可用的任务对应范文",
          data.modelEssay
            ? "The task-specific AI reference essay is now available"
            : "No task-specific reference essay is available for this cycle",
        )}
        description={text(
          data.modelEssaySource === "unavailable"
            ? "本轮没有持久化的任务对应参考文；系统不会用不相关范文填充。"
            : data.modelEssaySource === "mock"
              ? "Mock 模式只验证产品闭环，不提供可信的语言评分；请连接真实模型生成参考范文。"
              : "这是 Band 7–7.5 风格的 AI 教学参考，不是官方成绩或教师认证，也不应背诵套用。",
          data.modelEssaySource === "unavailable"
            ? "No task-specific reference was persisted for this cycle, so the system will not substitute an unrelated essay."
            : data.modelEssaySource === "mock"
              ? "Mock mode validates the product flow, not language quality. Connect a real model for a reference essay."
              : "This is a Band 7–7.5-style AI teaching reference, not an official score or teacher certification, and should not be memorised as a script.",
        )}
      />
      {data.modelEssay ? (
        <Card className="model-essay-card">
          <button
            aria-expanded={modelOpen}
            className="model-essay-toggle"
            onClick={() => setModelOpen((value) => !value)}
            type="button"
          >
            <span>
              <BookOpen aria-hidden="true" size={19} />
              <span>
                <strong>
                  {data.modelEssaySource === "mock"
                    ? "Mock flow reference"
                    : "Band 7–7.5-style AI reference"}
                </strong>
                <small>
                  {text(
                    "约 292 词 · 完整论证链",
                    "About 292 words · complete argument chains",
                  )}
                </small>
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={modelOpen ? "rotated" : ""}
              size={18}
            />
          </button>
          {modelOpen ? (
            <article className="model-essay" lang="en">
              {data.modelEssay
                .split(/\n\s*\n/)
                .filter(Boolean)
                .map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
            </article>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
