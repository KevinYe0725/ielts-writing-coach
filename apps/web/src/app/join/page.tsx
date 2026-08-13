"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { Badge, Button, Card, LoadingButtonContent } from "@/components/ui";
import { useOneTimeLinkFromAddressBar } from "@/lib/client/one-time-link";

export default function JoinPage() {
  const router = useRouter();
  const { text } = useLocale();
  const { ready, token } = useOneTimeLinkFromAddressBar();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/invitations/accept", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          name,
          password,
          locale: "zh-CN",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };
        throw new Error(
          problem.detail ??
            text("邀请无法使用。", "The invitation cannot be used."),
        );
      }
      router.replace("/signin");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : text("加入失败。", "Joining failed."),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup-container">
      <section
        aria-labelledby="join-title"
        className="setup-panel setup-panel-narrow"
      >
        <div className="setup-heading">
          <Badge tone="violet">
            <UserPlus aria-hidden="true" size={13} />
            {text("一次性邀请", "One-time invitation")}
          </Badge>
          <h1 id="join-title">
            {text("创建你的学习账户", "Create your learner account")}
          </h1>
          <p>
            {text(
              "邀请只能使用一次，并会在设定时间后过期。",
              "The invitation can be used once and expires at its configured time.",
            )}
          </p>
        </div>
        {!ready ? (
          <Card aria-busy="true" className="setup-form-card">
            <p>{text("正在验证邀请…", "Checking invitation…")}</p>
          </Card>
        ) : !token ? (
          <Card className="setup-form-card">
            <p role="alert">
              {text(
                "邀请链接缺少令牌。",
                "The invitation link is missing its token.",
              )}
            </p>
            <Link href="/signin">{text("返回登录", "Back to sign in")}</Link>
          </Card>
        ) : (
          <Card className="setup-form-card">
            <form className="form-grid" onSubmit={submit}>
              <div className="form-field form-field-wide">
                <label htmlFor="join-name">{text("姓名", "Name")}</label>
                <input
                  className="text-input"
                  id="join-name"
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </div>
              <div className="form-field form-field-wide">
                <label htmlFor="join-password">
                  {text(
                    "密码（至少 12 个字符）",
                    "Password (at least 12 characters)",
                  )}
                </label>
                <input
                  autoComplete="new-password"
                  className="text-input"
                  id="join-password"
                  minLength={12}
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
                  disabled={busy || !name || password.length < 12}
                  size="lg"
                  type="submit"
                >
                  {busy ? (
                    <LoadingButtonContent
                      label={text("正在创建…", "Creating…")}
                    />
                  ) : (
                    text("接受邀请", "Accept invitation")
                  )}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </section>
    </div>
  );
}
