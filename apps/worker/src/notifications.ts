import { createHash } from "node:crypto";

import { and, eq, inArray, isNull, lte } from "drizzle-orm";

import { MailService } from "@iwc/email";
import {
  learningPreference,
  lessonPlan,
  newDomainId,
  notification,
  rewriteTask,
  trainingCycle,
  user,
} from "@iwc/db";

import { databaseContext, environment } from "./runtime";

interface QuietHours {
  start: string;
  end: string;
}

function localMinute(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: timezone,
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type === "hour" || part.type === "minute")
      .map((part) => [part.type, Number(part.value)]),
  );
  return (parts.hour ?? 0) * 60 + (parts.minute ?? 0);
}

function minuteValue(value: string): number {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

export function withinQuietHours(
  date: Date,
  timezone: string,
  quietHours: QuietHours | null,
): boolean {
  if (!quietHours || quietHours.start === quietHours.end) return false;
  const current = localMinute(date, timezone);
  const start = minuteValue(quietHours.start);
  const end = minuteValue(quietHours.end);
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

/** DST-safe bounded search for the next permitted minute in the user's zone. */
export function afterQuietHours(
  requestedAt: Date,
  timezone: string,
  quietHours: QuietHours | null,
): Date {
  let candidate = new Date(requestedAt);
  for (let minutes = 0; minutes <= 24 * 60; minutes += 1) {
    if (!withinQuietHours(candidate, timezone, quietHours)) return candidate;
    candidate = new Date(candidate.getTime() + 60_000);
  }
  return requestedAt;
}

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

async function createEventNotifications(input: {
  userId: string;
  eventKey: string;
  kind: string;
  dueAt: Date;
  payload: Record<string, unknown>;
}): Promise<void> {
  const [preference, account] = await Promise.all([
    databaseContext.db.query.learningPreference.findFirst({
      where: eq(learningPreference.userId, input.userId),
    }),
    databaseContext.db.query.user.findFirst({
      where: eq(user.id, input.userId),
    }),
  ]);
  if (!account) return;
  const scheduledAt = afterQuietHours(
    input.dueAt,
    account.timezone,
    preference?.quietHours ?? null,
  );
  const rows: Array<typeof notification.$inferInsert> = [];
  if (preference?.reminderInApp ?? true) {
    rows.push({
      id: newDomainId(),
      userId: input.userId,
      channel: "in_app",
      kind: input.kind,
      dedupeKey: input.eventKey,
      payload: input.payload,
      scheduledAt,
    });
  }
  if (preference?.reminderEmail === true && mail.configured) {
    rows.push({
      id: newDomainId(),
      userId: input.userId,
      channel: "email",
      kind: input.kind,
      dedupeKey: input.eventKey,
      payload: input.payload,
      scheduledAt,
    });
  }
  if (rows.length > 0) {
    await databaseContext.db
      .insert(notification)
      .values(rows)
      .onConflictDoNothing();
  }
}

async function discoverNotifications(now: Date): Promise<void> {
  const lessons = await databaseContext.db
    .select({
      lessonId: lessonPlan.id,
      userId: trainingCycle.userId,
    })
    .from(lessonPlan)
    .innerJoin(trainingCycle, eq(trainingCycle.id, lessonPlan.cycleId))
    .where(eq(trainingCycle.status, "LESSON_READY"));
  for (const lesson of lessons) {
    await createEventNotifications({
      userId: lesson.userId,
      eventKey: `lesson-ready:${lesson.lessonId}`,
      kind: "LESSON_READY",
      dueAt: now,
      payload: {
        titleZh: "专项课已就绪",
        titleEn: "Your focused lesson is ready",
        href: "/lesson",
      },
    });
  }

  const rewrites = await databaseContext.db
    .select({
      id: rewriteTask.id,
      userId: rewriteTask.userId,
      availableAt: rewriteTask.availableAt,
    })
    .from(rewriteTask)
    .where(
      and(eq(rewriteTask.status, "LOCKED"), lte(rewriteTask.availableAt, now)),
    );
  for (const rewrite of rewrites) {
    await createEventNotifications({
      userId: rewrite.userId,
      eventKey: `rewrite-unlocked:${rewrite.id}`,
      kind: "REWRITE_UNLOCKED",
      dueAt: rewrite.availableAt,
      payload: {
        titleZh: "闭卷重写已解锁",
        titleEn: "Your closed-book rewrite is unlocked",
        href: "/rewrite",
      },
    });
    const overdueAt = new Date(
      rewrite.availableAt.getTime() + 24 * 60 * 60 * 1000,
    );
    if (overdueAt <= now) {
      await createEventNotifications({
        userId: rewrite.userId,
        eventKey: `rewrite-overdue:${rewrite.id}`,
        kind: "REWRITE_OVERDUE",
        dueAt: overdueAt,
        payload: {
          titleZh: "重写窗口仍在等待你",
          titleEn: "Your rewrite window is still open",
          href: "/rewrite",
        },
      });
    }
  }
}

async function deliverDueNotifications(now: Date): Promise<void> {
  await databaseContext.db
    .update(notification)
    .set({ sentAt: now })
    .where(
      and(
        eq(notification.channel, "in_app"),
        isNull(notification.sentAt),
        lte(notification.scheduledAt, now),
      ),
    );

  const due = await databaseContext.db
    .select({
      id: notification.id,
      userId: notification.userId,
      payload: notification.payload,
      email: user.email,
    })
    .from(notification)
    .innerJoin(user, eq(user.id, notification.userId))
    .where(
      and(
        eq(notification.channel, "email"),
        isNull(notification.sentAt),
        lte(notification.scheduledAt, now),
      ),
    )
    .limit(200);
  const byUser = Map.groupBy(due, (item) => item.userId);
  for (const items of byUser.values()) {
    const first = items[0];
    if (!first) continue;
    const messages = items.map((item) => {
      const title = String(item.payload.titleEn ?? "Learning task ready");
      const href = String(item.payload.href ?? "/today");
      return `${title}: ${new URL(href, environment.APP_URL).toString()}`;
    });
    const result = await mail.send({
      to: first.email,
      messageId: `<notifications-${createHash("sha256")
        .update(
          items
            .map((item) => item.id)
            .sort()
            .join(":"),
        )
        .digest("hex")}@ielts-writing-coach.local>`,
      subject:
        messages.length === 1
          ? "IELTS Writing Coach update"
          : `${messages.length} IELTS Writing Coach updates`,
      text: messages.join("\n\n"),
    });
    const ids = items.map((item) => item.id);
    if (result.delivered) {
      await databaseContext.db
        .update(notification)
        .set({ sentAt: now, failureCode: null })
        .where(inArray(notification.id, ids));
    } else {
      await databaseContext.db
        .insert(notification)
        .values(
          items.map((item) => ({
            id: newDomainId(),
            userId: item.userId,
            channel: "in_app" as const,
            kind: "EMAIL_DELIVERY_FALLBACK",
            dedupeKey: `email-fallback:${item.id}`,
            payload: item.payload,
            scheduledAt: now,
            sentAt: now,
            failureCode: result.reason,
          })),
        )
        .onConflictDoNothing();
      await databaseContext.db
        .update(notification)
        .set({
          failureCode: result.reason,
          scheduledAt: new Date(now.getTime() + 15 * 60 * 1000),
        })
        .where(inArray(notification.id, ids));
    }
  }
}

export async function processNotifications(now = new Date()): Promise<void> {
  await discoverNotifications(now);
  await deliverDueNotifications(now);
}
