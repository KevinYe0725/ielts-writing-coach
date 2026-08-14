"use client";

import { useEffect, useRef, useState } from "react";

import {
  LearningClientError,
  type LegacyLessonRecoveryResult,
} from "@/lib/client";

export const FOCUSED_RECOVERY_PREPARATION_WINDOW_MS = 20_000;
const FOCUSED_RECOVERY_POLL_INTERVAL_MS = 1_500;

export type FocusedPackageRecoveryState =
  | "IDLE"
  | "PREPARING"
  | "CONTINUING_SAFELY";

type ReplaceLesson = (lessonId: string) => Promise<LegacyLessonRecoveryResult>;

export function isFocusedPackageRecoveryRequired(error: unknown): boolean {
  return (
    error instanceof LearningClientError &&
    (error.code === "FOCUSED_TEACHING_REPLACEMENT_REQUIRED" ||
      error.code === "PRACTICE_PAPER_REPLACEMENT_REQUIRED")
  );
}

export async function runFocusedPackageRecovery({
  lessonId,
  replace,
  refresh,
}: {
  lessonId: string;
  replace: ReplaceLesson;
  refresh: () => void;
}): Promise<Exclude<FocusedPackageRecoveryState, "IDLE">> {
  try {
    const result = await replace(lessonId);
    if (result.state === "READY") {
      refresh();
      return "PREPARING";
    }
    return result.state === "PREPARING" ? "PREPARING" : "CONTINUING_SAFELY";
  } catch {
    return "CONTINUING_SAFELY";
  }
}

/**
 * Keeps an earlier focused lesson moving without placing recovery work on the
 * learner. A page may safely render its own normal loading state while this
 * hook checks for the completed package in the background.
 */
export function useFocusedPackageRecovery({
  available,
  error,
  lessonId,
  replace,
  refresh,
}: {
  available: boolean;
  error: Error | null;
  lessonId: string | null | undefined;
  replace: ReplaceLesson;
  refresh: () => void;
}): FocusedPackageRecoveryState {
  const [state, setState] = useState<FocusedPackageRecoveryState>("IDLE");
  const startedLessonId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    if (available) {
      startedLessonId.current = null;
      return () => {
        active = false;
      };
    }
    if (!error) {
      return () => {
        active = false;
      };
    }
    if (!lessonId || !isFocusedPackageRecoveryRequired(error)) {
      queueMicrotask(() => {
        if (active) {
          setState((current) =>
            current === "PREPARING" ? "CONTINUING_SAFELY" : current,
          );
        }
      });
      return () => {
        active = false;
      };
    }
    if (startedLessonId.current === lessonId) {
      return () => {
        active = false;
      };
    }

    startedLessonId.current = lessonId;
    void Promise.resolve()
      .then(async () => {
        if (active) setState("PREPARING");
        return runFocusedPackageRecovery({ lessonId, replace, refresh });
      })
      .then((nextState) => {
        if (active) setState(nextState);
      });
    return () => {
      active = false;
    };
  }, [available, error, lessonId, refresh, replace]);

  useEffect(() => {
    if (available || state !== "PREPARING") return;

    const deadline = Date.now() + FOCUSED_RECOVERY_PREPARATION_WINDOW_MS;
    let active = true;
    let timer: number | undefined;
    const poll = () => {
      if (!active) return;
      refresh();
      if (Date.now() >= deadline) {
        setState("CONTINUING_SAFELY");
        return;
      }
      timer = window.setTimeout(poll, FOCUSED_RECOVERY_POLL_INTERVAL_MS);
    };
    timer = window.setTimeout(poll, FOCUSED_RECOVERY_POLL_INTERVAL_MS);

    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [available, refresh, state]);

  return state;
}
