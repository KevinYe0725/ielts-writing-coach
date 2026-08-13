export type Role = "owner" | "admin" | "learner";

export type Action =
  | "instance:manage"
  | "invite:manage"
  | "provider:manage"
  | "operations:view"
  | "learning:write-own"
  | "learning:read-own"
  | "learning:read-learner-content";

const policy: Readonly<Record<Role, ReadonlySet<Action>>> = {
  owner: new Set([
    "instance:manage",
    "invite:manage",
    "provider:manage",
    "operations:view",
    "learning:write-own",
    "learning:read-own",
  ]),
  admin: new Set([
    "invite:manage",
    "provider:manage",
    "operations:view",
    "learning:write-own",
    "learning:read-own",
  ]),
  learner: new Set(["learning:write-own", "learning:read-own"]),
};

export interface AuthorizationContext {
  actorId: string;
  actorRole: Role;
  resourceOwnerId?: string;
  adminContentAccessEnabled?: boolean;
}

export function isAuthorized(
  action: Action,
  context: AuthorizationContext,
): boolean {
  if (action === "learning:read-learner-content") {
    return (
      context.resourceOwnerId === context.actorId ||
      ((context.actorRole === "owner" || context.actorRole === "admin") &&
        context.adminContentAccessEnabled === true)
    );
  }
  if (
    (action === "learning:read-own" || action === "learning:write-own") &&
    context.resourceOwnerId
  ) {
    return (
      policy[context.actorRole].has(action) &&
      context.resourceOwnerId === context.actorId
    );
  }
  return policy[context.actorRole].has(action);
}

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  constructor() {
    super("You do not have permission to perform this action.");
  }
}

export function assertAuthorized(
  action: Action,
  context: AuthorizationContext,
): void {
  if (!isAuthorized(action, context)) throw new AuthorizationError();
}
