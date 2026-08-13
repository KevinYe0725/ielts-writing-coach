"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  HelpCircle,
  Lightbulb,
  LockKeyhole,
  Pause,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import {
  ActionLink,
  Badge,
  Button,
  Card,
  LoadingButtonContent,
  Skeleton,
} from "@/components/ui";
import { useDemoResource } from "@/components/use-demo-resource";
import { useDialogFocus } from "@/components/use-dialog-focus";
import { cn } from "@/components/utils";
import {
  LearningClientError,
  learningClient,
  type LessonEvaluationResult,
  type LessonCompletionResult,
  type LessonItem,
  type LessonRuntimeData,
  type LessonStage,
} from "@/lib/client";
import {
  learningRouteHref,
  singleRouteParam,
  type LearningSearchParams,
} from "@/lib/client/learning-route";
import {
  cacheLessonItem,
  readCachedLessonItem,
  removeCachedLessonItem,
} from "@/lib/client/lesson-cache";

const stages: Array<{ id: LessonStage; zh: string; en: string }> = [
  { id: "diagnose", zh: "诊断", en: "Diagnose" },
  { id: "understand", zh: "理解", en: "Understand" },
  { id: "produce", zh: "独立输出", en: "Produce" },
  { id: "apply", zh: "应用", en: "Apply" },
  { id: "finish", zh: "收尾", en: "Finish" },
];

function isChoice(item: LessonItem): boolean {
  return (
    item.responseMode === "choice" ||
    item.kind === "choice" ||
    item.kind === "explain"
  );
}

function mappingSelections(answer: string): Record<string, string> {
  return Object.fromEntries(
    answer
      .split("|")
      .map((entry) => entry.split("=>"))
      .filter(
        (entry): entry is [string, string] =>
          entry.length === 2 && Boolean(entry[0]) && Boolean(entry[1]),
      ),
  );
}

