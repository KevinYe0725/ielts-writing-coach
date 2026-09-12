import { afterEach, describe, expect, it, vi } from "vitest";
import PreviewPage from "./page";

describe("teaching prototype isolation", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("does not publish the prototype in the real-account build", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    await expect(
      PreviewPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
  it("selects the linked design only inside the explicit demo preview", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const page = await PreviewPage({
      searchParams: Promise.resolve({ view: "focus" }),
    });
    expect(page.props.initialView).toBe("focus");
    const fallback = await PreviewPage({
      searchParams: Promise.resolve({ view: "unknown" }),
    });
    expect(fallback.props.initialView).toBe("workbench");
  });
});
