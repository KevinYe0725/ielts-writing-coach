import { eq } from "drizzle-orm";

import { instanceConfiguration, user } from "@iwc/db";

import { getServerContext } from "./context";
import { ApiProblem } from "./problem";

type DeploymentMode = "personal" | "shared";

interface AuthOperationInput {
  email: string;
  password: string;
  origin: string;
}

interface SignUpOperationInput extends AuthOperationInput {
  name: string;
}

export interface AccountEntryDependencies {
  findUserByEmail: (email: string) => Promise<{ id: string } | null>;
  getDeploymentMode: () => Promise<DeploymentMode>;
  signIn: (input: AuthOperationInput) => Promise<{ headers: Headers }>;
  signUp: (input: SignUpOperationInput) => Promise<{ headers: Headers }>;
  isDuplicateEmailError?: (error: unknown) => boolean;
}

export type AccountEntryResult =
  | { kind: "SIGNED_IN"; redirectTo: string; headers: Headers }
  | { kind: "REGISTERED"; redirectTo: string; headers: Headers }
  | { kind: "INVITE_REQUIRED" }
  | { kind: "INVALID_CREDENTIALS" };

const localOrigin = "https://local.invalid";

export function parseAccountReturnPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/today";
  try {
    const parsed = new URL(value, localOrigin);
    return parsed.origin === localOrigin
      ? `${parsed.pathname}${parsed.search}`
      : "/today";
  } catch {
    return "/today";
  }
}

function displayNameForEmail(email: string): string {
  const localPart = email.split("@", 1)[0]?.trim();
  return localPart ? localPart.slice(0, 100) : "Learner";
}

function duplicateEmailError(error: unknown): boolean {
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  return (
    code === "USER_ALREADY_EXISTS" ||
    code === "EMAIL_ALREADY_EXISTS" ||
    (candidate.status === 409 &&
      /(?:email|user).*(?:exist|taken)|duplicate/i.test(message))
  );
}

function productionDependencies(): AccountEntryDependencies {
  const { auth, db, environment } = getServerContext();
  if (!auth) {
    throw new ApiProblem({
      title: "Authentication unavailable",
      status: 503,
      code: "AUTH_NOT_CONFIGURED",
      detail: "Authentication is not configured.",
    });
  }

  return {
    findUserByEmail: async (email) =>
      (await db.query.user.findFirst({
        where: eq(user.email, email),
        columns: { id: true },
      })) ?? null,
    getDeploymentMode: async () =>
      (
        await db.query.instanceConfiguration.findFirst({
          columns: { deploymentMode: true },
        })
      )?.deploymentMode ?? environment.DEPLOYMENT_MODE,
    signIn: async ({ email, password, origin }) => {
      const result = await auth.api.signInEmail({
        returnHeaders: true,
        body: { email, password, rememberMe: true },
        headers: new Headers({ origin }),
      });
      return { headers: result.headers };
    },
    signUp: async ({ email, name, password, origin }) => {
      const result = await auth.api.signUpEmail({
        returnHeaders: true,
        body: { email, name, password, locale: "zh-CN", timezone: "UTC" },
        headers: new Headers({ origin }),
      });
      return { headers: result.headers };
    },
    isDuplicateEmailError: duplicateEmailError,
  };
}

export async function enterAccount(
  input: {
    email: string;
    password: string;
    returnPath: string;
    origin: string;
  },
  dependencies: AccountEntryDependencies = productionDependencies(),
): Promise<AccountEntryResult> {
  const email = input.email.trim().toLowerCase();
  const redirectTo = parseAccountReturnPath(input.returnPath);
  const existing = await dependencies.findUserByEmail(email);

  if (existing) {
    try {
      const signedIn = await dependencies.signIn({
        email,
        password: input.password,
        origin: input.origin,
      });
      return { kind: "SIGNED_IN", redirectTo, headers: signedIn.headers };
    } catch {
      return { kind: "INVALID_CREDENTIALS" };
    }
  }

  if ((await dependencies.getDeploymentMode()) !== "personal")
    return { kind: "INVITE_REQUIRED" };

  try {
    await dependencies.signUp({
      email,
      name: displayNameForEmail(email),
      password: input.password,
      origin: input.origin,
    });
  } catch (error) {
    if (!(dependencies.isDuplicateEmailError ?? duplicateEmailError)(error))
      return { kind: "INVALID_CREDENTIALS" };
    try {
      const signedIn = await dependencies.signIn({
        email,
        password: input.password,
        origin: input.origin,
      });
      return { kind: "SIGNED_IN", redirectTo, headers: signedIn.headers };
    } catch {
      return { kind: "INVALID_CREDENTIALS" };
    }
  }

  try {
    const signedIn = await dependencies.signIn({
      email,
      password: input.password,
      origin: input.origin,
    });
    return { kind: "REGISTERED", redirectTo, headers: signedIn.headers };
  } catch {
    return { kind: "INVALID_CREDENTIALS" };
  }
}
