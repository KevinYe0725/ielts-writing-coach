import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAccountIdentity, signOutAccount } from "./account-session";

const sessionStorageState = new Map<string, string>();
const dispatchEvent = vi.fn();

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("account session", () => {
  beforeEach(() => {
    sessionStorageState.clear();
    sessionStorageState.set("iwc:learning-navigation:v1", '{"today":"/today"}');
    dispatchEvent.mockClear();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => sessionStorageState.get(key) ?? null,
        removeItem: (key: string) => sessionStorageState.delete(key),
      },
      dispatchEvent,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("projects only an email, initial, and known role from the active session", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        session: { token: "must-not-reach-the-ui" },
        user: {
          id: "private-user-id",
          email: "learner@example.com",
          name: "Private name",
          role: "learner",
          locale: "zh-CN",
        },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(getAccountIdentity()).resolves.toEqual({
      email: "learner@example.com",
      initial: "L",
      role: "learner",
    });
    expect(fetcher).toHaveBeenCalledWith("/api/v1/auth/get-session", {
      cache: "no-store",
      credentials: "include",
    });
  });

  it("treats absent and malformed sessions as signed out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(response({}, 401)),
    );
    await expect(getAccountIdentity()).resolves.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(response({ user: { email: 42 } })),
    );
    await expect(getAccountIdentity()).resolves.toBeNull();
  });

  it("clears transient navigation only after a confirmed sign out", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ detail: "Try again" }, 500))
      .mockResolvedValueOnce(response({ success: true }));
    vi.stubGlobal("fetch", fetcher);

    await expect(signOutAccount()).rejects.toThrow("Try again");
    expect(
      sessionStorageState.get("iwc:learning-navigation:v1"),
    ).not.toBeNull();

    await expect(signOutAccount()).resolves.toBeUndefined();
    expect(
      sessionStorageState.get("iwc:learning-navigation:v1"),
    ).toBeUndefined();
    expect(fetcher).toHaveBeenLastCalledWith("/api/v1/auth/sign-out", {
      body: "{}",
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  });
});
