"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  ChevronDown,
  Lightbulb,
} from "lucide-react";
import Markdown from "react-markdown";

import { useLocale } from "@/components/locale-provider";
import { ActionLink, Button } from "@/components/ui";
import { learningClient } from "@/lib/client";
import type {
  FocusedTeachingData,
  TeachingPracticeAnalysis,
  TeachingPracticePrompt,
  TeachingPracticeResponseData,
  TeachingSectionMarkdown,
} from "@/lib/client/types";

import styles from "./page.module.css";

const ANALYSIS_POLL_INTERVAL_MS = 350;
const ANALYSIS_MAX_POLL_ATTEMPTS = 75;
const ANALYSIS_POLL_DEADLINE_MS = 26_250;
const ANALYSIS_REQUEST_TIMEOUT_MS = 2_000;
const ANALYSIS_REQUEST_TIMED_OUT = Symbol("analysis-request-timed-out");
const RESTORE_REQUEST_TIMEOUT_MS = 5_000;
const RESTORE_REQUEST_TIMED_OUT = Symbol("restore-request-timed-out");

type PracticeView = {
  readonly draft: string;
  readonly submittedAnswer: string | null;
  readonly response: TeachingPracticeResponseData | null;
  readonly restoring: boolean;
  readonly submitting: boolean;
  readonly retrying: boolean;
  readonly rewriteOpen: boolean;
  readonly rewriteDraft: string;
  readonly terminalAnnouncement: "ready" | "unavailable" | null;
};

function initialPracticeView(): PracticeView {
  return {
    draft: "",
    submittedAnswer: null,
    response: null,
    restoring: true,
    submitting: false,
    retrying: false,
    rewriteOpen: false,
    rewriteDraft: "",
    terminalAnnouncement: null,
  };
}

function analysisDisplayState(
  response: TeachingPracticeResponseData | null,
  submitting: boolean,
  retrying = false,
): "reference" | "pending" | "unavailable" | "demo" | "ready" {
  if (retrying) return "unavailable";
  if (submitting || response?.analysisState === "ANALYSIS_PENDING") {
    return "pending";
  }
  if (response?.analysisState === "DEMO_ONLY") return "demo";
  if (response?.analysisState === "REFERENCE_READY") return "reference";
  if (response?.analysisState === "ANALYSIS_READY" && response.analysis) {
    return "ready";
  }
  return "unavailable";
}

function AnalysisDetails({ analysis }: { analysis: TeachingPracticeAnalysis }) {
  const { text } = useLocale();
  return (
    <div className={styles.personalizedAnalysis}>
      <p className={styles.analysisSummary}>
        {text(analysis.summary.zh, analysis.summary.en)}
      </p>

      {analysis.strengths.length > 0 ? (
        <section className={styles.analysisSection}>
          <h5>{text("你已经写清楚的部分", "What already works")}</h5>
          {analysis.strengths.map((strength, index) => (
            <div data-teaching-strength key={`${strength.en}-${index}`}>
              <p>{text(strength.zh, strength.en)}</p>
              {strength.userAnswerEvidence.map((evidence) => (
                <q data-teaching-evidence key={evidence} lang="en">
                  {evidence}
                </q>
              ))}
            </div>
          ))}
        </section>
      ) : null}

      {analysis.keyImprovement ? (
        <section
          className={styles.analysisSection}
          data-teaching-key-improvement
        >
          <h5>{text("最值得改的一点", "The most useful next change")}</h5>
          <strong>
            {text(
              analysis.keyImprovement.title.zh,
              analysis.keyImprovement.title.en,
            )}
          </strong>
          <p>
            {text(
              analysis.keyImprovement.explanation.zh,
              analysis.keyImprovement.explanation.en,
            )}
          </p>
          <p className={styles.analysisWhy}>
            {text(
              analysis.keyImprovement.whyItMatters.zh,
              analysis.keyImprovement.whyItMatters.en,
            )}
          </p>
          {analysis.keyImprovement.userAnswerEvidence.map((evidence) => (
            <q data-teaching-evidence key={evidence} lang="en">
              {evidence}
            </q>
          ))}
        </section>
      ) : null}

      {analysis.comparisonPoints.length > 0 ? (
        <section className={styles.analysisSection}>
          <h5>{text("两种表达路径怎么不同", "How the two paths differ")}</h5>
          {analysis.comparisonPoints.map((point, index) => (
            <div
              className={styles.comparisonPoint}
              data-teaching-comparison-point
              key={`${point.aspect.en}-${index}`}
            >
              <strong>{text(point.aspect.zh, point.aspect.en)}</strong>
              <p>
                {text(point.referenceFeature.zh, point.referenceFeature.en)}
              </p>
              <p>
                {text(point.learnerDifference.zh, point.learnerDifference.en)}
              </p>
              {point.userAnswerEvidence.map((evidence) => (
                <q data-teaching-evidence key={evidence} lang="en">
                  {evidence}
                </q>
              ))}
            </div>
          ))}
        </section>
      ) : null}

      <p className={styles.nextCheck}>
        <strong>{text("下次自检", "Check next time")}</strong>
        {text(analysis.nextCheck.zh, analysis.nextCheck.en)}
      </p>
      {analysis.uncertainty ? (
        <p className={styles.uncertainty}>
          {text(analysis.uncertainty.zh, analysis.uncertainty.en)}
        </p>
      ) : null}
    </div>
  );
}

