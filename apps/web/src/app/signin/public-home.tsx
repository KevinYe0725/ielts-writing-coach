"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { Suspense, useRef, useState, type MouseEvent } from "react";
import { ArrowDown, ArrowRight, Feather, X } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { useClientReady } from "@/components/use-client-ready";
import { SignInForm } from "./sign-in-form";
import styles from "./public-home.module.css";

type EntryMode = "login" | "register";

export function PublicHome() {
  const { text, locale, setLocale } = useLocale();
  const ready = useClientReady();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<EntryMode>("login");
  const [example, setExample] = useState<"revision" | "reason">("revision");
  const returnFocus = useRef<HTMLButtonElement | null>(null);

  function enter(next: EntryMode, event: MouseEvent<HTMLButtonElement>) {
    returnFocus.current = event.currentTarget;
    setMode(next);
    setOpen(true);
  }

  return (
    <div className={styles.home} data-public-home data-entry-surface="signin">
      <header className={styles.header} data-public-header role="banner">
        <Link
          className={styles.brand}
          href="/signin"
          aria-label="IELTS Writing"
        >
          <Feather aria-hidden="true" size={24} />
          <span>
            IELTS <span className={styles.brandSuffix}>Writing</span>
          </span>
        </Link>
        <nav
          className={styles.navigation}
          aria-label={text("了解产品", "Explore the product")}
        >
          <a href="#learning">
            {text("写作，可以这样提升", "A better way to learn")}
          </a>
          <a href="#method">{text("学习过程", "How it works")}</a>
        </nav>
        <div className={styles.accountActions}>
          <button
            className={styles.locale}
            disabled={!ready}
            onClick={() => setLocale(locale === "zh-CN" ? "en" : "zh-CN")}
            type="button"
            aria-label={text("切换到英文界面", "Switch to Chinese interface")}
          >
            {locale === "zh-CN" ? "EN" : "中文"}
          </button>
          <button
            className={styles.login}
            disabled={!ready}
            onClick={(event) => enter("login", event)}
            type="button"
          >
            {text("登录", "Log in")}
          </button>
          <button
            className={styles.pill}
            disabled={!ready}
            onClick={(event) => enter("register", event)}
            type="button"
          >
            {text("注册", "Sign up")}
          </button>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} data-page-layout="entry">
        <section className={styles.hero} aria-labelledby="public-title">
          <p className={styles.kicker}>IELTS Writing Coach</p>
          <h1 id="public-title">
            {text("把每次修改，", "Make every revision")}
            <span>{text("变成写作能力。", "a lesson that stays.")}</span>
          </h1>
          <p className={styles.intro}>
            <span>
              {text(
                "从看懂一处问题，到独立写好下一篇。",
                "Understand what needs work. Learn how to improve it.",
              )}
            </span>
            <span>
              {text(
                "让批改、教学和练习，真正连在一起。",
                "Then make it your own in the next essay.",
              )}
            </span>
          </p>
          <div className={styles.heroActions}>
            <button
              className={styles.pill}
              disabled={!ready}
              onClick={(event) => enter("register", event)}
              type="button"
            >
              {text("开始写作", "Start writing")}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
            <a href="#learning">
              {text("看看它如何帮助你", "See how it helps")}
              <ArrowDown size={16} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section
          className={styles.showcase}
          id="learning"
          aria-labelledby="example-title"
        >
          <div className={styles.showcaseHeading}>
            <div>
              <p>{text("不止改对一句话", "Beyond a corrected sentence")}</p>
              <h2 id="example-title">
                {text(
                  "读懂修改背后的方法。",
                  "Understand the thinking behind the change.",
                )}
              </h2>
            </div>
            <span className={styles.exampleLabel}>
              {text(
                "教学示例 · 非评分",
                "Teaching example · not an assessment",
              )}
            </span>
          </div>
          <div className={styles.manuscript}>
            <div className={styles.before}>
              <span>{text("原来的表达", "The first version")}</span>
              <p lang="en">
                Remote work is flexible,{" "}
                <mark>so employees are more productive.</mark>
              </p>
              <div className={styles.marginNote}>
                <span aria-hidden="true">↳</span>
                {text(
                  "从原因直接跳到了结果。中间发生了什么？",
                  "The result follows too quickly. What happens in between?",
                )}
              </div>
            </div>
            <div className={styles.after}>
              <div
                className={styles.exampleTabs}
                role="group"
                aria-label={text("示例讲解", "Explore this example")}
              >
                <button
                  type="button"
                  disabled={!ready}
                  aria-pressed={example === "revision"}
                  onClick={() => setExample("revision")}
                >
                  {text("看一版改写", "A possible revision")}
                </button>
                <button
                  type="button"
                  disabled={!ready}
                  aria-pressed={example === "reason"}
                  onClick={() => setExample("reason")}
                >
                  {text("为什么这样改", "Why it works")}
                </button>
              </div>
              {example === "revision" ? (
                <p className={styles.revision} lang="en">
                  With flexible remote schedules, employees can{" "}
                  <mark>
                    reserve their most focused hours for demanding tasks
                  </mark>
                  , helping them complete those tasks more efficiently.
                </p>
              ) : (
                <div className={styles.explanation}>
                  <h3>
                    {text(
                      "让读者跟上你的推理。",
                      "Let the reader follow your reasoning.",
                    )}
                  </h3>
                  <p>
                    {text(
                      "改写补出了一个具体过程：灵活安排时间，把复杂任务放在自己更专注的时段，从而更高效地完成。",
                      "The revision supplies a concrete process: flexible scheduling lets people match demanding tasks to their most focused hours, helping them work more efficiently.",
                    )}
                  </p>
                  <p>
                    {text(
                      "下一次写论证句时，问自己：这个原因，究竟是怎样带来结果的？",
                      "In your next argument, ask: exactly how does this cause lead to that result?",
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section
          className={styles.method}
          id="method"
          aria-labelledby="method-title"
        >
          <div className={styles.methodIntro}>
            <p>{text("围绕你的作文展开", "Built around your own writing")}</p>
            <h2 id="method-title">
              {text(
                "看见问题。\n学会方法。\n再写一次。",
                "Notice the gap.\nLearn the method.\nWrite again.",
              )}
            </h2>
          </div>
          <ol className={styles.steps}>
            <li>
              <span aria-hidden="true">01</span>
              <div>
                <h3>
                  {text("具体到原文的批改", "Feedback grounded in your words")}
                </h3>
                <p>
                  {text(
                    "对照原文看清语法、搭配与论证问题，分清需要改正的错误和可以选择的润色。",
                    "Compare suggestions with your original text, separating errors from optional refinements.",
                  )}
                </p>
              </div>
            </li>
            <li>
              <span aria-hidden="true">02</span>
              <div>
                <h3>
                  {text("围绕薄弱点的教学", "A lesson for the skill you need")}
                </h3>
                <p>
                  {text(
                    "从你的薄弱点出发，用知识讲解、例句对照与随堂练习，把修改建议变成可复用的方法。",
                    "Turn your weaknesses into focused lessons, worked examples, and practice you can apply elsewhere.",
                  )}
                </p>
              </div>
            </li>
            <li>
              <span aria-hidden="true">03</span>
              <div>
                <h3>
                  {text("在新的表达中练习", "Practice beyond the example")}
                </h3>
                <p>
                  {text(
                    "完成专项训练，再通过延迟重写和新题练习，检验自己能否独立运用。多篇作文可以随时切换、继续。",
                    "Use focused papers, delayed rewrites, and new topics to test independent use. Switch between essays and continue where you left off.",
                  )}
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className={styles.closing} aria-labelledby="start-title">
          <h2 id="start-title">
            {text("下一篇，写得更明白。", "Make your next essay clearer.")}
          </h2>
          <button
            className={styles.pill}
            disabled={!ready}
            type="button"
            onClick={(event) => enter("register", event)}
          >
            {text("从一篇作文开始", "Begin with one essay")}
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </section>
      </main>
      <footer className={styles.footer}>
        <span>IELTS Writing Coach</span>
        <p>
          {text(
            "独立写作学习工具，非 IELTS 官方产品。",
            "An independent writing-learning tool, not an official IELTS product.",
          )}
        </p>
        <Link href="/recover">{text("找回账户", "Recover your account")}</Link>
      </footer>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content
            className={styles.dialog}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              returnFocus.current?.focus();
            }}
          >
            <Dialog.Title className={styles.authTitle} id="signin-title">
              {mode === "login"
                ? text("欢迎回来", "Welcome back")
                : text("创建你的学习账号", "Create your learning account")}
            </Dialog.Title>
            <Dialog.Description className={styles.authDescription}>
              {text(
                "让每篇作文，都有清晰的下一步。",
                "Give every essay a clear next step.",
              )}
            </Dialog.Description>
            <Suspense
              fallback={
                <p role="status">
                  {text("正在准备登录…", "Preparing account entry…")}
                </p>
              }
            >
              <SignInForm mode={mode} />
            </Suspense>
            <button
              className={styles.switchMode}
              type="button"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login"
                ? text("第一次使用？创建账号", "First visit? Create an account")
                : text("已有账号？去登录", "Already have an account? Log in")}
            </button>
            <Dialog.Close
              className={styles.close}
              aria-label={text("关闭登录窗口", "Close account entry")}
            >
              <X size={20} aria-hidden="true" />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
