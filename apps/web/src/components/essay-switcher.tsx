"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { Check, ChevronDown, FileText, Plus, Search, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useLocale } from "@/components/locale-provider";
import { learningClient, type EssayWorkspaceData } from "@/lib/client";
import {
  buildLearningDestinations,
  saveLearningDestinations,
} from "@/lib/client/learning-navigation";

import styles from "./essay-switcher.module.css";

function subscribeToHydration() {
  return () => {};
}

function hydratedBrowserSnapshot() {
  return true;
}

function hydratedServerSnapshot() {
  return false;
}

export function EssaySwitcher({
  currentCycleId,
}: {
  currentCycleId: string | null;
}) {
  const { text, locale } = useLocale();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const interactive = useSyncExternalStore(
    subscribeToHydration,
    hydratedBrowserSnapshot,
    hydratedServerSnapshot,
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<EssayWorkspaceData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void learningClient
      .getEssayWorkspace()
      .then((next) => {
        if (!active) return;
        setData(next);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [open, retry]);

  const currentEssay = data?.essays.find(
    (essay) => essay.id === currentCycleId,
  );
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setSearch("");
          setState("loading");
        }
        setOpen(next);
      }}
    >
      <Dialog.Trigger asChild>
        <button
          className={styles.trigger}
          data-interactive={interactive ? "true" : "false"}
          disabled={!interactive}
          type="button"
          aria-label={text("切换作文", "Switch essay")}
        >
          <FileText aria-hidden="true" size={17} />
          <span>{currentEssay?.prompt ?? text("我的作文", "My essays")}</span>
          <ChevronDown aria-hidden="true" size={15} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.dialog}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchRef.current?.focus();
          }}
        >
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14 }}
          >
            <div className={styles.heading}>
              <Dialog.Title>{text("切换作文", "Switch essay")}</Dialog.Title>
              <Dialog.Close
                className={styles.close}
                aria-label={text("关闭作文切换器", "Close essay switcher")}
              >
                <X aria-hidden="true" size={19} />
              </Dialog.Close>
            </div>
            <Command label={text("搜索作文", "Search essays")} loop>
              <div className={styles.search}>
                <Search aria-hidden="true" size={18} />
                <Command.Input
                  ref={searchRef}
                  aria-label={text("搜索作文题目", "Search essay prompts")}
                  placeholder={text(
                    "搜索题目或主题…",
                    "Search by prompt or topic…",
                  )}
                  value={search}
                  onValueChange={setSearch}
                />
              </div>
              <Command.List
                className={styles.list}
                aria-busy={state === "loading"}
              >
                {state === "loading" ? (
                  <p className={styles.message} role="status">
                    {text("正在读取作文…", "Loading essays…")}
                  </p>
                ) : null}
                {state === "error" ? (
                  <div className={styles.message} role="alert">
                    <p>
                      {text(
                        "暂时无法读取作文。请重试，或前往全部作文。",
                        "Essays could not be loaded. Retry or open all essays.",
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setState("loading");
                        setRetry((value) => value + 1);
                      }}
                    >
                      {text("重试", "Retry")}
                    </button>
                  </div>
                ) : null}
                {state === "ready" ? (
                  <>
                    <Command.Empty className={styles.message}>
                      {data?.essays.length
                        ? text(
                            "没有找到这篇作文。试试其他关键词。",
                            "No essay found. Try a different search.",
                          )
                        : text(
                            "还没有作文，可以开始新作文。",
                            "No essays yet. Start a new essay.",
                          )}
                    </Command.Empty>
                    {data?.essays.map((essay) => (
                      <Command.Item
                        className={styles.essay}
                        key={essay.id}
                        value={essay.id}
                        keywords={[
                          essay.prompt,
                          essay.topic,
                          essay.nextTask.titleZh,
                          essay.nextTask.titleEn,
                        ]}
                        onSelect={() => {
                          try {
                            saveLearningDestinations(
                              buildLearningDestinations(essay.resources),
                            );
                          } catch {
                            // The cache is optional; the essay's own route remains usable.
                          }
                          setOpen(false);
                          router.push(essay.nextTask.href);
                        }}
                      >
                        <FileText aria-hidden="true" size={18} />
                        <span className={styles.essayCopy}>
                          <span className={styles.prompt} lang="en">
                            {essay.prompt}
                          </span>
                          <span className={styles.action}>
                            {locale === "zh-CN"
                              ? essay.nextTask.actionZh
                              : essay.nextTask.actionEn}
                          </span>
                        </span>
                        {essay.id === currentCycleId ? (
                          <Check
                            aria-label={text("当前作文", "Current essay")}
                            size={17}
                          />
                        ) : null}
                      </Command.Item>
                    ))}
                  </>
                ) : null}
              </Command.List>
            </Command>
            <div className={styles.footer}>
              <Dialog.Close asChild>
                <Link href="/essays">{text("全部作文", "All essays")}</Link>
              </Dialog.Close>
              <Dialog.Close asChild>
                <Link href="/today?new-essay=1">
                  <Plus aria-hidden="true" size={16} />
                  {text("新作文", "New essay")}
                </Link>
              </Dialog.Close>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
