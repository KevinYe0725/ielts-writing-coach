import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn((target: string) => {
    throw new Error(`redirect:${target}`);
  }),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: "iwc.session=test" }),
}));

vi.mock("next/navigation", () => ({
  redirect: state.redirect,
}));

vi.mock("@/lib/server/context", () => ({
  getServerContext: () => ({
    auth: { api: { getSession: state.getSession } },
  }),
}));

import HomePage from "./page";

describe("home page entry", () => {
  beforeEach(() => {
    state.redirect.mockClear();
    state.getSession.mockReset();
  });

  it("sends an anonymous visitor to sign-in", async () => {
    state.getSession.mockResolvedValue(null);

    await expect(HomePage()).rejects.toThrow("redirect:/signin");
    expect(state.redirect).toHaveBeenCalledWith("/signin");
  });

  it("sends an active session to today", async () => {
    state.getSession.mockResolvedValue({ user: { id: "learner-1" } });

    await expect(HomePage()).rejects.toThrow("redirect:/today");
    expect(state.redirect).toHaveBeenCalledWith("/today");
  });
});
