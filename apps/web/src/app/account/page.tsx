"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck, UserRound } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { Badge, Button, Card, LoadingButtonContent } from "@/components/ui";
import {
  changeAccountPassword,
  getAccountIdentity,
  type AccountIdentity,
} from "@/lib/client/account-session";

import styles from "./account.module.css";

function roleLabel(role: AccountIdentity["role"], chinese: boolean) {
  if (role === "owner") return chinese ? "实例所有者" : "Instance owner";
  if (role === "admin") return chinese ? "管理员" : "Administrator";
  return chinese ? "学习者" : "Learner";
}

export default function AccountPage() {
  const router = useRouter();
  const { locale, text } = useLocale();
  const [identity, setIdentity] = useState<AccountIdentity | null | undefined>(
    undefined,
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    void getAccountIdentity().then((next) => {
      if (!active) return;
      if (!next) {
        router.replace("/signin");
        return;
      }
      setIdentity(next);
    });
    return () => {
      active = false;
    };
  }, [router]);

  const valid = useMemo(
    () =>
      currentPassword.length > 0 &&
      newPassword.length >= 12 &&
      newPassword.length <= 128 &&
      newPassword === confirmation,
    [confirmation, currentPassword, newPassword],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      await changeAccountPassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setSuccess(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : text(
              "暂时无法更新密码，请重试。",
              "Unable to update the password right now. Try again.",
            ),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!identity) {
    return (
      <div className={styles.loading} role="status">
        {text("正在读取账户…", "Loading account…")}
      </div>
    );
  }

  const chinese = locale === "zh-CN";
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <Badge tone="blue">
          <ShieldCheck aria-hidden="true" size={14} />
          {text("账户", "Account")}
        </Badge>
        <h1>{text("账户与安全", "Account and security")}</h1>
        <p>
          {text(
            "查看当前登录账户，并安全地更新密码。",
            "Review the active account and update its password securely.",
          )}
        </p>
      </header>

      <section aria-labelledby="signed-in-account" className={styles.section}>
        <div className={styles.sectionHeading}>
          <UserRound aria-hidden="true" size={19} />
          <div>
            <h2 id="signed-in-account">
              {text("当前登录账户", "Signed-in account")}
            </h2>
            <p>
              {text(
                "这是你正在使用的学习账户。",
                "This is the learning account currently in use.",
              )}
            </p>
          </div>
        </div>
        <Card className={styles.identityCard}>
          <span className={styles.identityInitial} aria-hidden="true">
            {identity.initial}
          </span>
          <div>
            <strong>{identity.email}</strong>
            <span>{roleLabel(identity.role, chinese)}</span>
          </div>
        </Card>
      </section>

      <section aria-labelledby="password-heading" className={styles.section}>
        <div className={styles.sectionHeading}>
          <KeyRound aria-hidden="true" size={19} />
          <div>
            <h2 id="password-heading">{text("修改密码", "Password")}</h2>
            <p>
              {text(
                "新密码需为 12–128 个字符。",
                "Your new password must be 12–128 characters.",
              )}
            </p>
          </div>
        </div>
        <Card className={styles.formCard}>
          <form className={styles.form} onSubmit={submit}>
            <div className="form-field">
              <label htmlFor="current-password">
                {text("当前密码", "Current password")}
              </label>
              <input
                autoComplete="current-password"
                className="text-input"
                id="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                type="password"
                value={currentPassword}
              />
            </div>
            <div className="form-field">
              <label htmlFor="new-password">
                {text("新密码", "New password")}
              </label>
              <input
                autoComplete="new-password"
                className="text-input"
                id="new-password"
                maxLength={128}
                minLength={12}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                type="password"
                value={newPassword}
              />
            </div>
            <div className="form-field">
              <label htmlFor="confirm-password">
                {text("确认新密码", "Confirm new password")}
              </label>
              <input
                autoComplete="new-password"
                className="text-input"
                id="confirm-password"
                maxLength={128}
                minLength={12}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                type="password"
                value={confirmation}
              />
              {confirmation && confirmation !== newPassword ? (
                <small className={styles.mismatch} role="alert">
                  {text(
                    "两次输入的密码不一致。",
                    "The passwords do not match.",
                  )}
                </small>
              ) : null}
            </div>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className={styles.success} role="status">
                {text("密码已更新。", "Password updated.")}
              </p>
            ) : null}
            <div className={styles.actions}>
              <Button disabled={!valid || busy} type="submit">
                {busy ? (
                  <LoadingButtonContent
                    label={text("正在更新…", "Updating…")}
                  />
                ) : (
                  <>
                    <KeyRound aria-hidden="true" size={16} />
                    {text("更新密码", "Update password")}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      </section>
    </div>
  );
}
