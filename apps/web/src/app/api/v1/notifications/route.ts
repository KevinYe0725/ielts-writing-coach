import { and, desc, eq, isNotNull, lte } from "drizzle-orm";

import { notification } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { apiRoute } from "@/lib/server/problem";
import { requireSession } from "@/lib/server/session";

export const GET = apiRoute(async (request) => {
  const actor = await requireSession(request);
  const { db } = getServerContext();
  const notifications = await db.query.notification.findMany({
    where: and(
      eq(notification.userId, actor.id),
      eq(notification.channel, "in_app"),
      isNotNull(notification.sentAt),
      lte(notification.scheduledAt, new Date()),
    ),
    orderBy: [desc(notification.scheduledAt)],
    limit: 100,
  });
  return Response.json({ notifications });
});
