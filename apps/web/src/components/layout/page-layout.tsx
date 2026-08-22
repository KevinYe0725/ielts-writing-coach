import { createElement, type ReactNode } from "react";

import { cn } from "@/components/utils";

import styles from "./page-layout.module.css";

export type PageLayoutVariant = "entry" | "focus" | "reading" | "workspace";

export function layoutVariantForPathname(pathname: string): PageLayoutVariant {
  if (
    ["/signin", "/join", "/recover", "/setup"].some((route) =>
      pathname.startsWith(route),
    )
  ) {
    return "entry";
  }

  if (pathname === "/lesson" || pathname === "/growth") {
    return "reading";
  }

  if (
    ["/today", "/essays", "/settings", "/account", "/admin"].some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    )
  ) {
    return "focus";
  }

  return "workspace";
}

export function PageLayout({
  variant,
  className,
  children,
}: {
  variant: PageLayoutVariant;
  className?: string;
  children: ReactNode;
}) {
  return createElement(
    "div",
    {
      className: cn(styles.layout, styles[variant], className),
      "data-page-layout": variant,
    },
    children,
  );
}
