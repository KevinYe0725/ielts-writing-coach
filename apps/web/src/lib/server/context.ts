import { createAuth } from "@iwc/auth";
import {
  readServerEnvironment,
  trustedOrigins,
  type ServerEnvironment,
} from "@iwc/config";
import { createDatabase, type Database } from "@iwc/db";
import { MailService } from "@iwc/email";
import type { Pool } from "pg";

interface ServerContext {
  environment: ServerEnvironment;
  db: Database;
  pool: Pool;
  mail: MailService;
  auth: ReturnType<typeof createAuth> | undefined;
}

declare global {
  var __iwcServerContext: ServerContext | undefined;
}

export function getServerContext(): ServerContext {
  if (globalThis.__iwcServerContext) return globalThis.__iwcServerContext;
  const environment = readServerEnvironment();
  const { db, pool } = createDatabase(environment.DATABASE_URL);
  const mail =
    environment.SMTP_HOST && environment.SMTP_FROM
      ? new MailService({
          host: environment.SMTP_HOST,
          port: environment.SMTP_PORT,
          secure: environment.SMTP_SECURE,
          from: environment.SMTP_FROM,
          ...(environment.SMTP_USER ? { user: environment.SMTP_USER } : {}),
          ...(environment.SMTP_PASSWORD
            ? { password: environment.SMTP_PASSWORD }
            : {}),
        })
      : new MailService();
  const auth = environment.AUTH_SECRET
    ? createAuth({
        database: db,
        secret: environment.AUTH_SECRET,
        baseUrl: environment.APP_URL,
        trustedOrigins: [
          new URL(environment.APP_URL).origin,
          ...trustedOrigins(environment),
        ],
        sendResetPassword: async ({ user, url }) => {
          const delivery = await mail.send({
            to: user.email,
            subject: "Reset your IELTS Writing Coach password",
            text: `Open this one-time link to reset your password: ${url}`,
          });
          if (!delivery.delivered) {
            throw new Error(`PASSWORD_RESET_${delivery.reason}`);
          }
        },
      })
    : undefined;
  globalThis.__iwcServerContext = { environment, db, pool, mail, auth };
  return globalThis.__iwcServerContext;
}
