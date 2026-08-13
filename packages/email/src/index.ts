import nodemailer, { type Transporter } from "nodemailer";
import { z } from "zod";

const smtpSchema = z
  .object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65_535),
    secure: z.boolean(),
    user: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    from: z.string().min(1),
  })
  .refine((value) => Boolean(value.user) === Boolean(value.password), {
    message: "SMTP_USER and SMTP_PASSWORD must be configured together.",
  });

export type SmtpConfiguration = z.infer<typeof smtpSchema>;

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Stable across retries so SMTP relays can de-duplicate an outbox item. */
  messageId?: string;
}

export type DeliveryResult =
  | { delivered: true; channel: "email"; messageId: string }
  | {
      delivered: false;
      channel: "in_app";
      reason: "SMTP_NOT_CONFIGURED" | "SMTP_FAILED";
    };

export class MailService {
  readonly #configuration: SmtpConfiguration | undefined;
  readonly #transporter: Transporter | undefined;

  constructor(configuration?: SmtpConfiguration) {
    this.#configuration =
      configuration === undefined ? undefined : smtpSchema.parse(configuration);
    this.#transporter = this.#configuration
      ? nodemailer.createTransport({
          host: this.#configuration.host,
          port: this.#configuration.port,
          secure: this.#configuration.secure,
          connectionTimeout: 15_000,
          greetingTimeout: 15_000,
          socketTimeout: 30_000,
          ...(this.#configuration.user && this.#configuration.password
            ? {
                auth: {
                  user: this.#configuration.user,
                  pass: this.#configuration.password,
                },
              }
            : {}),
        })
      : undefined;
  }

  get configured(): boolean {
    return this.#transporter !== undefined;
  }

  async verify(): Promise<boolean> {
    if (!this.#transporter) return false;
    try {
      return await this.#transporter.verify();
    } catch {
      return false;
    }
  }

  async send(message: MailMessage): Promise<DeliveryResult> {
    if (!this.#transporter || !this.#configuration) {
      return {
        delivered: false,
        channel: "in_app",
        reason: "SMTP_NOT_CONFIGURED",
      };
    }
    try {
      const result = await this.#transporter.sendMail({
        from: this.#configuration.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.messageId === undefined
          ? {}
          : { messageId: message.messageId }),
        ...(message.html === undefined ? {} : { html: message.html }),
      });
      return { delivered: true, channel: "email", messageId: result.messageId };
    } catch {
      return { delivered: false, channel: "in_app", reason: "SMTP_FAILED" };
    }
  }
}
