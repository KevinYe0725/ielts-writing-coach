"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileSearch,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Target,
  TriangleAlert,
} from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import {
  ActionLink,
  Badge,
  Button,
  Card,
  LoadingButtonContent,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { useDemoResource } from "@/components/use-demo-resource";
import {
  LearningClientError,
  learningClient,
  type TransferSubmission,
  type TransferTaskData,
} from "@/lib/client";
import {
  singleRouteParam,
  type LearningSearchParams,
} from "@/lib/client/learning-route";

const POLL_INTERVAL_MS = 1_500;

export default function TransferPage({
  searchParams,
}: {
  searchParams: Promise<LearningSearchParams>;
}) {
  const query = use(searchParams);
  const router = useRouter();
  const cycleId = singleRouteParam(query, "cycle");
  const requestedTaskId = singleRouteParam(query, "task");
  const { text, messages } = useLocale();
  const loader = useCallback(
    () =>
      cycleId && requestedTaskId
        ? learningClient.getTransferTask(requestedTaskId, cycleId)
        : Promise.reject(
            new LearningClientError(
              "This transfer check is missing its cycle or task identity. Open it from Today.",
              { status: 400, code: "LEARNING_ROUTE_IDENTITY_REQUIRED" },
            ),
          ),
    [cycleId, requestedTaskId],
  );
  const resource = useDemoResource(loader);
  const [taskOverride, setTask] = useState<TransferTaskData | null>(null);
  const [answer, setAnswer] = useState("");
  const [submission, setSubmission] = useState<TransferSubmission | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mutation, setMutation] = useState<
    "no-opportunity" | "reschedule" | null
  >(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const startedAt = useRef(new Date().toISOString());

  const task = taskOverride ?? resource.data;
  const taskId = task?.id;
  const pendingJobId = task?.evaluationError
    ? null
    : (submission?.jobId ?? task?.pendingJobId);
  const currentResult = task?.status === "READY" ? null : task?.result;

  useEffect(() => {
    if (!taskId || !pendingJobId || currentResult) return;
    let active = true;
    const refresh = async () => {
      try {
        const latest = await learningClient.getTransferTask(taskId, cycleId!);
        if (active) setTask(latest);
      } catch {
        // A transient refresh failure must not discard the immutable answer.
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [currentResult, cycleId, pendingJobId, taskId]);

  const submit = async () => {
    if (!task || !answer.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const accepted = await learningClient.submitTransferResponse(task.id, {
        firstAnswer: answer,
        elapsedSeconds: Math.max(
          0,
          Math.round(
            (Date.now() - new Date(startedAt.current).getTime()) / 1000,
          ),
        ),
        startedAt: startedAt.current,
      });
      setSubmission(accepted);
      const latest = await learningClient.getTransferTask(task.id, cycleId!);
      setTask(latest);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : text("提交失败，请重试。", "Submission failed. Please try again."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const recordNoOpportunity = async () => {
    if (!task || mutation) return;
    setMutation("no-opportunity");
    setSubmitError(null);
    try {
      setTask(await learningClient.markTransferNoOpportunity(task.id));
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : text(
              "无法记录无机会，请重试。",
              "Could not record no opportunity.",
            ),
      );
    } finally {
      setMutation(null);
    }
  };

  const rescheduleMissedWindow = async () => {
    if (!task || mutation) return;
    setMutation("reschedule");
    setSubmitError(null);
    try {
      await learningClient.rescheduleTransfer(task.id);
      router.push("/today");
      router.refresh();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : text("无法重新安排，请重试。", "Could not reschedule the window."),
      );
      setMutation(null);
    }
  };

  if (resource.loading || !task) {
    if (resource.error) {
      return (
        <Card className="transfer-result-card">
          <TriangleAlert aria-hidden="true" size={36} />
          <h2>{text("迁移任务暂不可用", "Transfer check unavailable")}</h2>
          <p>{resource.error.message}</p>
          <Button onClick={resource.retry} variant="secondary">
            <RotateCcw aria-hidden="true" size={16} />
            {text("重试", "Try again")}
          </Button>
        </Card>
      );
    }
    return <Skeleton label={messages.common.loading} />;
  }

  const result = currentResult;
  const evaluationError = task.evaluationError;
  const processing =
    Boolean(submission || task.pendingJobId) && !result && !evaluationError;
  const ready = task.status === "READY";
  const unavailable = !ready && !processing && !result && !evaluationError;
  const words = answer.trim().match(/[\p{L}\p{N}’'-]+/gu)?.length ?? 0;

  const resultTone = result?.mockLanguageScoring
    ? "neutral"
    : result?.outcome === "PASS"
      ? "green"
      : result?.outcome === "FAIL"
        ? "amber"
        : "blue";

  return (
    <>
      <PageHeader
        actions={
          <Badge tone={processing ? "amber" : "violet"}>
            {processing ? (
              <LoaderCircle aria-hidden="true" className="spin" size={13} />
            ) : (
              <Clock3 aria-hidden="true" size={13} />
            )}
            {processing
              ? text("服务器评估中", "Server evaluation pending")
              : `D5–D7 · 8 ${text("分钟", "minutes")}`}
          </Badge>
        }
        eyebrow={text("陌生题迁移", "Unfamiliar-question transfer")}
        title={text(
          "换一个话题，看能力是否真正带得走",
          "Change the topic and see whether the skill travels",
        )}
        description={text(
          "目标技能、提示和原题答案均已隐藏。结果只采用服务器评估，不以字数或关键词在本地判定。",
          "The target skill, hints, and previous answers are hidden. Results come only from server evaluation, never local word-count or keyword rules.",
        )}
      />

      {task.windowExpired ? (
        <Card aria-live="polite" className="transfer-result-card">
          <CalendarClock aria-hidden="true" size={36} />
          <Badge tone="amber">
            {text("迁移窗口已错过", "Transfer window missed")}
          </Badge>
          <h2>
            {text("重新安排无提示迁移", "Reschedule the unprompted transfer")}
          </h2>
          <p>
            {text(
              "错过窗口不会产生失败证据。服务器会保留原排程历史，并在 48 小时后开启新窗口。",
              "Missing the window creates no failure evidence. The server preserves the original schedule and opens a new window in 48 hours.",
            )}
          </p>
          {submitError ? <p role="alert">{submitError}</p> : null}
          <Button
            disabled={mutation !== null}
            onClick={() => void rescheduleMissedWindow()}
          >
            {mutation === "reschedule" ? (
              <LoadingButtonContent
                label={text("正在重新安排…", "Rescheduling…")}
              />
            ) : (
              text("重新安排迁移窗口", "Reschedule transfer window")
            )}
          </Button>
        </Card>
      ) : result ? (
        <Card aria-live="polite" className="transfer-result-card">
          <span className="completion-icon">
            {result.outcome === "PASS" ? (
              <CheckCircle2 aria-hidden="true" size={36} />
            ) : result.outcome === "FAIL" ? (
              <TriangleAlert aria-hidden="true" size={36} />
            ) : (
              <FileSearch aria-hidden="true" size={36} />
            )}
          </span>
          <Badge tone={resultTone}>
            {result.mockLanguageScoring
              ? text(
                  "Mock 流程已完成 · 未评分语言",
                  "Mock workflow complete · language not scored",
                )
              : result.outcome === "PASS"
                ? text("服务器结果：PASS", "Server result: PASS")
                : result.outcome === "FAIL"
                  ? text("服务器结果：FAIL", "Server result: FAIL")
                  : text(
                      "服务器结果：NO OPPORTUNITY",
                      "Server result: NO OPPORTUNITY",
                    )}
          </Badge>
          <h2>
            {result.mockLanguageScoring
              ? text(
                  "仅验证了提交流程，不产生迁移结论",
                  "Submission flow verified; no transfer conclusion was made",
                )
              : result.outcome === "NO_OPPORTUNITY"
                ? text(
                    "没有自然机会，不计为失败",
                    "No natural opportunity; not counted as failure",
                  )
                : result.transferred
                  ? text(
                      "迁移证据已达到当前门槛",
                      "Transfer evidence meets the current gate",
                    )
                  : text(
                      "结果已记录，但不会虚报掌握",
                      "Result recorded without overstating mastery",
                    )}
          </h2>
          <p>{text(result.feedbackZh, result.feedbackEn)}</p>
          {result.evidence ? (
            <p lang="en">
              <strong>{text("证据：", "Evidence: ")}</strong>
              {result.evidence}
            </p>
          ) : null}
          <p>
            <ShieldCheck aria-hidden="true" size={15} />{" "}
            {text("证据状态", "Evidence status")}: {result.evidenceStatus}
            {result.confidence === null
              ? ""
              : ` · ${text("置信度", "confidence")} ${Math.round(result.confidence * 100)}%`}
          </p>
          {result.gateMissing.length > 0 ? (
            <p>
              {text("尚缺证据：", "Evidence still needed: ")}
              {result.gateMissing.join(", ")}
            </p>
          ) : null}
          {result.mockLanguageScoring ? (
            <Badge tone="amber">
              {text(
                "Mock：仅演示流程，不是语言评分",
                "Mock: workflow demo, not language scoring",
              )}
            </Badge>
          ) : null}
          <ActionLink href="/today" size="lg">
            {text("返回今日计划", "Return to today")}
          </ActionLink>
        </Card>
      ) : evaluationError ? (
        <Card aria-live="assertive" className="transfer-result-card">
          <TriangleAlert aria-hidden="true" size={36} />
          <Badge tone="amber">{evaluationError.code}</Badge>
          <h2>
            {text(
              "首答已保存，但服务器评估未完成",
              "First answer saved, but server evaluation failed",
            )}
          </h2>
          <p>{evaluationError.safeMessage}</p>
          <p>
            {text(
              "这不是学习表现失败，也不会产生 FAIL 证据。请检查模型连接后再恢复任务。",
              "This is not a learning failure and creates no FAIL evidence. Check the model connection before recovering the task.",
            )}
          </p>
          <ActionLink href="/settings" variant="secondary">
            {text("检查模型设置", "Check model settings")}
          </ActionLink>
        </Card>
      ) : processing ? (
        <Card
          aria-busy="true"
          aria-live="polite"
          className="transfer-result-card"
        >
          <LoaderCircle aria-hidden="true" className="spin" size={36} />
          <Badge tone="amber">202 · {submission?.jobStatus ?? "QUEUED"}</Badge>
          <h2>
            {text(
              "首答已封存，等待服务器评估",
              "First answer saved; awaiting server evaluation",
            )}
          </h2>
          <p>
            {text(
              "页面会自动刷新证据状态。等待期间不会在浏览器里用答案长度或关键词推断成功。",
              "This page refreshes the evidence state automatically. While waiting, the browser never infers success from answer length or keywords.",
            )}
          </p>
        </Card>
      ) : unavailable ? (
        <Card className="transfer-result-card">
          <Clock3 aria-hidden="true" size={36} />
          <Badge tone="neutral">{task.status}</Badge>
          <h2>{text("迁移窗口尚未开放", "The transfer window is not open")}</h2>
          <p>
            {text(
              "系统会按计划开放这道陌生题。",
              "The unfamiliar question will open on schedule.",
            )}{" "}
            {task.availableAt}
          </p>
          <ActionLink href="/today" variant="secondary">
            {text("返回今日计划", "Return to today")}
          </ActionLink>
        </Card>
      ) : (
        <Card className="transfer-check-card">
          <div className="transfer-check-head">
            <Badge tone="blue">{task.question.category}</Badge>
            <span>
              <LockKeyhole aria-hidden="true" size={14} />
              {text("目标隐藏 · 无提示", "Target hidden · unassisted")}
            </span>
          </div>
          <blockquote lang="en">
            {task.question.question}
            <br />
            <strong>{task.question.instruction}</strong>
          </blockquote>
          <div className="transfer-task-prompt">
            <Target aria-hidden="true" size={19} />
            <div>
              <strong>{text("任务", "Task")}</strong>
              <p>
                {text(
                  "闭卷写一段 90–140 词的英文回应，在篇幅允许的范围内完整回应题目并展开主要观点。不要返回查看原题、专项课或范文。",
                  "Write a 90–140 word closed-book response that addresses the task as fully as space allows and develops the main idea. Do not revisit the original prompt, lesson, or model answer.",
                )}
              </p>
            </div>
          </div>
          <label className="sr-only" htmlFor="transfer-answer">
            {text("你的英文答案", "Your English answer")}
          </label>
          <textarea
            className="transfer-textarea"
            id="transfer-answer"
            lang="en"
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Write your answer without looking back…"
            spellCheck={false}
            value={answer}
          />
          {submitError ? (
            <p aria-live="assertive" role="alert">
              {submitError}
            </p>
          ) : null}
          <footer>
            <span>
              {words}{" "}
              {text(
                "词 · 仅供计数，不参与判定",
                "words · count only, never graded locally",
              )}
            </span>
            <Button
              disabled={mutation !== null || submitting}
              onClick={() => void recordNoOpportunity()}
              variant="secondary"
            >
              {mutation === "no-opportunity"
                ? text("正在记录…", "Recording…")
                : text("这道题没有自然机会", "No natural opportunity")}
            </Button>
            <Button
              disabled={!answer.trim() || submitting || mutation !== null}
              onClick={submit}
            >
              {submitting ? (
                <LoadingButtonContent
                  label={text("正在封存首答…", "Saving first answer…")}
                />
              ) : (
                <>
                  {text("提交给服务器评估", "Submit for server evaluation")}
                  <ArrowRight aria-hidden="true" size={17} />
                </>
              )}
            </Button>
          </footer>
        </Card>
      )}
    </>
  );
}
