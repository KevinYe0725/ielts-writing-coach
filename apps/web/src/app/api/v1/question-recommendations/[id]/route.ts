import { z } from "zod";

import { getServerContext } from "@/lib/server/context";
import { apiRoute } from "@/lib/server/problem";
import { getQuestionRecommendation } from "@/lib/server/question-recommendation";
import { requireSession } from "@/lib/server/session";

import { recommendationResponse } from "../route";

const recommendationIdSchema = z.uuid();

export const GET = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireSession(request);
    const { id } = await context.params;
    const recommendationId = recommendationIdSchema.parse(id);
    const { db } = getServerContext();
    return recommendationResponse(
      await getQuestionRecommendation(db, actor.id, recommendationId),
    );
  },
);