function PracticePrompt({
  prompt,
  view,
  onDraft,
  onSubmit,
  onRetry,
  onRewriteDraft,
  onToggleRewrite,
}: {
  prompt: TeachingPracticePrompt;
  view: PracticeView;
  onDraft: (answer: string) => void;
  onSubmit: () => void;
  onRetry: () => void;
  onRewriteDraft: (answer: string) => void;
  onToggleRewrite: () => void;
}) {
  const { text } = useLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  const answered = view.draft.trim().length > 0;
  const submitted = view.submittedAnswer !== null;
  const displayState = analysisDisplayState(
    view.response,
    view.submitting,
    view.retrying,
  );
  const analysis = view.response?.analysis ?? null;
  const canRetry =
    view.response !== null &&
    !view.response.id.startsWith("local:") &&
    view.response.responseMode === "SHORT_TEXT" &&
    (view.response.analysisState === "ANALYSIS_UNAVAILABLE" || view.retrying);
  const canRewrite =
    displayState === "ready" &&
    analysis?.kind === "PERSONALIZED" &&
    Boolean(analysis.keyImprovement);

  const submitAndFocus = () => {
    onSubmit();
    window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>("[data-teaching-answer-heading]")
        ?.focus({ preventScroll: true });
    });
  };

  return (
    <div className={styles.practicePrompt} data-teaching-practice ref={rootRef}>
      <div className={styles.practiceInstruction}>
        <strong>{text(prompt.instructionZh, prompt.instructionEn)}</strong>
        <p lang="en">{prompt.promptEn}</p>
      </div>

      {view.restoring ? (
        <div
          aria-live="polite"
          className={styles.practiceRestoring}
          data-teaching-practice-restoring
          role="status"
        >
          {text("正在恢复你保存的作答…", "Restoring your saved answer…")}
        </div>
      ) : !submitted && prompt.responseMode === "CHOICE" ? (
        <fieldset className={styles.choiceList}>
          <legend className="sr-only">
            {text("选择你的答案", "Choose your answer")}
          </legend>
          {prompt.optionsEn.map((option) => (
            <label key={option}>
              <input
                checked={view.draft === option}
                name={`teaching-practice-${prompt.id}`}
                onChange={() => onDraft(option)}
                type="radio"
                value={option}
              />
              <span lang="en">{option}</span>
            </label>
          ))}
        </fieldset>
      ) : !submitted ? (
        <label className={styles.shortAnswer}>
          <span>{text("先独立写下来", "Write independently first")}</span>
          <textarea
            onChange={(event) => onDraft(event.target.value)}
            placeholder={text(
              "先完成你的英文答案，再查看参考思路…",
              "Complete your answer before revealing the reference…",
            )}
            rows={4}
            value={view.draft}
          />
        </label>
      ) : null}

      {!view.restoring && !submitted ? (
        <Button
          data-teaching-practice-submit
          disabled={!answered}
          onClick={submitAndFocus}
          type="button"
          variant="secondary"
        >
          {text("提交并查看对照", "Submit and compare")}
        </Button>
      ) : null}

      {submitted ? (
        <section
          aria-labelledby={`teaching-answer-${prompt.id}`}
          className={styles.answerReview}
          data-teaching-answer-review
        >
          <header>
            <span>{text("提交后的对照", "Post-answer comparison")}</span>
            <h4
              data-teaching-answer-heading
              id={`teaching-answer-${prompt.id}`}
              tabIndex={-1}
            >
              {text(
                "你的答案与一种可行写法",
                "Your answer and one possible approach",
              )}
            </h4>
          </header>
          <div
            className={styles.answerComparison}
            data-teaching-answer-comparison
          >
            <div className={styles.answerPanel}>
              <span>{text("你的首次答案", "Your first answer")}</span>
              <blockquote data-teaching-submitted-answer lang="en">
                {view.submittedAnswer}
              </blockquote>
            </div>
            <div className={styles.answerPanel}>
              <span>{text("一种可行写法", "One possible approach")}</span>
              <blockquote data-teaching-reference-answer lang="en">
                {prompt.referenceAnswerEn}
              </blockquote>
            </div>
          </div>
          <div
            className={styles.referenceReasoning}
            data-teaching-reference-reasoning
          >
            <Lightbulb aria-hidden="true" size={18} />
            <div>
              <strong>{text("这条思路怎样展开", "How this path works")}</strong>
              <p>
                {text(prompt.referenceReasoningZh, prompt.referenceReasoningEn)}
              </p>
            </div>
          </div>

          {displayState !== "reference" ? (
            <>
              <div
                aria-atomic="true"
                aria-busy={displayState === "pending" ? "true" : undefined}
                aria-live="polite"
                className={
                  displayState === "pending" ? styles.analysisRegion : "sr-only"
                }
                data-state={displayState === "pending" ? "pending" : undefined}
                data-teaching-analysis={
                  displayState === "pending" ? true : undefined
                }
                data-teaching-analysis-announcement={
                  displayState === "pending" ? undefined : true
                }
                role={displayState === "pending" ? "status" : undefined}
              >
                {displayState === "pending"
                  ? text(
                      "正在结合你的答案整理进一步讲解…",
                      "Preparing a closer explanation from your answer…",
                    )
                  : view.terminalAnnouncement === "ready"
                    ? text(
                        "进一步讲解已整理好。",
                        "The closer explanation is ready.",
                      )
                    : view.terminalAnnouncement === "unavailable"
                      ? text(
                          "进一步讲解暂时没有生成。",
                          "The closer explanation is not available yet.",
                        )
                      : ""}
              </div>
              {displayState !== "pending" ? (
                <div
                  className={styles.analysisRegion}
                  data-state={displayState}
                  data-teaching-analysis
                  role="note"
                >
                  {displayState === "demo" ? (
                    <p>
                      {text(
                        "当前只演示讲解会怎样呈现，不评价你的英文质量。你仍可先用上面的参考思路自行检查。",
                        "This view only shows how an explanation may be presented; it does not judge your English. You can still self-check with the approach above.",
                      )}
                    </p>
                  ) : displayState === "ready" && analysis ? (
                    <AnalysisDetails analysis={analysis} />
                  ) : (
                    <div className={styles.unavailableAnalysis}>
                      <p>
                        {text(
                          "进一步讲解暂时没有生成。这次没有足够依据勉强下结论；你的答案和参考思路都已保留，不影响继续学习。",
                          "A closer explanation is not available yet. There is not enough basis to force a conclusion; your answer and the reference approach remain available, and you can keep learning.",
                        )}
                      </p>
                      {canRetry ? (
                        <Button
                          aria-disabled={view.retrying}
                          data-teaching-analysis-retry
                          onClick={onRetry}
                          type="button"
                          variant="secondary"
                        >
                          {view.retrying
                            ? text("正在重新整理…", "Preparing again…")
                            : text(
                                "重新整理个性化讲解",
                                "Prepare the explanation again",
                              )}
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <p className={styles.referenceReadyNote}>
              {text(
                "先对照两种写法，看看它们分别怎样完成题目要求。",
                "Compare the two approaches and notice how each addresses the task.",
              )}
            </p>
          )}

          {canRewrite ? (
            <div className={styles.rewriteArea}>
              <Button
                aria-expanded={view.rewriteOpen}
                onClick={onToggleRewrite}
                type="button"
                variant="ghost"
              >
                {view.rewriteOpen
                  ? text("收起改写", "Hide rewrite")
                  : text(
                      "现在自己改一次（可选）",
                      "Try a rewrite now (optional)",
                    )}
              </Button>
              {view.rewriteOpen ? (
                <label className={styles.rewriteEditor} data-teaching-rewrite>
                  <span>{text("你的改写草稿", "Your rewrite draft")}</span>
                  <textarea
                    aria-label={text("你的改写草稿", "Your rewrite draft")}
                    onChange={(event) => onRewriteDraft(event.target.value)}
                    rows={4}
                    value={view.rewriteDraft}
                  />
                  <small>
                    {text(
                      "这只是本地练习，不会替换上面保存的首次答案。",
                      "This local exercise never replaces the saved first answer above.",
                    )}
                  </small>
                </label>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function MarkdownSection({ section }: { section: TeachingSectionMarkdown }) {
  return (
    <div className={styles.prose} data-teaching-prose>
      <Markdown>{section.markdown}</Markdown>
    </div>
  );
}

function PracticePrompts({
  practicePrompts,
  practiceViews,
  onPracticeDraft,
  onPracticeSubmit,
  onPracticeRetry,
  onRewriteDraft,
  onToggleRewrite,
}: {
  practicePrompts: readonly TeachingPracticePrompt[];
  practiceViews: Readonly<Record<string, PracticeView>>;
  onPracticeDraft: (id: string, answer: string) => void;
  onPracticeSubmit: (prompt: TeachingPracticePrompt) => void;
  onPracticeRetry: (prompt: TeachingPracticePrompt) => void;
  onRewriteDraft: (id: string, answer: string) => void;
  onToggleRewrite: (id: string) => void;
}) {
  const { text } = useLocale();
  return (
    <div className={styles.practiceBlock} data-teaching-block="PRACTICE">
      <p className={styles.practiceLead}>
        {text(
          "先独立作答。提交后，你会立即看到自己的首次答案、另一种可行路径，以及针对这次表达的进一步讲解。",
          "Answer independently. After submitting, compare your saved first answer with another viable path and a closer explanation of this attempt.",
        )}
      </p>
      <div className={styles.practiceList}>
        {practicePrompts.map((prompt) => (
          <PracticePrompt
            key={prompt.id}
            onDraft={(answer) => onPracticeDraft(prompt.id, answer)}
            onRetry={() => onPracticeRetry(prompt)}
            onRewriteDraft={(answer) => onRewriteDraft(prompt.id, answer)}
            onSubmit={() => onPracticeSubmit(prompt)}
            onToggleRewrite={() => onToggleRewrite(prompt.id)}
            prompt={prompt}
            view={practiceViews[prompt.id] ?? initialPracticeView()}
          />
        ))}
      </div>
    </div>
  );
}

type TeachingArticleProps = {
  data: FocusedTeachingData;
  feedbackHref: string;
  paperHref: string;
};

function TeachingArticleContent({
  data,
  feedbackHref,
  paperHref,
}: TeachingArticleProps) {
  const { text } = useLocale();
  const practicePrompts = useMemo(
    () => [...data.practicePrompts],
    [data.practicePrompts],
  );
  const practiceSignature = useMemo(
    () => practicePrompts.map((prompt) => prompt.id).join("|"),
    [practicePrompts],
  );
  const [practiceViews, setPracticeViews] = useState<
    Record<string, PracticeView>
  >(() =>
    Object.fromEntries(
      practicePrompts.map((prompt) => [prompt.id, initialPracticeView()]),
    ),
  );
  const requestGenerations = useRef<Record<string, number>>({});
  const pollTimers = useRef<Record<string, Set<number>>>({});
  const restoreTimers = useRef<Record<string, number>>({});
  const mounted = useRef(true);
  const [contentsOpen, setContentsOpen] = useState(false);
  const sectionSlug = (index: number) => `section-${index + 1}`;
  const [activeAnchor, setActiveAnchor] = useState(sectionSlug(0));
  const sectionSignature = useMemo(
    () => data.sections.map((_, index) => sectionSlug(index)).join("|"),
    [data.sections],
  );

  const clearPoll = (promptId: string) => {
    const timers = pollTimers.current[promptId];
    if (!timers) return;
    for (const timer of timers) window.clearTimeout(timer);
    delete pollTimers.current[promptId];
  };

  const clearRestoreTimer = (promptId: string) => {
    const timer = restoreTimers.current[promptId];
    if (timer === undefined) return;
    window.clearTimeout(timer);
    delete restoreTimers.current[promptId];
  };

  const addPollTimer = (
    promptId: string,
    callback: () => void,
    delay: number,
  ) => {
    const timers =
      pollTimers.current[promptId] ??
      (pollTimers.current[promptId] = new Set<number>());
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
    return timer;
  };

  const applyResponse = (
    response: TeachingPracticeResponseData,
    generation: number,
  ) => {
    if (
      !mounted.current ||
      requestGenerations.current[response.promptId] !== generation
    ) {
      return;
    }
    setPracticeViews((current) => {
      const previous = current[response.promptId] ?? initialPracticeView();
      const wasWaiting =
        previous.submitting ||
        previous.retrying ||
        previous.response?.analysisState === "ANALYSIS_PENDING";
      const terminalAnnouncement =
        wasWaiting && response.analysisState === "ANALYSIS_READY"
          ? "ready"
          : wasWaiting && response.analysisState === "ANALYSIS_UNAVAILABLE"
            ? "unavailable"
            : null;
      return {
        ...current,
        [response.promptId]: {
          ...previous,
          submittedAnswer: response.submittedAnswer,
          response,
          restoring: false,
          submitting: false,
          retrying:
            response.analysisState === "ANALYSIS_PENDING"
              ? previous.retrying
              : false,
          rewriteDraft: previous.rewriteDraft || response.submittedAnswer,
          terminalAnnouncement,
        },
      };
    });
  };

  const markRestoreComplete = (promptId: string, generation: number) => {
    if (
      !mounted.current ||
      requestGenerations.current[promptId] !== generation
    ) {
      return;
    }
    setPracticeViews((current) => ({
      ...current,
      [promptId]: {
        ...(current[promptId] ?? initialPracticeView()),
        restoring: false,
      },
    }));
  };

  const expireRestore = (promptId: string, generation: number) => {
    if (
      !mounted.current ||
      requestGenerations.current[promptId] !== generation
    ) {
      return;
    }
    requestGenerations.current[promptId] = generation + 1;
    markRestoreComplete(promptId, generation + 1);
  };

  const schedulePoll = (
    prompt: TeachingPracticePrompt,
    fallback: TeachingPracticeResponseData,
    generation: number,
  ) => {
    clearPoll(prompt.id);
    const deadline = Date.now() + ANALYSIS_POLL_DEADLINE_MS;
    let latestFallback = fallback;

    const finishUnavailable = () => {
      if (requestGenerations.current[prompt.id] !== generation) return;
      clearPoll(prompt.id);
      applyResponse(
        {
          ...latestFallback,
          analysisState: "ANALYSIS_UNAVAILABLE",
          analysis: null,
        },
        generation,
      );
    };

    const poll = (attempt: number) => {
      if (requestGenerations.current[prompt.id] !== generation) return;
      const remaining = deadline - Date.now();
      if (attempt >= ANALYSIS_MAX_POLL_ATTEMPTS || remaining <= 0) {
        finishUnavailable();
        return;
      }
      addPollTimer(
        prompt.id,
        () => {
          const requestRemaining = deadline - Date.now();
          if (requestRemaining <= 0) {
            finishUnavailable();
            return;
          }
          let timeoutTimer = 0;
          const timeout = new Promise<typeof ANALYSIS_REQUEST_TIMED_OUT>(
            (resolve) => {
              timeoutTimer = addPollTimer(
                prompt.id,
                () => resolve(ANALYSIS_REQUEST_TIMED_OUT),
                Math.min(ANALYSIS_REQUEST_TIMEOUT_MS, requestRemaining),
              );
            },
          );
          void Promise.race([
            learningClient.getTeachingPracticeResponse(
              data.id,
              prompt.id,
              latestFallback,
            ),
            timeout,
          ])
            .then((response) => {
              window.clearTimeout(timeoutTimer);
              pollTimers.current[prompt.id]?.delete(timeoutTimer);
              if (requestGenerations.current[prompt.id] !== generation) return;
              if (Date.now() >= deadline) {
                finishUnavailable();
                return;
              }
              if (
                response === ANALYSIS_REQUEST_TIMED_OUT ||
                response === null
              ) {
                poll(attempt + 1);
                return;
              }
              if (response.analysisState === "ANALYSIS_PENDING") {
                latestFallback = response;
                poll(attempt + 1);
                return;
              }
              clearPoll(prompt.id);
              applyResponse(response, generation);
            })
            .catch(finishUnavailable);
        },
        Math.min(ANALYSIS_POLL_INTERVAL_MS, remaining),
      );
    };

    addPollTimer(prompt.id, finishUnavailable, ANALYSIS_POLL_DEADLINE_MS);
    poll(0);
  };

  useEffect(() => {
    mounted.current = true;

    for (const prompt of practicePrompts) {
      const generation = (requestGenerations.current[prompt.id] ?? 0) + 1;
      requestGenerations.current[prompt.id] = generation;
      clearRestoreTimer(prompt.id);
      const timeout = new Promise<typeof RESTORE_REQUEST_TIMED_OUT>(
        (resolve) => {
          restoreTimers.current[prompt.id] = window.setTimeout(
            () => resolve(RESTORE_REQUEST_TIMED_OUT),
            RESTORE_REQUEST_TIMEOUT_MS,
          );
        },
      );
      void Promise.race([
        learningClient.getTeachingPracticeResponse(data.id, prompt.id),
        timeout,
      ])
        .then((response) => {
          clearRestoreTimer(prompt.id);
          if (response === RESTORE_REQUEST_TIMED_OUT) {
            expireRestore(prompt.id, generation);
            return;
          }
          if (!response) {
            markRestoreComplete(prompt.id, generation);
            return;
          }
          applyResponse(response, generation);
          if (response.analysisState === "ANALYSIS_PENDING") {
            schedulePoll(prompt, response, generation);
          }
        })
        .catch(() => {
          clearRestoreTimer(prompt.id);
          markRestoreComplete(prompt.id, generation);
        });
    }

    return () => {
      mounted.current = false;
      for (const timers of Object.values(pollTimers.current)) {
        for (const timer of timers) window.clearTimeout(timer);
      }
      pollTimers.current = {};
      for (const timer of Object.values(restoreTimers.current)) {
        window.clearTimeout(timer);
      }
      restoreTimers.current = {};
    };
    // The stable signature deliberately represents the prompt set for restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id, practiceSignature]);

  const updatePracticeDraft = (promptId: string, draft: string) => {
    setPracticeViews((current) => ({
      ...current,
      [promptId]: {
        ...(current[promptId] ?? initialPracticeView()),
        draft,
      },
    }));
  };

  const submitPractice = (prompt: TeachingPracticePrompt) => {
    const view = practiceViews[prompt.id];
    const answer = view?.draft ?? "";
    if (!answer.trim() || view?.restoring || view?.submittedAnswer) return;
    clearPoll(prompt.id);
    const generation = (requestGenerations.current[prompt.id] ?? 0) + 1;
    requestGenerations.current[prompt.id] = generation;
    setPracticeViews((current) => ({
      ...current,
      [prompt.id]: {
        ...(current[prompt.id] ?? initialPracticeView()),
        submittedAnswer: answer,
        restoring: false,
        submitting: true,
        rewriteDraft: answer,
        terminalAnnouncement: null,
      },
    }));

    void learningClient
      .submitTeachingPracticeAnswer(data.id, prompt, answer)
      .then((response) => {
        applyResponse(response, generation);
        if (response.analysisState === "ANALYSIS_PENDING") {
          schedulePoll(prompt, response, generation);
        }
      })
      .catch(() => {
        applyResponse(
          {
            id: `local:${data.id}:${prompt.id}`,
            promptId: prompt.id,
            submittedAnswer: answer,
            responseMode: prompt.responseMode,
            analysisState: "ANALYSIS_UNAVAILABLE",
            analysis: null,
          },
          generation,
        );
      });
  };

  const retryPractice = (prompt: TeachingPracticePrompt) => {
    const view = practiceViews[prompt.id];
    if (!view?.response || view.retrying) return;
    clearPoll(prompt.id);
    const generation = (requestGenerations.current[prompt.id] ?? 0) + 1;
    requestGenerations.current[prompt.id] = generation;
    setPracticeViews((current) => ({
      ...current,
      [prompt.id]: {
        ...(current[prompt.id] ?? initialPracticeView()),
        retrying: true,
        terminalAnnouncement: null,
      },
    }));
    void learningClient
      .retryTeachingPracticeAnalysis(view.response)
      .then((response) => {
        applyResponse(response, generation);
        if (response.analysisState === "ANALYSIS_PENDING") {
          schedulePoll(prompt, response, generation);
        }
      })
      .catch(() => {
        applyResponse(
          {
            ...view.response!,
            analysisState: "ANALYSIS_UNAVAILABLE",
            analysis: null,
          },
          generation,
        );
      });
  };

  const updateRewriteDraft = (promptId: string, rewriteDraft: string) => {
    setPracticeViews((current) => ({
      ...current,
      [promptId]: {
        ...(current[promptId] ?? initialPracticeView()),
        rewriteDraft,
      },
    }));
  };

  const toggleRewrite = (promptId: string) => {
    setPracticeViews((current) => {
      const previous = current[promptId] ?? initialPracticeView();
      return {
        ...current,
        [promptId]: { ...previous, rewriteOpen: !previous.rewriteOpen },
      };
    });
  };

  useEffect(() => {
    const sections = data.sections
      .map((_, index) => document.getElementById(sectionSlug(index)))
      .filter((section): section is HTMLElement => Boolean(section));
    if (sections.length === 0 || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              Math.abs(left.boundingClientRect.top) -
              Math.abs(right.boundingClientRect.top),
          );
        const next = visible[0]?.target.id;
        if (next) setActiveAnchor(next);
      },
      { rootMargin: "-18% 0px -68% 0px", threshold: [0, 0.1, 0.5] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [data.sections, sectionSignature]);

  return (
    <article className={styles.article} data-teaching-article>
      <header className={styles.articleHeader}>
        <div className={styles.articleMeta}>
          <span>
            <BookOpenCheck aria-hidden="true" size={15} />
            {text("专项能力教程", "Focused writing tutorial")}
          </span>
          <span>
            {text(
              `约 ${data.estimatedMinutes} 分钟`,
              `About ${data.estimatedMinutes} min`,
            )}
          </span>
        </div>
        <h1>{text(data.titleZh, data.titleEn)}</h1>
        <div className={styles.prose} data-teaching-prose>
          <Markdown>{data.introductionMarkdown}</Markdown>
        </div>
      </header>

      <div className={styles.readingLayout} data-teaching-layout>
        <div className={styles.articleBody} data-teaching-content>
          {data.sections.map((section, sectionIndex) => {
            const slug = sectionSlug(sectionIndex);
            return (
              <section
                aria-labelledby={`${slug}-heading`}
                className={styles.articleSection}
                data-teaching-section
                id={slug}
                key={slug}
              >
                <header className={styles.sectionHeading}>
                  <span aria-hidden="true">
                    {String(sectionIndex + 1).padStart(2, "0")}
                  </span>
                  <h2 id={`${slug}-heading`} tabIndex={-1}>
                    {text(section.titleZh, section.titleEn)}
                  </h2>
                </header>
                <div className={styles.sectionBlocks}>
                  <MarkdownSection section={section} />
                </div>
              </section>
            );
          })}

          <PracticePrompts
            onPracticeDraft={updatePracticeDraft}
            onPracticeRetry={retryPractice}
            onPracticeSubmit={submitPractice}
            onRewriteDraft={updateRewriteDraft}
            onToggleRewrite={toggleRewrite}
            practicePrompts={practicePrompts}
            practiceViews={practiceViews}
          />

          <footer className={styles.articleActions}>
            <div>
              <span>{text("下一步", "Next")}</span>
              <strong>
                {text(
                  "趁方法清晰，完成整份专项训练卷",
                  "Apply the method in the complete focused paper",
                )}
              </strong>
              <p>
                {text(
                  "训练卷会换用新的语境，检验你能否独立迁移，而不是照抄教程例句。",
                  "The paper uses new contexts to test independent transfer rather than copying tutorial examples.",
                )}
              </p>
            </div>
            <div>
              <ActionLink href={feedbackHref} variant="secondary">
                {text("返回详细批改", "Back to detailed feedback")}
              </ActionLink>
              <ActionLink href={paperHref} size="lg" trailing={false}>
                {text("开始60分钟训练卷", "Start the 60-minute paper")}
                <ArrowRight aria-hidden="true" size={17} />
              </ActionLink>
            </div>
          </footer>
        </div>

        <div className={styles.contentsColumn} data-teaching-toc-column>
          <button
            aria-controls="adaptive-teaching-contents"
            aria-expanded={contentsOpen}
            className={styles.contentsToggle}
            data-teaching-toc-toggle
            onClick={() => setContentsOpen((open) => !open)}
            type="button"
          >
            <span>{text("本文目录", "In this tutorial")}</span>
            <ChevronDown aria-hidden="true" size={17} />
          </button>
          <nav
            aria-label={text("专项教学目录", "Focused teaching contents")}
            className={styles.contents}
            data-open={contentsOpen}
            data-teaching-toc
            id="adaptive-teaching-contents"
          >
            <p>{text("本文目录", "In this tutorial")}</p>
            <ol>
              {data.sections.map((section, index) => {
                const slug = sectionSlug(index);
                return (
                  <li key={slug}>
                    <a
                      aria-current={
                        activeAnchor === slug ? "location" : undefined
                      }
                      href={`#${slug}`}
                      onClick={(event) => {
                        event.preventDefault();
                        const link = event.currentTarget;
                        const disclosure = document.querySelector(
                          "[data-teaching-toc-toggle]",
                        );
                        const usesDisclosure =
                          disclosure instanceof HTMLElement &&
                          window.getComputedStyle(disclosure).display !==
                            "none";
                        setActiveAnchor(slug);
                        setContentsOpen(false);
                        window.history.replaceState(
                          window.history.state,
                          "",
                          `#${slug}`,
                        );
                        const focusDestination = () => {
                          const heading = document.getElementById(
                            `${slug}-heading`,
                          );
                          document.getElementById(slug)?.scrollIntoView({
                            behavior: "instant",
                            block: "start",
                          });
                          heading?.focus({ preventScroll: true });
                        };
                        if (usesDisclosure) {
                          window.requestAnimationFrame(() =>
                            window.requestAnimationFrame(focusDestination),
                          );
                        } else {
                          document
                            .getElementById(slug)
                            ?.scrollIntoView({ block: "start" });
                          link.focus({ preventScroll: true });
                        }
                      }}
                    >
                      <span aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {text(section.titleZh, section.titleEn)}
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </div>
    </article>
  );
}

export function TeachingArticle(props: TeachingArticleProps) {
  return <TeachingArticleContent key={props.data.id} {...props} />;
}
