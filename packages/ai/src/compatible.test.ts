import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { CompatibleAdapter } from "./compatible";
import type { ProviderAddressResolver } from "./ssrf";

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return (server.address() as AddressInfo).port;
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("CompatibleAdapter pinned provider requests", () => {
  it("uses the exact API root and supports a preset-owned api-key header", async () => {
    let requestedPath: string | undefined;
    let apiKeyHeader: string | undefined;
    let authorizationHeader: string | undefined;
    const server = createServer((request, response) => {
      requestedPath = request.url;
      apiKeyHeader = request.headers["api-key"] as string | undefined;
      authorizationHeader = request.headers.authorization;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [] }));
    });
    const port = await listen(server);
    const baseUrl = `http://provider.test:${port}/openai/v1`;
    const adapter = new CompatibleAdapter({
      apiKey: "azure-test-key",
      authHeader: "api-key",
      baseUrl,
      localBaseUrlAllowlist: [baseUrl],
      addressResolver: async () => [{ address: "127.0.0.1", family: 4 }],
    });

    try {
      await adapter.listModels();
      expect(requestedPath).toBe("/openai/v1/models");
      expect(apiKeyHeader).toBe("azure-test-key");
      expect(authorizationHeader).toBeUndefined();
    } finally {
      await close(server);
    }
  });

  it("uses the one validated DNS result for the actual socket while preserving Host", async () => {
    let requestedHost: string | undefined;
    let requestedPath: string | undefined;
    let requestedConnection: string | undefined;
    const server = createServer((request, response) => {
      requestedHost = request.headers.host;
      requestedPath = request.url;
      requestedConnection = request.headers.connection;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({ data: [{ id: "test-model", owned_by: "local" }] }),
      );
    });
    const port = await listen(server);
    let resolutionCalls = 0;
    const resolver: ProviderAddressResolver = async () => {
      resolutionCalls += 1;
      // A second lookup would simulate rebinding to a metadata endpoint. The
      // request must instead use the first, already-validated address.
      return resolutionCalls === 1
        ? [{ address: "127.0.0.1", family: 4 }]
        : [{ address: "169.254.169.254", family: 4 }];
    };
    const baseUrl = `http://provider.test:${port}/v1`;
    const adapter = new CompatibleAdapter({
      apiKey: "test-only-key",
      baseUrl,
      localBaseUrlAllowlist: [baseUrl],
      addressResolver: resolver,
    });

    try {
      await expect(adapter.listModels()).resolves.toEqual([
        { id: "test-model", ownedBy: "local" },
      ]);
      expect(resolutionCalls).toBe(1);
      expect(requestedHost).toBe(`provider.test:${port}`);
      expect(requestedPath).toBe("/v1/models");
      expect(requestedConnection).toBe("close");
    } finally {
      await close(server);
    }
  });

  it("does not follow a redirect to another origin", async () => {
    let redirectedTargetHits = 0;
    const target = createServer((_request, response) => {
      redirectedTargetHits += 1;
      response.end("should not be reached");
    });
    const targetPort = await listen(target);
    const source = createServer((_request, response) => {
      response.statusCode = 302;
      response.setHeader("location", `http://127.0.0.1:${targetPort}/metadata`);
      response.end();
    });
    const sourcePort = await listen(source);
    const baseUrl = `http://source.test:${sourcePort}/v1`;
    const adapter = new CompatibleAdapter({
      baseUrl,
      localBaseUrlAllowlist: [baseUrl],
      addressResolver: async () => [{ address: "127.0.0.1", family: 4 }],
    });

    try {
      await expect(adapter.listModels()).rejects.toThrow(
        "redirects are not allowed",
      );
      expect(redirectedTargetHits).toBe(0);
    } finally {
      await Promise.all([close(source), close(target)]);
    }
  });

  it("validates DNS again for a later independent request", async () => {
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [] }));
    });
    const port = await listen(server);
    let resolutionCalls = 0;
    const baseUrl = `http://provider.test:${port}/v1`;
    const adapter = new CompatibleAdapter({
      baseUrl,
      localBaseUrlAllowlist: [baseUrl],
      addressResolver: async () => {
        resolutionCalls += 1;
        return [{ address: "127.0.0.1", family: 4 }];
      },
    });

    try {
      await adapter.listModels();
      await adapter.listModels();
      expect(resolutionCalls).toBe(2);
    } finally {
      await close(server);
    }
  });

  it("does not retain an arbitrary provider error body in the thrown error", async () => {
    const sentinel = "unusual-error-sentinel-£-秘密-987";
    const server = createServer((_request, response) => {
      response.statusCode = 418;
      response.end(`upstream reflected ${sentinel}`);
    });
    const port = await listen(server);
    const baseUrl = `http://provider.test:${port}/v1`;
    const adapter = new CompatibleAdapter({
      apiKey: "test-only-key",
      baseUrl,
      localBaseUrlAllowlist: [baseUrl],
      addressResolver: async () => [{ address: "127.0.0.1", family: 4 }],
    });

    try {
      const error = await adapter
        .listModels()
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain(sentinel);
      expect(adapter.normalizeError(error).safeMessage).not.toContain(sentinel);
    } finally {
      await close(server);
    }
  });

  it("rejects a successful payload that reflects the exact configured key", async () => {
    const apiKey = "custom.key.format~ZZ987-secret";
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [{ id: apiKey }] }));
    });
    const port = await listen(server);
    const baseUrl = `http://provider.test:${port}/v1`;
    const adapter = new CompatibleAdapter({
      apiKey,
      baseUrl,
      localBaseUrlAllowlist: [baseUrl],
      addressResolver: async () => [{ address: "127.0.0.1", family: 4 }],
    });

    try {
      await expect(adapter.listModels()).rejects.toThrow("invalid response");
    } finally {
      await close(server);
    }
  });

  it("rejects reflected credentials in provider-controlled response metadata", async () => {
    const apiKey = "custom.key.format~ZZ987-secret";
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          id: apiKey,
          model: "safe-model",
          choices: [{ message: { content: "Safe text" } }],
        }),
      );
    });
    const port = await listen(server);
    const baseUrl = `http://provider.test:${port}/v1`;
    const adapter = new CompatibleAdapter({
      apiKey,
      baseUrl,
      localBaseUrlAllowlist: [baseUrl],
      addressResolver: async () => [{ address: "127.0.0.1", family: 4 }],
    });

    try {
      await expect(
        adapter.generateText({ model: "safe-model", input: "hello" }),
      ).rejects.toThrow("invalid response");
    } finally {
      await close(server);
    }
  });

  it("forwards a stable logical idempotency key to the compatible provider", async () => {
    const receivedKeys: Array<string | undefined> = [];
    const server = createServer((request, response) => {
      const key = request.headers["idempotency-key"];
      receivedKeys.push(Array.isArray(key) ? key[0] : key);
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          id: "response-1",
          model: "safe-model",
          choices: [{ message: { content: "Safe response" } }],
        }),
      );
    });
    const port = await listen(server);
    const baseUrl = `http://provider.test:${port}/v1`;
    const adapter = new CompatibleAdapter({
      baseUrl,
      localBaseUrlAllowlist: [baseUrl],
      addressResolver: async () => [{ address: "127.0.0.1", family: 4 }],
    });

    try {
      await adapter.generateText({
        model: "safe-model",
        input: "hello",
        idempotencyKey: "logical-job-123",
      });
      expect(receivedKeys).toEqual(["logical-job-123:text"]);
    } finally {
      await close(server);
    }
  });
});
