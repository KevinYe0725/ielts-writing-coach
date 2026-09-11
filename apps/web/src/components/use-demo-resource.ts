"use client";

import { useCallback, useEffect, useState } from "react";

const pendingResources = new WeakMap<
  () => Promise<unknown>,
  Promise<unknown>
>();

function sharedLoad<T>(loader: () => Promise<T>): Promise<T> {
  const current = pendingResources.get(loader) as Promise<T> | undefined;
  if (current) return current;
  const pending = loader().finally(() => {
    if (pendingResources.get(loader) === pending)
      pendingResources.delete(loader);
  });
  pendingResources.set(loader, pending);
  return pending;
}

export interface DemoResource<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  retry: () => void;
  refresh: () => void;
}

export function useDemoResource<T>(loader: () => Promise<T>): DemoResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState({ attempt: 0, silent: false });

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    setRequest((value) => ({ attempt: value.attempt + 1, silent: false }));
  }, []);
  const refresh = useCallback(() => {
    if (pendingResources.has(loader)) return;
    setRequest((value) => ({ attempt: value.attempt + 1, silent: true }));
  }, [loader]);

  useEffect(() => {
    let active = true;
    void sharedLoad(loader)
      .then((value) => {
        if (active) {
          setData(value);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        const status =
          typeof reason === "object" && reason !== null && "status" in reason
            ? Number(reason.status)
            : 0;
        const requiresAction =
          status >= 400 && status < 500 && status !== 408 && status !== 429;
        if (request.silent && !requiresAction) return;
        setError(reason instanceof Error ? reason : new Error("Unknown error"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request, loader]);

  return { data, error, loading, retry, refresh };
}
