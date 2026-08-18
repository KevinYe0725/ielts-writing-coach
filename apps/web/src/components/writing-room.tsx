"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  LockKeyhole,
  Send,
  ShieldCheck,
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
import {
  DraftConflictError,
  LearningClientError,
  learningClient,
  type AttemptData,
  type RewriteData,
} from "@/lib/client";
import {
  cacheWritingDraft,
  readCachedWritingDraft,
  removeCachedWritingDraft,
  type CachedWritingDraft,
} from "@/lib/client/draft-cache";
import { learningRouteHref } from "@/lib/client/learning-route";

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function formatCountdown(milliseconds: number, chinese: boolean): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (chinese) {
    if (days > 0) return `${days}天${hours}小时`;
    if (hours > 0) return `${hours}小时${minutes}分`;
    if (minutes > 0) return `${minutes}分${seconds}秒`;
    return `${seconds}秒`;
  }
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function countWords(value: string): number {
  const words = value.trim().match(/[\p{L}\p{N}’'-]+/gu);
  return words?.length ?? 0;
}

export function WritingRoom({
  cycleId,
  mode,
  taskId,
}: {
  cycleId: string | null;
  mode: "first" | "rewrite";
  taskId: string | null;
}) {
  const router = useRouter();
  const { text, messages, locale } = useLocale();
  const loader = useCallback(() => {
    if (!cycleId || (mode === "rewrite" && !taskId)) {
      return Promise.reject(
        new LearningClientError(
          "This writing step is missing its cycle or task identity. Open it from Today.",
          { status: 400, code: "LEARNING_ROUTE_IDENTITY_REQUIRED" },
        ),
      );
    }
    return mode === "rewrite"
      ? learningClient.getRewrite(taskId!, cycleId)
      : learningClient.getAttempt(1, cycleId);
  }, [cycleId, mode, taskId]);
  const {
    data,
    error: loadError,
    loading,
    retry,
  } = useDemoResource<AttemptData | RewriteData>(loader);
  const [rewriteCountdown, setRewriteCountdown] = useState<string | null>(null);
  useEffect(() => {
    const availableAt =
      loadError instanceof LearningClientError &&
      loadError.code === "REWRITE_LOCKED"
        ? (loadError.details?.availableAt as string | undefined)
        : undefined;
    if (!availableAt) {
      setRewriteCountdown(null);
      return;
    }
    const target = Date.parse(availableAt);
    if (!Number.isFinite(target)) {
      setRewriteCountdown(null);
      return;
    }
    const tick = () => {
      const remaining = target - Date.now();
      if (remaining <= 0) {
        setRewriteCountdown(null);
        return;
      }
      setRewriteCountdown(formatCountdown(remaining, locale === "zh-CN"));
    };
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [loadError, locale]);
  const [draft, setDraft] = useState("");
  const [remaining, setRemaining] = useState(40 * 60);
  const [active, setActive] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">(
    "saved",
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<CachedWritingDraft | null>(
    null,
  );
  const [draftConflict, setDraftConflict] = useState<DraftConflictError | null>(
    null,
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const [snapshotState, setSnapshotState] = useState<
    "waiting" | "saving" | "saved" | "error"
  >("waiting");
  const hydrated = useRef(false);
  const deadlineAt = useRef<number | null>(null);
  const blindSnapshotSaved = useRef(false);
  const blindSnapshotPromise = useRef<Promise<void> | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const submitStarted = useRef(false);
  const submittedRef = useRef(false);
  const latestDraft = useRef("");
  const localGeneration = useRef(0);
  const autosaveTimer = useRef<number | null>(null);
  const [dirtyTick, setDirtyTick] = useState(0);
  const [rewriteGoals, setRewriteGoals] = useState<
    Array<{ en: string; zh: string }>
  >([]);
  const submitDialogRef = useDialogFocus<HTMLDivElement>(
    confirmSubmit,
    () => setConfirmSubmit(false),
    submitButtonRef,
  );
  const recoveryDialogRef = useDialogFocus<HTMLDivElement>(
    recoveryDraft !== null,
  );
  const conflictDialogRef = useDialogFocus<HTMLDivElement>(
    draftConflict !== null,
  );

  useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    blindSnapshotSaved.current = data.selfCheckSnapshotSaved === true;
    const timeout = window.setTimeout(() => {
      setDraft(data.draft);
      latestDraft.current = data.draft;
      if (data.locked) {
        // Already submitted: no countdown, no editing, no auto-submit.
        setRemaining(0);
        setActive(false);
      } else {
        deadlineAt.current = Date.now() + data.durationSeconds * 1000;
        setRemaining(data.durationSeconds);
        setActive(true);
      }
      if (mode === "rewrite") {
        setRewriteGoals((data as RewriteData).abstractGoals);
      }
      setSnapshotState(data.selfCheckSnapshotSaved ? "saved" : "waiting");
      void readCachedWritingDraft(data.id).then((cached) => {
        if (!cached || cached.syncState !== "pending") return;
        if (cached.content === data.draft) {
          void removeCachedWritingDraft(data.id);
          return;
        }
        setRecoveryDraft(cached);
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [data, mode]);

  useEffect(() => {
    if (!active || deadlineAt.current === null) return;
    const updateRemaining = () => {
      if (deadlineAt.current === null) return;
      setRemaining(
        Math.max(0, Math.ceil((deadlineAt.current - Date.now()) / 1000)),
      );
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const persistDraft = useCallback(
    async (value: string, generation: number) => {
      if (!data || submittedRef.current || data.locked) return;
      setSaveState("saving");
      setSyncError(null);
      try {
        await learningClient.saveDraft(data.id, value);
        if (generation === localGeneration.current) {
          setSaveState("saved");
          await removeCachedWritingDraft(data.id);
        }
      } catch (error) {
        if (
          error instanceof LearningClientError &&
          ["ATTEMPT_LOCKED", "ATTEMPT_NOT_ACTIVE"].includes(error.code)
        ) {
          // The attempt was just submitted and locked; the draft is safe.
          // Stop autosaving instead of alarming the learner with a bogus
          // "sync failed" banner at the end of the countdown.
          submittedRef.current = true;
          setSaveState("saved");
          setSyncError(null);
          return;
        }
        setSaveState("unsaved");
        if (error instanceof DraftConflictError) setDraftConflict(error);
        else
          setSyncError(
            error instanceof Error
              ? error.message
              : "The draft could not be synchronized.",
          );
      }
    },
    [data],
  );

  useEffect(() => {
    if (!data || !hydrated.current || dirtyTick === 0) return;
    const generation = localGeneration.current;
    autosaveTimer.current = window.setTimeout(() => {
      void persistDraft(draft, generation);
    }, 650);
    return () => window.clearTimeout(autosaveTimer.current ?? undefined);
  }, [data, dirtyTick, draft, persistDraft]);

  const locked = data?.locked === true;

  useEffect(() => {
    const handleKeys = (event: KeyboardEvent) => {
      if (locked) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (data) void persistDraft(draft, localGeneration.current);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && active) {
        event.preventDefault();
        setConfirmSubmit(true);
      }
    };
    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, [active, data, draft, locked, persistDraft]);

  const words = useMemo(() => countWords(draft), [draft]);
  const rewrite = mode === "rewrite" ? (data as RewriteData | null) : null;
  const selfCheckWindowOpen = mode === "rewrite" && remaining <= 5 * 60;
  const selfCheckVisible = selfCheckWindowOpen && snapshotState === "saved";

  const sealBlindDraft = useCallback(
    (attemptId: string, value: string): Promise<void> => {
      if (blindSnapshotSaved.current) return Promise.resolve();
      if (blindSnapshotPromise.current) return blindSnapshotPromise.current;
      setSnapshotState("saving");
      const pending = learningClient
        .saveSelfCheckSnapshot(attemptId, value, "before")
        .then(() => {
          blindSnapshotSaved.current = true;
          setSnapshotState("saved");
        })
        .catch((error: unknown) => {
          setSnapshotState("error");
          throw error;
        })
        .finally(() => {
          blindSnapshotPromise.current = null;
        });
      blindSnapshotPromise.current = pending;
      return pending;
    },
    [],
  );

  useEffect(() => {
    if (!data || !selfCheckWindowOpen || blindSnapshotSaved.current) return;
    void sealBlindDraft(data.id, latestDraft.current).catch(() => undefined);
  }, [data, sealBlindDraft, selfCheckWindowOpen]);

  useEffect(() => {
    if (mode !== "rewrite" || !selfCheckVisible || rewriteGoals.length > 0)
      return;
    void learningClient
      .getRewrite(taskId!, cycleId!)
      .then((latest) => setRewriteGoals(latest.abstractGoals))
      .catch(() => undefined);
  }, [cycleId, mode, rewriteGoals.length, selfCheckVisible, taskId]);

  const submit = useCallback(async () => {
    if (!data || submitStarted.current) return;
    submitStarted.current = true;
    setSubmitting(true);
    // From here on the attempt is being sealed: cancel the pending autosave
    // and stop the save loop so post-submission saves cannot 423 and flash a
    // bogus "sync failed" banner while the grading job runs.
    submittedRef.current = true;
    if (autosaveTimer.current !== null)
      window.clearTimeout(autosaveTimer.current);
    setSyncError(null);
    try {
      if (mode === "rewrite") {
        await sealBlindDraft(data.id, draft);
        await learningClient.saveSelfCheckSnapshot(data.id, draft, "after");
      }
      const submission = await learningClient.submitAttempt(
        data.id,
        draft,
        () => setSubmitSuccess(true),
      );
      await removeCachedWritingDraft(data.id);
      // Let the success toast register before navigating away.
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      if (!submission.feedbackReady) {
        router.push("/today?notice=feedback-waiting-ai");
        return;
      }
      router.push(
        learningRouteHref(mode === "rewrite" ? "/compare" : "/feedback", {
          cycleId: data.cycleId ?? cycleId,
        }),
      );
    } catch (error) {
      if (error instanceof DraftConflictError) setDraftConflict(error);
      else if (
        error instanceof LearningClientError &&
        ["ATTEMPT_LOCKED", "ATTEMPT_ALREADY_SUBMITTED"].includes(error.code)
      ) {
        // A previous submission already locked this attempt (e.g. the
        // deadline auto-submit raced a manual one). Treat it as success.
        await removeCachedWritingDraft(data.id);
        router.push(
          mode === "rewrite"
            ? learningRouteHref("/compare", {
                cycleId: data.cycleId ?? cycleId,
              })
            : "/today?notice=feedback-waiting-ai",
        );
      } else
        setSyncError(
          error instanceof Error
            ? error.message
            : "The essay could not be submitted.",
        );
    } finally {
      submitStarted.current = false;
      setSubmitting(false);
    }
  }, [cycleId, data, draft, mode, router, sealBlindDraft]);

  const keepServerDraft = useCallback(async () => {
    if (!data) return;
    try {
      const fresh =
        mode === "rewrite"
          ? await learningClient.getRewrite(taskId!, cycleId!)
          : await learningClient.getAttempt(1, cycleId!);
      localGeneration.current = 0;
      setDirtyTick(0);
      setDraft(fresh.draft);
      latestDraft.current = fresh.draft;
      setRecoveryDraft(null);
      setDraftConflict(null);
      setSyncError(null);
      setSaveState("saved");
      await removeCachedWritingDraft(data.id);
    } catch (error) {
      setSyncError(
        error instanceof Error
          ? error.message
          : "The server draft could not be loaded.",
      );
    }
  }, [cycleId, data, mode, taskId]);

  const restoreLocalDraft = useCallback(
    async (value: string) => {
      if (!data) return;
      try {
        // Refresh the ETag before applying a local draft after a cross-device conflict.
        if (draftConflict) {
          if (mode === "rewrite")
            await learningClient.getRewrite(taskId!, cycleId!);
          else await learningClient.getAttempt(1, cycleId!);
        }
        const generation = localGeneration.current + 1;
        localGeneration.current = generation;
        setDirtyTick(generation);
        setDraft(value);
        latestDraft.current = value;
        setRecoveryDraft(null);
        setDraftConflict(null);
        setSyncError(null);
        setSaveState("unsaved");
        await cacheWritingDraft({
          attemptId: data.id,
          content: value,
          ...(data.revision === undefined
            ? {}
            : { serverRevision: data.revision }),
          updatedAt: new Date().toISOString(),
          syncState: "pending",
        });
      } catch (error) {
        setSyncError(
          error instanceof Error
            ? error.message
            : "The local draft could not be restored.",
        );
      }
    },
    [cycleId, data, draftConflict, mode, taskId],
  );

  useEffect(() => {
    if (!active || remaining > 0 || !data || data.locked) return;
    const timeout = window.setTimeout(() => {
      setConfirmSubmit(false);
      void submit();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [active, data, remaining, submit]);

  const rescheduleMissedRewrite = useCallback(async () => {
    if (!taskId || rescheduling) return;
    setRescheduling(true);
    try {
      await learningClient.rescheduleRewrite(taskId);
      router.push("/today");
      router.refresh();
    } catch (error) {
      setSyncError(
        error instanceof Error
          ? error.message
          : "The rewrite window could not be rescheduled.",
      );
      setRescheduling(false);
    }
  }, [rescheduling, router, taskId]);

  if (loading || !data) {
    if (loadError) {
      const isRewriteLocked =
        loadError instanceof LearningClientError &&
        loadError.code === "REWRITE_LOCKED";
      return (
        <Card className="transfer-result-card">
          <AlertCircle aria-hidden="true" size={36} />
          {isRewriteLocked ? (
            <p className="rewrite-locked-message">
              {rewriteCountdown
                ? `为确保学习质量，延迟重写于${rewriteCountdown}后开放。`
                : "为确保学习质量，延迟重写即将开放。"}
            </p>
          ) : (
            <>
              <p>{loadError.message}</p>
              {syncError ? <p role="alert">{syncError}</p> : null}
            </>
          )}
          <div className="completion-actions">
            {mode === "rewrite" &&
            loadError instanceof LearningClientError &&
            loadError.code === "REWRITE_WINDOW_EXPIRED" ? (
              <Button
                disabled={rescheduling}
                onClick={() => void rescheduleMissedRewrite()}
              >
                {rescheduling ? (
                  <LoadingButtonContent
                    label={text("正在重新安排…", "Rescheduling…")}
                  />
                ) : (
                  text("重新安排闭卷重写", "Reschedule closed-book rewrite")
                )}
              </Button>
            ) : null}
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
    <div className="writing-page">
      <header className="writing-topbar">
        <div className="writing-title-group">
          <Badge tone={mode === "rewrite" ? "violet" : "blue"}>
            {mode === "rewrite"
              ? text("Version 2 · 闭卷重写", "Version 2 · closed-book rewrite")
              : text("Version 1 · 首写", "Version 1 · first attempt")}
          </Badge>
          <strong>{data.prompt.category}</strong>
        </div>
        <div className="writing-controls">
          <span aria-live="polite" className="save-state">
            {saveState === "saving" ? (
              text("正在保存…", "Saving…")
            ) : saveState === "unsaved" ? (
              <>
                <AlertCircle aria-hidden="true" size={14} />
                {text(
                  "已保存在本设备，等待同步",
                  "Saved on this device; waiting to sync",
                )}
              </>
            ) : (
              <>
                <Check aria-hidden="true" size={14} />
                {text("已自动保存", "Autosaved")}
              </>
            )}
          </span>
          <div
            aria-label={text("剩余时间", "Time remaining")}
            className={`timer ${remaining <= 300 ? "timer-warning" : ""}`}
            role="timer"
          >
            <Clock3 aria-hidden="true" size={17} />
            <strong>{formatTime(remaining)}</strong>
          </div>
        </div>
      </header>

      {mode === "rewrite" && rewrite ? (
        <div className="integrity-banner">
          <LockKeyhole aria-hidden="true" size={17} />
          <span>
            {text(
              "Version 1、修改答案和范文已隐藏。",
              "Version 1, corrections, and the model essay are hidden.",
            )}
          </span>
          <small>{text(rewrite.unlockLabelZh, rewrite.unlockLabelEn)}</small>
        </div>
      ) : null}

      {locked ? (
        <div className="integrity-banner locked-banner" role="status">
          <LockKeyhole aria-hidden="true" size={17} />
          <span>
            {text(
              "这篇作文已提交并锁定，不能重复提交。",
              "This essay has been submitted and locked; it cannot be submitted again.",
            )}
          </span>
          <ActionLink
            href={
              mode === "rewrite"
                ? learningRouteHref("/compare", {
                    cycleId: data.cycleId ?? cycleId,
                  })
                : learningRouteHref("/feedback", {
                    cycleId: data.cycleId ?? cycleId,
                  })
            }
            size="sm"
            variant="secondary"
          >
            {text("查看批改", "View feedback")}
          </ActionLink>
        </div>
      ) : null}

      {syncError ? (
        <div className="integrity-banner" role="alert">
          <AlertCircle aria-hidden="true" size={17} />
          <span>
            {text(
              "服务器同步暂时失败；你的未同步草稿仍保存在本设备。",
              "Server sync failed; your unsynced draft remains on this device.",
            )}
          </span>
          <small>{syncError}</small>
        </div>
      ) : null}

      {submitSuccess ? (
        <div className="writing-toast" role="status">
          <Check aria-hidden="true" size={17} />
          {text(
            "作文提交成功，正在生成批改…",
            "Essay submitted; feedback is being prepared…",
          )}
        </div>
      ) : null}

      <div className="writing-layout">
        <aside
          className="prompt-panel"
          aria-labelledby="writing-prompt-heading"
        >
          <div className="prompt-sticky">
            <p className="eyebrow">{data.prompt.sourceLabel}</p>
            <h1 id="writing-prompt-heading">
              {text("写作题目", "Writing prompt")}
            </h1>
            <blockquote lang="en">{data.prompt.question}</blockquote>
            <p className="prompt-instruction" lang="en">
              {data.prompt.instruction}
            </p>
            <div className="exam-rules">
              <div>
                <Clock3 aria-hidden="true" size={16} />
                <span>
                  {text(
                    "构思、写作和检查均计入 40 分钟",
                    "Planning, writing, and checking are included in 40 minutes",
                  )}
                </span>
              </div>
              <div>
                <ShieldCheck aria-hidden="true" size={16} />
                <span>
                  {text(
                    "拼写、语法与 AI 建议已关闭",
                    "Spelling, grammar, and AI suggestions are off",
                  )}
                </span>
              </div>
              <div>
                <FileText aria-hidden="true" size={16} />
                <span>{text("至少写 250 词", "Write at least 250 words")}</span>
              </div>
            </div>
            {mode === "rewrite" ? (
              <div
                className={`self-check-box ${selfCheckVisible ? "visible" : "locked"}`}
              >
                <strong>
                  {text("最后 5 分钟自检", "Final five-minute self-check")}
                </strong>
                {selfCheckVisible && rewrite ? (
                  <ul>
                    {rewriteGoals.map((goal) => (
                      <li key={goal.en}>{text(goal.zh, goal.en)}</li>
                    ))}
                  </ul>
                ) : selfCheckWindowOpen ? (
                  <p role="status">
                    <ShieldCheck aria-hidden="true" size={14} />
                    {snapshotState === "error"
                      ? text(
                          "闭卷草稿尚未安全锁定，请检查连接后重试。",
                          "The blind draft is not sealed yet. Check the connection and retry.",
                        )
                      : text(
                          "正在安全锁定闭卷草稿…",
                          "Securely sealing the blind draft…",
                        )}
                  </p>
                ) : (
                  <p>
                    <LockKeyhole aria-hidden="true" size={14} />
                    {text(
                      "为保留闭卷证据，剩余 5 分钟时才会显示。",
                      "Hidden until five minutes remain to preserve closed-book evidence.",
                    )}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </aside>

        <section className="editor-panel" aria-labelledby="essay-editor-label">
          <div className="editor-heading">
            <label id="essay-editor-label" htmlFor="essay-editor">
              {text("你的作文", "Your essay")}
            </label>
            <span
              className={words >= 250 ? "word-count complete" : "word-count"}
            >
              {words} {text("词", "words")}
            </span>
          </div>
          <textarea
            aria-describedby="editor-help"
            autoCapitalize="sentences"
            autoCorrect="off"
            className="essay-editor"
            disabled={!active || locked}
            id="essay-editor"
            lang="en"
            onChange={(event) => {
              const value = event.target.value;
              const generation = localGeneration.current + 1;
              localGeneration.current = generation;
              latestDraft.current = value;
              setDraft(value);
              setDirtyTick(generation);
              setSaveState("unsaved");
              setSyncError(null);
              void cacheWritingDraft({
                attemptId: data.id,
                content: value,
                ...(data.revision === undefined
                  ? {}
                  : { serverRevision: data.revision }),
                updatedAt: new Date().toISOString(),
                syncState: "pending",
              });
            }}
            placeholder="Start writing here…"
            spellCheck={false}
            value={draft}
          />
          <footer className="editor-footer">
            <p id="editor-help">
              {text(
                "快捷键：⌘/Ctrl + S 保存 · ⌘/Ctrl + Enter 提交",
                "Shortcuts: ⌘/Ctrl + S to save · ⌘/Ctrl + Enter to submit",
              )}
            </p>
            <Button
              disabled={!active || locked || submitting || words < 40}
              onClick={() => setConfirmSubmit(true)}
              ref={submitButtonRef}
            >
              <Send aria-hidden="true" size={17} />
              {text("提交作文", "Submit essay")}
            </Button>
          </footer>
        </section>
      </div>

      {confirmSubmit ? (
        <div
          aria-labelledby="submit-dialog-title"
          aria-modal="true"
          className="modal-backdrop"
          ref={submitDialogRef}
          role="dialog"
          tabIndex={-1}
        >
          <Card className="modal-card">
            <span className="modal-icon">
              <AlertCircle aria-hidden="true" size={22} />
            </span>
            <h2 id="submit-dialog-title">
              {text("确认提交这份版本？", "Submit this version?")}
            </h2>
            <p>
              {text(
                "提交后本版本会锁定，后续修改将作为新的学习证据保存。",
                "This version is locked after submission; later changes are stored as separate learning evidence.",
              )}
            </p>
            <div className="submit-summary">
              <span>
                {words} {text("词", "words")}
              </span>
              <span>
                {formatTime(remaining)} {text("剩余", "remaining")}
              </span>
            </div>
            <div className="modal-actions">
              <Button
                disabled={submitting}
                onClick={() => setConfirmSubmit(false)}
                variant="secondary"
              >
                {text("继续检查", "Keep checking")}
              </Button>
              <Button disabled={submitting} onClick={() => void submit()}>
                {submitting ? (
                  <LoadingButtonContent
                    label={text("正在提交…", "Submitting…")}
                  />
                ) : (
                  <>
                    {text("确认提交", "Submit now")}
                    <Send aria-hidden="true" size={16} />
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {recoveryDraft ? (
        <div
          aria-labelledby="draft-recovery-title"
          aria-modal="true"
          className="modal-backdrop"
          ref={recoveryDialogRef}
          role="dialog"
          tabIndex={-1}
        >
          <Card className="modal-card">
            <span className="modal-icon">
              <FileText aria-hidden="true" size={22} />
            </span>
            <h2 id="draft-recovery-title">
              {text("发现未同步的本地草稿", "Unsynced local draft found")}
            </h2>
            <p>
              {text(
                "服务器版本和本设备草稿不同。为避免静默覆盖，请选择要继续使用的版本；计时仍会继续。",
                "The server and this device contain different drafts. Choose explicitly; the timer keeps running.",
              )}
            </p>
            <div className="submit-summary">
              <span>
                {countWords(data.draft)}{" "}
                {text("词（服务器）", "words (server)")}
              </span>
              <span>
                {countWords(recoveryDraft.content)}{" "}
                {text("词（本地）", "words (local)")}
              </span>
            </div>
            <div className="modal-actions">
              <Button
                onClick={() => void keepServerDraft()}
                variant="secondary"
              >
                {text("使用服务器版本", "Use server draft")}
              </Button>
              <Button
                onClick={() => void restoreLocalDraft(recoveryDraft.content)}
              >
                {text("恢复本地草稿", "Restore local draft")}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {draftConflict ? (
        <div
          aria-labelledby="draft-conflict-title"
          aria-modal="true"
          className="modal-backdrop"
          ref={conflictDialogRef}
          role="dialog"
          tabIndex={-1}
        >
          <Card className="modal-card">
            <span className="modal-icon">
              <AlertCircle aria-hidden="true" size={22} />
            </span>
            <h2 id="draft-conflict-title">
              {text(
                "另一台设备也修改了草稿",
                "Draft changed on another device",
              )}
            </h2>
            <p>
              {text(
                "两个版本都已保留。请选择服务器版本，或在最新服务器修订上重新应用本地版本。",
                "Both versions were preserved. Use the server draft or reapply your local draft on the latest revision.",
              )}
            </p>
            <div className="submit-summary">
              <span>
                {countWords(draftConflict.serverDraft.content)}{" "}
                {text("词（服务器）", "words (server)")}
              </span>
              <span>
                {countWords(draftConflict.clientDraft.content)}{" "}
                {text("词（本地）", "words (local)")}
              </span>
            </div>
            <div className="modal-actions">
              <Button
                onClick={() => void keepServerDraft()}
                variant="secondary"
              >
                {text("使用服务器版本", "Use server draft")}
              </Button>
              <Button
                onClick={() =>
                  void restoreLocalDraft(draftConflict.clientDraft.content)
                }
              >
                {text("保留本地版本", "Keep local draft")}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
