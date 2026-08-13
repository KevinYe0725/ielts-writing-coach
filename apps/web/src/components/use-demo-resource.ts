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
}

export function useDemoResource<T>(loader: () => Promise<T>): DemoResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void sharedLoad(loader)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason : new Error("Unknown error"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt, loader]);

  return { data, error, loading, retry };
}
