import type { Role } from "@iwc/auth/authorization";

import { ApiProblem } from "./problem";
import { getServerContext } from "./context";

export interface SessionActor {
  id: string;
  email: string;
  name: string;
  role: Role;
}

const roles = new Set<Role>(["owner", "admin", "learner"]);

export async function requireSession(request: Request): Promise<SessionActor> {
  const { auth } = getServerContext();
  if (!auth) {
    throw new ApiProblem({
      title: "Authentication unavailable",
      status: 503,
      code: "AUTH_NOT_CONFIGURED",
      detail: "Set AUTH_SECRET before signing in.",
    });
  }
  const current = await auth.api.getSession({ headers: request.headers });
  if (!current) {
    throw new ApiProblem({
      title: "Authentication required",
      status: 401,
      code: "UNAUTHENTICATED",
      detail: "Sign in to continue.",
    });
  }
  const rawRole = (current.user as unknown as { role?: string }).role;
  const role =
    rawRole && roles.has(rawRole as Role) ? (rawRole as Role) : "learner";
  return {
    id: current.user.id,
    email: current.user.email,
    name: current.user.name,
    role,
  };
}

export function requireRole(
  actor: SessionActor,
  permitted: readonly Role[],
): void {
  if (!permitted.includes(actor.role)) {
    throw new ApiProblem({
      title: "Forbidden",
      status: 403,
      code: "FORBIDDEN",
      detail: "Your role does not permit this operation.",
    });
  }
}
