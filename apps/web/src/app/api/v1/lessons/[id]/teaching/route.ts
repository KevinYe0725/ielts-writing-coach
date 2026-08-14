import { eq } from "drizzle-orm";

import { lessonPlan } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { parseDomainId } from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";

import { learnerFacingTeachingArticle } from "../adaptive-teaching";

export const GET = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireSession(request);
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "lesson_id");
    const { db } = getServerContext();
    const plan = await db.query.lessonPlan.findFirst({
      where: eq(lessonPlan.id, id),
      with: { cycle: true },
    });
    if (!plan || plan.cycle.userId !== actor.id) {
      throw new ApiProblem({
        title: "Focused teaching not found",
        status: 404,
        code: "FOCUSED_TEACHING_NOT_FOUND",
        detail: "The focused teaching module does not exist.",
      });
    }
    const teaching = learnerFacingTeachingArticle(plan.paperContent);
    if (!teaching) {
      throw new ApiProblem({
        title: "Focused teaching unavailable",
        status: 409,
        code: "FOCUSED_TEACHING_REPLACEMENT_REQUIRED",
        detail:
          "This earlier paper needs a new teaching module before timed practice.",
      });
    }
    return Response.json({ teaching });
  },
);
