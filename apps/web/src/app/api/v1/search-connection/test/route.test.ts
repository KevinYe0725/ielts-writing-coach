import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProblem } from "@/lib/server/problem";

const state = vi.hoisted(() => ({
  actor: {
    id: "owner-1",
    email: "owner@example.test",
    name: "Owner",
    role: "owner" as "owner" | "admin" | "learner",
  },
  validate: vi.fn(),
  protectMutation: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/server/session", () => ({
  requireSession: async () => state.actor,
  requireRole: (actor: typeof state.actor, roles: readonly string[]) => {
    if (!roles.includes(actor.role))
      throw new ApiProblem({
        title: "Forbidden",
        status: 403,
        code: "FORBIDDEN",
        detail: "Forbidden",
      });
  },
}));
vi.mock("@/lib/server/security", () => ({
  protectMutation: state.protectMutation,
  enforceRateLimit: state.enforceRateLimit,
}));
vi.mock("@iwc/search", () => ({
  BraveSearchAdapter: class {
    validateConnection = state.validate;
  },
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("https://coach.test/api/v1/search-connection/test", {
    method: "POST",
    headers: {
      origin: "https://coach.test",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/search-connection/test", () => {
  beforeEach(() => {
    state.actor = {
      id: "owner-1",
      email: "owner@example.test",
      name: "Owner",
      role: "owner",
    };
    state.protectMutation.mockReset().mockImplementation(() => undefined);
    state.enforceRateLimit.mockReset().mockResolvedValue(undefined);
    state.validate.mockReset().mockResolvedValue({
      ok: true,
      latencyMs: 9,
      safeMessage: "Brave Search connection validated.",
    });
  });

  it("returns a bounded no-store test result without echoing the key", async () => {
    const key = "test-route-api-key";

    const response = await POST(request({ api_key: key }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      latency_ms: 9,
      safe_message: "Brave Search connection validated.",
    });
  });

  it("returns 422 when the provider rejects the submitted key", async () => {
    state.validate.mockResolvedValue({
      ok: false,
      latencyMs: 3,
      safeMessage: "Search credentials were rejected.",
    });

    const response = await POST(request({ api_key: "bad-key" }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "SEARCH_CONNECTION_TEST_FAILED",
    });
  });

  it("rejects a learner before probing the provider", async () => {
    state.actor = {
      id: "learner-1",
      email: "learner@example.test",
      name: "Learner",
      role: "learner",
    };

    const response = await POST(request({ api_key: "valid-looking-key" }));

    expect(response.status).toBe(403);
    expect(state.validate).not.toHaveBeenCalled();
  });
});
