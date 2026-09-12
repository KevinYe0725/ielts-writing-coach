"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Check,
  CircleHelp,
  FileCheck2,
  LockKeyhole,
  PenLine,
  RefreshCw,
  Sparkles,
  Target,
  type LucideIcon,
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
import {
  flattenRoadmapUnits,
  roadmapProgress,
  type RoadmapMapNode,
  type RoadmapNodeKind,
  type RoadmapNodeState,
  type RoadmapUnit,
} from "./roadmap-map";
import styles from "./roadmap.module.css";

type CourseNode = Omit<RoadmapMapNode, "unitId"> & {
  readonly number: string;
  readonly labelZh: string;
  readonly labelEn: string;
  readonly detailZh: string;
  readonly detailEn: string;
  readonly actionZh: string;
  readonly actionEn: string;
  readonly href: string;
  readonly Icon: LucideIcon;
  readonly position: "one" | "two" | "three" | "four" | "branch";
};

type CourseUnit = Omit<RoadmapUnit, "nodes"> & {
  readonly nodes: readonly CourseNode[];
  readonly tone: "mint" | "sun" | "sky";
  readonly summaryZh: string;
  readonly summaryEn: string;
};

const courseUnits: readonly CourseUnit[] = [
  {
    id: "notice",
    titleZh: "看懂一条论证",
    titleEn: "See the argument",
    summaryZh: "从你的首写出发，找到观点、原因和证据如何连起来。",
    summaryEn:
      "Start with your draft and see how a position, reason, and evidence connect.",
    tone: "mint",
    nodes: [
      {
        id: "first",
        kind: "lesson",
        state: "completed",
        number: "01",
        labelZh: "写下第一版",
        labelEn: "First draft",
        detailZh: "先把自己的观点完整写出来，留下可以回看的起点。",
        detailEn:
          "Write your own position first and keep a starting point to revisit.",
        actionZh: "查看首写",
        actionEn: "View first draft",
        href: "/write?cycle=cycle-demo",
        Icon: PenLine,
        position: "one",
      },
      {
        id: "feedback",
        kind: "practice",
        state: "completed",
        number: "02",
        labelZh: "看懂批改",
        labelEn: "Read feedback",
        detailZh: "对照原文看清真正需要修正的地方，知道问题为什么影响表达。",
        detailEn:
          "Compare the report with your words and see why each change matters.",
        actionZh: "查看批改",
        actionEn: "View feedback",
        href: "/feedback?cycle=cycle-demo",
        Icon: FileCheck2,
        position: "two",
      },
      {
        id: "lesson",
        kind: "lesson",
        state: "completed",
        number: "03",
        labelZh: "拆开好句子",
        labelEn: "Unpack a strong sentence",
        detailZh: "围绕你的薄弱能力，先理解方法，再换一个语境尝试。",
        detailEn: "Learn one focused skill, then try it in a new context.",
        actionZh: "继续教学",
        actionEn: "Open lesson",
        href: "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
        Icon: BookOpenCheck,
        position: "three",
      },
      {
        id: "notice-checkpoint",
        kind: "milestone",
        state: "completed",
        number: "✓",
        labelZh: "看见自己的模式",
        labelEn: "Spot your pattern",
        detailZh: "你已经知道问题在哪里，下一步要把这套方法写回自己的句子。",
        detailEn:
          "You can now name the gap. Next, put the method back into your own sentence.",
        actionZh: "回看总结",
        actionEn: "Review the recap",
        href: "/feedback?cycle=cycle-demo",
        Icon: BadgeCheck,
        position: "four",
      },
    ],
  },
  {
    id: "build",
    titleZh: "把方法写成句子",
    titleEn: "Build the sentence",
    summaryZh: "先独立重写，再沿着分支补上论证、语法和搭配。",
    summaryEn:
      "Rewrite independently, then choose the branch that strengthens your argument.",
    tone: "sun",
    nodes: [
      {
        id: "rewrite",
        kind: "practice",
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
        position: "one",
      },
      {
        id: "mechanism",
        kind: "lesson",
        state: "available",
        number: "05",
        labelZh: "补上论证",
        labelEn: "Strengthen the why",
        detailZh:
          "把“我认为”往前推进一步：说明为什么、对谁有影响，以及结果是什么。",
        detailEn:
          "Push beyond “I think” by showing why it matters, for whom, and what follows.",
        actionZh: "练习论证",
        actionEn: "Practice reasoning",
        href: "/lesson?cycle=cycle-demo&lesson=lesson-collocation-perspective",
        Icon: Target,
        position: "two",
      },
      {
        id: "collocation-drill",
        kind: "practice",
        state: "available",
        number: "06",
        labelZh: "写出自然搭配",
        labelEn: "Make it natural",
        detailZh:
          "用一个新话题复现刚学的句框，检查表达是否自然、准确而且有变化。",
        detailEn:
          "Reuse the sentence frame on a fresh topic and check that it is natural, accurate, and varied.",
        actionZh: "开始练习",
        actionEn: "Start practice",
        href: "/transfer?cycle=cycle-demo&task=transfer-task",
        Icon: Sparkles,
        position: "three",
      },
      {
        id: "grammar-branch",
        kind: "branch",
        state: "available",
        number: "B",
        labelZh: "句子控制",
        labelEn: "Sentence control",
        detailZh:
          "如果你常在主谓一致、连接词或搭配上失分，可以从这里走一条支线。",
        detailEn:
          "Take this branch when agreement, linking words, or collocation is costing you marks.",
        actionZh: "进入句子支线",
        actionEn: "Open sentence branch",
        href: "/lesson?cycle=cycle-collocation-control&lesson=lesson-collocation-control",
        Icon: CircleHelp,
        position: "branch",
      },
    ],
  },
  {
    id: "transfer",
    titleZh: "换到陌生题",
    titleEn: "Use it elsewhere",
    summaryZh: "把刚学会的能力带到新的话题，确认它不只对这一篇作文有效。",
    summaryEn:
      "Carry the skill to a new topic so it works beyond this one essay.",
    tone: "sky",
    nodes: [
      {
        id: "transfer",
        kind: "practice",
        state: "locked",
        number: "07",
        labelZh: "陌生题迁移",
        labelEn: "Transfer",
        detailZh: "换一道没有见过的题，检查这项能力是否真正属于你。",
        detailEn:
          "Try an unfamiliar prompt and see whether the skill now belongs to you.",
        actionZh: "了解迁移",
        actionEn: "Explore transfer",
        href: "/transfer?cycle=cycle-demo&task=transfer-task",
        Icon: Sparkles,
        position: "one",
      },
      {
        id: "education-transfer",
        kind: "lesson",
        state: "locked",
        number: "08",
        labelZh: "教育话题",
        labelEn: "Education topic",
        detailZh: "在熟悉的教育语境里换一种论证角度，保持观点清楚且有层次。",
        detailEn:
          "Try a fresh angle on an education prompt while keeping the position clear and layered.",
        actionZh: "查看题目",
        actionEn: "Preview prompt",
        href: "/transfer?cycle=cycle-demo&task=transfer-task",
        Icon: BookOpenCheck,
        position: "two",
      },
      {
        id: "environment-transfer",
        kind: "practice",
        state: "locked",
        number: "09",
        labelZh: "环境话题",
        labelEn: "Environment topic",
        detailZh: "把同一套论证骨架迁移到陌生领域，练习真正的灵活性。",
        detailEn:
          "Move the same reasoning skeleton to an unfamiliar domain and practise flexibility.",
        actionZh: "查看题目",
        actionEn: "Preview prompt",
        href: "/transfer?cycle=cycle-demo&task=transfer-task",
        Icon: Target,
        position: "three",
      },
      {
        id: "transfer-checkpoint",
        kind: "milestone",
        state: "locked",
        number: "10",
        labelZh: "能力解锁",
        labelEn: "Skill unlocked",
        detailZh: "完成迁移后，这项能力才算从练习变成你可以主动调用的工具。",
        detailEn:
          "After transfer, the skill becomes a tool you can call on deliberately.",
        actionZh: "查看目标",
        actionEn: "View goal",
        href: "/today",
        Icon: LockKeyhole,
        position: "four",
      },
    ],
  },
];

