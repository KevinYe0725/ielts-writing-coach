import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAIAdapter } from "./openai";

describe("OpenAIAdapter structured requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps structured contract context out of OpenAI payloads", async () => {
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            id: "resp_safe",
            object: "response",
            created_at: 0,
            status: "completed",
            model: "gpt-safe",
            output: [
              {
                id: "msg_safe",
                type: "message",
                status: "completed",
                role: "assistant",
                content: [
                  {
                    type: "output_text",
                    text: '{"ok":true}',
                    annotations: [],
                    logprobs: [],
                  },
                ],
              },
            ],
            usage: {
              input_tokens: 1,
              output_tokens: 1,
              total_tokens: 2,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );
    const adapter = new OpenAIAdapter("test-api-key");

    await adapter.generateStructured({
      model: "gpt-safe",
      input: "Return JSON.",
      schemaName: "context_is_internal",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["ok"],
        properties: { ok: { type: "boolean" } },
      },
      contractContext: {
        kind: "question_bank_refill_v1",
        targetMix: [{ questionType: "opinion", topic: "education", count: 1 }],
      },
      validate: (value): value is { ok: true } =>
        typeof value === "object" &&
        value !== null &&
        (value as { ok?: unknown }).ok === true,
    });

    expect(JSON.stringify(requestBody)).not.toContain("contractContext");
    expect(JSON.stringify(requestBody)).not.toContain(
      "question_bank_refill_v1",
    );
  });
});
