"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { LogIn } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { Button, LoadingButtonContent } from "@/components/ui";
import { markAccountBoundaryAfterSuccessfulResponse } from "@/lib/client/account-boundary";

import styles from "../entry.module.css";
import pageStyles from "./public-home.module.css";

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

export function SignInForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { text } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SignInFieldErrors>({});
  const requestInFlight = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  useEffect(() => () => requestController.current?.abort(), []);
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
    const controller = new AbortController();
    requestController.current = controller;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/account-entry", {
        method: "POST",
        signal: controller.signal,
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
      if (controller.signal.aborted) return;
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
      if (controller.signal.aborted) return;
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
    <div
      data-signin-form
      data-entry-surface="signin"
      className={pageStyles.authBody}
    >
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
          <label htmlFor="signin-password">{text("密码", "Password")}</label>
          <input
            aria-describedby={[
              "signin-password-hint",
              fieldErrors.password ? "signin-password-error" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-invalid={fieldErrors.password ? true : undefined}
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
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
          <p className={"inline-probe error " + styles.formError} role="alert">
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
            <LoadingButtonContent label={text("正在继续…", "Continuing…")} />
          ) : (
            <>
              <LogIn aria-hidden="true" size={17} />
              {mode === "register"
                ? text("注册并继续", "Create account and continue")
                : text("登录并继续", "Sign in and continue")}
            </>
          )}
        </Button>
      </form>
      <div className={pageStyles.authMeta}>
        <p>
          {text(
            "新邮箱自动创建账号；团队学习请使用收到的邀请链接。",
            "New emails create an account. For team learning, use your invitation link.",
          )}
        </p>
        <Link href="/recover">{text("忘记密码？", "Forgot password?")}</Link>
      </div>
    </div>
  );
}
