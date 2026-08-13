import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import type { Database } from "@iwc/db";
import { schema } from "@iwc/db/schema";

export interface AuthOptions {
  database: Database;
  secret: string;
  baseUrl: string;
  trustedOrigins?: string[];
  sendResetPassword?: (input: {
    user: { email: string; name: string };
    url: string;
  }) => Promise<void>;
}

export function createAuth(options: AuthOptions) {
  if (options.secret.length < 32)
    throw new Error("AUTH_SECRET must contain at least 32 characters.");

  return betterAuth({
    appName: "IELTS Writing Coach",
    baseURL: options.baseUrl,
    basePath: "/api/v1/auth",
    secret: options.secret,
    database: drizzleAdapter(options.database, { provider: "pg", schema }),
    trustedOrigins: options.trustedOrigins ?? [new URL(options.baseUrl).origin],
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      ...(options.sendResetPassword === undefined
        ? {}
        : {
            sendResetPassword: async ({
              user,
              url,
            }: {
              user: { email: string; name: string };
              url: string;
            }) => options.sendResetPassword?.({ user, url }),
          }),
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "learner",
          input: false,
        },
        locale: { type: "string", required: false, defaultValue: "zh-CN" },
        timezone: { type: "string", required: false, defaultValue: "UTC" },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix: "iwc",
      useSecureCookies: options.baseUrl.startsWith("https://"),
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: options.baseUrl.startsWith("https://"),
      },
    },
  });
}

export * from "./authorization";
export * from "./origin";
export * from "./tokens";
