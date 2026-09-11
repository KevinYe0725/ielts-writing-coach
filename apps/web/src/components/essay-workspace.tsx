"use client";

import { useCallback } from "react";
import { BookOpenCheck, CirclePlus, LoaderCircle } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { ActionLink, Badge, Button, Card, PageHeader } from "@/components/ui";
import { useDemoResource } from "@/components/use-demo-resource";
import { learningClient, type EssayWorkspaceData } from "@/lib/client";

import styles from "./essay-workspace.module.css";

function topicLabel(topic: string, locale: "zh-CN" | "en"): string {
  const labels: Record<string, { zh: string; en: string }> = {
    education: { zh: "教育", en: "Education" },
    technology: { zh: "科技", en: "Technology" },
    environment: { zh: "环境", en: "Environment" },
    health: { zh: "健康", en: "Health" },
    government: { zh: "政府", en: "Government" },
    work_economy: { zh: "工作与经济", en: "Work & economy" },
    society_culture: { zh: "社会与文化", en: "Society & culture" },
    urban_transport: { zh: "城市与交通", en: "Cities & transport" },
  };
  const label = labels[topic];
  return label ? (locale === "zh-CN" ? label.zh : label.en) : topic;
}

function updatedLabel(updatedAt: string, locale: "zh-CN" | "en"): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function EssayWorkspaceContent({
  workspace,
  compact = false,
}: {
  workspace: EssayWorkspaceData;
  compact?: boolean;
}) {
  const { locale, text } = useLocale();
  const atLimit = workspace.activeCount >= workspace.activeLimit;
  const title = text("我的作文", "My essays");

  return (
    <section
      aria-labelledby="essay-workspace-title"
      className={compact ? styles.compact : styles.workspace}
      data-active-limit={workspace.activeLimit}
      data-essay-workspace={compact ? "compact" : "full"}
    >
      {compact ? (
        <div className={styles.compactHeading}>
          <h2 id="essay-workspace-title">{title}</h2>
          <ActionLink href="/essays" size="sm" variant="ghost">
            {text("查看全部", "View all")}
          </ActionLink>
        </div>
      ) : (
        <PageHeader
          actions={
            atLimit ? null : (
              <ActionLink href="/today?new-essay=1" size="lg">
                <CirclePlus aria-hidden="true" size={18} />
                {text("开始新作文", "Start a new essay")}
              </ActionLink>
            )
          }
          title={title}
        />
      )}

      <div className={styles.statusLine}>
        <span>
          {text(
            `进行中 ${workspace.activeCount} / ${workspace.activeLimit} 篇`,
            `${workspace.activeCount} of ${workspace.activeLimit} essays in progress`,
          )}
        </span>
        {atLimit ? (
          <span className={styles.limitCopy} role="status">
            {text(
              "已达到同时进行上限；完成其中一篇后可再开始新的作文。",
              "You have reached the in-progress limit. Finish one before starting another.",
            )}
          </span>
        ) : null}
      </div>

      <div
        aria-label={text("进行中的作文", "Essays in progress")}
        className={styles.grid}
        role="list"
      >
        {workspace.essays.map((essay) => (
          <article
            className={styles.card}
            data-essay-card
            key={essay.id}
            role="listitem"
          >
            <div className={styles.cardTopline}>
              <Badge tone="blue">{topicLabel(essay.topic, locale)}</Badge>
              <div className={styles.cardMeta}>
                <span className={styles.cardUpdated}>
                  {updatedLabel(essay.updatedAt, locale)}
                </span>
                <span
                  className={styles.cardDue}
                  data-essay-due
                  data-overdue={essay.nextAction.overdue ? "true" : "false"}
                >
                  {text(essay.nextTask.dueLabelZh, essay.nextTask.dueLabelEn)}
                  {essay.nextAction.overdue
                    ? ` · ${text("已过期", "Overdue")}`
                    : null}
                </span>
              </div>
            </div>
            <p className={styles.prompt} lang="en">
              {essay.prompt}
            </p>
            <div className={styles.nextStep}>
              <div>
                <strong>
                  {text(essay.nextTask.titleZh, essay.nextTask.titleEn)}
                </strong>
                <p>
                  {text(
                    essay.nextTask.descriptionZh,
                    essay.nextTask.descriptionEn,
                  )}
                </p>
              </div>
            </div>
            <ActionLink
              href={essay.nextTask.href}
              size="sm"
              variant="secondary"
            >
              {text(essay.nextTask.actionZh, essay.nextTask.actionEn)}
            </ActionLink>
          </article>
        ))}
      </div>

      {!compact && workspace.essays.length === 0 ? (
        <Card className={styles.empty}>
          <BookOpenCheck aria-hidden="true" size={25} />
          <div>
            <h2>{text("还没有进行中的作文", "No essay in progress yet")}</h2>
            <p>
              {text(
                "从题库选择一道题开始；草稿会自动保留在这里。",
                "Choose a prompt to begin; its draft will stay here automatically.",
              )}
            </p>
          </div>
        </Card>
      ) : null}
    </section>
  );
}

export function EssayWorkspace({ compact = false }: { compact?: boolean }) {
  const { text } = useLocale();
  const loader = useCallback(() => learningClient.getEssayWorkspace(), []);
  const { data, error, loading, retry } = useDemoResource(loader);

  if (loading) {
    return compact ? (
      <section aria-busy="true" className={styles.compactLoading}>
        <LoaderCircle aria-hidden="true" className="spin" size={18} />
        {text("正在读取你的作文…", "Loading your essays…")}
      </section>
    ) : null;
  }

  if (error || !data) {
    if (compact) return null;
    return (
      <Card className={styles.loadError} role="alert">
        <h1>
          {text(
            "作文工作台暂时无法读取",
            "Your essay workspace is unavailable",
          )}
        </h1>
        <p>
          {text(
            "已保存的作文不会受到影响。请稍后重新读取。",
            "Your saved essays are unaffected. Please try loading them again.",
          )}
        </p>
        <Button onClick={retry} variant="secondary">
          {text("重新读取", "Try again")}
        </Button>
      </Card>
    );
  }

  return <EssayWorkspaceContent compact={compact} workspace={data} />;
}
