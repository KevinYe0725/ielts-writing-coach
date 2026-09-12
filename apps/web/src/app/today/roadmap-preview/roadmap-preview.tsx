"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  FileCheck2,
  PenLine,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useMemo, useReducer } from "react";

import { useLocale } from "@/components/locale-provider";
import { useClientReady } from "@/components/use-client-ready";
import { cn } from "@/components/utils";

import {
  createRoadmapState,
  roadmapReducer,
  type RoadmapStep,
} from "./roadmap-state";
import styles from "./roadmap.module.css";

type CourseStep = RoadmapStep & {
  readonly number: string;
  readonly labelZh: string;
  readonly labelEn: string;
  readonly detailZh: string;
  readonly detailEn: string;
  readonly actionZh: string;
  readonly actionEn: string;
  readonly href: string;
  readonly Icon: typeof PenLine;
};

const courseSteps: readonly CourseStep[] = [
  {
    id: "first",
    state: "done",
    number: "01",
    labelZh: "首写",
    labelEn: "First draft",
    detailZh: "先把自己的观点完整写出来，留下可以回看的起点。",
    detailEn:
      "Write your own position first and keep a starting point to revisit.",
    actionZh: "查看首写",
    actionEn: "View first draft",
    href: "/write?cycle=cycle-demo",
    Icon: PenLine,
  },
  {
    id: "feedback",
    state: "done",
    number: "02",
    labelZh: "批改",
    labelEn: "Feedback",
    detailZh: "对照原文看清真正需要修正的地方，知道问题为什么影响表达。",
    detailEn:
      "Compare the report with your words and see why each change matters.",
    actionZh: "查看批改",
    actionEn: "View feedback",
    href: "/feedback?cycle=cycle-demo",
    Icon: FileCheck2,
  },
  {
    id: "lesson",
    state: "done",
    number: "03",
    labelZh: "专项教学",
    labelEn: "Focused lesson",
    detailZh: "围绕一个薄弱能力，先理解方法，再换语境尝试。",
    detailEn: "Learn one focused skill, then try it in a new context.",
    actionZh: "继续教学",
    actionEn: "Open lesson",
    href: "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
    Icon: BookOpenCheck,
  },
  {
    id: "rewrite",
    state: "current",
    number: "04",
    labelZh: "延迟重写",
    labelEn: "Delayed rewrite",
    detailZh: "隔开一段时间，不看原来的改法，重新写一次同一篇作文。",
    detailEn:
      "Return after a pause and rewrite the same essay without looking at the suggestions.",
    actionZh: "开始重写",
    actionEn: "Start rewrite",
    href: "/rewrite?cycle=cycle-demo&task=rewrite-primary-language",
    Icon: RefreshCw,
  },
  {
    id: "transfer",
    state: "upcoming",
    number: "05",
    labelZh: "陌生题迁移",
    labelEn: "Transfer",
    detailZh: "换一道没有见过的题，检查这项能力是否真正属于你。",
    detailEn:
      "Try an unfamiliar prompt and see whether the skill now belongs to you.",
    actionZh: "了解迁移",
    actionEn: "Explore transfer",
    href: "/transfer?cycle=cycle-demo&task=transfer-task",
    Icon: Sparkles,
  },
];

function StepDetails({ step }: { step: CourseStep }) {
  const { text } = useLocale();
  const reducedMotion = useReducedMotion();
  const Icon = step.Icon;
  const current = step.state === "current";
  const detailsMotion = reducedMotion
    ? { initial: false as const, transition: { duration: 0 } }
    : {
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 8 },
        initial: { opacity: 0, y: 8 },
        transition: { duration: 0.18, ease: "easeOut" as const },
      };
  return (
    <motion.div
      {...detailsMotion}
      className={styles.details}
      data-roadmap-details
      key={step.id}
      data-roadmap-motion={reducedMotion ? "reduced" : "full"}
    >
      <div className={styles.detailIcon} data-state={step.state}>
        <Icon aria-hidden="true" size={22} />
      </div>
      <div className={styles.detailCopy}>
        <p className={styles.detailKicker}>
          {current
            ? text("现在进行中", "Current step")
            : step.state === "done"
              ? text("已经完成", "Completed")
              : text("接下来", "Up next")}
        </p>
        <h2>{text(step.labelZh, step.labelEn)}</h2>
        <p>{text(step.detailZh, step.detailEn)}</p>
      </div>
      <Link className={styles.detailAction} href={step.href}>
        {text(step.actionZh, step.actionEn)}
        <ArrowRight aria-hidden="true" size={17} />
      </Link>
    </motion.div>
  );
}

function RoadmapNode({
  step,
  selected,
  onSelect,
}: {
  step: CourseStep;
  selected: boolean;
  onSelect: () => void;
}) {
  const { text } = useLocale();
  const reducedMotion = useReducedMotion();
  return (
    <li
      className={cn(styles.node, selected && styles.nodeSelected)}
      data-roadmap-node={step.id}
      data-state={step.state}
    >
      <button
        aria-current={step.state === "current" ? "step" : undefined}
        aria-pressed={selected}
        className={styles.nodeButton}
        onClick={onSelect}
        type="button"
      >
        <span className={styles.nodeMarker}>
          {step.state === "done" ? (
            <Check aria-hidden="true" size={17} strokeWidth={2.5} />
          ) : (
            <span aria-hidden="true">{step.number}</span>
          )}
          {step.state === "current" && !reducedMotion ? (
            <motion.span
              animate={{ opacity: [0.25, 0], scale: [1, 1.45] }}
              className={styles.nodePulse}
              transition={{ duration: 1.8, ease: "easeOut", repeat: Infinity }}
            />
          ) : null}
        </span>
        <span className={styles.nodeText}>
          <strong>{text(step.labelZh, step.labelEn)}</strong>
          <span>{step.number}</span>
        </span>
      </button>
    </li>
  );
}

