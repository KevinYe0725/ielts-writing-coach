import { and, eq, isNull, ne } from "drizzle-orm";

import { trainingCycle, user, type Database } from "@iwc/db";

import { ApiProblem } from "./problem";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export const ACTIVE_TRAINING_CYCLE_LIMIT = 8;

export async function lockLearnerAndAssertActiveCycleCapacity(
  transaction: DatabaseTransaction,
  learnerId: string,
): Promise<void> {
  const [lockedLearner] = await transaction
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, learnerId))
    .for("update");
  if (!lockedLearner) {
    throw new ApiProblem({
      title: "Learner not found",
      status: 404,
      code: "LEARNER_NOT_FOUND",
      detail: "The learner account no longer exists.",
    });
  }

  const active = await transaction
    .select({ id: trainingCycle.id })
    .from(trainingCycle)
    .where(
      and(
        eq(trainingCycle.userId, learnerId),
        isNull(trainingCycle.archivedAt),
        ne(trainingCycle.status, "CORE_CYCLE_COMPLETED"),
      ),
    );
  if (active.length >= ACTIVE_TRAINING_CYCLE_LIMIT) {
    throw new ApiProblem({
      title: "Eight essays are already in progress",
      status: 409,
      code: "ACTIVE_CYCLE_LIMIT",
      detail:
        "You already have eight essays in progress. Continue one of them before starting another.",
    });
  }
}
