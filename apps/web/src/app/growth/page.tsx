"use client";

import { useCallback } from "react";
import {
  ArrowDownRight,
  BarChart3,
  BookCheck,
  Clock3,
  Target,
  TrendingUp,
} from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import {
  Badge,
  Card,
  PageHeader,
  SectionHeader,
  Skeleton,
} from "@/components/ui";
import { useDemoResource } from "@/components/use-demo-resource";
import { learningClient, type SkillState } from "@/lib/client";

export default function GrowthPage() {
  const { text } = useLocale();
  const loader = useCallback(() => learningClient.getGrowth(), []);
  const { data, loading } = useDemoResource(loader);

  if (loading || !data)
    return (
      <Skeleton label={text("正在准备成长记录…", "Preparing growth record…")} />
    );

  const skillState = (state: SkillState) => {
    const states = {
      diagnosed: { zh: "已诊断", en: "Diagnosed", tone: "neutral" as const },
      practicing: { zh: "练习中", en: "Practising", tone: "amber" as const },
      applied: { zh: "临时通过", en: "Applied", tone: "blue" as const },
      retained: { zh: "已保持", en: "Retained", tone: "green" as const },
      transferred: { zh: "已迁移", en: "Transferred", tone: "violet" as const },
    };
    return states[state];
  };
  const firstScore = data.weeklyScores.at(0)?.score ?? null;
  const latestScore = data.weeklyScores.at(-1)?.score ?? null;
  const scoreChange =
    firstScore === null || latestScore === null
      ? null
      : latestScore - firstScore;

  return (
    <>
      <PageHeader
        eyebrow={text("能力档案", "Skill record")}
        title={text(
          "看错误是否消失，不看刷了多少题",
          "Track disappearing errors, not completed exercises",
        )}
        description={text(
          "即时练习最多证明“现在会用”；延迟重写和陌生题才提供保持与迁移证据。",
          "Immediate practice shows only current application. Delayed rewrites and new topics provide retention and transfer evidence.",
        )}
      />

      <div className="growth-stat-grid">
        <Card>
          <span className="stat-icon blue">
            <BookCheck aria-hidden="true" size={19} />
          </span>
          <div>
            <span>{text("完整作文", "Essays completed")}</span>
            <strong>{data.essaysCompleted}</strong>
          </div>
        </Card>
        <Card>
          <span className="stat-icon green">
            <Clock3 aria-hidden="true" size={19} />
          </span>
          <div>
            <span>{text("已记录学习", "Recorded learning")}</span>
            <strong>
              {data.learningMinutes}
              <small> min</small>
            </strong>
          </div>
        </Card>
        <Card>
          <span className="stat-icon violet">
            <Target aria-hidden="true" size={19} />
          </span>
          <div>
            <span>{text("当前 → 目标", "Current → target")}</span>
            <strong>
              {data.currentBand === null ? "—" : data.currentBand.toFixed(1)}
              <small> → {data.targetBand.toFixed(1)}</small>
            </strong>
          </div>
        </Card>
        <Card>
          <span className="stat-icon amber">
            <ArrowDownRight aria-hidden="true" size={19} />
          </span>
          <div>
            <span>
              {text("独立复测未复发", "No recurrence in independent checks")}
            </span>
            <strong>
              {data.independentNonRecurrenceRate ?? "—"}
              {data.independentNonRecurrenceRate === null ? null : (
                <small>%</small>
              )}
            </strong>
          </div>
        </Card>
      </div>

      <div className="growth-main-grid">
        <Card className="score-trend-card">
          <div className="card-title-row">
            <div>
              <p className="eyebrow">{text("限时表现", "Timed performance")}</p>
              <h2>
                {text("最近五轮估分趋势", "Estimated band across five cycles")}
              </h2>
            </div>
            {scoreChange === null ? null : (
              <Badge tone={scoreChange >= 0 ? "green" : "amber"}>
                <TrendingUp aria-hidden="true" size={13} />
                {scoreChange > 0 ? "+" : ""}
                {scoreChange.toFixed(1)}
              </Badge>
            )}
          </div>
          <div
            className="score-chart"
            role="img"
            aria-label={
              firstScore === null || latestScore === null
                ? text("暂无估分记录", "No estimated score history")
                : text(
                    `估分记录从 ${firstScore.toFixed(1)} 到 ${latestScore.toFixed(1)}`,
                    `Estimated band history from ${firstScore.toFixed(1)} to ${latestScore.toFixed(1)}`,
                  )
            }
          >
            {data.weeklyScores.map((point) => (
              <div className="chart-column" key={point.label}>
                <span className="chart-value">{point.score.toFixed(1)}</span>
                <div className="chart-bar-track">
                  <span
                    style={{ height: `${((point.score - 4) / 4) * 100}%` }}
                  />
                </div>
                <small>{point.label}</small>
              </div>
            ))}
          </div>
          <p className="chart-note">
            {text(
              "模型或 rubric 版本变化时，系统不会把分数差直接解释为能力变化。",
              "A model or rubric version change is never treated as a learner improvement by itself.",
            )}
          </p>
        </Card>
        <Card className="north-star-card">
          <span className="north-star-icon">
            <BarChart3 aria-hidden="true" size={23} />
          </span>
          <p className="eyebrow">{text("北极星指标", "North-star metric")}</p>
          <strong>
            {data.independentNonRecurrenceRate === null
              ? "—"
              : `${data.independentNonRecurrenceRate}%`}
          </strong>
          <h2>
            {text(
              "学过的高频错误没有再次出现",
              "Previously learned high-frequency errors did not recur",
            )}
          </h2>
          <p>
            {text(
              "这一指标只读取后续独立写作，不使用看过提示后的最终正确率。",
              "This metric uses later independent writing, never final correctness after hints.",
            )}
          </p>
        </Card>
      </div>

      <SectionHeader
        title={text("能力状态", "Skill states")}
        description={text(
          "状态可以因新证据升级，也可以标记为不稳定并安排复习。",
          "New evidence can advance a state or mark it unstable and schedule review.",
        )}
      />
      <div
        className="skill-table"
        role="table"
        aria-label={text("能力状态表", "Skill state table")}
      >
        <div className="skill-table-head" role="row">
          <span role="columnheader">{text("能力", "Skill")}</span>
          <span role="columnheader">{text("状态", "State")}</span>
          <span role="columnheader">{text("复发率", "Recurrence")}</span>
          <span role="columnheader">{text("下一次证据", "Next evidence")}</span>
        </div>
        {data.skills.map((skill) => {
          const state = skillState(skill.state);
          return (
            <div className="skill-table-row" key={skill.id} role="row">
              <div role="cell">
                <Badge tone="neutral">{skill.category}</Badge>
                <span>
                  <strong>{text(skill.labelZh, skill.labelEn)}</strong>
                  <small>
                    {skill.evidenceCount}{" "}
                    {text("条有效证据", "valid evidence events")}
                  </small>
                </span>
              </div>
              <span role="cell">
                <Badge tone={state.tone}>{text(state.zh, state.en)}</Badge>
              </span>
              <span role="cell" className="recurrence-cell">
                <strong>
                  {skill.recurrenceRate === null
                    ? "—"
                    : `${skill.recurrenceRate}%`}
                </strong>
                <i>
                  <b
                    style={{
                      width: `${skill.recurrenceRate ?? 0}%`,
                    }}
                  />
                </i>
              </span>
              <span role="cell" className="next-review">
                {text(skill.nextReviewZh, skill.nextReviewEn)}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