const mapUnits: readonly RoadmapUnit[] = courseUnits.map((unit) => ({
  id: unit.id,
  titleZh: unit.titleZh,
  titleEn: unit.titleEn,
  nodes: unit.nodes.map(({ id, kind, state }) => ({ id, kind, state })),
}));

const allNodes = flattenRoadmapUnits(mapUnits);
const legacySteps: readonly RoadmapStep[] = allNodes.map((node) => ({
  id: node.id,
  state:
    node.state === "completed"
      ? "done"
      : node.state === "current"
        ? "current"
        : "upcoming",
}));

const nodeById = new Map(
  courseUnits.flatMap((unit) =>
    unit.nodes.map((node) => [node.id, node] as const),
  ),
);

const kindLabel: Record<RoadmapNodeKind, [string, string]> = {
  lesson: ["教学", "Lesson"],
  practice: ["练习", "Practice"],
  branch: ["支线", "Branch"],
  milestone: ["里程碑", "Milestone"],
};

const stateLabel: Record<RoadmapNodeState, [string, string]> = {
  completed: ["已完成", "Completed"],
  current: ["现在进行", "Current"],
  available: ["可开始", "Ready"],
  locked: ["稍后解锁", "Locked"],
};

const positionClass: Record<CourseNode["position"], string> = {
  one: styles.mapNodeOne!,
  two: styles.mapNodeTwo!,
  three: styles.mapNodeThree!,
  four: styles.mapNodeFour!,
  branch: styles.mapNodeBranch!,
};

