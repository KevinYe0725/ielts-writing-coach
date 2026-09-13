"use client";

import { useReducer, useRef, type Dispatch } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CornerDownRight,
  MoveUpRight,
  PenLine,
} from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import {
  createPreviewState,
  previewReducer,
  type PreviewAction,
  type PreviewState,
  type PreviewStep,
  type PreviewView,
} from "./preview-state";
import styles from "./preview.module.css";

type InteractionProps = {
  state: PreviewState;
  dispatch: Dispatch<PreviewAction>;
};
const existingLesson =
  "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective";

function SentenceExample({ state, dispatch }: InteractionProps) {
  const { text } = useLocale();
  const expanded = state.example === "expanded";
  return (
    <section
      className={styles.example}
      aria-label={text("教学例句", "Teaching example")}
    >
      <div className={styles.exampleToolbar}>
        <span>{text("远程办公", "Remote work")}</span>
        <div
          className={styles.sentenceToggle}
          role="group"
          aria-label={text("对比例句", "Compare examples")}
        >
          <button
            type="button"
            aria-pressed={!expanded}
            onClick={() => dispatch({ type: "example", value: "original" })}
          >
            {text("原始表达", "Before")}
          </button>
          <button
            type="button"
            aria-pressed={expanded}
            onClick={() => dispatch({ type: "example", value: "expanded" })}
          >
            {text("展开之后", "Developed")}
          </button>
        </div>
      </div>
      <blockquote
        className={styles.sentence}
        key={state.example}
        lang="en"
        data-prototype-sentence
      >
        {expanded ? (
          <>
            Remote work can <mark>reduce office interruptions</mark>, giving
            employees <mark>longer periods for focused tasks</mark> and helping
            them work more efficiently.
          </>
        ) : (
          <>
            Remote work is flexible,{" "}
            <span className={styles.unsupportedLink}>so</span> employees are
            more productive.
          </>
        )}
      </blockquote>
      <div
        className={styles.reasoningPath}
        aria-label={text("这句话的推理过程", "The reasoning in this sentence")}
      >
        <span>
          {expanded
            ? text("减少打断", "Fewer interruptions")
            : text("远程办公", "Remote work")}
        </span>
        <ArrowRight aria-hidden="true" size={16} />
        {expanded ? (
          <strong>{text("保留专注时间", "Time to focus")}</strong>
        ) : (
          <button
            type="button"
            onClick={() => dispatch({ type: "example", value: "expanded" })}
          >
            {text("中间发生了什么？", "What happens in between?")}
          </button>
        )}
        <ArrowRight aria-hidden="true" size={16} />
        <span>{text("更高效地工作", "More efficient work")}</span>
      </div>
      <p className={styles.exampleTakeaway}>
        <CornerDownRight aria-hidden="true" size={19} />
        {expanded
          ? text(
              "增加的是解释，不是更复杂的词。",
              "The improvement is in the explanation, not harder vocabulary.",
            )
          : text(
              "so 连接了两个判断，但没有解释变化怎样发生。",
              "So connects two claims without explaining how the change happens.",
            )}
      </p>
    </section>
  );
}

