"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { KeyRound, LogIn } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { Badge, Button, Card, LoadingButtonContent } from "@/components/ui";

interface ProblemPayload {
  detail?: string;
  message?: string;
  code?: string;
}

interface AccountEntryPayload {
  outcome?: "SIGNED_IN" | "REGISTERED";
  redirect_to?: string;
}

function safeLocalRedirect(value: unknown): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : "/today";
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { text } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/account-entry", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(searchParams.get("next")
            ? { next: searchParams.get("next") }
            : {}),
        }),
      });
      if (!response.ok) {
        const problem = (await response
          .json()
          .catch(() => ({}))) as ProblemPayload;
        if (problem.code === "INVITE_REQUIRED") {
          throw new Error(
            text(
              "这是共享学习空间；请使用管理员发给你的邀请链接创建账号。",
              "This is a shared learning space. Use an invitation link from its administrator to create an account.",
            ),
          );
        }
        throw new Error(
          problem.detail ??
            problem.message ??
            text("邮箱或密码不正确。", "The email or password is incorrect."),
        );
      }
      const result = (await response.json()) as AccountEntryPayload;
      router.replace(safeLocalRedirect(result.redirect_to));
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : text("登录失败。", "Sign-in failed."),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup-container">
      <section
        aria-labelledby="signin-title"
        className="setup-panel setup-panel-narrow"
      >
        <div className="setup-heading">
          <Badge tone="blue">
            <KeyRound aria-hidden="true" size={13} />
            {text("自托管实例", "Self-hosted instance")}
          </Badge>
          <h1 id="signin-title">
            {text("登录 IELTS Writing Coach", "Sign in to IELTS Writing Coach")}
          </h1>
          <p>
            {text(
              "继续你的写作、专项训练和延迟重写。个人学习空间会为新邮箱创建账号；共享空间需要邀请链接。",
              "Continue your writing, focused practice, and delayed rewrite. Personal spaces create a new account for a new email; shared spaces use invitations.",
            )}
          </p>
        </div>
        <Card className="setup-form-card">
          <form className="form-grid" onSubmit={submit}>
            <div className="form-field form-field-wide">
              <label htmlFor="signin-email">{text("邮箱", "Email")}</label>
              <input
                autoComplete="email"
                className="text-input"
                id="signin-email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </div>
            <div className="form-field form-field-wide">
              <label htmlFor="signin-password">
                {text("密码", "Password")}
              </label>
              <input
                autoComplete="current-password"
                className="text-input"
                id="signin-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>
            {error ? (
              <p className="inline-probe error form-field-wide" role="alert">
                {error}
              </p>
            ) : null}
            <div className="setup-footer form-field-wide">
              <Button
                disabled={busy || !email || !password}
                size="lg"
                type="submit"
              >
                {busy ? (
                  <LoadingButtonContent
                    label={text("正在继续…", "Continuing…")}
                  />
                ) : (
                  <>
                    <LogIn aria-hidden="true" size={17} />
                    {text("继续", "Continue")}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
        <p className="field-hint">
          <Link href="/recover">{text("忘记密码？", "Forgot password?")}</Link>
        </p>
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
