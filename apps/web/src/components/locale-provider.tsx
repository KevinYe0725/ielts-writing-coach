"use client";

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { en, zhCN, type Messages } from "@/messages";
import type { Locale } from "@/lib/client";

interface LocaleContextValue {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => void;
  text: (zh: string, english: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh-CN");
  const restoreTimeout = useRef<number | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("iwc.locale");
    if (saved !== "en" && saved !== "zh-CN") return;
    restoreTimeout.current = window.setTimeout(() => {
      restoreTimeout.current = null;
      setLocaleState(saved);
    }, 0);
    return () => {
      if (restoreTimeout.current !== null)
        window.clearTimeout(restoreTimeout.current);
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    // A fast interaction can happen before the deferred preference restore.
    // The user's explicit choice must always win that race.
    if (restoreTimeout.current !== null) {
      window.clearTimeout(restoreTimeout.current);
      restoreTimeout.current = null;
    }
    setLocaleState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem("iwc.locale", locale);
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      messages: locale === "zh-CN" ? zhCN : en,
      setLocale,
      text: (zh, english) => (locale === "zh-CN" ? zh : english),
    }),
    [locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}
