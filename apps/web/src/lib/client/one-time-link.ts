"use client";

import { useEffect, useRef, useState } from "react";

export interface ConsumedOneTimeLink {
  token: string;
  invalidToken: boolean;
}

export interface OneTimeLinkState extends ConsumedOneTimeLink {
  ready: boolean;
}

/**
 * Read a one-time credential without mutating browser state. Keeping this
 * separate from clearing the URL makes React state initializers pure, even
 * when development Strict Mode invokes them more than once.
 */
export function readOneTimeLink(href: string): ConsumedOneTimeLink {
  const url = new URL(href);
  return {
    token: url.searchParams.get("token") ?? "",
    invalidToken: url.searchParams.get("error") === "INVALID_TOKEN",
  };
}

/** Remove every query parameter from the current history entry. */
export function clearOneTimeLinkFromAddressBar(
  location: Pick<Location, "href" | "pathname" | "hash">,
  history: Pick<History, "replaceState" | "state">,
): void {
  const url = new URL(location.href);
  if (url.search.length > 0) {
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${location.hash}`,
    );
  }
}

/**
 * Move one-time credentials from the visible URL into component memory only.
 * Nothing is written to localStorage, sessionStorage, IndexedDB, cookies, or
 * the replacement history entry.
 */
export function consumeOneTimeLinkFromAddressBar(
  location: Pick<Location, "href" | "pathname" | "hash">,
  history: Pick<History, "replaceState" | "state">,
): ConsumedOneTimeLink {
  const value = readOneTimeLink(location.href);
  clearOneTimeLinkFromAddressBar(location, history);
  return value;
}

/**
 * Consume the link after hydration so the server and first browser render are
 * identical. The ref also prevents React development Strict Mode from reading
 * the already-cleared address bar during its second effect pass.
 */
export function useOneTimeLinkFromAddressBar(): OneTimeLinkState {
  const consumed = useRef(false);
  const [value, setValue] = useState<OneTimeLinkState>({
    token: "",
    invalidToken: false,
    ready: false,
  });

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    setValue({
      ...consumeOneTimeLinkFromAddressBar(window.location, window.history),
      ready: true,
    });
  }, []);

  return value;
}
