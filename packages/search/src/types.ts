export interface SearchQuery {
  query: string;
  freshness: "pm" | "py";
  count: number;
  language: "en";
  safeSearch: "strict";
  timeoutMs: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchConnectionValidation {
  ok: boolean;
  latencyMs: number;
  safeMessage: string;
}

export interface SearchAdapter {
  validateConnection(signal?: AbortSignal): Promise<SearchConnectionValidation>;
  search(input: SearchQuery): Promise<readonly SearchResult[]>;
}
