"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  ChevronRight,
  ClipboardCheck,
  FileDiff,
  Feather,
  Home,
  Languages,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  RefreshCw,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { NotificationCenter } from "@/components/notification-center";
import { AccountMenu } from "@/components/account-menu";
import { layoutVariantForPathname } from "@/components/layout/page-layout";
import { cn } from "@/components/utils";
import {
  buildLearningDestinations,
  readLearningDestinations,
  type LearningDestinations,
} from "@/lib/client/learning-navigation";

import styles from "./app-shell.module.css";

const navItems = [
  { href: "/today", key: "today", icon: Home },
  { href: "/essays", key: "essays", icon: BookOpenCheck },
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

const SIDEBAR_STORAGE_KEY = "iwc:sidebar-collapsed:v1";
const SIDEBAR_CHANGE_EVENT = "iwc:sidebar-preference";
let transientSidebarCollapsed = false;

function useLearningDestinations(pathname: string) {
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

  return destinations;
}

function sidebarCollapsedSnapshot() {
  if (typeof window === "undefined") return false;
  try {
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved !== null) transientSidebarCollapsed = saved === "true";
  } catch {
    // The in-memory preference still keeps this tab usable when storage is off.
  }
  return transientSidebarCollapsed;
}

function subscribeToSidebarPreference(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === SIDEBAR_STORAGE_KEY) {
      transientSidebarCollapsed = event.newValue === "true";
      onStoreChange();
    }
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(SIDEBAR_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SIDEBAR_CHANGE_EVENT, onStoreChange);
  };
}

function saveSidebarPreference(collapsed: boolean) {
  transientSidebarCollapsed = collapsed;
  try {
    if (collapsed) {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(SIDEBAR_STORAGE_KEY);
    }
  } catch {
    // Keep the in-memory preference for this tab.
  }
  window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT));
}