export function CourseRoadmapPreview() {
  const { text } = useLocale();
  const reducedMotion = useReducedMotion();
  const interactive = useClientReady();
  const [state, dispatch] = useReducer(
    (
      current: ReturnType<typeof createRoadmapState>,
      action: Parameters<typeof roadmapReducer>[1],
    ) => roadmapReducer(current, action),
    courseSteps,
    createRoadmapState,
  );
  const selected = useMemo(
    () =>
      courseSteps.find((step) => step.id === state.selectedId) ??
      courseSteps[0]!,
    [state.selectedId],
  );
  const completedCount = courseSteps.filter(
    (step) => step.state === "done",
  ).length;
  const progress = Math.round((completedCount / courseSteps.length) * 100);

  return (
    <div
      className={styles.page}
      data-course-roadmap
      data-roadmap-interactive={interactive ? "true" : "false"}
    >
      <header className={styles.hero}>
        <Link className={styles.back} href="/today">
          <ArrowLeft aria-hidden="true" size={16} />
          {text("回到今天", "Back to Today")}
        </Link>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            {text("我的写作路径", "My writing path")}
          </p>
          <h1>
            {text(
              "一篇作文，走完一次完整训练。",
              "One essay, one complete learning loop.",
            )}
          </h1>
          <p>
            {text(
              "每一步只做一件事：先写出来，再理解、修正，最后换题验证。",
              "Each step has one job: write, understand, revise, then transfer the skill.",
            )}
          </p>
        </div>
        <div className={styles.heroMeta}>
          <span>{text("当前作文", "Current essay")}</span>
          <strong>
            {text(
              "儿童是否应在小学开始学习外语",
              "Should children start learning a foreign language in primary school?",
            )}
          </strong>
        </div>
      </header>

      <div className={styles.content}>
        <section
          className={styles.progressSummary}
          aria-label={text("课程进度", "Course progress")}
        >
          <div>
            <p>{text("训练进度", "Training progress")}</p>
            <strong>
              {completedCount} <span>/ {courseSteps.length}</span>
            </strong>
          </div>
          <div className={styles.progressTrack} aria-hidden="true">
            <motion.span
              animate={{ width: `${progress}%` }}
              initial={reducedMotion ? false : { width: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            />
          </div>
          <p className={styles.progressHint}>
            {text(
              "当前正在重写，完成后再做陌生题迁移。",
              "You are rewriting now; transfer comes after this step.",
            )}
          </p>
        </section>

        <section
          className={styles.roadmapSection}
          aria-labelledby="roadmap-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>
                {text("学习路线", "Learning path")}
              </p>
              <h2 id="roadmap-title">
                {text(
                  "从第一版，到真正会用。",
                  "From a first draft to a transferable skill.",
                )}
              </h2>
            </div>
            <span className={styles.freeExplore}>
              {text("可以随时查看其他步骤", "Explore any step anytime")}
            </span>
          </div>

          <ol className={styles.roadmap} data-roadmap-path>
            {courseSteps.map((step) => (
              <RoadmapNode
                key={step.id}
                onSelect={() => dispatch({ type: "select", id: step.id })}
                selected={step.id === state.selectedId}
                step={step}
              />
            ))}
            <motion.span
              data-roadmap-progress="horizontal"
              className={cn(
                styles.roadmapProgress,
                styles.roadmapProgressHorizontal,
              )}
              aria-hidden="true"
              initial={reducedMotion ? false : { scaleX: 0 }}
              animate={{ scaleX: progress / 100 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            />
            <motion.span
              data-roadmap-progress="vertical"
              aria-hidden="true"
              className={cn(
                styles.roadmapProgress,
                styles.roadmapProgressVertical,
              )}
              initial={reducedMotion ? false : { scaleY: 0 }}
              animate={{ scaleY: progress / 100 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            />
          </ol>

          <AnimatePresence initial={false} mode="wait">
            <StepDetails step={selected} />
          </AnimatePresence>
        </section>

        <section className={styles.todayFocus} aria-labelledby="focus-title">
          <div className={styles.focusMark} aria-hidden="true">
            <PenLine size={19} />
          </div>
          <div>
            <p className={styles.eyebrow}>
              {text("今天只做这一件事", "One focus for today")}
            </p>
            <h2 id="focus-title">
              {text(
                "不看提示，把同一个观点重新写清楚。",
                "Rewrite the same idea without looking at the suggestions.",
              )}
            </h2>
            <p>
              {text(
                "这一步不是重新考试，而是检查刚学会的方法能不能独立使用。",
                "This is not another exam. It checks whether you can use the method independently.",
              )}
            </p>
          </div>
          <Link
            className={styles.primaryAction}
            href="/rewrite?cycle=cycle-demo&task=rewrite-primary-language"
          >
            {text("开始延迟重写", "Start rewrite")}
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </section>
      </div>
    </div>
  );
}
