import { describe, expect, it } from "vitest";

import { readBoundedRequestBody } from "./bounded-body";

describe("readBoundedRequestBody", () => {
  it("accepts a chunked body at the exact byte limit", async () => {
    const request = chunkedRequest([
      new Uint8Array([1, 2]),
      new Uint8Array([3]),
    ]);

    await expect(readBoundedRequestBody(request, 3)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("stops reading a chunked body as soon as the actual limit is exceeded", async () => {
    const request = chunkedRequest([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
    ]);

    await expect(readBoundedRequestBody(request, 3)).rejects.toMatchObject({
      problem: { status: 413, code: "IMPORT_TOO_LARGE" },
    });
  });

  it("rejects an oversized declared content length before consuming the stream", async () => {
    const request = chunkedRequest([new Uint8Array([1])], {
      "content-length": "4",
    });

    await expect(readBoundedRequestBody(request, 3)).rejects.toMatchObject({
      problem: { status: 413, code: "IMPORT_TOO_LARGE" },
    });
    expect(request.bodyUsed).toBe(false);
  });
});

function chunkedRequest(chunks: Uint8Array[], headers?: HeadersInit): Request {
  return new Request("http://localhost/api/v1/imports", {
    method: "POST",
    headers,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}
