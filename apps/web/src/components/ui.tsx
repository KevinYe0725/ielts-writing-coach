import Link from "next/link";
import {
  forwardRef,
  type MouseEventHandler,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { ArrowRight, Check, ChevronRight, LoaderCircle } from "lucide-react";

import { cn } from "@/components/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "blue" | "green" | "amber" | "red" | "violet";
  className?: string;
}) {
  return (
    <span className={cn("badge", `badge-${tone}`, className)}>{children}</span>
  );
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
  }
>(function Button(
  { variant = "primary", size = "md", className, children, ...props },
  ref,
) {
  return (
    <button
      className={cn("button", `button-${variant}`, `button-${size}`, className)}
      ref={ref}
      {...props}
    >
      {children}
    </button>
  );
});

export function ActionLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  trailing = true,
  onClick,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  trailing?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Link
      className={cn("button", `button-${variant}`, `button-${size}`, className)}
      href={href}
      {...(onClick ? { onClick } : {})}
    >
      {children}
      {trailing ? <ArrowRight aria-hidden="true" size={17} /> : null}
    </Link>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className={cn("icon-button", className)}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="page-lede">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="skeleton-layout">
      <span className="sr-only">{label}</span>
      <div className="skeleton-line skeleton-short" />
      <div className="skeleton-block" />
      <div className="skeleton-grid">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        {icon}
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function LoadingButtonContent({ label }: { label: string }) {
  return (
    <>
      <LoaderCircle className="spin" aria-hidden="true" size={17} />
      {label}
    </>
  );
}

export function CheckRow({
  children,
  state = "done",
}: {
  children: ReactNode;
  state?: "done" | "next";
}) {
  return (
    <li className={cn("check-row", state === "next" && "check-row-next")}>
      <span className="check-row-icon" aria-hidden="true">
        {state === "done" ? <Check size={15} /> : <ChevronRight size={15} />}
      </span>
      <span>{children}</span>
    </li>
  );
}
