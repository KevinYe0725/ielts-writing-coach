import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProblem } from "@/lib/server/problem";

const state = vi.hoisted(() => ({
  actor: {
    id: "owner-1",
    email: "owner@example.test",
    name: "Owner",
    role: "owner" as "owner" | "admin" | "learner",
  },
  getProjection: vi.fn(),
  save: vi.fn(),
  revoke: vi.fn(),
  protectMutation: vi.fn(),
  enforceRateLimit: vi.fn(),
  reserve: vi.fn(),
  complete: vi.fn(),
  settle: vi.fn(),
  db: {},
}));

vi.mock("@/lib/server/context", () => ({
  getServerContext: () => ({ db: state.db }),
}));
vi.mock("@/lib/server/session", () => ({
  requireSession: async () => state.actor,
  requireRole: (actor: typeof state.actor, roles: readonly string[]) => {
    if (!roles.includes(actor.role)) {
      throw new ApiProblem({
        title: "Forbidden",
        status: 403,
        code: "FORBIDDEN",
        detail: "Forbidden",
      });
    }
  },
}));
vi.mock("@/lib/server/search-connection", () => ({
  getSearchConnectionProjection: state.getProjection,
  saveSearchConnection: state.save,
  revokeSearchConnection: state.revoke,
}));
vi.mock("@/lib/server/security", () => ({
  protectMutation: state.protectMutation,
  enforceRateLimit: state.enforceRateLimit,
  reserveIdempotencyKey: state.reserve,
  completeIdempotentResponse: state.complete,
  settleIdempotentError: state.settle,
}));

import { DELETE, GET, PUT } from "./route";

function request(method: string, body?: unknown, headers: HeadersInit = {}) {
  return new Request("https://coach.test/api/v1/search-connection", {
    method,
    headers: {
      origin: "https://coach.test",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("/api/v1/search-connection", () => {
  beforeEach(() => {
    state.actor = {
      id: "owner-1",
      email: "owner@example.test",
      name: "Owner",
      role: "owner",
    };
    state.getProjection.mockReset().mockResolvedValue(null);
    state.save.mockReset().mockResolvedValue({
      kind: "brave",
      status: "ACTIVE",
      tested_at: "2026-08-25T00:00:00.000Z",
    });
    state.revoke.mockReset().mockResolvedValue(true);
    state.protectMutation.mockReset().mockImplementation(() => undefined);
    state.enforceRateLimit.mockReset().mockResolvedValue(undefined);
    state.reserve.mockReset().mockResolvedValue({ key: "request-key" });
    state.complete.mockReset().mockResolvedValue(undefined);
    state.settle
      .mockReset()
      .mockImplementation(
        async (_db: unknown, _userId: string, _key: string, error: unknown) => {
          throw error;
        },
      );
  });

  it("returns only the no-store write-only projection to a privileged actor", async () => {
    state.getProjection.mockResolvedValue({
      kind: "brave",
      status: "ACTIVE",
      tested_at: "2026-08-25T00:00:00.000Z",
    });

    const response = await GET(request("GET"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      kind: "brave",
      status: "ACTIVE",
      tested_at: "2026-08-25T00:00:00.000Z",
    });
  });

  it("rejects learner connection metadata", async () => {
    state.actor = {
      id: "learner-1",
      email: "learner@example.test",
      name: "Learner",
      role: "learner",
    };

    const response = await GET(request("GET"));

    expect(response.status).toBe(403);
    expect(state.getProjection).not.toHaveBeenCalled();
  });

  it("protects, bounds, idempotently saves, and never returns the submitted key", async () => {
    const apiKey = "route-api-key";

    const response = await PUT(
      request(
        "PUT",
        { api_key: apiKey },
        { "idempotency-key": "search-save-1" },
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.save).toHaveBeenCalledWith(state.db, state.actor, apiKey);
    expect(state.complete).toHaveBeenCalledWith(
      state.db,
      state.actor.id,
      "request-key",
      200,
      expect.any(Object),
    );
    expect(await response.text()).not.toContain(apiKey);
  });

  it("rejects an invalid key before the idempotent persistence boundary", async () => {
    const response = await PUT(
      request("PUT", { api_key: " " }, { "idempotency-key": "search-save-2" }),
    );

    expect(response.status).toBe(422);
    expect(state.reserve).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });

  it("revokes with an idempotent no-content response", async () => {
    const response = await DELETE(
      request("DELETE", undefined, { "idempotency-key": "search-delete-1" }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.revoke).toHaveBeenCalledWith(state.db, state.actor);
    expect(state.complete).toHaveBeenCalledWith(
      state.db,
      state.actor.id,
      "request-key",
      204,
      { revoked: true },
    );
  });
});
