import { z } from "zod";

import { enterAccount } from "@/lib/server/account-entry";
import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { parseJsonBody } from "@/lib/server/request";
import { enforceRateLimit, protectMutation } from "@/lib/server/security";

const accountEntrySchema = z
  .object({
    email: z.email().max(320),
    password: z.string().min(12).max(128),
    next: z.string().max(2_048).optional(),
  })
  .strict();

function successResponse(
  outcome: "SIGNED_IN" | "REGISTERED",
  redirectTo: string,
  authHeaders: Headers,
): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  for (const [key, value] of authHeaders) headers.append(key, value);
  return Response.json(
    { outcome, redirect_to: redirectTo },
    { status: 200, headers },
  );
}

export const POST = apiRoute(async (request) => {
  protectMutation(request);
  await enforceRateLimit(request, {
    bucket: "authentication",
    limit: 10,
    windowSeconds: 15 * 60,
  });
  const payload = await parseJsonBody(request, accountEntrySchema, {
    maximumBytes: 4 * 1_024,
  });
  const { environment } = getServerContext();
  const result = await enterAccount({
    email: payload.email,
    password: payload.password,
    returnPath: payload.next ?? "/today",
    origin: new URL(environment.APP_URL).origin,
  });

  if (result.kind === "INVITE_REQUIRED") {
    throw new ApiProblem({
      title: "Invitation required",
      status: 403,
      code: "INVITE_REQUIRED",
      detail:
        "This shared instance requires an invitation before a new account can be created.",
    });
  }
  if (result.kind === "INVALID_CREDENTIALS") {
    throw new ApiProblem({
      title: "Unable to continue",
      status: 401,
      code: "INVALID_CREDENTIALS",
      detail: "The email or password is incorrect.",
    });
  }
  return successResponse(result.kind, result.redirectTo, result.headers);
});