function ExploreExplanation({ state, dispatch }: InteractionProps) {
  const { text } = useLocale();
  return (
    <section
      className={styles.explanation}
      aria-label={text("进一步理解", "Explore the idea")}
    >
      <div
        className={styles.lenses}
        role="group"
        aria-label={text("选择讲解", "Choose an explanation")}
      >
        {(
          [
            ["why", "为什么这样写", "Why it works"],
            ["transfer", "换个话题", "Another context"],
            ["limits", "什么情况下不适用", "When it does not apply"],
          ] as const
        ).map(([value, zh, en]) => (
          <button
            key={value}
            type="button"
            aria-expanded={state.lens === value}
            aria-controls="preview-explanation"
            onClick={() => dispatch({ type: "lens", value })}
          >
            {text(zh, en)}
            <ChevronDown aria-hidden="true" size={15} />
          </button>
        ))}
      </div>
      <div
        id="preview-explanation"
        className={styles.explanationBody}
        hidden={state.lens === null}
      >
        {state.lens === "why" ? (
          <>
            <h2>
              {text(
                "让读者看见“怎么发生”。",
                "Show the reader how it happens.",
              )}
            </h2>
            <p>
              {text(
                "“更灵活”和“效率更高”之间还缺一个过程。补上“减少打断，让人有时间专注”，读者才知道这个结论从哪里来。",
                "Flexibility does not automatically lead to productivity. Fewer interruptions and longer stretches of concentration explain a plausible path between them.",
              )}
            </p>
            <p className={styles.takeaway}>
              {text(
                "自检：删掉这段解释，推理有没有损失？",
                "Self-check: if you remove the explanation, does the reasoning lose anything?",
              )}
            </p>
          </>
        ) : null}
        {state.lens === "transfer" ? (
          <>
            <h2>
              {text(
                "同一个方法，不同的中间过程。",
                "Same method. A different mechanism.",
              )}
            </h2>
            <blockquote lang="en">
              Public libraries give residents access to books they may not be
              able to afford, allowing them to explore subjects independently.
            </blockquote>
            <p>
              {text(
                "图书馆的作用是降低获取资料的障碍，不是减少工作打断。迁移的是追问方法，不是照搬上一句。",
                "Libraries reduce barriers to accessing materials, not interruptions at work. Transfer the question you ask, rather than copy the earlier sentence.",
              )}
            </p>
          </>
        ) : null}
        {state.lens === "limits" ? (
          <>
            <h2>
              {text(
                "解释清楚，不等于保证结果。",
                "A clear explanation is not a guarantee.",
              )}
            </h2>
            <p>
              {text(
                "不是所有人都能在家专注。所以例句用了 can，而不是 always。选一个合理的过程，再检查它依赖什么条件。",
                "Not everyone can concentrate at home, so the example uses can, not always. Choose a plausible process and consider the conditions it depends on.",
              )}
            </p>
            <p>
              {text(
                "比较政策、表达立场时，仍然要先完成题目要求。因果解释只是展开理由的一种方法。",
                "When comparing policies or stating a position, address that task first. A causal explanation is one way to develop a reason.",
              )}
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}

function WritingSpace({ state, dispatch }: InteractionProps) {
  const { text } = useLocale();
  const reviewRef = useRef<HTMLDivElement>(null);
  const compare = () => {
    dispatch({ type: "compare" });
    if (!state.comparisonOpen)
      window.requestAnimationFrame(() =>
        reviewRef.current?.focus({ preventScroll: true }),
      );
  };
  return (
    <section
      className={styles.writing}
      aria-labelledby="preview-writing-heading"
    >
      <span className={styles.writingLabel}>
        <PenLine size={16} aria-hidden="true" />
        {text("动笔试试", "Try the idea")}
      </span>
      <h2 id="preview-writing-heading">
        {text("补上你自己的中间一步。", "Write your own missing link.")}
      </h2>
      <p>
        {text(
          "如果员工能自主安排工作时间，为什么可能做得更好？用一句英文解释其中的过程。",
          "Why might choosing their own working hours help employees work better? Explain the process in one English sentence.",
        )}
      </p>
      <label className={styles.editor}>
        <span className="sr-only">
          {text("你的英文尝试", "Your English attempt")}
        </span>
        <textarea
          value={state.draft}
          onChange={(event) =>
            dispatch({ type: "draft", value: event.target.value })
          }
          rows={5}
          maxLength={4000}
          placeholder={text(
            "从一个具体的变化写起…",
            "Start with a specific change…",
          )}
          lang="en"
        />
      </label>
      <div className={styles.writeActions}>
        <button
          type="button"
          className={styles.primary}
          disabled={!state.draft.trim()}
          onClick={compare}
          aria-expanded={state.comparisonOpen}
          aria-controls={
            state.comparisonOpen ? "preview-comparison" : undefined
          }
        >
          {state.comparisonOpen
            ? text("收起对照", "Hide comparison")
            : state.sampleAnswer
              ? text("看示例解析", "See sample feedback")
              : text("对照写法", "Compare approaches")}
          <ArrowRight aria-hidden="true" size={17} />
        </button>
        <button
          type="button"
          className={styles.textButton}
          onClick={() => dispatch({ type: "sample" })}
        >
          {state.draft
            ? text("替换为示例", "Replace with sample")
            : text("先用示例体验", "Try a sample first")}
        </button>
      </div>
      {state.comparisonOpen ? (
        <div
          className={styles.comparison}
          id="preview-comparison"
          tabIndex={-1}
          ref={reviewRef}
          data-prototype-comparison
        >
          <h3>
            {state.sampleAnswer
              ? text("示例解析", "Sample feedback")
              : text("对照自检", "Reflect on your approach")}
          </h3>
          {state.sampleAnswer ? (
            <>
              <p>
                {text(
                  "这句示例给出了立场，但 beneficial 仍然只是在重复“有好处”，没有增加中间过程。",
                  "This sample states a position, but beneficial simply repeats the positive judgment. It does not add an intermediate process.",
                )}
              </p>
              <p>
                {text(
                  "可以保留立场，再说明：员工会怎样利用时间上的自由？",
                  "Keep the position, then explain how employees might use that freedom over their time.",
                )}
              </p>
            </>
          ) : (
            <p>
              {text(
                "先看两种表达怎样解释过程。这里不对你的答案评分。",
                "Compare how the two approaches explain the process. This preview does not grade your answer.",
              )}
            </p>
          )}
          <details className={styles.reference}>
            <summary>{text("一种可行写法", "One possible approach")}</summary>
            <blockquote lang="en">
              Flexible schedules allow employees to reserve demanding tasks for
              the hours when they concentrate best.
            </blockquote>
            <p>
              {text(
                "它说明时间安排如何改变，而不只是重复效率会提高。你也可以选择其他合理的解释。",
                "This explains a change in scheduling instead of repeating the outcome. Other plausible explanations are possible.",
              )}
            </p>
          </details>
          <p className={styles.nextQuestion}>
            {text(
              "再问自己：我写的是一个新过程，还是原观点的同义表达？",
              "Ask yourself: have I added a process, or only restated my claim?",
            )}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function TeachingDesignPreview({
  initialView,
}: {
  initialView: PreviewView;
}) {
  const [state, dispatch] = useReducer(
    previewReducer,
    initialView,
    createPreviewState,
  );
  const { text } = useLocale();
  const focusTitle = useRef<HTMLHeadingElement>(null);
  const steps: readonly { id: PreviewStep; zh: string; en: string }[] = [
    { id: "notice", zh: "看见缺口", en: "Notice the gap" },
    { id: "build", zh: "理解展开", en: "Understand the link" },
    { id: "try", zh: "自己写一次", en: "Try it yourself" },
  ];
  const stepIndex = steps.findIndex((step) => step.id === state.step);
  const setStep = (value: PreviewStep) => {
    dispatch({ type: "step", value });
    if (value === "build") dispatch({ type: "example", value: "expanded" });
    window.requestAnimationFrame(() =>
      focusTitle.current?.focus({ preventScroll: true }),
    );
  };
  const chooseView = (value: PreviewView) => {
    dispatch({ type: "view", value });
    const url = new URL(window.location.href);
    url.searchParams.set("view", value);
    window.history.replaceState(window.history.state, "", url);
  };
  return (
    <div className={styles.preview} data-teaching-design={state.view}>
      <div className={styles.previewBar}>
        <a href={existingLesson} className={styles.back}>
          <ArrowLeft size={16} aria-hidden="true" />
          {text("现有教学", "Current tutorial")}
        </a>
        <div
          className={styles.designSwitch}
          role="group"
          aria-label={text("切换设计方案", "Compare designs")}
        >
          <button
            type="button"
            aria-pressed={state.view === "workbench"}
            onClick={() => chooseView("workbench")}
          >
            <span>A</span>
            {text("例句工作台", "Writing workbench")}
          </button>
          <button
            type="button"
            aria-pressed={state.view === "focus"}
            onClick={() => chooseView("focus")}
          >
            <span>B</span>
            {text("一屏一概念", "One idea at a time")}
          </button>
        </div>
        <span className={styles.prototypeNote}>
          {text(
            "交互原型 · 不保存学习记录",
            "Prototype · no learning records saved",
          )}
        </span>
      </div>

      {state.view === "workbench" ? (
        <>
          <header className={styles.heading}>
            <div>
              <p className={styles.eyebrow}>
                {text("论证展开", "Developing an argument")}
              </p>
              <h1>{text("从结论，到解释。", "From a claim to a reason.")}</h1>
            </div>
            <p>
              {text(
                "看见中间发生了什么，\n再把它写出来。",
                "See what happens in between.\nThen put it into words.",
              )}
            </p>
          </header>
          <div className={styles.workbench}>
            <div className={styles.lessonDesk}>
              <SentenceExample state={state} dispatch={dispatch} />
              <ExploreExplanation state={state} dispatch={dispatch} />
            </div>
            <WritingSpace state={state} dispatch={dispatch} />
          </div>
        </>
      ) : (
        <div className={styles.focusMode}>
          <nav
            className={styles.stepNav}
            aria-label={text(
              "本课内容，可自由切换",
              "Lesson sections, freely navigable",
            )}
          >
            {steps.map((step, index) => (
              <button
                type="button"
                key={step.id}
                aria-current={state.step === step.id ? "step" : undefined}
                onClick={() => setStep(step.id)}
              >
                <span aria-hidden="true">{index + 1}</span>
                {text(step.zh, step.en)}
              </button>
            ))}
          </nav>
          <div className={styles.focusStage}>
            <header className={styles.focusHeading}>
              <p className={styles.eyebrow}>
                {text("论证展开", "Developing an argument")}
              </p>
              <h1 ref={focusTitle} tabIndex={-1}>
                {state.step === "notice"
                  ? text(
                      "“灵活”，为什么等于“高效”？",
                      "Does flexible always mean productive?",
                    )
                  : state.step === "build"
                    ? text(
                        "把中间发生的事，说出来。",
                        "Show what happens in between.",
                      )
                    : text(
                        "这次，用你自己的解释。",
                        "Now explain it in your own words.",
                      )}
              </h1>
              <p>
                {state.step === "notice"
                  ? text(
                      "先看一句话，找找读者还不知道的那一步。",
                      "Look at one sentence. What does the reader still need to know?",
                    )
                  : state.step === "build"
                    ? text(
                        "留意新增的内容，怎样让结论有了依据。",
                        "Notice how the new information supports the conclusion.",
                      )
                    : text(
                        "不用背刚才的句子，保留追问的方法就够了。",
                        "Keep the question you learned to ask, not the sentence you just saw.",
                      )}
              </p>
            </header>
            {state.step === "try" ? (
              <WritingSpace state={state} dispatch={dispatch} />
            ) : (
              <>
                <SentenceExample state={state} dispatch={dispatch} />
                {state.step === "build" ? (
                  <ExploreExplanation state={state} dispatch={dispatch} />
                ) : (
                  <p className={styles.focusHint}>
                    {state.example === "expanded"
                      ? text(
                          "可以切回原始表达，看看删去中间一步会怎样。",
                          "Switch to Before and notice what disappears with the missing link.",
                        )
                      : text(
                          "试着点开中间的缺口，或切换到“展开之后”。",
                          "Open the gap in the middle, or switch to Developed.",
                        )}
                  </p>
                )}
              </>
            )}
          </div>
          <div className={styles.focusControls}>
            <button
              type="button"
              className={styles.textButton}
              disabled={stepIndex === 0}
              onClick={() => setStep(steps[stepIndex - 1]!.id)}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {text("上一节", "Previous")}
            </button>
            {stepIndex < steps.length - 1 ? (
              <button
                type="button"
                className={styles.primary}
                onClick={() => setStep(steps[stepIndex + 1]!.id)}
              >
                {stepIndex === 0
                  ? text("看看怎样展开", "Explore the explanation")
                  : text("我来试试", "Let me try")}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            ) : (
              <a className={styles.finishLink} href={existingLesson}>
                {text("返回现有课程", "Back to the current lesson")}
                <MoveUpRight size={16} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      )}
      <footer className={styles.previewFooter}>
        <span>
          {state.view === "workbench"
            ? text(
                "A · 例句、讲解与尝试同时可见",
                "A · Example, explanation and writing together",
              )
            : text(
                "B · 一次聚焦一个问题，自由前进或返回",
                "B · One question at a time, with free navigation",
              )}
        </span>
        <span>
          {text(
            "两版内容相同，切换不会丢失当前草稿。",
            "Same content. Switching designs keeps your draft.",
          )}
        </span>
      </footer>
    </div>
  );
}
