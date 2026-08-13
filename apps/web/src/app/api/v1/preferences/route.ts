import { eq } from "drizzle-orm";
import { z } from "zod";

import { learningPreference, learningSlot, user } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { apiRoute } from "@/lib/server/problem";
import {
  ianaTimezoneSchema,
  localTimeSchema,
  parseJsonBody,
} from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

const preferenceSchema = z
  .object({
    target_band: z.number().min(0).max(9).multipleOf(0.5).default(7),
    ielts_track: z.enum(["academic", "general_training"]).default("academic"),
    feedback_locale: z.enum(["zh-CN", "en"]).default("zh-CN"),
    timezone: ianaTimezoneSchema,
    reminder_in_app: z.boolean().default(true),
    reminder_email: z.boolean().default(false),
    quiet_hours: z
      .object({
        start: localTimeSchema,
        end: localTimeSchema,
      })
      .strict()
      .nullable()
      .optional(),
    slots: z
      .array(
        z
          .object({
            weekday: z.number().int().min(0).max(6),
            local_time: localTimeSchema,
            enabled: z.boolean().default(true),
          })
          .strict(),
      )
      .max(14)
      .default([
        { weekday: 2, local_time: "20:00", enabled: true },
        { weekday: 4, local_time: "20:00", enabled: true },
        { weekday: 6, local_time: "20:00", enabled: true },
      ]),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    for (const [index, slot] of value.slots.entries()) {
      const key = `${slot.weekday}:${slot.local_time}`;
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["slots", index],
          message: "Learning slots must be unique.",
        });
      }
      seen.add(key);
    }
  });

export const GET = apiRoute(async (request) => {
  const actor = await requireSession(request);
  const { db, mail } = getServerContext();
  const [preference, slots, account] = await Promise.all([
    db.query.learningPreference.findFirst({
      where: eq(learningPreference.userId, actor.id),
    }),
    db.query.learningSlot.findMany({
      where: eq(learningSlot.userId, actor.id),
    }),
    db.query.user.findFirst({ where: eq(user.id, actor.id) }),
  ]);
  return Response.json({
    preferences: preference ?? {
      targetBand: 7,
      ieltsTrack: "academic",
      feedbackLocale: "zh-CN",
      reminderInApp: true,
      reminderEmail: false,
      quietHours: null,
    },
    timezone: account?.timezone ?? "UTC",
    email: account?.email ?? "",
    smtp_configured: mail.configured,
    slots,
  });
});

export const PUT = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  const payload = await parseJsonBody(request, preferenceSchema, {
    maximumBytes: 16 * 1_024,
  });
  const { db, mail } = getServerContext();
  const emailConfigured = mail.configured;
  const emailEnabled = payload.reminder_email && emailConfigured;
  const reservation = await reserveIdempotencyKey(
    db,
    actor.id,
    request,
    payload,
  );
  if (reservation.replay) return reservation.replay;
  try {
    await db.transaction(async (transaction) => {
      await transaction
        .insert(learningPreference)
        .values({
          userId: actor.id,
          targetBand: payload.target_band,
          ieltsTrack: payload.ielts_track,
          feedbackLocale: payload.feedback_locale,
          reminderInApp:
            payload.reminder_in_app ||
            (payload.reminder_email && !emailConfigured),
          reminderEmail: emailEnabled,
          quietHours: payload.quiet_hours,
        })
        .onConflictDoUpdate({
          target: learningPreference.userId,
          set: {
            targetBand: payload.target_band,
            ieltsTrack: payload.ielts_track,
            feedbackLocale: payload.feedback_locale,
            reminderInApp:
              payload.reminder_in_app ||
              (payload.reminder_email && !emailConfigured),
            reminderEmail: emailEnabled,
            quietHours: payload.quiet_hours,
          },
        });
      await transaction
        .update(user)
        .set({ timezone: payload.timezone, locale: payload.feedback_locale })
        .where(eq(user.id, actor.id));
      await transaction
        .delete(learningSlot)
        .where(eq(learningSlot.userId, actor.id));
      if (payload.slots.length > 0) {
        await transaction.insert(learningSlot).values(
          payload.slots.map((slot) => ({
            userId: actor.id,
            weekday: slot.weekday,
            localTime: slot.local_time,
            timezone: payload.timezone,
            enabled: slot.enabled,
          })),
        );
      }
    });
    const responseBody = {
      updated: true,
      email_reminders_enabled: emailEnabled,
      fallback_to_in_app: payload.reminder_email && !emailConfigured,
    };
    await completeIdempotentResponse(
      db,
      actor.id,
      reservation.key,
      200,
      responseBody,
    );
    return Response.json(responseBody);
  } catch (error) {
    return settleIdempotentError(db, actor.id, reservation.key, error);
  }
});