const toneClass: Record<CourseUnit["tone"], string> = {
  mint: styles.unitMint!,
  sun: styles.unitSun!,
  sky: styles.unitSky!,
};

function NodeMarker({ node }: { node: CourseNode }) {
  const reducedMotion = useReducedMotion();
  const Icon = node.Icon;
  return (
    <span className={styles.nodeMarker} data-node-marker-state={node.state}>
      {node.state === "completed" ? (
        <Check aria-hidden="true" size={19} strokeWidth={2.6} />
      ) : node.state === "locked" ? (
        <LockKeyhole aria-hidden="true" size={17} />
      ) : node.kind === "milestone" ? (
        <Icon aria-hidden="true" size={19} />
      ) : (
        <span aria-hidden="true">{node.number}</span>
      )}
      {node.state === "current" && !reducedMotion ? (
        <motion.span
          animate={{ opacity: [0.28, 0], scale: [1, 1.45] }}
          className={styles.nodePulse}
          transition={{ duration: 1.8, ease: "easeOut", repeat: Infinity }}
        />
      ) : null}
    </span>
  );
}

function RoadmapNode({
  node,
  selected,
  onSelect,
}: {
  node: CourseNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const { text } = useLocale();
  const [kindZh, kindEn] = kindLabel[node.kind];
  return (
    <li
      className={cn(
        styles.mapNode,
        positionClass[node.position],
        selected && styles.nodeSelected,
      )}
      data-roadmap-node={node.id}
      data-roadmap-node-kind={node.kind}
      data-roadmap-node-state={node.state}
      data-state={node.state === "completed" ? "done" : node.state}
    >
      <button
        aria-current={node.state === "current" ? "step" : undefined}
        aria-controls="roadmap-node-details"
        aria-label={text(node.labelZh, node.labelEn)}
        aria-pressed={selected}
        className={styles.nodeButton}
        onClick={onSelect}
        type="button"
      >
        <NodeMarker node={node} />
        <span className={styles.nodeText}>
          <span className={styles.nodeKind}>{text(kindZh, kindEn)}</span>
          <strong>{text(node.labelZh, node.labelEn)}</strong>
          <span className={styles.nodeNumber}>{node.number}</span>
        </span>
      </button>
    </li>
  );
}

function UnitPath({
  completedRatio,
  hasBranch,
}: {
  completedRatio: number;
  hasBranch: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const mainPath = hasBranch
    ? "M80 205 C180 205 160 82 315 95 S470 240 610 188"
    : "M80 205 C180 205 160 82 315 95 S470 240 610 188 S760 70 920 95";
  return (
    <svg
      aria-hidden="true"
      className={styles.unitPath}
      preserveAspectRatio="none"
      viewBox="0 0 1000 300"
    >
      <path className={styles.unitPathBase} d={mainPath} />
      <motion.path
        animate={{ pathLength: completedRatio }}
        className={styles.unitPathProgress}
        d={mainPath}
        initial={reducedMotion ? false : { pathLength: 0 }}
        pathLength={1}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />
      {hasBranch ? (
        <path
          className={styles.branchPath}
          d="M610 188 C650 235 730 252 790 250"
        />
      ) : null}
    </svg>
  );
}

function Unit({
  unit,
  selectedId,
  onSelect,
}: {
  unit: CourseUnit;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { text } = useLocale();
  const completed = unit.nodes.filter(
    (node) => node.state === "completed",
  ).length;
  const ratio = completed / unit.nodes.length;
  const hasBranch = unit.nodes.some((node) => node.kind === "branch");
  return (
    <li
      className={cn(styles.unit, toneClass[unit.tone])}
      data-roadmap-unit={unit.id}
    >
      <header className={styles.unitHeader}>
        <div>
          <p className={styles.unitEyebrow}>
            {text("阶段", "Unit")}{" "}
            {courseUnits.findIndex((candidate) => candidate.id === unit.id) + 1}
          </p>
          <h3>{text(unit.titleZh, unit.titleEn)}</h3>
          <p>{text(unit.summaryZh, unit.summaryEn)}</p>
        </div>
        <span className={styles.unitCount}>
          {completed}/{unit.nodes.length}
        </span>
      </header>
      <div
        className={styles.unitCanvas}
        data-roadmap-unit-branch={hasBranch ? "true" : "false"}
      >
        <UnitPath completedRatio={ratio} hasBranch={hasBranch} />
        <ol className={styles.unitNodes}>
          {unit.nodes.map((node) => (
            <RoadmapNode
              key={node.id}
              node={node}
              onSelect={() => onSelect(node.id)}
              selected={node.id === selectedId}
            />
          ))}
        </ol>
      </div>
    </li>
  );
}

function NodeDetails({ node }: { node: CourseNode }) {
  const { text } = useLocale();
  const reducedMotion = useReducedMotion();
  const Icon = node.Icon;
  const [stateZh, stateEn] = stateLabel[node.state];
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
      data-roadmap-motion={reducedMotion ? "reduced" : "full"}
      id="roadmap-node-details"
      role="region"
      aria-labelledby="roadmap-node-details-title"
      aria-live="polite"
      key={node.id}
    >
      <div className={styles.detailIcon} data-state={node.state}>
        <Icon aria-hidden="true" size={22} />
      </div>
      <div className={styles.detailCopy}>
        <div className={styles.detailMeta}>
          <span>{text(stateZh, stateEn)}</span>
          <span>{text(kindLabel[node.kind][0], kindLabel[node.kind][1])}</span>
        </div>
        <h2 id="roadmap-node-details-title">
          {text(node.labelZh, node.labelEn)}
        </h2>
        <p>{text(node.detailZh, node.detailEn)}</p>
      </div>
      <Link className={styles.detailAction} href={node.href}>
        {text(node.actionZh, node.actionEn)}
        <ArrowRight aria-hidden="true" size={17} />
      </Link>
    </motion.div>
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
    ) => roadmapReducer(current, action, legacySteps),
    legacySteps,
    createRoadmapState,
  );
  const selected = nodeById.get(state.selectedId) ?? nodeById.get("rewrite")!;
  const progress = roadmapProgress(mapUnits);
  const progressPercent = Math.round(
    (progress.completed / progress.total) * 100,
  );
  const currentUnitIndex = courseUnits.findIndex(
    (unit) => unit.id === progress.currentUnitId,
  );

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
            {text("我的写作路图", "My writing map")}
          </p>
          <h1>
            {text(
              "把一篇作文，练成自己的能力。",
              "Turn one essay into a skill you can use.",
            )}
          </h1>
          <p>
            {text(
              "沿着路线逐步前进。你可以自由查看每个节点，但今天只需要完成一个明确动作。",
              "Follow the path one step at a time. Explore any node, then focus on one clear action today.",
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
          <Link href="/feedback?cycle=cycle-demo">
            {text("查看这篇作文的报告", "Open this essay's report")}
            <ArrowRight aria-hidden="true" size={15} />
          </Link>
        </div>
      </header>

      <div className={styles.content}>
        <section
          className={styles.progressSummary}
          aria-label={text("课程进度", "Course progress")}
        >
          <div className={styles.progressCount}>
            <span>{text("已走过", "Progress")}</span>
            <strong>
              {progress.completed} <span>/ {progress.total}</span>
            </strong>
          </div>
          <div className={styles.progressTrack} aria-hidden="true">
            <motion.span
              animate={{ width: `${progressPercent}%` }}
              initial={reducedMotion ? false : { width: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            />
          </div>
          <p className={styles.progressHint}>
            {text(
              `现在在第 ${currentUnitIndex + 1} 阶段 · 完成重写后进入陌生题迁移`,
              `Unit ${currentUnitIndex + 1} · transfer unlocks after your rewrite`,
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
                  "沿着路图，看到下一步。",
                  "Follow the map to your next move.",
                )}
              </h2>
            </div>
            <span className={styles.freeExplore}>
              {text("节点可以自由查看", "Every node is open to explore")}
            </span>
          </div>

          <div className={styles.mapSurface} data-roadmap-path>
            <ol className={styles.units}>
              {courseUnits.map((unit) => (
                <Unit
                  key={unit.id}
                  onSelect={(id) => dispatch({ type: "select", id })}
                  selectedId={state.selectedId}
                  unit={unit}
                />
              ))}
            </ol>
            <motion.span
              aria-hidden="true"
              className={cn(
                styles.roadmapProgress,
                styles.roadmapProgressHorizontal,
              )}
              data-roadmap-progress="horizontal"
              initial={reducedMotion ? false : { scaleX: 0 }}
              animate={{ scaleX: progress.completed / progress.total }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
            <motion.span
              aria-hidden="true"
              className={cn(
                styles.roadmapProgress,
                styles.roadmapProgressVertical,
              )}
              data-roadmap-progress="vertical"
              initial={reducedMotion ? false : { scaleY: 0 }}
              animate={{ scaleY: progress.completed / progress.total }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          </div>

          <AnimatePresence initial={false} mode="wait">
            <NodeDetails node={selected} />
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
                "完成这一步，路图会为你打开下一条支线。",
                "Complete this step to open the next branch on your map.",
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
