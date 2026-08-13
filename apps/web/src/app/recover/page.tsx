"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Mail, ShieldCheck } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { Badge, Button, Card, LoadingButtonContent } from "@/components/ui";
import { useOneTimeLinkFromAddressBar } from "@/lib/client/one-time-link";

export default function RecoverPage() {
  const { text } = useLocale();
  const { invalidToken, ready, token } = useOneTimeLinkFromAddressBar();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestReset = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/request-password-reset", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, redirectTo: "/recover" }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          code?: string;
        } | null;
        if (problem?.code === "SMTP_NOT_CONFIGURED") {
          throw new Error(
            text(
              "此实例未配置 SMTP。请联系 Owner 通过管理员接口生成一次性恢复链接。",
              "SMTP is not configured. Ask the Owner to create a one-time link through the administrator API.",
            ),
          );
        }
        throw new Error(
          text("无法发起密码重置。", "Password reset could not be requested."),
        );
      }
      setComplete(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : text("请求失败。", "Request failed."),
      );
    } finally {
      setBusy(false);
    }
  };

  const reset = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!response.ok)
        throw new Error(
          text("链接无效或已过期。", "The link is invalid or expired."),
        );
      setComplete(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : text("重置失败。", "Reset failed."),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup-container">
      <section
        aria-labelledby="recover-title"
        className="setup-panel setup-panel-narrow"
      >
        <div className="setup-heading">
          <Badge tone="blue">
            {token ? (
              <ShieldCheck aria-hidden="true" size={13} />
            ) : (
              <Mail aria-hidden="true" size={13} />
            )}
            {text("账户恢复", "Account recovery")}
          </Badge>
          <h1 id="recover-title">
            {token
              ? text("设置新密码", "Set a new password")
              : text("重置密码", "Reset your password")}
          </h1>
          <p>
            {token
              ? text(
                  "此一次性令牌成功使用后会立即失效。",
                  "This one-time token is consumed after a successful reset.",
                )
              : text(
                  "若 SMTP 已配置，系统会发送一封重置邮件；响应不会泄露账户是否存在。",
                  "When SMTP is configured, a reset message is sent. The response never reveals whether an account exists.",
                )}
          </p>
        </div>
        <Card className="setup-form-card">
          {!ready ? (
            <p aria-busy="true">
              {text("正在检查恢复链接…", "Checking recovery link…")}
            </p>
          ) : complete ? (
            <div>
              <p>
                {token
                  ? text("密码已更新。", "Your password was updated.")
                  : text(
                      "若账户存在，请检查邮箱。无 SMTP 时请联系实例 Owner 生成一次性恢复链接。",
                      "If the account exists, check your email. Without SMTP, ask the instance Owner for a one-time recovery link.",
                    )}
              </p>
              <Link href="/signin">{text("返回登录", "Back to sign in")}</Link>
            </div>
          ) : invalidToken ? (
            <div>
              <p role="alert">
                {text(
                  "恢复链接无效或已过期。",
                  "The recovery link is invalid or expired.",
                )}
              </p>
              <Link href="/recover">{text("重新请求", "Request another")}</Link>
            </div>
          ) : (
            <form className="form-grid" onSubmit={token ? reset : requestReset}>
              {token ? (
                <div className="form-field form-field-wide">
                  <label htmlFor="new-password">
                    {text(
                      "新密码（至少 12 个字符）",
                      "New password (at least 12 characters)",
                    )}
                  </label>
                  <input
                    autoComplete="new-password"
                    className="text-input"
                    id="new-password"
                    minLength={12}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    type="password"
                    value={password}
                  />
                </div>
              ) : (
                <div className="form-field form-field-wide">
                  <label htmlFor="recover-email">{text("邮箱", "Email")}</label>
                  <input
                    autoComplete="email"
                    className="text-input"
                    id="recover-email"
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    type="email"
                    value={email}
                  />
                </div>
              )}
              {error ? (
                <p className="inline-probe error form-field-wide" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="setup-footer form-field-wide">
                <Button
                  disabled={busy || (token ? password.length < 12 : !email)}
                  size="lg"
                  type="submit"
                >
                  {busy ? (
                    <LoadingButtonContent
                      label={text("正在处理…", "Working…")}
                    />
                  ) : token ? (
                    text("更新密码", "Update password")
                  ) : (
                    text("发送恢复邮件", "Send recovery email")
                  )}
                </Button>
              </div>
            </form>
          )}
        </Card>
      </section>
    </div>
  );
}
