"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { useLocale } from "@/components/locale-provider";

import styles from "./feedback.module.css";
import { RESIZABLE_REPORT_QUERY } from "./report-layout";

function subscribeToReportWidth(onStoreChange: () => void) {
  const query = window.matchMedia(RESIZABLE_REPORT_QUERY);
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function reportWidthSnapshot() {
  return window.matchMedia(RESIZABLE_REPORT_QUERY).matches;
}

export function ResponsiveReport({
  children,
}: {
  children: [ReactNode, ReactNode];
}) {
  const { text } = useLocale();
  const resizable = useSyncExternalStore(
    subscribeToReportWidth,
    reportWidthSnapshot,
    () => false,
  );
  const [source, suggestions] = children;

  if (!resizable) {
    return (
      <div
        className={styles.workbench}
        data-feedback-workbench
        data-testid="feedback-workbench"
      >
        {source}
        {suggestions}
      </div>
    );
  }

  return (
    <Group
      className={styles.workbench}
      data-feedback-workbench
      defaultLayout={{ "feedback-source": 58, "feedback-suggestions": 42 }}
      id="feedback-report-panels"
      orientation="horizontal"
      style={{ alignItems: "stretch", height: "auto", overflow: "visible" }}
      data-testid="feedback-workbench"
    >
      <Panel
        className={styles.resizablePanel}
        defaultSize="58%"
        id="feedback-source"
        minSize={420}
        style={{ overflow: "visible" }}
      >
        {source}
      </Panel>
      <Separator
        aria-label={text("调整原文与修改建议宽度", "Resize report columns")}
        className={styles.resizeHandle}
        id="feedback-column-separator"
      >
        <span aria-hidden="true" />
      </Separator>
      <Panel
        className={styles.resizablePanel}
        defaultSize="42%"
        id="feedback-suggestions"
        minSize={340}
        style={{ overflow: "visible" }}
      >
        {suggestions}
      </Panel>
    </Group>
  );
}
