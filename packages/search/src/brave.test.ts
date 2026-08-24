import { describe, expect, it } from "vitest";

import { BraveSearchAdapter } from "./brave";

const MAX_RESPONSE_BYTES = 256 * 1024;

function jsonBodyOfExactByteLength(bytes: number): string {
  const prefix = '{"web":{"results":[]},"padding":"';
  const suffix = '"}';
  const paddingLength = bytes - new TextEncoder().encode(prefix + suffix).byteLength;
  if (paddingLength < 0) throw new Error("Fixture length is too small.");
  const body = `${prefix}${"x".repeat(paddingLength)}${suffix}`;
  expect(new TextEncoder().encode(body).byteLength).toBe(bytes);
  return body;
}

function jsonResponse(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "application/json" },
  });
}

const defaultQuery = {
  query: "urban mobility",
  freshness: "pm" as const,
  count: 10,
  language: "en" as const,
  safeSearch: "strict" as const,
  timeoutMs: 1_000,
};

describe("BraveSearchAdapter", () => {
  it("uses the fixed HTTPS boundary, key header, strict settings, and a capped count", async () => {
    const adapter = new BraveSearchAdapter({
      apiKey: "test-key",
      fetch: async (request) => {
        const url = new URL(request.url);
        expect(url.origin).toBe("https://api.search.brave.com");
        expect(url.pathname).toBe("/res/v1/web/search");
        expect(url.searchParams.get("q")).toBe("urban mobility");
        expect(url.searchParams.get("freshness")).toBe("pm");
        expect(url.searchParams.get("count")).toBe("5");
        expect(url.searchParams.get("search_lang")).toBe("en");
        expect(url.searchParams.get("safesearch")).toBe("strict");
        expect(request.headers.get("X-Subscription-Token")).toBe("test-key");
        expect(request.redirect).toBe("error");
        return Response.json({
          web: {
            results: [
              {
                title: "Urban mobility",
                url: "https://EXAMPLE.test:443/a#ignored",
                description: "Public transport policy.",
              },
            ],
          },
        });
      },
    });

    await expect(adapter.search(defaultQuery)).resolves.toEqual([
      {
        title: "Urban mobility",
        url: "https://example.test/a",
        snippet: "Public transport policy.",
      },
    ]);
  });

  it("returns a safe timeout error", async () => {
    const adapter = new BraveSearchAdapter({
      apiKey: "test-key",
      fetch: (request) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener(
            "abort",
            () => reject(new DOMException("provider reflected test-key", "AbortError")),
            { once: true },
          );
        }),
    });

    const error = await adapter
      .search({ ...defaultQuery, timeoutMs: 1 })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Search request timed out.");
    expect((error as Error).message).not.toContain("test-key");
  });

  it.each([
    [401, "Search credentials were rejected."],
    [429, "Search provider rate limit reached."],
  ])("returns a safe error for HTTP %i", async (status, expectedMessage) => {
    const adapter = new BraveSearchAdapter({
      apiKey: "test-key",
      fetch: async () => new Response("test-key reflected here", { status }),
    });

    await expect(adapter.search(defaultQuery)).rejects.toThrow(expectedMessage);
  });

  it("rejects a redirect response without exposing its target", async () => {
    const adapter = new BraveSearchAdapter({
      apiKey: "test-key",
      fetch: async () =>
        new Response("https://unsafe.example.test/test-key", {
          status: 302,
          headers: { location: "https://unsafe.example.test/test-key" },
        }),
    });

    await expect(adapter.search(defaultQuery)).rejects.toThrow(
      "Search provider returned an unsafe redirect.",
    );
  });

  it("rejects non-JSON responses without exposing their content", async () => {
    const adapter = new BraveSearchAdapter({
      apiKey: "test-key",
      fetch: async () =>
        new Response("test-key reflected in HTML", {
          headers: { "content-type": "text/html" },
        }),
    });

    await expect(adapter.search(defaultQuery)).rejects.toThrow(
      "Search provider returned an invalid response.",
    );
  });

  it("accepts a JSON response at exactly the 256 KiB byte boundary", async () => {
    const adapter = new BraveSearchAdapter({
      apiKey: "test-key",
      fetch: async () => jsonResponse(jsonBodyOfExactByteLength(MAX_RESPONSE_BYTES)),
    });

    await expect(adapter.search(defaultQuery)).resolves.toEqual([]);
  });

  it("rejects a JSON response one byte above the 256 KiB byte boundary", async () => {
    const adapter = new BraveSearchAdapter({
      apiKey: "test-key",
      fetch: async () =>
        jsonResponse(jsonBodyOfExactByteLength(MAX_RESPONSE_BYTES + 1)),
    });

    await expect(adapter.search(defaultQuery)).rejects.toThrow(
      "Search provider response exceeded the allowed size.",
    );
  });

  it("returns only canonical HTTPS URLs, snippets capped at 500 characters, and five results", async () => {
    const longSnippet = "x".repeat(501);
    const adapter = new BraveSearchAdapter({
      apiKey: "test-key",
      fetch: async () =>
        Response.json({
          web: {
            results: [
              {
                title: "insecure",
                url: "http://example.test/nope",
                description: "Must not be returned.",
              },
              {
                title: "credentialed",
                url: "https://user:password@example.test/nope",
                description: "Must not be returned.",
              },
              ...Array.from({ length: 6 }, (_, index) => ({
                title: `Result ${index + 1}`,
                url: `https://example.test/${index + 1}`,
                description: index === 0 ? longSnippet : `Snippet ${index + 1}`,
              })),
            ],
          },
        }),
    });

    const results = await adapter.search(defaultQuery);
    expect(results).toHaveLength(5);
    expect(results[0]).toEqual({
      title: "Result 1",
      url: "https://example.test/1",
      snippet: "x".repeat(500),
    });
    expect(results.map((result) => result.url)).toEqual([
      "https://example.test/1",
      "https://example.test/2",
      "https://example.test/3",
      "https://example.test/4",
      "https://example.test/5",
    ]);
  });

  it("reports connection failures through a safe validation result", async () => {
    const adapter = new BraveSearchAdapter({
      apiKey: "test-key",
      fetch: async () => new Response("test-key reflected here", { status: 401 }),
    });

    await expect(adapter.validateConnection()).resolves.toMatchObject({
      ok: false,
      safeMessage: "Search credentials were rejected.",
    });
  });
});
