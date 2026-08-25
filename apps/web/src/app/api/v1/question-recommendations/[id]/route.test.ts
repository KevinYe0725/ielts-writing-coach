import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actorId: "learner-1",
  db: {},
  get: vi.fn(),
  abandon: vi.fn(),
  protectMutation: vi.fn(),
  enforceRateLimit: vi.fn(),
  reserve: vi.fn(),
  complete: vi.fn(),
  settle: vi.fn(),
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
  abandonQuestionRecommendation: state.abandon,
  getQuestionRecommendation: state.get,
}));
vi.mock("@/lib/server/security", () => ({
  protectMutation: state.protectMutation,
  enforceRateLimit: state.enforceRateLimit,
  reserveIdempotencyKey: state.reserve,
  completeIdempotentResponse: state.complete,
  settleIdempotentError: state.settle,
}));

import * as routeModule from "./route";

const { GET } = routeModule;

const recommendationId = "f9f0ab90-39e3-4d80-b8f2-968e83b6f722";

function request(): Request {
  return new Request(
    `https://coach.test/api/v1/question-recommendations/${recommendationId}`,
  );
}

function mutationRequest(body?: unknown): Request {
  return new Request(
    `https://coach.test/api/v1/question-recommendations/${recommendationId}`,
    {
      method: "DELETE",
      headers: {
        origin: "https://coach.test",
        "idempotency-key": "abandon-recommendation-1",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
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
    state.abandon
      .mockReset()
      .mockImplementation(async (_db, _actorId, _id, options) => {
        await options?.afterPersist(state.db);
      });
    state.protectMutation.mockReset().mockImplementation(() => undefined);
    state.enforceRateLimit.mockReset().mockResolvedValue(undefined);
    state.reserve.mockReset().mockResolvedValue({ key: "reserved-key" });
    state.complete.mockReset().mockResolvedValue(undefined);
    state.settle
      .mockReset()
      .mockImplementation(
        async (_db: unknown, _userId: string, _key: string, error: unknown) => {
          throw error;
        },
      );
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

  it("protects, rate-limits, idempotently abandons, and returns no internals", async () => {
    const DELETE = (
      routeModule as unknown as {
        DELETE?: (
          request: Request,
          context: { params: Promise<{ id: string }> },
        ) => Promise<Response>;
      }
    ).DELETE;
    expect(DELETE).toEqual(expect.any(Function));
    if (!DELETE) return;

    const response = await DELETE(mutationRequest(), {
      params: Promise.resolve({ id: recommendationId }),
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.text()).resolves.toBe("");
    expect(state.protectMutation).toHaveBeenCalledOnce();
    expect(state.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        bucket: "question-recommendations-abandon",
        identity: state.actorId,
      }),
    );
    expect(state.reserve).toHaveBeenCalledWith(
      state.db,
      state.actorId,
      expect.any(Request),
      {},
    );
    expect(state.abandon).toHaveBeenCalledWith(
      state.db,
      state.actorId,
      recommendationId,
      expect.objectContaining({ afterPersist: expect.any(Function) }),
    );
    expect(state.complete).toHaveBeenCalledWith(
      state.db,
      state.actorId,
      "reserved-key",
      204,
      { abandoned: true },
    );
  });

  it("rejects non-empty or oversized abandonment bodies before reservation", async () => {
    const DELETE = (
      routeModule as unknown as {
        DELETE?: (
          request: Request,
          context: { params: Promise<{ id: string }> },
        ) => Promise<Response>;
      }
    ).DELETE;
    expect(DELETE).toEqual(expect.any(Function));
    if (!DELETE) return;

    for (const [body, status] of [
      [{ unexpected: true }, 422],
      [{ padding: "x".repeat(1_025) }, 413],
    ] as const) {
      const response = await DELETE(mutationRequest(body), {
        params: Promise.resolve({ id: recommendationId }),
      });
      expect(response.status).toBe(status);
    }
    expect(state.reserve).not.toHaveBeenCalled();
    expect(state.abandon).not.toHaveBeenCalled();
  });

  it("replays completed abandonment without repeating the state transition", async () => {
    const DELETE = (
      routeModule as unknown as {
        DELETE?: (
          request: Request,
          context: { params: Promise<{ id: string }> },
        ) => Promise<Response>;
      }
    ).DELETE;
    expect(DELETE).toEqual(expect.any(Function));
    if (!DELETE) return;
    state.reserve.mockResolvedValue({
      key: "replay-key",
      replay: new Response(null, {
        status: 204,
        headers: { "idempotency-replayed": "true" },
      }),
    });

    const response = await DELETE(mutationRequest(), {
      params: Promise.resolve({ id: recommendationId }),
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("idempotency-replayed")).toBe("true");
    expect(state.abandon).not.toHaveBeenCalled();
    expect(state.complete).not.toHaveBeenCalled();
  });
});
