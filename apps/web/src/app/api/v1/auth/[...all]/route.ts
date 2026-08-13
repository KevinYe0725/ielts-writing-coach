import { toNextJsHandler } from "better-auth/next-js";

import { getServerContext } from "@/lib/server/context";
import { apiRoute, forceNoStore } from "@/lib/server/problem";
import { boundedDelegatedJsonRequest } from "@/lib/server/request";
import { enforceRateLimit, protectMutation } from "@/lib/server/security";

function handlers() {
  const { auth } = getServerContext();
  if (!auth) {
    const unavailable = () =>
      Response.json(
        {
          type: "https://ielts-writing-coach.dev/problems/auth-not-configured",
          title: "Authentication unavailable",
          status: 503,
          code: "AUTH_NOT_CONFIGURED",
          detail: "Set AUTH_SECRET and restart the instance.",
        },
        {
          status: 503,
          headers: { "content-type": "application/problem+json" },
        },
      );
    return { GET: unavailable, POST: unavailable };
  }
  return toNextJsHandler(auth);
}

export const GET = apiRoute(async (request) =>
  forceNoStore(await handlers().GET(request)),
);
export const POST = apiRoute(async (request) => {
  const pathname = new URL(request.url).pathname;
  if (pathname.endsWith("/sign-up/email")) {
    return Response.json(
      {
        type: "https://ielts-writing-coach.dev/problems/invite-required",
        title: "Invite required",
        status: 403,
        code: "INVITE_REQUIRED",
        detail:
          "Use the setup or invitation acceptance flow to create an account.",
      },
      {
        status: 403,
        headers: {
          "content-type": "application/problem+json",
          "cache-control": "no-store",
        },
      },
    );
  }
  protectMutation(request);
  const { mail } = getServerContext();
  if (
    (pathname.endsWith("/request-password-reset") ||
      pathname.endsWith("/forget-password")) &&
    !mail.configured
  ) {
    return Response.json(
      {
        type: "https://ielts-writing-coach.dev/problems/smtp-not-configured",
        title: "Email recovery unavailable",
        status: 503,
        code: "SMTP_NOT_CONFIGURED",
        detail:
          "Ask the instance Owner to create a one-time recovery link from the administrator API.",
      },
      {
        status: 503,
        headers: {
          "content-type": "application/problem+json",
          "cache-control": "no-store",
        },
      },
    );
  }
  if (
    pathname.endsWith("/sign-in/email") ||
    pathname.endsWith("/request-password-reset") ||
    pathname.endsWith("/forget-password") ||
    pathname.endsWith("/reset-password")
  ) {
    await enforceRateLimit(request, {
      bucket: "authentication",
      limit: 10,
      windowSeconds: 15 * 60,
    });
  }
  const boundedRequest = await boundedDelegatedJsonRequest(request);
  return forceNoStore(await handlers().POST(boundedRequest));
});
