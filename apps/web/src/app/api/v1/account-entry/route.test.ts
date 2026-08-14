import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProblem } from "@/lib/server/problem";

const state = vi.hoisted(() => ({
  enterAccount: vi.fn(),
  protectMutation: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/server/account-entry", () => ({
  enterAccount: state.enterAccount,
}));

vi.mock("@/lib/server/context", () => ({
  getServerContext: () => ({
    environment: { APP_URL: "https://coach.test" },
  }),
}));

vi.mock("@/lib/server/security", () => ({
  protectMutation: state.protectMutation,
  enforceRateLimit: state.enforceRateLimit,
}));

import { POST } from "./route";

function request(body: unknown, headers: HeadersInit = {}) {
  return new Request("https://coach.test/api/v1/account-entry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://coach.test",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/account-entry", () => {
  beforeEach(() => {
    state.enterAccount.mockReset();
    state.protectMutation.mockReset().mockImplementation(() => undefined);
    state.enforceRateLimit.mockReset().mockResolvedValue(undefined);
  });

  it("returns a no-store registered outcome and preserves the session cookie", async () => {
    state.enterAccount.mockResolvedValue({
      kind: "REGISTERED",
      redirectTo: "/today",
      headers: new Headers({ "set-cookie": "iwc.session=created; HttpOnly" }),
    });

    const response = await POST(
      request({ email: "new@example.test", password: "secure-password" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain("iwc.session=created");
    await expect(response.json()).resolves.toEqual({
      outcome: "REGISTERED",
      redirect_to: "/today",
    });
  });

  it("does not invoke account policy after an untrusted origin is rejected", async () => {
    state.protectMutation.mockImplementation(() => {
      throw new ApiProblem({
        title: "Invalid origin",
        status: 403,
        code: "INVALID_ORIGIN",
        detail: "The request origin is not trusted.",
      });
    });

    const response = await POST(
      request(
        { email: "new@example.test", password: "secure-password" },
        { origin: "https://evil.example" },
      ),
    );

    expect(response.status).toBe(403);
    expect(state.enterAccount).not.toHaveBeenCalled();
  });

  it("returns invitation-required for a shared unknown email", async () => {
    state.enterAccount.mockResolvedValue({ kind: "INVITE_REQUIRED" });

    const response = await POST(
      request({ email: "new@example.test", password: "secure-password" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVITE_REQUIRED",
    });
  });

  it("rejects a body above the 4 KiB limit", async () => {
    const response = await POST(
      request({
        email: "new@example.test",
        password: "x".repeat(4_100),
      }),
    );

    expect(response.status).toBe(413);
    expect(state.enterAccount).not.toHaveBeenCalled();
  });
});
