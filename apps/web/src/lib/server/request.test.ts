import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApiProblem } from "./problem";
import {
  ianaTimezoneSchema,
  localTimeSchema,
  boundedDelegatedJsonRequest,
  parseDomainId,
  parseJsonBody,
} from "./request";

const strictPayload = z.object({ value: z.string().max(20) }).strict();

describe("bounded API request parsing", () => {
  it("rejects an oversized declared body before parsing", async () => {
    const request = new Request("http://localhost/api/v1/test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "9999",
      },
      body: JSON.stringify({ value: "safe" }),
    });
    await expect(
      parseJsonBody(request, strictPayload, { maximumBytes: 32 }),
    ).rejects.toMatchObject({
      problem: { status: 413, code: "REQUEST_BODY_TOO_LARGE" },
    });
  });

  it("bounds a chunked body even without Content-Length", async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ value: "x".repeat(50) }),
    );
    const request = new Request("http://localhost/api/v1/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.subarray(0, 12));
          controller.enqueue(bytes.subarray(12));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    await expect(
      parseJsonBody(request, strictPayload, { maximumBytes: 32 }),
    ).rejects.toMatchObject({
      problem: { status: 413, code: "REQUEST_BODY_TOO_LARGE" },
    });
  });

  it("rejects unsupported media types and malformed JSON", async () => {
    await expect(
      parseJsonBody(
        new Request("http://localhost/api/v1/test", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: "{}",
        }),
        strictPayload,
      ),
    ).rejects.toMatchObject({
      problem: { status: 415, code: "UNSUPPORTED_MEDIA_TYPE" },
    });
    await expect(
      parseJsonBody(
        new Request("http://localhost/api/v1/test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        }),
        strictPayload,
      ),
    ).rejects.toMatchObject({
      problem: { status: 400, code: "MALFORMED_JSON" },
    });
  });

  it("accepts only real UUIDs, IANA zones, and clock times", () => {
    expect(parseDomainId("019ff69d-ea7d-7d92-8603-284f7add1179")).toBe(
      "019ff69d-ea7d-7d92-8603-284f7add1179",
    );
    expect(() => parseDomainId("not-an-id")).toThrow(ApiProblem);
    expect(ianaTimezoneSchema.safeParse("Asia/Shanghai").success).toBe(true);
    expect(ianaTimezoneSchema.safeParse("Mars/Olympus").success).toBe(false);
    expect(localTimeSchema.safeParse("23:59").success).toBe(true);
    expect(localTimeSchema.safeParse("29:99").success).toBe(false);
  });

  it("bounds and rebuilds a JSON request for delegated auth handlers", async () => {
    const body = JSON.stringify({ email: "learner@example.test" });
    const rebuilt = await boundedDelegatedJsonRequest(
      new Request("https://coach.test/api/v1/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(new TextEncoder().encode(body).byteLength),
          origin: "https://coach.test",
        },
        body,
      }),
      1_024,
    );
    expect(rebuilt.headers.get("origin")).toBe("https://coach.test");
    expect(rebuilt.headers.has("content-length")).toBe(false);
    await expect(rebuilt.json()).resolves.toEqual({
      email: "learner@example.test",
    });

    await expect(
      boundedDelegatedJsonRequest(
        new Request("https://coach.test/api/v1/auth/sign-in/email", {
          method: "POST",
          headers: { "content-length": "70000" },
          body: "{}",
        }),
      ),
    ).rejects.toMatchObject({
      problem: { status: 413, code: "REQUEST_BODY_TOO_LARGE" },
    });
  });
});
