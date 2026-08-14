import { clearLearningDestinations } from "./learning-navigation";

export type AccountRole = "owner" | "admin" | "learner";

export interface AccountIdentity {
  email: string;
  initial: string;
  role: AccountRole;
}

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
}

function accountRole(value: unknown): AccountRole | null {
  return value === "owner" || value === "admin" || value === "learner"
    ? value
    : null;
}

function problemDetail(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object") return fallback;
  const detail = (value as { detail?: unknown; message?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  const message = (value as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

async function responseProblem(response: Response, fallback: string) {
  return problemDetail(await response.json().catch(() => null), fallback);
}

export function projectAccountIdentity(value: unknown): AccountIdentity | null {
  if (!value || typeof value !== "object") return null;
  const user = (value as { user?: unknown }).user;
  if (!user || typeof user !== "object") return null;
  const email = (user as { email?: unknown }).email;
  const role = accountRole((user as { role?: unknown }).role);
  if (typeof email !== "string" || !email.trim() || !role) return null;

  const normalizedEmail = email.trim();
  return {
    email: normalizedEmail,
    initial: Array.from(normalizedEmail)[0]?.toUpperCase() ?? "U",
    role,
  };
}

export async function getAccountIdentity(): Promise<AccountIdentity | null> {
  try {
    const response = await fetch("/api/v1/auth/get-session", {
      cache: "no-store",
      credentials: "include",
    });
    if (!response.ok) return null;
    return projectAccountIdentity(await response.json().catch(() => null));
  } catch {
    return null;
  }
}

export async function changeAccountPassword({
  currentPassword,
  newPassword,
}: PasswordChangeInput): Promise<void> {
  const response = await fetch("/api/v1/auth/change-password", {
    body: JSON.stringify({ currentPassword, newPassword }),
    credentials: "include",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(
      await responseProblem(response, "Unable to update the password right now."),
    );
  }
}

export async function signOutAccount(): Promise<void> {
  const response = await fetch("/api/v1/auth/sign-out", {
    body: "{}",
    credentials: "include",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await responseProblem(response, "Unable to sign out right now."));
  }
  clearLearningDestinations();
}
