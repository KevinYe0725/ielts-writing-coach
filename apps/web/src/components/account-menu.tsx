"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LogIn, LogOut, ShieldCheck } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { cn } from "@/components/utils";
import {
  getAccountIdentity,
  signOutAccount,
  type AccountIdentity,
} from "@/lib/client/account-session";

type AccountMenuVariant = "sidebar" | "mobile";

function roleLabel(role: AccountIdentity["role"], chinese: boolean) {
  if (role === "owner") return chinese ? "实例所有者" : "Instance owner";
  if (role === "admin") return chinese ? "管理员" : "Administrator";
  return chinese ? "学习者" : "Learner";
}

export function AccountMenu({ variant }: { variant: AccountMenuVariant }) {
  const { locale, text } = useLocale();
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [identity, setIdentity] = useState<AccountIdentity | null | undefined>(
    undefined,
  );
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getAccountIdentity().then((next) => {
      if (active) setIdentity(next);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (identity === null) {
    return (
      <Link
        className={cn("account-signin", `account-signin-${variant}`)}
        href="/signin"
      >
        <LogIn aria-hidden="true" size={17} />
        {text("登录", "Sign in")}
      </Link>
    );
  }

  const chinese = locale === "zh-CN";
  const accountText = text("账户与安全", "Account and security");
  const signOutText = text("退出登录", "Sign out");

  return (
    <div
      className={cn("account-menu", `account-menu-${variant}`)}
      data-account-menu={variant}
      ref={wrapperRef}
    >
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          identity
            ? text(
                `${identity.email} 的账户菜单`,
                `${identity.email} account menu`,
              )
            : text("正在读取账户", "Loading account")
        }
        className="account-trigger"
        disabled={!identity}
        onClick={() => {
          setError(null);
          setOpen((current) => !current);
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="avatar" aria-hidden="true">
          {identity?.initial ?? "…"}
        </span>
        <span className="account-trigger-copy">
          <strong>
            {identity?.email ?? text("正在读取账户", "Loading account")}
          </strong>
          {identity ? <span>{roleLabel(identity.role, chinese)}</span> : null}
        </span>
        <ChevronDown aria-hidden="true" size={16} />
      </button>
      {open && identity ? (
        <div
          aria-label={text("账户菜单", "Account menu")}
          className="account-popover"
          id={menuId}
          role="menu"
        >
          <p className="account-popover-identity">
            <span>{identity.email}</span>
            <small>{roleLabel(identity.role, chinese)}</small>
          </p>
          <Link href="/account" onClick={() => setOpen(false)} role="menuitem">
            <ShieldCheck aria-hidden="true" size={17} />
            {accountText}
          </Link>
          <button
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              setError(null);
              try {
                await signOutAccount();
                setOpen(false);
                router.replace("/signin");
                router.refresh();
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : text(
                        "暂时无法退出，请重试。",
                        "Unable to sign out right now. Try again.",
                      ),
                );
              } finally {
                setSigningOut(false);
              }
            }}
            role="menuitem"
            type="button"
          >
            <LogOut aria-hidden="true" size={17} />
            {signingOut ? text("正在退出…", "Signing out…") : signOutText}
          </button>
          {error ? (
            <p className="account-menu-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
