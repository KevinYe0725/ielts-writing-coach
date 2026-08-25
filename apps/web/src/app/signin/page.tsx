"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { LogIn } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { Badge, Button, Card, LoadingButtonContent } from "@/components/ui";
import { markAccountBoundaryAfterSuccessfulResponse } from "@/lib/client/account-boundary";

import styles from "../entry.module.css";

interface ProblemPayload {
  detail?: string;
  message?: string;
  code?: string;
}

interface AccountEntryPayload {
  outcome?: "SIGNED_IN" | "REGISTERED";
  redirect_to?: string;
}

interface SignInFieldErrors {
  email?: string;
  password?: string;
}

const minimumPasswordLength = 12;
const maximumPasswordLength = 128;

function subscribeToHydration() {
  return () => undefined;
}

function hydratedBrowserSnapshot() {
  return true;
}

function hydratedServerSnapshot() {
  return false;
}

function safeLocalRedirect(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/today";
  }
  try {
    const base = "https://local.invalid";
    const parsed = new URL(value, base);
    return parsed.origin === base
      ? parsed.pathname + parsed.search + parsed.hash
      : "/today";
  } catch {
    return "/today";
  }
}

function userFacingProblem(
  problem: ProblemPayload,
  status: number,
  text: (zh: string, en: string) => string,
): string {
  if (problem.code === "INVITE_REQUIRED") {
    return text(
      "这个邮箱尚未加入当前学习空间，请通过收到的邀请链接进入。",
      "This email has not joined this learning space yet. Open the invitation link you received.",
    );
  }
  if (problem.code === "INVALID_CREDENTIALS" || status === 401) {
    return text("邮箱或密码不正确。", "The email or password is incorrect.");
  }
  if (problem.code === "VALIDATION_ERROR" || status === 422) {
    return text(
      "请检查邮箱和密码后再试。",
      "Check the email and password, then try again.",
    );
  }
  if (status === 429) {
    return text(
      "尝试次数较多，请稍后再试。",
      "There have been several attempts. Try again shortly.",
    );
  }
  return text(
    "暂时无法登录，请稍后再试。你的学习记录不会丢失。",
    "Sign-in is temporarily unavailable. Try again shortly; your learning record is safe.",
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { text } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SignInFieldErrors>({});
  const requestInFlight = useRef(false);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    hydratedBrowserSnapshot,
    hydratedServerSnapshot,
  );

  const normalizedEmail = email.trim().toLowerCase();
  const canSubmit =
    normalizedEmail.length > 0 &&
    password.length >= minimumPasswordLength &&
    password.length <= maximumPasswordLength;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (requestInFlight.current) return;

    const form = event.currentTarget;
    const emailInput = form.elements.namedItem(
      "email",
    ) as HTMLInputElement | null;
    const nextFieldErrors: SignInFieldErrors = {};
    if (!normalizedEmail) {
      nextFieldErrors.email = text(
        "请输入邮箱地址。",
        "Enter your email address.",
      );
    } else if (emailInput) {
      emailInput.value = normalizedEmail;
      if (!emailInput.validity.valid) {
        nextFieldErrors.email = text(
          "请输入有效的邮箱地址。",
          "Enter a valid email address.",
        );
      }
    }
    if (password.length < minimumPasswordLength) {
      nextFieldErrors.password = text(
        "密码至少需要 12 个字符。",
        "The password must be at least 12 characters.",
      );
    } else if (password.length > maximumPasswordLength) {
      nextFieldErrors.password = text(
        "密码不能超过 128 个字符。",
        "The password cannot exceed 128 characters.",
      );
    }
    setEmail(normalizedEmail);
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    requestInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/account-entry", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          ...(searchParams.get("next")
            ? { next: searchParams.get("next") }
            : {}),
        }),
      });
      markAccountBoundaryAfterSuccessfulResponse(response);
      if (!response.ok) {
        const problem = (await response
          .json()
          .catch(() => ({}))) as ProblemPayload;
        setError(userFacingProblem(problem, response.status, text));
        return;
      }
      const result = (await response.json()) as AccountEntryPayload;
      router.replace(safeLocalRedirect(result.redirect_to));
      router.refresh();
    } catch {
      setError(
        text(
          "暂时无法连接登录服务，请检查网络后再试。",
          "The sign-in service could not be reached. Check your connection and try again.",
        ),
      );
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className={styles.signinSurface} data-entry-surface="signin">
      <section
        aria-labelledby="signin-title"
        className={styles.signinLayout}
        data-signin-layout
      >
        <div className={styles.signinFormPane} data-signin-form>
          <div className={styles.signinHeading}>
            <Badge tone="blue">{text("继续学习", "Continue learning")}</Badge>
            <h1 id="signin-title">{text("欢迎回来", "Welcome back")}</h1>
            <p>
              {text(
                "登录后继续上次的写作、专项提升和延迟重写。",
                "Sign in to continue your writing, focused learning, and delayed rewrite.",
              )}
            </p>
          </div>
          <Card className={"setup-form-card " + styles.formCard}>
            <form
              aria-busy={busy || !hydrated}
              className={styles.signinForm}
              noValidate
              onSubmit={submit}
            >
              <div className="form-field">
                <label htmlFor="signin-email">{text("邮箱", "Email")}</label>
                <input
                  aria-describedby={
                    fieldErrors.email ? "signin-email-error" : undefined
                  }
                  aria-invalid={fieldErrors.email ? true : undefined}
                  autoComplete="email"
                  className="text-input"
                  disabled={busy || !hydrated}
                  id="signin-email"
                  maxLength={320}
                  name="email"
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (fieldErrors.email) {
                      setFieldErrors((current) => {
                        const next = { ...current };
                        delete next.email;
                        return next;
                      });
                    }
                  }}
                  required
                  type="email"
                  value={email}
                />
                {fieldErrors.email ? (
                  <p
                    className={styles.fieldError}
                    id="signin-email-error"
                    role="alert"
                  >
                    {fieldErrors.email}
                  </p>
                ) : null}
              </div>
              <div className="form-field">
                <label htmlFor="signin-password">
                  {text("密码", "Password")}
                </label>
                <input
                  aria-describedby={[
                    "signin-password-hint",
                    fieldErrors.password ? "signin-password-error" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-invalid={fieldErrors.password ? true : undefined}
                  autoComplete="current-password"
                  className="text-input"
                  disabled={busy || !hydrated}
                  id="signin-password"
                  maxLength={maximumPasswordLength}
                  minLength={minimumPasswordLength}
                  name="password"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (fieldErrors.password) {
                      setFieldErrors((current) => {
                        const next = { ...current };
                        delete next.password;
                        return next;
                      });
                    }
                  }}
                  required
                  type="password"
                  value={password}
                />
                <p className={styles.inputHint} id="signin-password-hint">
                  {text("至少 12 个字符", "At least 12 characters")}
                </p>
                {fieldErrors.password ? (
                  <p
                    className={styles.fieldError}
                    id="signin-password-error"
                    role="alert"
                  >
                    {fieldErrors.password}
                  </p>
                ) : null}
              </div>
              {error ? (
                <p
                  className={"inline-probe error " + styles.formError}
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              <Button
                className={styles.signinSubmit}
                disabled={busy || !hydrated || !canSubmit}
                size="lg"
                type="submit"
              >
                {busy ? (
                  <LoadingButtonContent
                    label={text("正在登录…", "Signing in…")}
                  />
                ) : (
                  <>
                    <LogIn aria-hidden="true" size={17} />
                    {text("登录并继续", "Sign in and continue")}
                  </>
                )}
              </Button>
            </form>
          </Card>
          <div className={styles.signinMeta}>
            <p>
              {text(
                "第一次使用？新邮箱会自动创建账号。",
                "First visit? A new email automatically creates an account.",
              )}
            </p>
            <p>
              {text(
                "通过学校或团队学习？请使用收到的邀请链接进入。",
                "Learning through a school or team? Open the invitation link you received.",
              )}
            </p>
            <Link href="/recover">
              {text("忘记密码？", "Forgot password?")}
            </Link>
          </div>
        </div>

        <aside
          aria-label={text("学习记录说明", "Learning record overview")}
          className={styles.signinStory}
          data-signin-story
        >
          <p className={styles.storyKicker}>
            {text("你的写作进度会保留", "Your writing progress is kept")}
          </p>
          <h2>
            {text(
              "每次回来，都从下一步开始。",
              "Return to the next useful step.",
            )}
          </h2>
          <p className={styles.storyLead}>
            {text(
              "首稿、批改、专项提升和重写会留在同一条学习路径里，不需要重新寻找进度。",
              "Your first draft, feedback, focused learning, and rewrite stay together in one learning path.",
            )}
          </p>
          <ol className={styles.storySteps}>
            <li>
              <span>01</span>
              <div>
                <strong>
                  {text("写下真实水平", "Write at your real level")}
                </strong>
                <p>
                  {text(
                    "计时写作与草稿会持续保存。",
                    "Timed writing and drafts remain available.",
                  )}
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>{text("看懂需要改什么", "See what to change")}</strong>
                <p>
                  {text(
                    "批改与专项教学围绕同一个薄弱点展开。",
                    "Feedback and focused teaching follow the same weakness.",
                  )}
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>
                  {text("用重写证明进步", "Prove it in a rewrite")}
                </strong>
                <p>
                  {text(
                    "延迟重写和陌生题迁移检验是否真正掌握。",
                    "Delayed rewrite and transfer show whether the skill holds.",
                  )}
                </p>
              </div>
            </li>
          </ol>
          <p className={styles.storyFoot}>
            {text(
              "已有进度会在登录后自动恢复。",
              "Existing progress resumes after sign-in.",
            )}
          </p>
        </aside>
      </section>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
