"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  ChevronDown,
  FileDiff,
  Feather,
  Languages,
  RefreshCw,
  Settings,
  Sparkles,
} from "lucide-react";

import { AccountMenu } from "@/components/account-menu";
import { EssaySwitcher } from "@/components/essay-switcher";
import { layoutVariantForPathname } from "@/components/layout/page-layout";
import { useLocale } from "@/components/locale-provider";
import { NotificationCenter } from "@/components/notification-center";
import { useClientReady } from "@/components/use-client-ready";
import { cn } from "@/components/utils";
import {
  readLearningDestinations,
  type LearningDestinations,
} from "@/lib/client/learning-navigation";
import { workspaceDestinations } from "@/lib/client/workspace-navigation";

import styles from "./app-shell.module.css";

function LocaleSwitch() {
  const { locale, setLocale, text } = useLocale();
  const interactive = useClientReady();
  return (
    <button
      aria-label={text("切换到英文界面", "Switch to Chinese interface")}
      className={cn("locale-switch", styles.localeSwitch)}
      data-interactive={interactive ? "true" : "false"}
      disabled={!interactive}
      onClick={() => setLocale(locale === "zh-CN" ? "en" : "zh-CN")}
      type="button"
    >
      <Languages aria-hidden="true" size={16} />
      <span>{locale === "zh-CN" ? "EN" : "中文"}</span>
    </button>
  );
}

function Brand() {
  const { messages } = useLocale();
  return (
    <Link
      aria-label={messages.brand + " · " + messages.nav.today}
      className={styles.brand}
      href="/today"
    >
      <span className={styles.brandMark} aria-hidden="true">
        <Feather size={20} strokeWidth={2} />
      </span>
      <strong>{messages.brand}</strong>
    </Link>
  );
}

const moreItems = [
  { key: "rewrite", icon: RefreshCw, zh: "重写", en: "Rewrite" },
  { key: "compare", icon: FileDiff, zh: "对比", en: "Compare" },
  { key: "transfer", icon: Sparkles, zh: "陌生题迁移", en: "Transfer" },
  { key: "growth", icon: BarChart3, zh: "成长记录", en: "Growth" },
  { key: "settings", icon: Settings, zh: "设置", en: "Settings" },
] as const;

function Topbar({
  currentHref,
  pathname,
  cached = null,
}: {
  currentHref: string;
  pathname: string;
  cached?: LearningDestinations | null;
}) {
  const { text, messages } = useLocale();
  const links = workspaceDestinations(currentHref, cached);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const moreTrigger = useRef<HTMLElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node) && moreRef.current)
        moreRef.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !moreRef.current?.open) return;
      moreRef.current.open = false;
      moreTrigger.current?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  const currentMore = moreItems.find((item) => pathname === "/" + item.key);
  const extraContext = currentMore
    ? text(currentMore.zh, currentMore.en)
    : pathname === "/account"
      ? text("账户", "Account")
      : pathname === "/admin/backup"
        ? text("创建备份", "Create backup")
        : pathname === "/admin"
          ? messages.nav.admin
          : null;

  return (
    <header className={cn("topbar", styles.topbar)} data-workspace-header>
      <Brand />
      <EssaySwitcher currentCycleId={links.cycleId} />
      <nav
        aria-label={text("主导航", "Primary navigation")}
        className={styles.navigation}
        data-context-topbar
      >
        <div className={styles.primaryLinks}>
          {(
            [
              ["write", text("写作", "Write")],
              ["feedback", text("批改", "Feedback")],
              ["lesson", text("提升", "Learn")],
            ] as const
          ).map(([key, label]) => {
            const href = links[key];
            const active =
              pathname === "/" + key ||
              (key === "lesson" && pathname === "/lesson/paper");
            return href ? (
              <Link
                aria-current={active ? "page" : undefined}
                className={styles.navLink}
                href={href}
                key={key}
              >
                {label}
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className={styles.unavailableLink}
                key={key}
                title={text(
                  "完成前面的学习步骤后即可查看",
                  "Available after the earlier learning step",
                )}
              >
                {label}
              </span>
            );
          })}
          {extraContext ? (
            <Link
              aria-current="page"
              className={styles.navLink}
              href={currentHref}
            >
              {extraContext}
            </Link>
          ) : null}
        </div>
        <details className={styles.more} data-workspace-more ref={moreRef}>
          <summary
            aria-label={text("更多导航", "More navigation")}
            ref={moreTrigger}
          >
            {text("更多", "More")}
            <ChevronDown aria-hidden="true" size={15} />
          </summary>
          <div
            className={styles.morePanel}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a") && moreRef.current)
                moreRef.current.open = false;
            }}
          >
            <Link href={links.essays}>{text("全部作文", "All essays")}</Link>
            {moreItems.map(({ key, icon: Icon, zh, en }) =>
              links[key] ? (
                <Link href={links[key]} key={key}>
                  <Icon aria-hidden="true" size={17} />
                  {text(zh, en)}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className={styles.unavailableItem}
                  key={key}
                >
                  <Icon aria-hidden="true" size={17} />
                  <span>
                    {text(zh, en)}
                    <small>
                      {text(
                        "完成前一步后开启",
                        "Available after the previous step",
                      )}
                    </small>
                  </span>
                </span>
              ),
            )}
          </div>
        </details>
      </nav>
      <div className={styles.controls}>
        <LocaleSwitch />
        <NotificationCenter />
        <AccountMenu variant="topbar" />
      </div>
    </header>
  );
}