function LocaleSwitch() {
  const { locale, setLocale, text } = useLocale();
  const next = locale === "zh-CN" ? "en" : "zh-CN";
  return (
    <button
      aria-label={text("切换到英文界面", "Switch to Chinese interface")}
      className={cn("locale-switch", styles.localeSwitch)}
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
      className={cn("brand", styles.brand)}
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

function destinationForItem(
  item: (typeof navItems)[number],
  destinations: LearningDestinations,
) {
  return item.key === "essays" ? item.href : destinations[item.key];
}

function itemIsActive(pathname: string, item: (typeof navItems)[number]) {
  return (
    pathname === item.href ||
    (item.href === "/lesson" && pathname.startsWith("/lesson/"))
  );
}

function itemUsesCurrentResourceIdentity(item: (typeof navItems)[number]) {
  return (
    item.key === "write" ||
    item.key === "feedback" ||
    item.key === "lesson" ||
    item.key === "rewrite" ||
    item.key === "compare"
  );
}

function Navigation({
  compact = false,
  destinations,
}: {
  compact?: boolean;
  destinations: LearningDestinations;
}) {
  const pathname = usePathname();
  const { messages, text } = useLocale();
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
          const active = itemIsActive(pathname, item);
          const destination = destinationForItem(item, destinations);
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

function Sidebar({
  destinations,
  hidden,
}: {
  destinations: LearningDestinations;
  hidden: boolean;
}) {
  const { text } = useLocale();
  return (
    <aside
      className={cn("sidebar", styles.sidebar)}
      hidden={hidden}
      id="primary-sidebar"
    >
      <Brand />
      <Navigation destinations={destinations} />
      <div className={cn("sidebar-foot", styles.sidebarFoot)}>
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
        <AccountMenu variant="sidebar" />
      </div>
    </aside>
  );
}

function MobileHeader({
  destinations,
}: {
  destinations: LearningDestinations;
}) {
  const { messages, text } = useLocale();
  return (
    <header className={cn("mobile-header", styles.mobileHeader)}>
      <Brand />
      <div className="mobile-header-actions">
        <LocaleSwitch />
        <details className={cn("mobile-menu", styles.mobileMenu)}>
          <summary aria-label={text("打开导航", "Open navigation")}>
            <Menu aria-hidden="true" size={21} />
          </summary>
          <div className={cn("mobile-menu-panel", styles.mobileMenuPanel)}>
            <p>{messages.brandTagline}</p>
            <Navigation compact destinations={destinations} />
            <div className="mobile-utility-links">
              <Link href="/settings">
                <Settings aria-hidden="true" size={17} />
                {messages.nav.settings}
              </Link>
              <AccountMenu variant="mobile" />
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}

function Topbar({
  destinations,
  currentHref,
  pathname,
  sidebarExpanded,
  onToggleSidebar,
}: {
  destinations: LearningDestinations;
  currentHref: string;
  pathname: string;
  sidebarExpanded: boolean;
  onToggleSidebar: () => void;
}) {
  const { messages, text } = useLocale();
  const activeItem = navItems.find((item) => itemIsActive(pathname, item));
  const activeUtility = utilityItems.find((item) => pathname === item.href);
  const routeContext =
    pathname === "/transfer"
      ? {
          href: currentHref,
          icon: Sparkles,
          label: text("陌生题迁移", "Transfer"),
        }
      : pathname === "/account"
        ? {
            href: "/account",
            icon: UserRound,
            label: text("账户", "Account"),
          }
        : pathname === "/admin/backup"
          ? {
              href: "/admin/backup",
              icon: Settings,
              label: text("创建备份", "Create backup"),
            }
          : pathname === "/admin"
            ? {
                href: "/admin",
                icon: Settings,
                label: messages.nav.admin,
              }
            : null;
  const context = activeItem
    ? {
        href: itemUsesCurrentResourceIdentity(activeItem)
          ? currentHref
          : (destinationForItem(activeItem, destinations) ?? activeItem.href),
        icon: activeItem.icon,
        label: messages.nav[activeItem.key],
        current: true,
      }
    : activeUtility
      ? {
          href: activeUtility.href,
          icon: activeUtility.icon,
          label: messages.nav[activeUtility.key],
          current: true,
        }
      : routeContext
        ? { ...routeContext, current: true }
        : {
            href: destinations.today,
            icon: Home,
            label: messages.nav.today,
            current: false,
          };
  const ContextIcon = context.icon;
  return (
    <header className={cn("topbar", styles.topbar)}>
      <div className="topbar-leading">
        <button
          aria-controls="primary-sidebar"
          aria-expanded={sidebarExpanded}
          aria-label={text(
            sidebarExpanded ? "隐藏侧边栏" : "显示侧边栏",
            sidebarExpanded ? "Hide sidebar" : "Show sidebar",
          )}
          className="sidebar-toggle"
          data-sidebar-toggle
          onClick={onToggleSidebar}
          type="button"
        >
          {sidebarExpanded ? (
            <PanelLeftClose aria-hidden="true" size={18} />
          ) : (
            <PanelLeftOpen aria-hidden="true" size={18} />
          )}
          <span>
            {text(
              sidebarExpanded ? "隐藏侧栏" : "显示侧栏",
              sidebarExpanded ? "Hide sidebar" : "Show sidebar",
            )}
          </span>
        </button>
        <div
          className={cn("focus-message", styles.contextTopbar)}
          data-context-topbar
        >
          <span className={styles.contextKicker}>
            <Sparkles aria-hidden="true" size={14} />
            {text("当前步骤", "Current step")}
          </span>
          <Link
            aria-current={context.current ? "page" : undefined}
            className={styles.contextLink}
            href={context.href}
          >
            <ContextIcon aria-hidden="true" size={17} />
            <span>{context.label}</span>
            <ChevronRight aria-hidden="true" size={15} />
          </Link>
        </div>
      </div>
      <div className="topbar-actions">
        <NotificationCenter />
        <LocaleSwitch />
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const currentHref = useSyncExternalStore(
    () => () => undefined,
    () => `${window.location.pathname}${window.location.search}`,
    () => pathname,
  );
  const { text } = useLocale();
  const destinations = useLearningDestinations(pathname);
  const layoutVariant = layoutVariantForPathname(pathname);
  const sidebarCollapsed = useSyncExternalStore(
    subscribeToSidebarPreference,
    sidebarCollapsedSnapshot,
    () => false,
  );
  const setup = ["/setup", "/signin", "/join", "/recover"].some((path) =>
    pathname.startsWith(path),
  );

  if (setup) {
    return (
      <div className={cn("setup-shell", styles.entryShell)}>
        <a className="skip-link" href="#main-content">
          {text("跳到主要内容", "Skip to main content")}
        </a>
        <header className={cn("setup-topbar", styles.entryTopbar)}>
          <Brand />
          <LocaleSwitch />
        </header>
        <main
          className={styles.entryMain}
          data-page-layout={layoutVariant}
          id="main-content"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    );
  }

  return (
    <div
      className={cn("app-shell", styles.shell)}
      data-app-shell
      data-design-system="annotation-desk-v1"
      data-sidebar-state={sidebarCollapsed ? "collapsed" : "expanded"}
    >
      <a className="skip-link" href="#main-content">
        {text("跳到主要内容", "Skip to main content")}
      </a>
      <Sidebar destinations={destinations} hidden={sidebarCollapsed} />
      <div className={cn("app-column", styles.appColumn)}>
        <MobileHeader destinations={destinations} />
        <Topbar
          currentHref={currentHref}
          destinations={destinations}
          onToggleSidebar={() => saveSidebarPreference(!sidebarCollapsed)}
          pathname={pathname}
          sidebarExpanded={!sidebarCollapsed}
        />
        <main
          className={cn("main-content", styles.mainContent)}
          data-page-layout={layoutVariant}
          id="main-content"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
