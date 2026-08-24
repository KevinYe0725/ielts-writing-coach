import type {
  SearchAdapter,
  SearchConnectionValidation,
  SearchQuery,
  SearchResult,
} from "./types";

const BRAVE_SEARCH_ENDPOINT =
  "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_RESULTS = 5;
const MAX_SNIPPET_LENGTH = 500;
const MAX_TITLE_LENGTH = 500;

type FetchLike = (request: Request) => Promise<Response>;

export interface BraveSearchAdapterOptions {
  apiKey: string;
  fetch?: FetchLike;
}

type SafeSearchErrorCode =
  | "AUTHENTICATION"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "REDIRECT"
  | "INVALID_RESPONSE"
  | "RESPONSE_TOO_LARGE"
  | "CONNECTION"
  | "INVALID_QUERY";

type SafeSearchError = Error & {
  code: SafeSearchErrorCode;
  status?: number;
};

function searchError(
  code: SafeSearchErrorCode,
  message: string,
  status?: number,
): SafeSearchError {
  const error = new Error(message) as SafeSearchError;
  error.code = code;
  if (status !== undefined) error.status = status;
  return error;
}

function boundedSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function boundedTimeout(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw searchError("INVALID_QUERY", "Search request is invalid.");
  }
  return Math.min(Math.floor(timeoutMs), MAX_TIMEOUT_MS);
}

function boundedCount(count: number): number {
  if (!Number.isFinite(count) || count < 1) {
    throw searchError("INVALID_QUERY", "Search request is invalid.");
  }
  return Math.min(Math.floor(count), MAX_RESULTS);
}

function responseIsJson(response: Response): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.split(";", 1)[0]?.trim() === "application/json";
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!responseIsJson(response)) {
    throw searchError(
      "INVALID_RESPONSE",
      "Search provider returned an invalid response.",
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw searchError(
      "INVALID_RESPONSE",
      "Search provider returned an invalid response.",
    );
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw searchError(
          "RESPONSE_TOO_LARGE",
          "Search provider response exceeded the allowed size.",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (isSafeSearchError(error)) throw error;
    throw searchError(
      "INVALID_RESPONSE",
      "Search provider returned an invalid response.",
    );
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw searchError(
      "INVALID_RESPONSE",
      "Search provider returned an invalid response.",
    );
  }
}

function isSafeSearchError(error: unknown): error is SafeSearchError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

function normalizeUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      return undefined;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeResults(payload: unknown): readonly SearchResult[] {
  if (typeof payload !== "object" || payload === null) {
    throw searchError(
      "INVALID_RESPONSE",
      "Search provider returned an invalid response.",
    );
  }
  const web = (payload as { web?: unknown }).web;
  if (typeof web !== "object" || web === null) return [];
  const results = (web as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];

  const normalized: SearchResult[] = [];
  for (const result of results) {
    if (normalized.length === MAX_RESULTS) break;
    if (typeof result !== "object" || result === null) continue;
    const record = result as Record<string, unknown>;
    const url = normalizeUrl(record.url);
    if (!url) continue;
    normalized.push({
      title:
        typeof record.title === "string"
          ? record.title.slice(0, MAX_TITLE_LENGTH)
          : "",
      url,
      snippet:
        typeof record.description === "string"
          ? record.description.slice(0, MAX_SNIPPET_LENGTH)
          : "",
    });
  }
  return normalized;
}

function safeErrorFor(error: unknown, signal: AbortSignal): SafeSearchError {
  if (isSafeSearchError(error)) return error;
  if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
    return searchError("TIMEOUT", "Search request timed out.");
  }
  const status =
    typeof error === "object" &&
    error !== null &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : undefined;
  if (status === 401 || status === 403) {
    return searchError(
      "AUTHENTICATION",
      "Search credentials were rejected.",
      status,
    );
  }
  if (status === 429) {
    return searchError(
      "RATE_LIMITED",
      "Search provider rate limit reached.",
      status,
    );
  }
  return searchError("CONNECTION", "Search provider request failed.", status);
}

export class BraveSearchAdapter implements SearchAdapter {
  readonly #apiKey: string;
  readonly #fetch: FetchLike;

  constructor(options: BraveSearchAdapterOptions) {
    if (!options.apiKey) {
      throw new Error("A Brave Search API key is required.");
    }
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetch ?? ((request) => globalThis.fetch(request));
  }

  async validateConnection(
    signal?: AbortSignal,
  ): Promise<SearchConnectionValidation> {
    const started = performance.now();
    try {
      await this.#performSearch(
        {
          query: "connection validation",
          freshness: "pm",
          count: 1,
          language: "en",
          safeSearch: "strict",
          timeoutMs: DEFAULT_TIMEOUT_MS,
        },
        signal,
      );
      return {
        ok: true,
        latencyMs: Math.round(performance.now() - started),
        safeMessage: "Brave Search connection validated.",
      };
    } catch (error) {
      const safeError = isSafeSearchError(error)
        ? error
        : searchError("CONNECTION", "Search provider request failed.");
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - started),
        safeMessage: safeError.message,
      };
    }
  }

  async search(input: SearchQuery): Promise<readonly SearchResult[]> {
    return this.#performSearch(input);
  }

  async #performSearch(
    input: SearchQuery,
    callerSignal?: AbortSignal,
  ): Promise<readonly SearchResult[]> {
    const timeoutMs = boundedTimeout(input.timeoutMs);
    const count = boundedCount(input.count);
    if (
      input.query.trim().length === 0 ||
      input.query.length > 500 ||
      (input.freshness !== "pm" && input.freshness !== "py") ||
      input.language !== "en" ||
      input.safeSearch !== "strict"
    ) {
      throw searchError("INVALID_QUERY", "Search request is invalid.");
    }

    const url = new URL(BRAVE_SEARCH_ENDPOINT);
    url.searchParams.set("q", input.query);
    url.searchParams.set("freshness", input.freshness);
    url.searchParams.set("count", String(count));
    url.searchParams.set("search_lang", "en");
    url.searchParams.set("safesearch", "strict");

    const signal = boundedSignal(timeoutMs, callerSignal);
    const request = new Request(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": this.#apiKey,
      },
      redirect: "error",
      signal,
    });

    try {
      const response = await this.#fetch(request);
      if (response.redirected || (response.status >= 300 && response.status < 400)) {
        throw searchError(
          "REDIRECT",
          "Search provider returned an unsafe redirect.",
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw searchError(
          "AUTHENTICATION",
          "Search credentials were rejected.",
          response.status,
        );
      }
      if (response.status === 429) {
        throw searchError(
          "RATE_LIMITED",
          "Search provider rate limit reached.",
          response.status,
        );
      }
      if (!response.ok) {
        throw searchError(
          "CONNECTION",
          "Search provider request failed.",
          response.status,
        );
      }
      return normalizeResults(await readBoundedJson(response));
    } catch (error) {
      throw safeErrorFor(error, signal);
    }
  }
}