function WorkspaceHeader({ pathname }: { pathname: string }) {
  const search = useSearchParams().toString();
  const currentHref = search ? pathname + "?" + search : pathname;
  const [cached, setCached] = useState<LearningDestinations | null>(null);
  useEffect(() => {
    const update = () => setCached(readLearningDestinations());
    window.addEventListener("storage", update);
    window.addEventListener("iwc:learning-navigation", update);
    update();
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("iwc:learning-navigation", update);
    };
  }, []);
  return (
    <Topbar currentHref={currentHref} pathname={pathname} cached={cached} />
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { text } = useLocale();
  const layoutVariant = layoutVariantForPathname(pathname);
  const publicHome = pathname === "/signin";
  const courseHome = pathname === "/today";
  const writingPage = pathname === "/write" || pathname === "/rewrite";
  const feedbackPage = pathname === "/feedback";
  const setup = ["/setup", "/signin", "/join", "/recover"].some((path) =>
    pathname.startsWith(path),
  );

  if (publicHome) {
    return (
      <div className={cn("setup-shell", styles.entryShell)}>
        <a className="skip-link" href="#main-content">
          {text("跳到主要内容", "Skip to main content")}
        </a>
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        setup ? "setup-shell" : "app-shell",
        setup ? styles.entryShell : styles.shell,
        (courseHome || writingPage || feedbackPage) && styles.monochromeShell,
      )}
      data-app-shell={setup ? undefined : ""}
      data-course-home={courseHome ? "true" : undefined}
      data-design-system={setup ? undefined : "annotation-desk-v1"}
      data-sidebar-state={setup ? undefined : "collapsed"}
    >
      <a className="skip-link" href="#main-content">
        {text("跳到主要内容", "Skip to main content")}
      </a>
      {setup ? (
        <header className={cn("setup-topbar", styles.entryTopbar)}>
          <Brand />
          <LocaleSwitch />
        </header>
      ) : (
        <Suspense
          fallback={
            <div className={styles.headerPlaceholder} aria-hidden="true" />
          }
        >
          <WorkspaceHeader pathname={pathname} />
        </Suspense>
      )}
      <main
        className={cn(
          "main-content",
          setup ? styles.entryMain : styles.mainContent,
        )}
        data-page-layout={layoutVariant}
        id="main-content"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}
