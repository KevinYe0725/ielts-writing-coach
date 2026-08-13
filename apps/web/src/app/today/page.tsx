"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { cn } from "@/components/utils";
import { learningClient } from "@/lib/client";
import type { QuestionOption, QuestionTopic, QuestionType } from "@/lib/client";
import { learningRouteHref } from "@/lib/client/learning-route";

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

export default function TodayPage() {
  const router = useRouter();
  const { locale, text, messages } = useLocale();
  const loader = useCallback(() => learningClient.getToday(), []);
  const { data, error, loading, retry } = useDemoResource(loader);
  const [questions, setQuestions] = useState<QuestionOption[]>([]);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [customType, setCustomType] = useState<QuestionType>("opinion");
  const [customTopic, setCustomTopic] = useState<QuestionTopic>("education");
  const [customTrack, setCustomTrack] = useState<
    "academic" | "general_training"
  >("academic");

  const needsQuestion =
    data?.nextTask.id === "question-bank" ||
    data?.nextTask.href.startsWith("/today?mixed-review=1");
  useEffect(() => {
    if (!needsQuestion) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled) setQuestionLoading(true);
    }, 0);
    void learningClient
      .getQuestions()
      .then((items) => {
        if (cancelled) return;
        setQuestions(items);
        setSelectedQuestionId((current) => current || items[0]?.id || "");
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setQuestionError(
            error instanceof Error
              ? error.message
              : "Questions could not be loaded.",
          );
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (!cancelled) setQuestionLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [needsQuestion]);

  const selectedQuestion = useMemo(
    () => questions.find((question) => question.id === selectedQuestionId),
    [questions, selectedQuestionId],
  );

  const beginSelectedQuestion = async () => {
    if (!selectedQuestionId) return;
    setQuestionLoading(true);
    setQuestionError(null);
    try {
      const cycleId =
        await learningClient.startTrainingCycle(selectedQuestionId);
      router.push(learningRouteHref("/write", { cycleId }));
    } catch (error) {
      setQuestionError(
        error instanceof Error ? error.message : "The cycle could not start.",
      );
    } finally {
      setQuestionLoading(false);
    }
  };

  const saveCustomQuestion = async () => {
    if (customPrompt.trim().length < 30) return;
    setQuestionLoading(true);
    setQuestionError(null);
    try {
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
    } catch (error) {
      setQuestionError(
        error instanceof Error
          ? error.message
          : "The private question could not be saved.",
      );
    } finally {
      setQuestionLoading(false);
    }
  };

  if (loading) return <Skeleton label={messages.common.loading} />;
  if (error || !data) {
    return (
      <Card className="transfer-result-card" role="alert">
        <AlertTriangle aria-hidden="true" size={36} />
        <h1>{text("今日计划暂时无法读取", "Today’s plan is unavailable")}</h1>
        <p>
          {error?.message ??
            text(
              "服务器没有返回可用的计划。",
              "The server did not return a usable plan.",
            )}
        </p>
        <div className="completion-actions">
          <Button onClick={retry}>{text("重试", "Try again")}</Button>
          <ActionLink href="/settings" variant="secondary">
            {text("检查设置", "Check settings")}
          </ActionLink>
        </div>
      </Card>
    );
  }

  const task = data.nextTask;
  return (
    <>
      <PageHeader
        eyebrow={text("今日计划", "Today’s plan")}
        title={text(data.greetingZh, data.greetingEn)}
        description={text(
          "系统已经替你选好优先级。完成眼前这一步，其余任务会自动排程。",
          "The system has set the priorities. Complete this action and everything else is scheduled automatically.",
        )}
      />

      {data.aiState !== "connected" ? (
        <div className="status-banner status-banner-warning" role="status">
          <CloudOff aria-hidden="true" size={21} />
          <div>
            <strong>
              {text(
                "AI 尚未连接，但写作不会被阻塞",
                "AI is not connected, but writing remains available",
              )}
            </strong>
            <p>
              {text(
                "计时、自动保存与历史记录照常工作；批改可以等待 AI 恢复后再运行。",
                "Timing, autosave, and history continue to work; feedback can run when AI is restored.",
              )}
            </p>
          </div>
          <ActionLink href="/settings" size="sm" variant="secondary">
            {text("配置 AI", "Configure AI")}
          </ActionLink>
        </div>
      ) : null}

      <Card className="next-task-card">
        <div className="next-task-accent" aria-hidden="true" />
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
            <h2>{text(task.titleZh, task.titleEn)}</h2>
            <p>{text(task.descriptionZh, task.descriptionEn)}</p>
            <div className="task-meta">
              <span>
                <Clock3 aria-hidden="true" size={16} />
                {task.durationMinutes} {messages.common.minutes}
              </span>
              <span>
                <Target aria-hidden="true" size={16} />
                {text("闭卷独立输出", "Closed-book production")}
              </span>
            </div>
          </div>
          {needsQuestion ? (
            <Button
              disabled={questionLoading || !selectedQuestionId}
              onClick={() => void beginSelectedQuestion()}
              size="lg"
            >
              {questionLoading ? (
                <LoaderCircle aria-hidden="true" className="spin" size={17} />
              ) : (
                <PenLine aria-hidden="true" size={17} />
              )}
              {text("用这道题开始", "Start with this question")}
            </Button>
          ) : (
            <ActionLink href={task.href} size="lg">
              {text(task.actionZh, task.actionEn)}
            </ActionLink>
          )}
        </div>
      </Card>

      {needsQuestion ? (
        <section aria-labelledby="question-picker-title">
          <SectionHeader
            title={text("先选一道题", "Choose a question first")}
            description={text(
              "120 道原创开放题可直接使用；你粘贴的题目只保存在自己的私有题库。",
              "Use one of 120 original open questions, or save a pasted task privately.",
            )}
          />
          <Card className="setup-form-card">
            {questionLoading && questions.length === 0 ? (
              <p role="status">{messages.common.loading}</p>
            ) : (
              <div className="form-grid">
                <div className="form-field form-field-wide">
                  <label htmlFor="question-choice">
                    <LibraryBig aria-hidden="true" size={16} />{" "}
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
                    {questions.map((question) => (
                      <option key={question.id} value={question.id}>
                        {optionLabel(topics, question.topic, locale)} ·{" "}
                        {optionLabel(questionTypes, question.type, locale)} —{" "}
                        {question.prompt.slice(0, 110)}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedQuestion ? (
                  <div className="form-field form-field-wide">
                    <p className="field-hint" lang="en">
                      {selectedQuestion.prompt}
                    </p>
                    <div className="task-meta">
                      <Badge tone="neutral">
                        {optionLabel(topics, selectedQuestion.topic, locale)}
                      </Badge>
                      <Badge tone="neutral">
                        {optionLabel(
                          questionTypes,
                          selectedQuestion.type,
                          locale,
                        )}
                      </Badge>
                      {selectedQuestion.visibility === "private" ? (
                        <Badge tone="violet">
                          {text("仅自己可见", "Private")}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="form-field form-field-wide">
                  <Button
                    onClick={() => setCustomOpen((value) => !value)}
                    type="button"
                    variant="secondary"
                  >
                    <PenLine aria-hidden="true" size={16} />
                    {text("粘贴我自己的题目", "Paste my own task")}
                  </Button>
                </div>
                {customOpen ? (
                  <>
                    <div className="form-field form-field-wide">
                      <label htmlFor="custom-question">
                        {text("完整英文题目", "Full English task")}
                      </label>
                      <textarea
                        className="exercise-textarea"
                        id="custom-question"
                        lang="en"
                        minLength={30}
                        onChange={(event) =>
                          setCustomPrompt(event.target.value)
                        }
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
                            event.target.value as
                              | "academic"
                              | "general_training",
                          )
                        }
                        value={customTrack}
                      >
                        <option value="academic">Academic</option>
                        <option value="general_training">
                          General Training
                        </option>
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
                        {text("保存到私有题库", "Save privately")}
                      </Button>
                    </div>
                  </>
                ) : null}
              </div>
            )}
            {questionError ? (
              <p className="inline-probe error" role="alert">
                {questionError}
              </p>
            ) : null}
          </Card>
        </section>
      ) : null}

      <SectionHeader
        title={text("本篇训练闭环", "This learning loop")}
        description={data.cycleTitle}
      />
      <Card className="cycle-timeline-card">
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

      <div className="stat-grid today-stat-grid">
        <Card className="stat-card">
          <span className="stat-icon blue">
            <Clock3 aria-hidden="true" size={19} />
          </span>
          <div>
            <span>{text("已记录学习时长", "Recorded learning time")}</span>
            <strong>
              {data.week.focusedMinutes ?? "—"}
              {data.week.focusedMinutes === null ? null : <small> min</small>}
            </strong>
          </div>
        </Card>
        <Card className="stat-card">
          <span className="stat-icon green">
            <Gauge aria-hidden="true" size={19} />
          </span>
          <div>
            <span>{text("已提交首稿", "First drafts submitted")}</span>
            <strong>{data.week.completedActions ?? "—"}</strong>
          </div>
        </Card>
        <Card className="stat-card">
          <span className="stat-icon violet">
            <Target aria-hidden="true" size={19} />
          </span>
          <div>
            <span>
              {text("独立复测未复发", "No recurrence in independent checks")}
            </span>
            <strong>
              {data.week.repeatedErrorReduction ?? "—"}
              {data.week.repeatedErrorReduction === null ? null : (
                <small>%</small>
              )}
            </strong>
          </div>
        </Card>
      </div>

      <div className="quiet-footer">
        <span>
          <AlertTriangle aria-hidden="true" size={15} />
          {text(
            "不需要自己整理错误或安排重写日期。",
            "No need to organise errors or schedule rewrites yourself.",
          )}
        </span>
        <Button onClick={retry} size="sm" variant="ghost">
          {text("刷新计划", "Refresh plan")}
          <ArrowRight aria-hidden="true" size={15} />
        </Button>
      </div>
    </>
  );
}
