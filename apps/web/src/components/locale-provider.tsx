"use client";

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
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
const LOCALE_STORAGE_KEY = "iwc.locale";
const LOCALE_CHANGE_EVENT = "iwc:locale-change";
let transientLocale: Locale = "zh-CN";

function localeSnapshot(): Locale {
  if (typeof window === "undefined") return transientLocale;
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === "en" || saved === "zh-CN") transientLocale = saved;
  } catch {
    // The in-memory preference keeps this tab usable when storage is blocked.
  }
  return transientLocale;
}

function subscribeToLocale(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== LOCALE_STORAGE_KEY) return;
    transientLocale =
      event.newValue === "en" || event.newValue === "zh-CN"
        ? event.newValue
        : "zh-CN";
    onStoreChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
  };
}

function saveLocale(next: Locale) {
  transientLocale = next;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // The transient preference still applies for this tab.
  }
  window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(
    subscribeToLocale,
    localeSnapshot,
    (): Locale => "zh-CN",
  );
  const setLocale = useCallback((next: Locale) => saveLocale(next), []);

  useEffect(() => {
    document.documentElement.lang = locale;
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
