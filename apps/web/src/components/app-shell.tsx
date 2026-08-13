"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  ChevronDown,
  ClipboardCheck,
  FileDiff,
  Feather,
  Home,
  Languages,
  Menu,
  PenLine,
  RefreshCw,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { NotificationCenter } from "@/components/notification-center";
import { cn } from "@/components/utils";
import {
  buildLearningDestinations,
  readLearningDestinations,
  type LearningDestinations,
} from "@/lib/client/learning-navigation";

const navItems = [
  { href: "/today", key: "today", icon: Home },
  { href: "/write", key: "write", icon: PenLine },
  { href: "/feedback", key: "feedback", icon: ClipboardCheck },
  { href: "/lesson", key: "lesson", icon: BrainCircuit },
  { href: "/rewrite", key: "rewrite", icon: RefreshCw },
  { href: "/compare", key: "compare", icon: FileDiff },
  { href: "/growth", key: "growth", icon: BarChart3 },
] as const;

const utilityItems = [
  { href: "/settings", key: "settings", icon: Settings },
] as const;

function LocaleSwitch() {
  const { locale, setLocale, text } = useLocale();
  const next = locale === "zh-CN" ? "en" : "zh-CN";
  return (
    <button
      aria-label={text("切换到英文界面", "Switch to Chinese interface")}
      className="locale-switch"
      onClick={() => setLocale(next)}
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
      aria-label={`${messages.brand} · ${messages.nav.today}`}
      className="brand"
      href="/today"
    >
      <span className="brand-mark" aria-hidden="true">
        <Feather size={21} strokeWidth={2.1} />
      </span>
      <span className="brand-copy">
        <strong>{messages.brand}</strong>
        <small>{messages.brandTagline}</small>
      </span>
    </Link>
  );
}

function Navigation({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const { messages, text } = useLocale();
  const [destinations, setDestinations] = useState<LearningDestinations>(() =>
    buildLearningDestinations({
      cycleId: null,
      writingAvailable: false,
      feedbackAvailable: false,
      lessonId: null,
      rewriteTaskId: null,
      comparisonAvailable: false,
      transferTaskId: null,
    }),
  );
  useEffect(() => {
    const update = () => setDestinations(readLearningDestinations());
    window.addEventListener("storage", update);
    window.addEventListener("iwc:learning-navigation", update);
    update();
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("iwc:learning-navigation", update);
    };
  }, [pathname]);
  return (
    <nav
      aria-label={text("主导航", "Primary navigation")}
      className={cn("navigation", compact && "navigation-compact")}
    >
      <div className="nav-group">
        {!compact ? (
          <p className="nav-label">{text("学习闭环", "Learning loop")}</p>
        ) : null}
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href === "/lesson" && pathname.startsWith("/lesson/"));
          const destination = destinations[item.key];
          if (!destination) {
            return (
              <span
                aria-disabled="true"
                className="nav-link nav-link-disabled"
                key={item.href}
                title={text(
                  "完成前面的学习步骤后即可查看",
                  "Available after the earlier learning step",
                )}
              >
                <Icon aria-hidden="true" size={18} />
                <span>{messages.nav[item.key]}</span>
              </span>
            );
          }
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn("nav-link", active && "nav-link-active")}
              href={destination}
              key={item.href}
            >
              <Icon aria-hidden="true" size={18} />
              <span>{messages.nav[item.key]}</span>
              {active && !compact ? (
                <span className="nav-active-dot" aria-hidden="true" />
              ) : null}
            </Link>
          );
        })}
      </div>
      {!compact ? (
        <div className="nav-group nav-utility-group">
          <p className="nav-label">{text("更多", "More")}</p>
          {utilityItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn("nav-link", active && "nav-link-active")}
                href={item.href}
                key={item.href}
              >
                <Icon aria-hidden="true" size={18} />
                <span>{messages.nav[item.key]}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </nav>
  );
}

function Sidebar() {
  const { text } = useLocale();
  return (
    <aside className="sidebar">
      <Brand />
      <Navigation />
      <div className="sidebar-foot">
        <div className="system-mini-card">
          <span className="system-mini-icon" aria-hidden="true">
            <UserRound size={17} />
          </span>
          <div>
            <strong>{text("专注学习", "Focused study")}</strong>
            <span>
              {text("今天只完成眼前一步", "One clear step at a time")}
            </span>
          </div>
        </div>
        <div className="profile-row">
          <span className="avatar" aria-hidden="true">
            U
          </span>
          <div>
            <strong>{text("当前学习者", "Current learner")}</strong>
            <span>{text("个人学习档案", "Personal learning record")}</span>
          </div>
          <ChevronDown aria-hidden="true" size={16} />
        </div>
      </div>
    </aside>
  );
}

function MobileHeader() {
  const { messages, text } = useLocale();
  return (
    <header className="mobile-header">
      <Brand />
      <div className="mobile-header-actions">
        <LocaleSwitch />
        <details className="mobile-menu">
          <summary aria-label={text("打开导航", "Open navigation")}>
            <Menu aria-hidden="true" size={21} />
          </summary>
          <div className="mobile-menu-panel">
            <p>{messages.brandTagline}</p>
            <Navigation compact />
            <div className="mobile-utility-links">
              <Link href="/settings">
                <Settings aria-hidden="true" size={17} />
                {messages.nav.settings}
              </Link>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}

function Topbar() {
  const { text } = useLocale();
  return (
    <header className="topbar">
      <div className="focus-message">
        <Sparkles aria-hidden="true" size={16} />
        <span>
          {text(
            "流程已经排好，你只需完成眼前一步",
            "The sequence is planned; focus only on the next action",
          )}
        </span>
      </div>
      <NotificationCenter />
      <LocaleSwitch />
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { text } = useLocale();
  const setup = ["/setup", "/signin", "/join", "/recover"].some((path) =>
    pathname.startsWith(path),
  );

  if (setup) {
    return (
      <div className="setup-shell">
        <a className="skip-link" href="#main-content">
          {text("跳到主要内容", "Skip to main content")}
        </a>
        <header className="setup-topbar">
          <Brand />
          <LocaleSwitch />
        </header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {text("跳到主要内容", "Skip to main content")}
      </a>
      <Sidebar />
      <div className="app-column">
        <MobileHeader />
        <Topbar />
        <main className="main-content" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
