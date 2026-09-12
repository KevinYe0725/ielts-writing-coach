import { afterEach, describe, expect, it, vi } from "vitest";

import RoadmapPreviewPage from "./page";

describe("course roadmap preview", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is not published in the real-account build", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    expect(() => RoadmapPreviewPage()).toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("renders only for the explicit demo preview", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    expect(RoadmapPreviewPage()).toBeTruthy();
  });
});
