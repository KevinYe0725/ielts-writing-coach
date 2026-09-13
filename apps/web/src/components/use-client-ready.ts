"use client";

import { useSyncExternalStore } from "react";

function subscribeToHydration() {
  return () => {};
}

function hydratedBrowserSnapshot() {
  return true;
}

function hydratedServerSnapshot() {
  return false;
}

export function useClientReady(): boolean {
  return useSyncExternalStore(
    subscribeToHydration,
    hydratedBrowserSnapshot,
    hydratedServerSnapshot,
  );
}
