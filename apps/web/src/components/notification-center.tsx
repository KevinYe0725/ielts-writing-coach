"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";

import { useLocale } from "@/components/locale-provider";

interface NotificationItem {
  id: string;
  readAt: string | null;
  payload: Record<string, unknown>;
  scheduledAt: string;
}

export function NotificationCenter() {
  const pathname = usePathname();
  const { text, locale } = useLocale();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const refresh = useCallback(async () => {
    if (demo) return;
    const response = await fetch("/api/v1/notifications", {
      cache: "no-store",
      credentials: "include",
    });
    if (!response.ok) return;
    const body = (await response.json()) as {
      notifications?: NotificationItem[];
    };
    setItems(body.notifications ?? []);
  }, [demo]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [pathname, refresh]);

  const unread = items.filter((item) => item.readAt === null);
  const markRead = async (id: string) => {
    const response = await fetch(
      `/api/v1/notifications/${encodeURIComponent(id)}/read`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: "{}",
      },
    );
    if (response.ok) {
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
        ),
      );
    }
  };

  return (
    <details className="notification-center">
      <summary aria-label={text("查看提醒", "View notifications")}>
        <Bell aria-hidden="true" size={17} />
        {unread.length > 0 ? (
          <span aria-label={`${unread.length} unread`}>{unread.length}</span>
        ) : null}
      </summary>
      <div className="notification-panel">
        <strong>{text("提醒", "Notifications")}</strong>
        {unread.length === 0 ? (
          <p>{text("暂无新提醒。", "No new notifications.")}</p>
        ) : (
          <ul>
            {unread.slice(0, 8).map((item) => {
              const title = String(
                item.payload[locale === "zh-CN" ? "titleZh" : "titleEn"] ??
                  text("学习任务已就绪", "A learning task is ready"),
              );
              const href = String(item.payload.href ?? "/today");
              return (
                <li key={item.id}>
                  <Link href={href}>{title}</Link>
                  <button
                    aria-label={text("标为已读", "Mark as read")}
                    onClick={() => void markRead(item.id)}
                    type="button"
                  >
                    <Check aria-hidden="true" size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
