import { describe, expect, it } from "vitest";

import { MailService } from "./index";

describe("mail fallback", () => {
  it("degrades to an in-app notification when SMTP is absent", async () => {
    const service = new MailService();
    await expect(
      service.send({
        to: "learner@example.test",
        subject: "Rewrite ready",
        text: "Open Today.",
      }),
    ).resolves.toEqual({
      delivered: false,
      channel: "in_app",
      reason: "SMTP_NOT_CONFIGURED",
    });
  });

  it("rejects a partially configured SMTP credential pair", () => {
    expect(
      () =>
        new MailService({
          host: "smtp.example.test",
          port: 587,
          secure: false,
          from: "coach@example.test",
          user: "coach",
        }),
    ).toThrow(/SMTP_USER and SMTP_PASSWORD/);
  });
});
