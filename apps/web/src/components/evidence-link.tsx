import { createElement, type ReactNode } from "react";

import { cn } from "@/components/utils";

import styles from "./evidence-link.module.css";

export type EvidenceLinkState =
  | "active"
  | "verified"
  | "revision"
  | "unavailable"
  | "disabled";

export function EvidenceLink({
  state,
  label,
  children,
  className,
}: {
  state: EvidenceLinkState;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return createElement(
    "span",
    {
      className: cn(styles.evidenceLink, styles[state], className),
      "data-evidence-state": state,
    },
    createElement("span", { className: styles.subject }, children),
    state === "disabled"
      ? null
      : createElement("span", {
          "aria-hidden": true,
          className: styles.line,
        }),
    createElement("span", { className: styles.label }, label),
  );
}