export default function LessonPage({
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
        ? learningClient.getLesson(cycleId, lessonId)
        : Promise.reject(
            new LearningClientError(
              "This lesson is missing its cycle or lesson identity. Open it from Today.",
              { status: 400, code: "LEARNING_ROUTE_IDENTITY_REQUIRED" },
            ),
          ),
    [cycleId, lessonId],
  );
  const {
    data,
    error: loadError,
    loading,
    retry: reloadLesson,
  } = useDemoResource(loader);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [firstAnswer, setFirstAnswer] = useState("");
  const [responseId, setResponseId] = useState<string>();
  const [attempts, setAttempts] = useState(0);
  const [result, setResult] = useState<LessonEvaluationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [hintLevel, setHintLevel] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completionResult, setCompletionResult] =
    useState<LessonCompletionResult | null>(null);
  const [runtimeOverride, setRuntimeOverride] =
    useState<LessonRuntimeData | null>(null);
  const [refresherAnswer, setRefresherAnswer] = useState("");
  const [selfCheckConfirmations, setSelfCheckConfirmations] = useState<
    string[]
  >([]);
  const [spotlightTokens, setSpotlightTokens] = useState<number[]>([]);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const itemStartedAt = useRef<number | null>(null);
  const hydratedItemId = useRef<string | null>(null);
  const runtimeRevision = useRef<number | null>(null);
  const pauseButtonRef = useRef<HTMLButtonElement | null>(null);
  const actualIndex = data ? Math.max(index, data.initialItemIndex) : 0;
  const item = data?.items[actualIndex];
  const runtime =
    runtimeOverride && data && runtimeOverride.revision >= data.runtime.revision
      ? runtimeOverride
      : (data?.runtime ?? null);
  const movedToFollowUp =
    attempts >= 2 &&
    (data?.remediationActive === true || result?.remediationActive === true);
  const accepted =
    result?.outcome === "PASS" ||
    result?.outcome === "NEUTRAL" ||
    result?.outcome === "DEMO_ONLY" ||
    result?.outcome === "UNASSESSED" ||
    result?.outcome === "BATCH_PENDING" ||
    result?.outcome === "BATCH_COMPLETE" ||
    movedToFollowUp;
  const currentStageIndex = item
    ? stages.findIndex((stage) => stage.id === item.stage)
    : 0;
  const remainingMinutes = useMemo(
    () =>
      data?.items
        .slice(actualIndex)
        .reduce((total, current) => total + current.estimatedMinutes, 0) ?? 0,
    [actualIndex, data],
  );
  const effectiveElapsedSeconds = runtime
    ? runtime.effectiveElapsedSeconds +
      (runtime.status === "ACTIVE"
        ? Math.max(0, Math.floor((clockNow - runtime.observedAtMs) / 1_000))
        : 0)
    : 0;
  const timeboxExpired =
    runtime?.timeboxExpired === true ||
    (runtime !== null &&
      effectiveElapsedSeconds >= runtime.segmentLimitSeconds);
  const selfCheckReady =
    item?.form !== "TARGETED_SELF_CHECK" ||
    ((item.selfCheckPrompts ?? []).every((check) =>
      selfCheckConfirmations.includes(check),
    ) &&
      Boolean(firstAnswer.trim()) &&
      answer.trim() !== firstAnswer.trim());
  const answerWordCount = answer.trim().split(/\s+/).filter(Boolean).length;
  const wordCountReady =
    (item?.minimumWords === undefined ||
      answerWordCount >= item.minimumWords) &&
    (item?.maximumWords === undefined || answerWordCount <= item.maximumWords);
  const timeboxDialogRef = useDialogFocus<HTMLDivElement>(timeboxExpired);
  const pauseDialogRef = useDialogFocus<HTMLDivElement>(
    pauseOpen,
    () => setPauseOpen(false),
    pauseButtonRef,
  );

  useEffect(() => {
    const interval = window.setInterval(() => setClockNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!data || !item || hydratedItemId.current === item.id) return;
    hydratedItemId.current = item.id;
    const server =
      data.initialResponse?.itemId === item.id ? data.initialResponse : null;
    const serverDraft =
      data.runtime.serverDraft?.itemId === item.id
        ? data.runtime.serverDraft
        : null;
    const revisionBaseline = item.revisionBaseline ?? "";
    setAnswer(
      serverDraft?.answer ||
        server?.finalAnswer ||
        server?.firstAnswer ||
        revisionBaseline,
    );
    setFirstAnswer(
      serverDraft?.firstAnswer || server?.firstAnswer || revisionBaseline,
    );
    setResponseId(serverDraft?.responseId ?? server?.responseId);
    setAttempts(Math.max(serverDraft?.attempts ?? 0, server?.attempts ?? 0));
    setHintLevel(serverDraft?.hintLevel ?? server?.hintsUsed ?? 0);
    setRevealed(serverDraft?.revealed ?? server?.referenceAnswerSeen ?? false);
    setResult(server?.evaluation ?? null);
    setErrorMessage("");
    setSelfCheckConfirmations([]);
    setSpotlightTokens([]);
    itemStartedAt.current = Date.now();
    void readCachedLessonItem(data.id, item.id).then((cached) => {
      if (!cached || hydratedItemId.current !== item.id) return;
      const persisted =
        serverDraft &&
        Date.parse(serverDraft.updatedAt) > Date.parse(cached.updatedAt)
          ? serverDraft
          : cached;
      setAnswer(persisted.answer);
      setFirstAnswer(
        persisted.firstAnswer ||
          serverDraft?.firstAnswer ||
          server?.firstAnswer ||
          "",
      );
      setResponseId(
        persisted.responseId ?? serverDraft?.responseId ?? server?.responseId,
      );
      setAttempts(
        Math.max(
          persisted.attempts,
          serverDraft?.attempts ?? 0,
          server?.attempts ?? 0,
        ),
      );
      setHintLevel(persisted.hintLevel);
      setRevealed(persisted.revealed);
      setResult(server?.evaluation ?? null);
    });
  }, [data, item]);

  useEffect(() => {
    if (!data || !item || hydratedItemId.current !== item.id) return;
    const timeout = window.setTimeout(() => {
      void cacheLessonItem({
        lessonId: data.id,
        itemId: item.id,
        answer,
        firstAnswer,
        ...(responseId ? { responseId } : {}),
        attempts,
        hintLevel,
        revealed,
        updatedAt: new Date().toISOString(),
      });
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [
    answer,
    attempts,
    data,
    firstAnswer,
    hintLevel,
    item,
    responseId,
    revealed,
  ]);

  useEffect(() => {
    if (!data || !item || hydratedItemId.current !== item.id) return;
    const draft = {
      lessonId: data.id,
      itemId: item.id,
      answer,
      firstAnswer,
      ...(responseId ? { responseId } : {}),
      attempts,
      hintLevel,
      revealed,
      updatedAt: new Date().toISOString(),
    };
    const timeout = window.setTimeout(() => {
      void learningClient
        .updateLessonRuntime(data.id, {
          revision: Math.max(
            runtimeRevision.current ?? 0,
            data.runtime.revision,
          ),
          action: "SAVE_DRAFT",
          draft,
        })
        .then((nextRuntime) => {
          runtimeRevision.current = nextRuntime.revision;
          setRuntimeOverride(nextRuntime);
        })
        .catch(() => {
          // IndexedDB keeps this device's version. A visible conflict is shown
          // on the next explicit save instead of silently overwriting another device.
        });
    }, 1_200);
    return () => window.clearTimeout(timeout);
  }, [
    answer,
    attempts,
    data,
    firstAnswer,
    hintLevel,
    item,
    responseId,
    revealed,
  ]);

  useEffect(() => {
    if (!data || !item || !runtime || !timeboxExpired || runtime.timeboxExpired)
      return;
    void learningClient
      .updateLessonRuntime(data.id, {
        revision: Math.max(runtimeRevision.current ?? 0, runtime.revision),
        action: "SAVE_DRAFT",
        draft: {
          lessonId: data.id,
          itemId: item.id,
          answer,
          firstAnswer,
          ...(responseId ? { responseId } : {}),
          attempts,
          hintLevel,
          revealed,
          updatedAt: new Date().toISOString(),
        },
      })
      .then((nextRuntime) => {
        runtimeRevision.current = nextRuntime.revision;
        setRuntimeOverride(nextRuntime);
      })
      .catch((error) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : text("计时状态保存失败。", "Could not save the timebox state."),
        );
      });
  }, [
    answer,
    attempts,
    data,
    firstAnswer,
    hintLevel,
    item,
    responseId,
    revealed,
    runtime,
    text,
    timeboxExpired,
  ]);

  const resetItem = () => {
    setAnswer("");
    setFirstAnswer("");
    setResponseId(undefined);
    setAttempts(0);
    setResult(null);
    setHintLevel(0);
    setRevealed(false);
    setSelfCheckConfirmations([]);
    setSpotlightTokens([]);
    itemStartedAt.current = Date.now();
  };

  const submit = async () => {
    if (
      !data ||
      !item ||
      !answer.trim() ||
      !selfCheckReady ||
      !wordCountReady ||
      saving ||
      timeboxExpired ||
      runtime?.refresher === "REQUIRED"
    )
      return;
    itemStartedAt.current ??= Date.now();
    const baseline = firstAnswer || answer;
    if (!firstAnswer) setFirstAnswer(answer);
    setSaving(true);
    setErrorMessage("");
    try {
      const evaluation = await learningClient.saveLessonProgress(
        data.id,
        actualIndex,
        {
          itemId: item.id,
          ...(responseId ? { responseId } : {}),
          firstAnswer: baseline,
          ...(hintLevel > 0 || attempts > 0 ? { hintedAnswer: answer } : {}),
          finalAnswer: answer,
          hintsUsed: hintLevel,
          hintLevel: revealed
            ? "ANSWER_SHOWN"
            : hintLevel >= 2
              ? "PARTIAL_FRAME"
              : hintLevel === 1
                ? "KEYWORD"
                : "NONE",
          referenceAnswerSeen: revealed,
          elapsedSeconds: Math.max(
            0,
            Math.round(
              (Date.now() - (itemStartedAt.current ?? Date.now())) / 1000,
            ),
          ),
          selfCheckConfirmations,
        },
      );
      if (!evaluation) throw new Error("Evaluation result was not returned.");
      setResponseId(evaluation.responseId);
      setAttempts((value) => value + 1);
      setResult(evaluation);
      if (evaluation.outcome === "RETRY" && attempts >= 1) setHintLevel(2);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text("评价暂时失败，请重试。", "Evaluation failed. Please retry."),
      );
    } finally {
      setSaving(false);
    }
  };

  const retryFailedEvaluation = async () => {
    if (!data || !item || saving) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const evaluation = await learningClient.retryLessonItem(data.id, item.id);
      setResponseId(evaluation.responseId);
      setResult(evaluation);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text(
              "这个单题仍未完成评价，请稍后再试。",
              "This item is still not evaluated. Try again later.",
            ),
      );
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    if (!data || !item || !accepted) return;
    const nextIndex = actualIndex + 1;
    setSaving(true);
    try {
      const completeLesson = nextIndex >= data.items.length;
      await removeCachedLessonItem(data.id, item.id);
      if (result?.remediationActive || result?.outcome === "BATCH_COMPLETE") {
        setIndex(0);
        hydratedItemId.current = null;
        runtimeRevision.current = null;
        setRuntimeOverride(null);
        resetItem();
        reloadLesson();
        return;
      }
      if (data.items[nextIndex]?.form === "TARGETED_SELF_CHECK") {
        // The revision baseline is projected from the server's immutable
        // integrated-response record. Refresh at this boundary because the
        // lesson payload loaded at entry predates that response.
        setIndex(0);
        hydratedItemId.current = null;
        runtimeRevision.current = null;
        setRuntimeOverride(null);
        resetItem();
        reloadLesson();
        return;
      }
      if (completeLesson) {
        const completion = await learningClient.completeLesson(data.id);
        if (completion.segmentScheduled) {
          router.push("/today");
          return;
        }
        setCompletionResult(completion);
        setCompleted(true);
        return;
      }
      setIndex(nextIndex);
      hydratedItemId.current = null;
      resetItem();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text(
              "服务器尚未确认课程门槛，请检查反馈后重试。",
              "The server has not confirmed the lesson gates. Review the feedback and retry.",
            ),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data || !item) {
    if (loadError) {
      return (
        <Card className="transfer-result-card">
          <X aria-hidden="true" size={36} />
          <h1>{text("专项课暂不可用", "Lesson unavailable")}</h1>
          <p>{loadError.message}</p>
          <div className="completion-actions">
            <Button onClick={reloadLesson} variant="secondary">
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

  if (
    runtime?.split === "ACTIVE" &&
    runtime.refresher === "REQUIRED" &&
    !completed
  ) {
    return (
      <div className="lesson-completion">
        <Badge tone="amber">
          {text(
            `拆分课程 · ${runtime.refresherPlan?.durationMinutes ?? 10} 分钟短回炉`,
            `Split lesson · ${runtime.refresherPlan?.durationMinutes ?? 10}-minute refresher`,
          )}
        </Badge>
        <h1>
          {runtime.refresherPlan?.kind === "TIMED_PARAGRAPH"
            ? text(
                "先完成一次限时段落回炉",
                "Start with a timed paragraph refresher",
              )
            : runtime.refresherPlan?.kind === "SCAFFOLD_FADE"
              ? text("先用递减支架重新生成", "Regenerate with fading scaffolds")
              : text(
                  "先用对比讲解找回规则",
                  "Rebuild the rule through contrast",
                )}
        </h1>
        <p>
          {runtime.refresherPlan?.kind === "TIMED_PARAGRAPH"
            ? text(
                "写一个能自然应用目标的短段落，再继续剩余课程。这次回炉属于教学暴露，不计保持证据。",
                "Write a short paragraph that naturally applies the target before resuming. This refresher is instructional exposure, not retention evidence.",
              )
            : runtime.refresherPlan?.kind === "SCAFFOLD_FADE"
              ? text(
                  "先写出完整句框，再逐步去掉提示，最后用关键词闭卷生成。这一步不计能力证据。",
                  "Move from a full frame to partial cues and then keyword-only production. This step is not mastery evidence.",
                )
              : text(
                  "写下容易混淆的两个表达及区别，再用一句新例句确认规则。这一步不计能力证据。",
                  "Contrast the two easily confused forms and add one new example. This step is not mastery evidence.",
                )}
        </p>
        <Card className="exercise-card">
          <label htmlFor="lesson-refresher">
            {text("我的回忆", "My recall")}
          </label>
          <textarea
            className="exercise-textarea"
            id="lesson-refresher"
            onChange={(event) => setRefresherAnswer(event.target.value)}
            value={refresherAnswer}
          />
          <Button
            disabled={!refresherAnswer.trim() || saving}
            onClick={() => {
              setSaving(true);
              void learningClient
                .updateLessonRuntime(data.id, {
                  revision: Math.max(
                    runtimeRevision.current ?? 0,
                    runtime.revision,
                  ),
                  action: "COMPLETE_REFRESHER",
                  refresherAnswer,
                })
                .then((nextRuntime) => {
                  runtimeRevision.current = nextRuntime.revision;
                  setRuntimeOverride(nextRuntime);
                })
                .catch((error) =>
                  setErrorMessage(
                    error instanceof Error
                      ? error.message
                      : text(
                          "短回炉保存失败。",
                          "Could not save the refresher.",
                        ),
                  ),
                )
                .finally(() => setSaving(false));
            }}
          >
            {text("保存并继续剩余课程", "Save and resume remaining work")}
          </Button>
        </Card>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="lesson-completion">
        <span className="completion-icon" aria-hidden="true">
          <CheckCircle2 size={38} />
        </span>
        <Badge tone="green">
          {text("本次专项训练已完成", "Focused lesson complete")}
        </Badge>
        <h1>{text("你已完成核心路径", "You completed the core path")}</h1>
        <p>
          {completionResult?.masteryEvidenceCreated
            ? text(
                "本课只证明你现在可以应用；系统会在延迟重写和陌生题中继续验证。",
                "This lesson only shows that you can apply the skill now. Delayed rewriting and a new topic will test retention and transfer.",
              )
            : text(
                "练习流程已经结束，但当前没有合格的真实 AI 证据，因此不会把能力标记为 applied，也不会安排证据重写或迁移。请连接真实 AI 后从新一轮首写开始。",
                "The practice flow is complete, but there is no qualifying real-AI evidence, so the skill is not marked applied and no evidence rewrite or transfer is scheduled. Connect a real evaluator and begin a new cycle with a first attempt.",
              )}
        </p>
        <div className="completion-result-grid">
          <Card>
            <span className="result-dot green" />
            <strong>
              {completionResult?.masteryEvidenceCreated
                ? text("临时通过", "Provisionally applied")
                : text("仅完成练习", "Practice completed")}
            </strong>
            <p>
              {text("自然表达学业压力", "Express academic pressure naturally")}
            </p>
          </Card>
          <Card>
            <span className="result-dot amber" />
            <strong>{text("发展中", "Developing")}</strong>
            <p>
              {text(
                "段落中稳定补足机制",
                "Sustain mechanisms within paragraphs",
              )}
            </p>
          </Card>
          <Card>
            <span className="result-dot blue" />
            <strong>
              {completionResult?.rewriteScheduled
                ? text("已自动安排", "Scheduled")
                : text("尚未安排", "Not scheduled")}
            </strong>
            <p>
              {completionResult?.rewriteScheduled
                ? text("陌生语境迁移", "New-context transfer")
                : text(
                    "重写与迁移需真实证据",
                    "Rewrite and transfer require real evidence",
                  )}
            </p>
          </Card>
        </div>
        {completionResult?.rewriteScheduled ? (
          <Card className="next-schedule-card">
            <CalendarClock aria-hidden="true" size={22} />
            <div>
              <strong>{text("闭卷 Version 2", "Closed-book Version 2")}</strong>
              <span>{text(data.rewriteUnlockZh, data.rewriteUnlockEn)}</span>
            </div>
            <Badge tone="violet">24–48h</Badge>
          </Card>
        ) : (
          <Card className="next-schedule-card">
            <CalendarClock aria-hidden="true" size={22} />
            <div>
              <strong>
                {text("未安排证据重写", "No evidence rewrite scheduled")}
              </strong>
              <span>
                {text(
                  "当前只有练习完成记录；连接真实 AI 并满足 applied 门槛后，系统才会安排 24–48 小时闭卷重写。",
                  "This is a practice-completion record only. A 24–48 hour closed-book rewrite is scheduled only after a real evaluator confirms the applied gate.",
                )}
              </span>
            </div>
            <Badge tone="amber">{text("不计证据", "No evidence")}</Badge>
          </Card>
        )}
        <div className="completion-actions">
          <ActionLink href="/today" size="lg">
            {text("完成并返回今日计划", "Finish and return to today")}
          </ActionLink>
          <ActionLink href="/growth" size="lg" variant="secondary">
            {text("查看能力档案", "View skill record")}
          </ActionLink>
        </div>
      </div>
    );
  }

  return (
    <div className="lesson-page">
      <header className="lesson-header">
        <div>
          <p className="eyebrow">
            {text("专项能力转化课", "Focused skill lesson")}
          </p>
          <h1>{text(data.titleZh, data.titleEn)}</h1>
          <p>{text(data.coreTargetZh, data.coreTargetEn)}</p>
        </div>
        <div className="lesson-header-actions">
          <span className="remaining-chip">
            <Clock3 aria-hidden="true" size={16} />
            <strong>{remainingMinutes}</strong> {messages.common.minutes}{" "}
            {text("左右", "left")}
          </span>
          {runtime?.autoSplit ? (
            <span className="remaining-chip">
              {text("拆分模块", "Split module")}{" "}
              {runtime.autoSplit.currentModule}/{runtime.autoSplit.moduleCount}{" "}
              · ≤{runtime.autoSplit.maxMinutes}m
            </span>
          ) : null}
          <span className="remaining-chip">
            <Clock3 aria-hidden="true" size={16} />
            {text("经过", "Elapsed")} {Math.floor(effectiveElapsedSeconds / 60)}
            m · {text("有效输出", "productive")}{" "}
            {Math.floor((runtime?.productiveSeconds ?? 0) / 60)}m
          </span>
          <Button
            disabled={saving}
            onClick={() => {
              if (data && item) {
                const draft = {
                  lessonId: data.id,
                  itemId: item.id,
                  answer,
                  firstAnswer,
                  ...(responseId ? { responseId } : {}),
                  attempts,
                  hintLevel,
                  revealed,
                  updatedAt: new Date().toISOString(),
                };
                void cacheLessonItem(draft);
                setSaving(true);
                void learningClient
                  .updateLessonRuntime(data.id, {
                    revision: Math.max(
                      runtimeRevision.current ?? 0,
                      runtime?.revision ?? data.runtime.revision,
                    ),
                    action: "PAUSE",
                    draft,
                  })
                  .then((nextRuntime) => {
                    runtimeRevision.current = nextRuntime.revision;
                    setRuntimeOverride(nextRuntime);
                    setPauseOpen(true);
                  })
                  .catch((error) =>
                    setErrorMessage(
                      error instanceof Error
                        ? error.message
                        : text(
                            "暂停状态保存失败。",
                            "Could not save the pause state.",
                          ),
                    ),
                  )
                  .finally(() => setSaving(false));
              }
            }}
            ref={pauseButtonRef}
            variant="secondary"
          >
            <Pause aria-hidden="true" size={16} />
            {text("暂停", "Pause")}
          </Button>
        </div>
      </header>

      <nav
        aria-label={text("课程阶段", "Lesson stages")}
        className="lesson-stage-nav"
      >
        <ol>
          {stages.map((stage, stageIndex) => (
            <li
              aria-current={
                stageIndex === currentStageIndex ? "step" : undefined
              }
              className={cn(
                stageIndex < currentStageIndex && "done",
                stageIndex === currentStageIndex && "current",
              )}
              key={stage.id}
            >
              <span aria-hidden="true">
                {stageIndex < currentStageIndex ? (
                  <Check size={13} />
                ) : (
                  stageIndex + 1
                )}
              </span>
              <strong>{text(stage.zh, stage.en)}</strong>
            </li>
          ))}
        </ol>
        <div className="lesson-progress-track">
          <span
            style={{
              width: `${((actualIndex + 1) / data.items.length) * 100}%`,
            }}
          />
        </div>
      </nav>

      <div className="lesson-workspace">
        <Card className="exercise-card">
          <div className="exercise-topline">
            <Badge
              tone={
                item.stage === "apply"
                  ? "violet"
                  : item.stage === "finish"
                    ? "green"
                    : "blue"
              }
            >
              {text(item.eyebrowZh, item.eyebrowEn)}
            </Badge>
            <span>
              <Clock3 aria-hidden="true" size={14} />
              {item.estimatedMinutes} {messages.common.minutes}
            </span>
          </div>
          {item.source ? (
            <blockquote lang="en">{item.source}</blockquote>
          ) : null}
          <div className="exercise-prompt">
            <h2>{text(item.promptZh, item.promptEn)}</h2>
            <p>{text(item.helperZh, item.helperEn)}</p>
          </div>

          {item.form === "SPOTLIGHT" && item.source ? (
            <fieldset
              className="choice-list spotlight-picker"
              disabled={timeboxExpired}
            >
              <legend>
                {text("点击选出问题片段", "Select the problematic span")}
              </legend>
              <div
                aria-label={text("可选择的原句", "Selectable source sentence")}
              >
                {item.source.split(/\s+/).map((token, tokenIndex) => {
                  const selected = spotlightTokens.includes(tokenIndex);
                  return (
                    <button
                      aria-pressed={selected}
                      className={cn("spotlight-token", selected && "selected")}
                      key={`${token}-${tokenIndex}`}
                      onClick={() => {
                        const next = selected
                          ? spotlightTokens.filter(
                              (index) => index !== tokenIndex,
                            )
                          : [...spotlightTokens, tokenIndex].sort(
                              (a, b) => a - b,
                            );
                        setSpotlightTokens(next);
                        setAnswer(
                          next
                            .map(
                              (index) => item.source?.split(/\s+/)[index] ?? "",
                            )
                            .join(" "),
                        );
                        setResult(null);
                      }}
                      type="button"
                    >
                      {token}
                    </button>
                  );
                })}
              </div>
              <small>
                {text(`已选择：${answer || "—"}`, `Selected: ${answer || "—"}`)}
              </small>
            </fieldset>
          ) : item.form === "EXPRESSION_MAP" &&
            (item.mappingPairs?.length ?? 0) > 0 ? (
            <fieldset
              className="choice-list expression-map"
              disabled={timeboxExpired}
            >
              <legend>
                {text(
                  "为每个意思匹配完整英语词块",
                  "Match each meaning to a complete English chunk",
                )}
              </legend>
              {item.mappingPairs?.map((pair) => {
                const selected = mappingSelections(answer)[pair.left] ?? "";
                return (
                  <label key={pair.left}>
                    <span>{pair.left}</span>
                    <select
                      aria-label={`${pair.left} mapping`}
                      onChange={(event) => {
                        const selections = {
                          ...mappingSelections(answer),
                          [pair.left]: event.target.value,
                        };
                        setAnswer(
                          item.mappingPairs
                            ?.filter((candidate) => selections[candidate.left])
                            .map(
                              (candidate) =>
                                `${candidate.left}=>${selections[candidate.left]}`,
                            )
                            .join("|") ?? "",
                        );
                        setResult(null);
                      }}
                      value={selected}
                    >
                      <option value="">{text("请选择", "Choose")}</option>
                      {[...(item.mappingPairs ?? [])]
                        .map((candidate) => candidate.right)
                        .sort((left, right) => left.localeCompare(right))
                        .map((right) => (
                          <option key={right} value={right}>
                            {right}
                          </option>
                        ))}
                    </select>
                  </label>
                );
              })}
            </fieldset>
          ) : isChoice(item) ? (
            <fieldset className="choice-list" disabled={timeboxExpired}>
              <legend className="sr-only">
                {text(item.promptZh, item.promptEn)}
              </legend>
              {item.choices?.map((choice, choiceIndex) => (
                <label
                  className={cn(answer === choice.id && "selected")}
                  key={choice.id}
                >
                  <input
                    checked={answer === choice.id}
                    name={`answer-${item.id}`}
                    onChange={() => {
                      setAnswer(choice.id);
                      setResult(null);
                    }}
                    type="radio"
                    value={choice.id}
                  />
                  <span className="choice-letter" aria-hidden="true">
                    {String.fromCharCode(65 + choiceIndex)}
                  </span>
                  <span
                    lang={choice.labelZh === choice.labelEn ? "en" : undefined}
                  >
                    {text(choice.labelZh, choice.labelEn)}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="exercise-input-wrap">
              {item.slotLabels?.length ? (
                <div
                  className="slot-guide"
                  aria-label={text("语义槽位", "Semantic slots")}
                >
                  {item.slotLabels.map((slot, slotIndex) => (
                    <span key={`${slot}-${slotIndex}`}>
                      {slotIndex + 1}. {slot}
                    </span>
                  ))}
                  <small>
                    {text(
                      "按语义槽位组织完整答案；如果题目允许多个顺序，服务端会按全部明确答案判分。",
                      "Build a complete answer from the semantic slots. Every explicitly valid order is judged deterministically.",
                    )}
                  </small>
                </div>
              ) : null}
              {item.form === "TARGETED_SELF_CHECK" ? (
                <fieldset className="self-check-list">
                  <legend>
                    {text(
                      "提交第二版前逐项确认",
                      "Confirm before the second revision",
                    )}
                  </legend>
                  {item.selfCheckPrompts?.map((check) => (
                    <label key={check}>
                      <input
                        checked={selfCheckConfirmations.includes(check)}
                        onChange={(event) =>
                          setSelfCheckConfirmations((current) =>
                            event.target.checked
                              ? [...current, check]
                              : current.filter((entry) => entry !== check),
                          )
                        }
                        type="checkbox"
                      />
                      <span>{check}</span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              {item.criteria?.length ? (
                <ul className="lesson-criteria">
                  {item.criteria.map((criterion) => (
                    <li key={criterion.id}>{criterion.description}</li>
                  ))}
                </ul>
              ) : null}
              <label className="sr-only" htmlFor="lesson-answer">
                {text("你的英文答案", "Your English answer")}
              </label>
              <textarea
                autoCorrect="off"
                className="exercise-textarea"
                disabled={timeboxExpired}
                id="lesson-answer"
                lang="en"
                onChange={(event) => {
                  setAnswer(event.target.value);
                  setResult(null);
                }}
                placeholder={
                  item.responseMode === "paragraph" ||
                  item.responseMode === "revision"
                    ? "Write 80–120 words…"
                    : "Write one complete response…"
                }
                spellCheck={false}
                value={answer}
              />
              <span>
                {answerWordCount} {text("词", "words")}
                {item.minimumWords !== undefined &&
                item.maximumWords !== undefined
                  ? ` · ${item.minimumWords}–${item.maximumWords}`
                  : ""}
              </span>
            </div>
          )}

          {hintLevel > 0 && item.hintZh ? (
            <div className="hint-panel" role="status">
              <Lightbulb aria-hidden="true" size={17} />
              <div>
                <strong>
                  {text(`提示 ${hintLevel}/2`, `Hint ${hintLevel}/2`)}
                </strong>
                <p>{text(item.hintZh, item.hintEn ?? item.hintZh)}</p>
              </div>
            </div>
          ) : null}

          {revealed && item.modelAnswer ? (
            <div className="model-answer" role="status">
              <Eye aria-hidden="true" size={17} />
              <div>
                <strong>{text("参考表达", "Reference expression")}</strong>
                <p lang="en">{item.modelAnswer}</p>
                <small>
                  {text(
                    "看过完整示范后的正确不会计为无提示独立成功。",
                    "A correct answer after seeing the full model is not counted as independent success.",
                  )}
                </small>
              </div>
            </div>
          ) : null}

          {result ? (
            <div
              aria-live="polite"
              className={cn(
                "answer-feedback",
                accepted && !movedToFollowUp
                  ? "feedback-correct"
                  : "feedback-retry",
              )}
            >
              {accepted && !movedToFollowUp ? (
                <CheckCircle2 aria-hidden="true" size={19} />
              ) : (
                <RotateCcw aria-hidden="true" size={19} />
              )}
              <div>
                <strong>
                  {result.outcome === "BATCH_PENDING"
                    ? text(
                        "答案已封存，组末统一反馈",
                        "Answer sealed — feedback at the end of the group",
                      )
                    : result.outcome === "BATCH_COMPLETE"
                      ? text(
                          "本组统一反馈已发布",
                          "Batch feedback is now available",
                        )
                      : result.outcome === "UNASSESSED"
                        ? text(
                            "已保存，但未进行语言评价",
                            "Saved without language evaluation",
                          )
                        : result.outcome === "NEUTRAL"
                          ? text(
                              "已记录，不判对错",
                              "Recorded without a pass/fail judgment",
                            )
                          : result.outcome === "DEMO_ONLY"
                            ? text(
                                "仅演示，不计能力证据",
                                "Demo only — no mastery evidence",
                              )
                            : movedToFollowUp
                              ? text(
                                  "本题已记录为待加强，继续针对性练习",
                                  "Recorded for follow-up — continue with targeted practice",
                                )
                              : accepted
                                ? text(
                                    "准确，而且意思保持完整",
                                    "Accurate, with the intended meaning preserved",
                                  )
                                : text(
                                    "还差一步，先自己再改一次",
                                    "Almost there — revise it once yourself",
                                  )}
                </strong>
                <p>{text(result.feedbackZh, result.feedbackEn)}</p>
                {result.criterionResults.length > 0 ? (
                  <ul>
                    {result.criterionResults.map((criterion) => (
                      <li key={criterion.id}>
                        <strong>{criterion.id}</strong>:{" "}
                        {Math.round(criterion.score * 100)}% ·{" "}
                        {criterion.passed
                          ? text("达到", "met")
                          : text("未达到", "not met")}
                        {criterion.evidence.length > 0
                          ? ` — ${criterion.evidence.join("; ")}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {result.acceptedAnswers.length > 0 ? (
                  <details>
                    <summary>
                      {text("明确可接受答案", "Explicit accepted answers")}
                    </summary>
                    <ul>
                      {result.acceptedAnswers.map((acceptedAnswer) => (
                        <li key={acceptedAnswer} lang="en">
                          {acceptedAnswer}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {result.confusionId ? (
                  <small>
                    {text("本次易混点：", "Recorded confusion: ")}
                    {result.confusionId}
                  </small>
                ) : null}
                {result.batchFeedback.length > 0 ? (
                  <ul>
                    {result.batchFeedback.map((feedback, feedbackIndex) => (
                      <li key={`${feedback.itemId}-${feedbackIndex}`}>
                        <strong>
                          {text("答案", "Answer")} {feedbackIndex + 1}:{" "}
                          {feedback.passed
                            ? text("达到目标", "meets target")
                            : text("需要补救", "needs repair")}
                        </strong>{" "}
                        {text(feedback.feedbackZh, feedback.feedbackEn)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {result.suggestionZh && (!accepted || movedToFollowUp) ? (
                  <small>{result.suggestionZh}</small>
                ) : null}
              </div>
            </div>
          ) : null}

          {errorMessage || (attempts >= 2 && !result) ? (
            <div className="answer-feedback feedback-retry" role="alert">
              <X aria-hidden="true" size={19} />
              <div>
                <strong>{text("评价未完成", "Evaluation incomplete")}</strong>
                <p>
                  {errorMessage ||
                    text(
                      "答案已经保存，但本次评价尚未完成。请只重试评价，不要重复提交答案。",
                      "Your answer is saved, but its evaluation did not finish. Retry only the evaluation instead of submitting another answer.",
                    )}
                </p>
                <Button
                  disabled={saving}
                  onClick={() => void retryFailedEvaluation()}
                  size="sm"
                  variant="secondary"
                >
                  <RotateCcw aria-hidden="true" size={15} />
                  {text("只重试本题评价", "Retry this item only")}
                </Button>
              </div>
            </div>
          ) : null}

          <footer className="exercise-footer">
            <div className="hint-actions">
              {!accepted && item.hintZh ? (
                <Button
                  disabled={hintLevel >= 2 || timeboxExpired}
                  onClick={() => {
                    if (!firstAnswer && answer.trim()) setFirstAnswer(answer);
                    setHintLevel((value) => Math.min(2, value + 1));
                  }}
                  variant="ghost"
                >
                  <HelpCircle aria-hidden="true" size={16} />
                  {text("给我一点提示", "Give me a hint")}
                </Button>
              ) : null}
              {attempts >= 2 && item.modelAnswer && !revealed ? (
                <Button onClick={() => setRevealed(true)} variant="ghost">
                  <Eye aria-hidden="true" size={16} />
                  {text("查看参考表达", "View reference")}
                </Button>
              ) : null}
            </div>
            {accepted ? (
              <Button
                disabled={saving || timeboxExpired}
                onClick={() => void next()}
              >
                {saving ? (
                  <LoadingButtonContent label={text("正在保存…", "Saving…")} />
                ) : (
                  <>
                    {actualIndex === data.items.length - 1
                      ? text("完成本课", "Complete lesson")
                      : movedToFollowUp
                        ? text(
                            "进入针对性练习",
                            "Continue to targeted practice",
                          )
                        : text("继续", "Continue")}
                    <ArrowRight aria-hidden="true" size={17} />
                  </>
                )}
              </Button>
            ) : attempts >= 2 && !result ? null : (
              <Button
                disabled={
                  !answer.trim() ||
                  !selfCheckReady ||
                  !wordCountReady ||
                  saving ||
                  timeboxExpired
                }
                onClick={() => void submit()}
              >
                {saving ? (
                  <LoadingButtonContent
                    label={text(
                      "正在由服务端评价…",
                      "Evaluating on the server…",
                    )}
                  />
                ) : (
                  <>
                    {attempts > 0
                      ? text("再次提交", "Submit revision")
                      : text("提交", "Submit")}
                    <ArrowRight aria-hidden="true" size={17} />
                  </>
                )}
              </Button>
            )}
          </footer>
        </Card>

        <aside className="lesson-side-panel">
          <Card>
            <span className="side-card-icon">
              <Target aria-hidden="true" size={18} />
            </span>
            <h3>{text("本课只练这一件事", "One core target")}</h3>
            <p>{text(data.coreTargetZh, data.coreTargetEn)}</p>
          </Card>
          <Card>
            <span className="side-card-icon green">
              <ShieldCheck aria-hidden="true" size={18} />
            </span>
            <h3>{text("进度真实可信", "Evidence stays honest")}</h3>
            <p>
              {text(
                "首次答案、提示后答案和最终答案分别保存。看懂不等于独立会用。",
                "First, hinted, and final answers are stored separately. Understanding is not independent production.",
              )}
            </p>
          </Card>
          {actualIndex >= 2 && accepted ? (
            <div className="adaptive-note">
              <Sparkles aria-hidden="true" size={16} />
              <span>
                {text(
                  "你已达到当前支架目标，系统不会为了凑时长添加重复题。",
                  "You met the current scaffold target, so no repetitive items will be added just to fill time.",
                )}
              </span>
            </div>
          ) : null}
        </aside>
      </div>

      {timeboxExpired ? (
        <div
          aria-labelledby="timebox-dialog-title"
          aria-modal="true"
          className="modal-backdrop"
          ref={timeboxDialogRef}
          role="dialog"
          tabIndex={-1}
        >
          <Card className="modal-card">
            <span className="modal-icon modal-icon-blue">
              <Clock3 aria-hidden="true" size={22} />
            </span>
            <h2 id="timebox-dialog-title">
              {text(
                `本段 ${runtime?.autoSplit?.maxMinutes ?? 60} 分钟已到`,
                `This ${runtime?.autoSplit?.maxMinutes ?? 60}-minute segment has ended`,
              )}
            </h2>
            <p>
              {text(
                "当前输入已经保留。系统不会继续挤压你的注意力，也不会把未评价内容算作掌握。你可以把剩余核心任务拆到下一次；如果核心答案都已保存，也可以裁掉 FLEX 后结束为练习记录。",
                "Your current input is preserved. Unassessed work is never counted as mastery. Schedule the remaining core work for another segment, or—if every core answer is saved—trim FLEX and finish as a practice record.",
              )}
            </p>
            <div className="pause-summary">
              <Save aria-hidden="true" size={17} />
              <span>
                {text(
                  `有效输出约 ${Math.floor((runtime?.productiveSeconds ?? 0) / 60)} 分钟；未提交输入仍在草稿中。`,
                  `About ${Math.floor((runtime?.productiveSeconds ?? 0) / 60)} productive minutes; unsubmitted input remains in the draft.`,
                )}
              </span>
            </div>
            {errorMessage ? <p role="alert">{errorMessage}</p> : null}
            <div className="modal-actions modal-actions-stacked">
              <Button
                disabled={saving}
                onClick={() => {
                  setSaving(true);
                  setErrorMessage("");
                  void learningClient
                    .updateLessonRuntime(data.id, {
                      revision: Math.max(
                        runtimeRevision.current ?? 0,
                        runtime?.revision ?? data.runtime.revision,
                      ),
                      action: "SCHEDULE_SPLIT",
                      draft: {
                        lessonId: data.id,
                        itemId: item.id,
                        answer,
                        firstAnswer,
                        ...(responseId ? { responseId } : {}),
                        attempts,
                        hintLevel,
                        revealed,
                        updatedAt: new Date().toISOString(),
                      },
                    })
                    .then((nextRuntime) => {
                      runtimeRevision.current = nextRuntime.revision;
                      setRuntimeOverride(nextRuntime);
                      router.push("/today");
                    })
                    .catch((error) =>
                      setErrorMessage(
                        error instanceof Error
                          ? error.message
                          : text(
                              "拆分状态保存失败，请重试。",
                              "Could not schedule the remainder. Try again.",
                            ),
                      ),
                    )
                    .finally(() => setSaving(false));
                }}
              >
                <CalendarClock aria-hidden="true" size={16} />
                {text(
                  "拆分剩余课程并返回今日计划",
                  "Schedule remainder and return",
                )}
              </Button>
              <Button
                disabled={saving}
                onClick={() => {
                  setSaving(true);
                  setErrorMessage("");
                  void learningClient
                    .completeLesson(data.id, "trim_optional")
                    .then((completion) => {
                      if (completion.segmentScheduled) {
                        router.push("/today");
                        return;
                      }
                      setCompletionResult(completion);
                      setCompleted(true);
                    })
                    .catch((error) =>
                      setErrorMessage(
                        error instanceof Error
                          ? error.message
                          : text(
                              "仍有核心答案未保存，请选择拆分。",
                              "Some core answers are not saved; schedule the remainder.",
                            ),
                      ),
                    )
                    .finally(() => setSaving(false));
                }}
                variant="secondary"
              >
                {text("裁掉 FLEX 并结束练习", "Trim FLEX and finish practice")}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {pauseOpen ? (
        <div
          aria-labelledby="pause-dialog-title"
          aria-modal="true"
          className="modal-backdrop"
          ref={pauseDialogRef}
          role="dialog"
          tabIndex={-1}
        >
          <Card className="modal-card">
            <span className="modal-icon modal-icon-blue">
              <Pause aria-hidden="true" size={22} />
            </span>
            <h2 id="pause-dialog-title">
              {text("需要离开一下？", "Need to step away?")}
            </h2>
            <p>
              {text(
                "当前答案、提示层级和学习分支都已保存。返回时会从这里继续。",
                "Your answer, hint level, and learning branch are saved. You will resume here.",
              )}
            </p>
            <div className="pause-summary">
              <Save aria-hidden="true" size={17} />
              <span>
                {text(
                  `已完成 ${actualIndex + 1}/${data.items.length} 个核心任务，预计剩余 ${remainingMinutes} 分钟。`,
                  `${actualIndex + 1}/${data.items.length} core items reached; about ${remainingMinutes} minutes remain.`,
                )}
              </span>
            </div>
            <div className="modal-actions modal-actions-stacked">
              <Button
                onClick={() => {
                  setPauseOpen(false);
                  setIndex(0);
                  hydratedItemId.current = null;
                  runtimeRevision.current = null;
                  setRuntimeOverride(null);
                  reloadLesson();
                }}
              >
                <ChevronRight aria-hidden="true" size={16} />
                {text("继续当前练习", "Continue now")}
              </Button>
              <Button onClick={() => router.push("/today")} variant="secondary">
                <ArrowLeft aria-hidden="true" size={16} />
                {text("保存并返回今日计划", "Save and return to today")}
              </Button>
              <Button
                disabled={saving}
                onClick={() => {
                  if (!data || !item) return;
                  setSaving(true);
                  setErrorMessage("");
                  const draft = {
                    lessonId: data.id,
                    itemId: item.id,
                    answer,
                    firstAnswer,
                    ...(responseId ? { responseId } : {}),
                    attempts,
                    hintLevel,
                    revealed,
                    updatedAt: new Date().toISOString(),
                  };
                  void learningClient
                    .updateLessonRuntime(data.id, {
                      revision: Math.max(
                        runtimeRevision.current ?? 0,
                        runtime?.revision ?? data.runtime.revision,
                      ),
                      action: "REPORT_INTERRUPTION",
                      interruptionKind: "USER_ABNORMAL",
                      draft,
                    })
                    .then(() => router.push("/today"))
                    .catch((error) =>
                      setErrorMessage(
                        error instanceof Error
                          ? error.message
                          : text(
                              "异常中断状态保存失败。",
                              "Could not record the abnormal interruption.",
                            ),
                      ),
                    )
                    .finally(() => setSaving(false));
                }}
                variant="secondary"
              >
                <CalendarClock aria-hidden="true" size={16} />
                {text(
                  "异常中断并稍后继续",
                  "Record abnormal interruption and leave",
                )}
              </Button>
              <Button
                disabled={saving}
                onClick={() => {
                  if (!data) return;
                  setSaving(true);
                  setErrorMessage("");
                  void learningClient
                    .skipLesson(data.id)
                    .then((rewriteTaskId) =>
                      router.push(
                        learningRouteHref("/rewrite", {
                          cycleId,
                          taskId: rewriteTaskId,
                        }),
                      ),
                    )
                    .catch((error) =>
                      setErrorMessage(
                        error instanceof Error
                          ? error.message
                          : text(
                              "无法跳过这节专项课。",
                              "Could not skip this focused lesson.",
                            ),
                      ),
                    )
                    .finally(() => setSaving(false));
                }}
                variant="ghost"
              >
                <X aria-hidden="true" size={16} />
                {text(
                  "跳过专项课并开始不计保持的重写",
                  "Skip lesson and rewrite without retention credit",
                )}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
