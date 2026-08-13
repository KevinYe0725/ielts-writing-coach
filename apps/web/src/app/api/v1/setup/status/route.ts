import { count } from "drizzle-orm";

import { instanceConfiguration, user } from "@iwc/db";
import { sessionOnlyProviderAllowed } from "@iwc/config";

import { apiRoute } from "@/lib/server/problem";
import { getServerContext } from "@/lib/server/context";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async () => {
  const { db, environment } = getServerContext();
  const [[users], instance] = await Promise.all([
    db.select({ count: count() }).from(user),
    db.query.instanceConfiguration.findFirst(),
  ]);
  const completed =
    (users?.count ?? 0) > 0 || Boolean(instance?.setupCompletedAt);
  return Response.json(
    {
      setup_required: !completed,
      setup_available:
        !completed &&
        Boolean(environment.SETUP_TOKEN && environment.AUTH_SECRET),
      deployment_mode: instance?.deploymentMode ?? environment.DEPLOYMENT_MODE,
      public_registration: false,
      session_only_available: sessionOnlyProviderAllowed(environment),
    },
    { headers: { "cache-control": "no-store" } },
  );
});
