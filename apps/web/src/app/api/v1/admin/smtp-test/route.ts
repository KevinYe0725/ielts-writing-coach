import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { requireRole, requireSession } from "@/lib/server/session";
import { enforceRateLimit, protectMutation } from "@/lib/server/security";

export const POST = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  requireRole(actor, ["owner", "admin"]);
  await enforceRateLimit(request, {
    bucket: "smtp-test",
    identity: actor.id,
    limit: 5,
    windowSeconds: 15 * 60,
  });
  const { mail } = getServerContext();
  if (!mail.configured) {
    throw new ApiProblem({
      title: "SMTP not configured",
      status: 409,
      code: "SMTP_NOT_CONFIGURED",
      detail: "Configure SMTP_HOST and SMTP_FROM, then restart the instance.",
    });
  }
  if (!(await mail.verify())) {
    throw new ApiProblem({
      title: "SMTP verification failed",
      status: 502,
      code: "SMTP_VERIFICATION_FAILED",
      detail:
        "The instance could not authenticate or establish a connection to the SMTP server.",
    });
  }
  return Response.json(
    { verified: true },
    { headers: { "cache-control": "no-store" } },
  );
});
