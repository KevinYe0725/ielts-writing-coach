import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  hasRoute: true,
  hasProvider: true,
  environmentKey: undefined as string | undefined,
  fail: false,
}));
vi.mock("./context", () => ({
  getServerContext: () => ({
    environment: {
      DEPLOYMENT_MODE: "shared",
      OPENAI_API_KEY: state.environmentKey,
    },
    db: {
      transaction: async (callback: (tx: unknown) => unknown) => callback({}),
    },
  }),
}));
vi.mock("./jobs", () => ({
  resolveInstanceDeploymentMode: async () => "shared",
  resolveAIJobRoute: async () => {
    if (state.fail) throw new Error("Private configuration failure");
    return {
      route: state.hasRoute
        ? { providerConnectionId: "private-provider", model: "private-model" }
        : undefined,
      provider: state.hasProvider
        ? {
            id: "private-provider",
            secretCiphertext: "never-return",
            enabled: true,
          }
        : undefined,
    };
  },
}));
import { learnerAiStatus } from "./learner-ai-status";
describe("learner AI status", () => {
  beforeEach(() => {
    state.hasRoute = true;
    state.hasProvider = true;
    state.environmentKey = undefined;
    state.fail = false;
  });
  it("reports shared configuration without exposing privileged provider details", async () => {
    expect(await learnerAiStatus({ id: "learner", role: "learner" })).toEqual({
      state: "configured",
      can_manage: false,
    });
  });
  it("does not treat an absent or disabled route provider as configured", async () => {
    state.hasProvider = false;
    expect(await learnerAiStatus({ id: "owner", role: "owner" })).toEqual({
      state: "needs_setup",
      can_manage: true,
    });
  });
  it("keeps unknown distinct from missing when status cannot be read", async () => {
    state.fail = true;
    expect(await learnerAiStatus({ id: "learner", role: "learner" })).toEqual({
      state: "unknown",
      can_manage: false,
    });
  });
  it("recognizes the same environment fallback as job admission", async () => {
    state.hasRoute = false;
    state.environmentKey = "test-only-not-a-real-key";
    expect(await learnerAiStatus({ id: "owner", role: "owner" })).toEqual({
      state: "configured",
      can_manage: true,
    });
  });
});
