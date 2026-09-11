import { describe, expect, it } from "vitest";
import { HttpLearningClient } from "./http-service";

describe("Today uses learner-safe AI availability", () => {
  it.each([
    [{ state: "configured", can_manage: false }, "configured", "connected"],
    [undefined, "unknown", "compatibility"],
  ] as const)(
    "does not infer a disconnected service from an inaccessible provider list",
    async (service, state, aiState) => {
      const requests: string[] = [];
      const client = new HttpLearningClient({
        baseUrl: "https://coach.test/api/v1",
        origin: "https://coach.test",
        fetch: async (input) => {
          const path = new URL(String(input)).pathname;
          requests.push(path);
          if (path.endsWith("/today"))
            return Response.json({
              next_action: {
                kind: "START_NEW_CYCLE",
                entityId: "question-bank",
                reason: "Choose a question",
                dueAt: null,
                overdue: false,
              },
              cycle: null,
              queue: [],
              ...(service ? { ai_service: service } : {}),
            });
          if (path.endsWith("/providers"))
            return Response.json({ code: "FORBIDDEN" }, { status: 403 });
          return Response.json({});
        },
      });
      const result = await client.getToday();
      expect(result).toMatchObject({
        aiState,
        aiService: { state, canManage: false },
      });
      expect(requests).not.toContain("/api/v1/providers");
    },
  );
});
