import { z } from "zod";

import { ApiProblem } from "./problem";

const domainIdSchema = z.string().uuid();

export function parseDomainId(value: string, field = "id"): string {
  const parsed = domainIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiProblem({
      title: "Invalid resource id",
      status: 400,
      code: "INVALID_RESOURCE_ID",
      detail: `${field} must be a UUID.`,
      errors: [{ path: field, message: "Expected a UUID." }],
    });
  }
  return parsed.data;
}

async function readBodyText(
  request: Request,
  maximumBytes: number,
): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > maximumBytes
    ) {
      throw new ApiProblem({
        title: "Request body too large",
        status: 413,
        code: "REQUEST_BODY_TOO_LARGE",
        detail: `The request body must not exceed ${maximumBytes} bytes.`,
      });
    }
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new ApiProblem({
          title: "Request body too large",
          status: 413,
          code: "REQUEST_BODY_TOO_LARGE",
          detail: `The request body must not exceed ${maximumBytes} bytes.`,
        });
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch (error) {
    if (error instanceof ApiProblem) throw error;
    throw new ApiProblem({
      title: "Malformed request body",
      status: 400,
      code: "MALFORMED_REQUEST_BODY",
      detail: "The request body must be valid UTF-8 JSON.",
    });
  } finally {
    reader.releaseLock();
  }
}

export async function parseJsonBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
  options: { maximumBytes?: number; allowEmpty?: boolean } = {},
): Promise<z.output<TSchema>> {
  const maximumBytes = options.maximumBytes ?? 64 * 1_024;
  const contentType = request.headers.get("content-type");
  if (
    contentType !== null &&
    !/^(?:application\/json|[^;]+\+json)(?:\s*;|$)/i.test(contentType)
  ) {
    throw new ApiProblem({
      title: "Unsupported media type",
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
      detail: "Use Content-Type: application/json for this operation.",
    });
  }

  const text = await readBodyText(request, maximumBytes);
  if (text.trim().length === 0) {
    if (options.allowEmpty) return schema.parse({});
    throw new ApiProblem({
      title: "Request body required",
      status: 400,
      code: "REQUEST_BODY_REQUIRED",
      detail: "A JSON request body is required.",
    });
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new ApiProblem({
      title: "Malformed JSON",
      status: 400,
      code: "MALFORMED_JSON",
      detail: "The request body is not valid JSON.",
    });
  }
  return schema.parse(value);
}

/**
 * Rebuild a request after bounded UTF-8 body consumption for a delegated
 * handler such as Better Auth. This preserves the handler's own schema and
 * semantics while preventing an unbounded chunked body from reaching it.
 */
export async function boundedDelegatedJsonRequest(
  request: Request,
  maximumBytes = 64 * 1_024,
): Promise<Request> {
  const text = await readBodyText(request, maximumBytes);
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: text,
    signal: request.signal,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

export const emptyObjectSchema = z.object({}).strict();

export const ianaTimezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    },
    { message: "Expected a valid IANA time zone." },
  );

export const localTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Expected a 24-hour HH:mm time.");
