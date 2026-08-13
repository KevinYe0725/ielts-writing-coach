"use client";

import { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  ChevronDown,
  Lightbulb,
  ListChecks,
  Quote,
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
import { LearningClientError, learningClient } from "@/lib/client";
import {
  learningRouteHref,
  singleRouteParam,
  type LearningSearchParams,
} from "@/lib/client/learning-route";

export default function FocusedTeachingPage({
  searchParams,
}: {
  searchParams: Promise<LearningSearchParams>;
}) {
  const query = use(searchParams);
  const router = useRouter();
  const cycleId = singleRouteParam(query, "cycle");
  const lessonId = singleRouteParam(query, "lesson");
  const { text } = useLocale();
  const loader = useCallback(
    () =>
      cycleId && lessonId
        ? learningClient.getFocusedTeaching(cycleId, lessonId)
        : Promise.reject(
            new LearningClientError(
              "This teaching module is missing its identity. Open it from Today.",
              { status: 400, code: "LEARNING_ROUTE_IDENTITY_REQUIRED" },
            ),
          ),
    [cycleId, lessonId],
  );
  const { data, error, loading, retry } = useDemoResource(loader);
  const [openChecks, setOpenChecks] = useState<number[]>([]);
  const [replacing, setReplacing] = useState(false);
  const [replacementError, setReplacementError] = useState<string | null>(null);

  if (loading || !data) {
    if (error) {
      const needsReplacement =
        error instanceof LearningClientError &&
        error.code === "FOCUSED_TEACHING_REPLACEMENT_REQUIRED";
      return (
        <Card className="transfer-result-card">
          <h1>
            {needsReplacement
              ? text(
                  "这份旧训练需要补上专项教学",
                  "This earlier paper needs focused teaching",
                )
              : text("专项教学暂不可用", "Focused teaching unavailable")}
          </h1>
          <p>
            {needsReplacement
              ? text(
                  "系统会保留原作文和批改依据，重新生成“专项教学＋完整训练卷”，避免你在没有学会方法前直接做题。",
                  "Your essay and diagnosis will be preserved while the teaching module and complete paper are regenerated.",
                )
              : error.message}
          </p>
          {replacementError ? (
            <p className="error-text">{replacementError}</p>
          ) : null}
          <div className="completion-actions">
            {needsReplacement && lessonId ? (
              <Button
                disabled={replacing}
                onClick={() => {
                  setReplacing(true);
                  setReplacementError(null);
                  void learningClient
                    .replaceLegacyLesson(lessonId)
                    .then(() => router.push("/today"))
                    .catch((cause) => {
                      setReplacementError(
                        cause instanceof Error
                          ? cause.message
                          : text(
                              "生成失败，请稍后再试。",
                              "Generation failed.",
                            ),
                      );
                    })
                    .finally(() => setReplacing(false));
                }}
              >
                {replacing
                  ? text("正在生成新版内容…", "Generating…")
                  : text(
                      "生成专项教学和新版训练卷",
                      "Generate teaching and a new paper",
                    )}
              </Button>
            ) : (
              <Button onClick={retry} variant="secondary">
                {text("重试", "Try again")}
              </Button>
            )}
            <ActionLink href="/today">
              {text("返回今日计划", "Return to Today")}
            </ActionLink>
          </div>
        </Card>
      );
    }
    return (
      <Skeleton
        label={text("正在准备专项教学", "Preparing focused teaching")}
      />
    );
  }

  const paperHref = learningRouteHref("/lesson/paper", {
    cycleId: data.cycleId,
    lessonId: data.id,
  });
  return (
    <div className="teaching-page">
      <PageHeader
        actions={
          <Badge tone="blue">
            <BookOpenCheck aria-hidden="true" size={14} />
            {text("先学习，再限时实践", "Learn before timed practice")}
          </Badge>
        }
        eyebrow={text(
          "第2步 · 专项能力提升",
          "Step 2 · Focused skill building",
        )}
        title={text(data.targetTitleZh, data.targetTitleEn)}
        description={text(data.whyItMattersZh, data.whyItMattersEn)}
      />

      <div className="teaching-overview-grid">
        <Card className="teaching-current-pattern">
          <Badge tone="amber">
            {text("你现在的表达", "Your current pattern")}
          </Badge>
          <blockquote lang="en">
            <Quote aria-hidden="true" size={16} />
            {data.currentPattern}
          </blockquote>
        </Card>
        <Card className="teaching-decision-rule">
          <Target aria-hidden="true" size={22} />
          <div>
            <p className="eyebrow">
              {text("这次要学会的判断方法", "Decision rule")}
            </p>
            <strong>{text(data.decisionRuleZh, data.decisionRuleEn)}</strong>
          </div>
        </Card>
      </div>

      <SectionHeader
        title={text("把方法真正弄懂", "Understand the method")}
        description={text(
          "这些知识点直接来自你的原文问题，不是通用资料堆砌。",
          "These points come directly from your essay rather than a generic content dump.",
        )}
      />
      <div className="teaching-card-grid">
        {data.knowledgeCards.map((card, index) => (
          <Card className="teaching-knowledge-card" key={card.titleZh}>
            <span>{index + 1}</span>
            <h3>{card.titleZh}</h3>
            <p>{card.explanationZh}</p>
            <blockquote lang="en">{card.exampleEn}</blockquote>
          </Card>
        ))}
      </div>

      <SectionHeader
        title={text("可以直接迁移的表达库", "Reusable expression bank")}
        description={text(
          "重点不是背高级词，而是知道一个表达在什么时候、怎样使用。",
          "The goal is knowing when and how to use an expression, not memorising decorative vocabulary.",
        )}
      />
      <Card className="expression-bank">
        {data.expressionBank.map((entry) => (
          <article key={entry.expressionEn}>
            <div>
              <strong lang="en">{entry.expressionEn}</strong>
              <Badge tone="neutral">{entry.functionZh}</Badge>
            </div>
            <p>{entry.usageZh}</p>
            <blockquote lang="en">{entry.exampleEn}</blockquote>
          </article>
        ))}
      </Card>

      <SectionHeader title={text("跟着思路改一遍", "Follow the reasoning")} />
      <Card className="worked-example">
        <p className="eyebrow">{data.workedExample.taskZh}</p>
        <div className="worked-example-before">
          <span>{text("原来的写法", "Before")}</span>
          <p lang="en">{data.workedExample.weakAnswerEn}</p>
        </div>
        <ol>
          {data.workedExample.thinkingStepsZh.map((step) => (
            <li key={step}>
              <Lightbulb aria-hidden="true" size={16} />
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="worked-example-after">
          <span>{text("改进后的写法", "Improved")}</span>
          <p lang="en">{data.workedExample.improvedAnswerEn}</p>
        </div>
        <p>{data.workedExample.explanationZh}</p>
      </Card>

      <SectionHeader
        title={text("两个小检查", "Two quick checks")}
        description={text(
          "这里可以立即看答案；它只帮助你确认理解，不计入训练卷结果。",
          "Answers are available immediately. These checks support understanding and do not count toward the paper.",
        )}
      />
      <div className="teaching-quick-checks">
        {data.quickChecks.map((check, index) => {
          const open = openChecks.includes(index);
          return (
            <Card key={check.promptZh}>
              <strong>
                {index + 1}. {check.promptZh}
              </strong>
              {check.optionsZh.map((option) => (
                <p className="quick-check-option" key={option}>
                  {option}
                </p>
              ))}
              <Button
                aria-expanded={open}
                onClick={() =>
                  setOpenChecks((current) =>
                    open
                      ? current.filter((value) => value !== index)
                      : [...current, index],
                  )
                }
                variant="ghost"
              >
                {open
                  ? text("收起答案", "Hide answer")
                  : text("查看答案与原因", "Show answer and reason")}
                <ChevronDown aria-hidden="true" size={16} />
              </Button>
              {open ? (
                <div className="quick-check-answer">
                  <Check aria-hidden="true" size={17} />
                  <div>
                    <strong>{check.answerZh}</strong>
                    <p>{check.explanationZh}</p>
                  </div>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <Card className="teaching-ready-card">
        <div>
          <Sparkles aria-hidden="true" size={24} />
          <div>
            <p className="eyebrow">
              {text("进入训练卷前", "Before the paper")}
            </p>
            <h2>
              {text("确认你已经知道要怎么做", "Check that you know what to do")}
            </h2>
          </div>
        </div>
        <ul>
          {data.readyChecklistZh.map((item) => (
            <li key={item}>
              <ListChecks aria-hidden="true" size={16} />
              {item}
            </li>
          ))}
        </ul>
        <div className="teaching-ready-actions">
          <ActionLink
            href={learningRouteHref("/feedback", { cycleId: data.cycleId })}
            variant="secondary"
          >
            {text("返回详细批改", "Back to detailed feedback")}
          </ActionLink>
          <ActionLink href={paperHref} size="lg">
            {text("开始60分钟训练卷", "Start the 60-minute paper")}
            <ArrowRight aria-hidden="true" size={17} />
          </ActionLink>
        </div>
      </Card>
    </div>
  );
}
