import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProblem } from "@/lib/server/problem";

const state = vi.hoisted(() => ({
  actor: {
    id: "learner-1",
    email: "learner@example.test",
    name: "Learner",
    role: "learner" as const,
  },
  db: {},
  protectMutation: vi.fn(),
  enforceRateLimit: vi.fn(),
  reserve: vi.fn(),
  complete: vi.fn(),
  settle: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/server/context", () => ({
  getServerContext: () => ({ db: state.db }),
}));
vi.mock("@/lib/server/session", () => ({
  requireSession: async () => state.actor,
}));
vi.mock("@/lib/server/security", () => ({
  protectMutation: state.protectMutation,
  enforceRateLimit: state.enforceRateLimit,
  reserveIdempotencyKey: state.reserve,
  completeIdempotentResponse: state.complete,
  settleIdempotentError: state.settle,
}));
vi.mock("@/lib/server/question-recommendation", () => ({
  createQuestionRecommendation: state.create,
}));

import { POST } from "./route";

function request(body: unknown, headers: HeadersInit = {}): Request {
  return new Request("https://coach.test/api/v1/question-recommendations", {
    method: "POST",
    headers: {
      origin: "https://coach.test",
      "content-type": "application/json",
      "idempotency-key": "recommendation-request-1",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/question-recommendations", () => {
  beforeEach(() => {
    state.protectMutation.mockReset().mockImplementation(() => undefined);
    state.enforceRateLimit.mockReset().mockResolvedValue(undefined);
    state.reserve.mockReset().mockResolvedValue({ key: "reserved-key" });
    state.complete.mockReset().mockResolvedValue(undefined);
    state.settle
      .mockReset()
      .mockImplementation(async (_db, _actorId, _key, error) => {
        throw error;
      });
    state.create.mockReset().mockResolvedValue({
      id: "0b1472aa-d5f6-4f9d-961d-674e815cfb91",
      status: "READY",
      question: {
        id: "question-1",
        prompt:
          "Some people think schools should teach practical skills. Discuss both views.",
        type: "discussion",
        topic: "education",
        ieltsTrack: "academic",
        visibility: "public",
      },
    });
  });

  it("protects, rate-limits, bounds, and idempotently returns READY", async () => {
    const response = await POST(request({ action: "INITIAL" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.protectMutation).toHaveBeenCalledOnce();
    expect(state.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ identity: state.actor.id }),
    );
    expect(state.reserve).toHaveBeenCalledWith(
      state.db,
      state.actor.id,
      expect.any(Request),
      { action: "INITIAL" },
    );
    expect(state.create).toHaveBeenCalledWith(
      state.db,
      state.actor.id,
      { action: "INITIAL" },
      expect.objectContaining({ afterPersist: expect.any(Function) }),
    );
    await expect(response.json()).resolves.toEqual({
      recommendation: {
        id: "0b1472aa-d5f6-4f9d-961d-674e815cfb91",
        status: "READY",
        question: {
          id: "question-1",
          prompt:
            "Some people think schools should teach practical skills. Discuss both views.",
          type: "discussion",
          topic: "education",
          ielts_track: "academic",
          visibility: "public",
        },
      },
    });
  });

  it("returns 202 with bounded polling metadata for PENDING", async () => {
    state.create.mockResolvedValue({
      id: "44d0f431-5c06-4623-9d00-c5ab6872cd5c",
      status: "PENDING",
      question: null,
    });

    const response = await POST(request({ action: "INITIAL" }));

    expect(response.status).toBe(202);
    expect(response.headers.get("location")).toBe(
      "/api/v1/question-recommendations/44d0f431-5c06-4623-9d00-c5ab6872cd5c",
    );
    await expect(response.json()).resolves.toEqual({
      recommendation: {
        id: "44d0f431-5c06-4623-9d00-c5ab6872cd5c",
        status: "PENDING",
        retry_after_seconds: 2,
        message:
          "We are preparing a new essay question. You can also paste your own question.",
      },
    });
  });

  it("returns a learner-safe 503 when supply is UNAVAILABLE", async () => {
    state.create.mockResolvedValue({
      id: "a3566cae-3f48-4af2-adf7-653320bbb470",
      status: "UNAVAILABLE",
      question: null,
    });

    const response = await POST(request({ action: "INITIAL" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "QUESTION_SUPPLY_UNAVAILABLE",
      recommendation_id: "a3566cae-3f48-4af2-adf7-653320bbb470",
      detail: expect.stringMatching(/paste your own question/i),
    });
  });

  it("replays a completed idempotency key without creating another exposure", async () => {
    state.reserve.mockResolvedValue({
      key: "reserved-key",
      replay: Response.json(
        {
          recommendation: {
            id: "same-recommendation",
            status: "READY",
            question: { id: "same-question" },
          },
        },
        { headers: { "idempotency-replayed": "true" } },
      ),
    });

    const response = await POST(request({ action: "INITIAL" }));

    expect(response.headers.get("idempotency-replayed")).toBe("true");
    expect(state.create).not.toHaveBeenCalled();
    expect(state.complete).not.toHaveBeenCalled();
  });

  it("returns ACTIVE_CYCLE_LIMIT without exposing a recommendation", async () => {
    state.create.mockRejectedValue(
      new ApiProblem({
        title: "Eight essays are already in progress",
        status: 409,
        code: "ACTIVE_CYCLE_LIMIT",
        detail:
          "You already have eight essays in progress. Continue one of them before starting another.",
      }),
    );

    const response = await POST(request({ action: "INITIAL" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "ACTIVE_CYCLE_LIMIT",
      status: 409,
    });
    expect(state.complete).not.toHaveBeenCalled();
  });

  it("rejects malformed, unexpected, and oversized bodies before reservation", async () => {
    for (const body of [
      { action: "UNKNOWN" },
      { action: "INITIAL", unexpected: true },
      { action: "SWAP", excluded_question_id: "x".repeat(201) },
    ]) {
      const response = await POST(request(body));
      expect(response.status).toBe(422);
    }
    const oversized = await POST(
      request({ action: "INITIAL", padding: "x".repeat(5_000) }),
    );
    expect(oversized.status).toBe(413);
    expect(state.reserve).not.toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
  });
});
