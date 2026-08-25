import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actorId: "learner-1",
  db: {},
  get: vi.fn(),
}));

vi.mock("@/lib/server/context", () => ({
  getServerContext: () => ({ db: state.db }),
}));
vi.mock("@/lib/server/session", () => ({
  requireSession: async () => ({
    id: state.actorId,
    email: `${state.actorId}@example.test`,
    name: "Learner",
    role: "learner" as const,
  }),
}));
vi.mock("@/lib/server/question-recommendation", () => ({
  getQuestionRecommendation: state.get,
}));

import * as routeModule from "./route";

const { GET } = routeModule;

const recommendationId = "f9f0ab90-39e3-4d80-b8f2-968e83b6f722";

function request(): Request {
  return new Request(
    `https://coach.test/api/v1/question-recommendations/${recommendationId}`,
  );
}

describe("GET /api/v1/question-recommendations/:id", () => {
  beforeEach(() => {
    state.actorId = "learner-1";
    state.get.mockReset().mockResolvedValue({
      id: recommendationId,
      status: "READY",
      question: {
        id: "question-1",
        prompt: "A complete public Task 2 prompt.",
        type: "opinion",
        topic: "education",
        ieltsTrack: "academic",
        visibility: "public",
      },
    });
  });

  it("returns the owning learner's READY projection without supply internals", async () => {
    const response = await GET(request(), {
      params: Promise.resolve({ id: recommendationId }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      recommendation: {
        id: recommendationId,
        status: "READY",
        question: {
          id: "question-1",
          prompt: "A complete public Task 2 prompt.",
          type: "opinion",
          topic: "education",
          ielts_track: "academic",
          visibility: "public",
        },
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /generationBatchId|aiJobId|searchConnectionId|score|research/iu,
    );
    expect(state.get).toHaveBeenCalledWith(
      state.db,
      state.actorId,
      recommendationId,
    );
  });

  it("returns 202 while the recommendation remains PENDING", async () => {
    state.get.mockResolvedValue({
      id: recommendationId,
      status: "PENDING",
      question: null,
    });

    const response = await GET(request(), {
      params: Promise.resolve({ id: recommendationId }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      recommendation: {
        id: recommendationId,
        status: "PENDING",
        retry_after_seconds: 2,
      },
    });
  });

  it("returns a safe 503 projection when supply is UNAVAILABLE", async () => {
    state.get.mockResolvedValue({
      id: recommendationId,
      status: "UNAVAILABLE",
      question: null,
    });

    const response = await GET(request(), {
      params: Promise.resolve({ id: recommendationId }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "QUESTION_SUPPLY_UNAVAILABLE",
      recommendation_id: recommendationId,
    });
  });

  it("does not expose a standalone recommendation reset mutation", () => {
    expect(
      (routeModule as unknown as { DELETE?: unknown }).DELETE,
    ).toBeUndefined();
  });
});
