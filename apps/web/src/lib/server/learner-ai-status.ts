import { getServerContext } from "./context";
import { resolveAIJobRoute, resolveInstanceDeploymentMode } from "./jobs";
import type { SessionActor } from "./session";

/** Configuration for this learner's first assessment, not a network-health claim. */
export async function learnerAiStatus(
  actor: Pick<SessionActor, "id" | "role">,
): Promise<{
  state: "configured" | "needs_setup" | "unknown";
  can_manage: boolean;
}> {
  const canManage = actor.role === "owner" || actor.role === "admin";
  try {
    const { db, environment } = getServerContext();
    const configured = await db.transaction(async (transaction) => {
      const deploymentMode = await resolveInstanceDeploymentMode(
        transaction,
        environment.DEPLOYMENT_MODE,
      );
      const { route, provider } = await resolveAIJobRoute(transaction, {
        deploymentMode,
        jobOwnerId: actor.id,
        taskKind: "ielts_assessment",
      });
      return route?.providerConnectionId
        ? Boolean(provider && provider.enabled !== false)
        : Boolean(environment.OPENAI_API_KEY);
    });
    return {
      state: configured ? "configured" : "needs_setup",
      can_manage: canManage,
    };
  } catch {
    return { state: "unknown", can_manage: canManage };
  }
}
