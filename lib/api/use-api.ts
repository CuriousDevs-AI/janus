"use client";
import { useCallback, useEffect, useState } from "react";
import { api, message } from "./client";

/**
 * The last answer for each path, for this company and this tab. A page opened again shows what it
 * showed before at once and refreshes it quietly, instead of blanking to "Loading…" and jumping
 * when the figures arrive. Cleared when the company changes or the person signs out.
 */
const cache = new Map<string, unknown>();
let cacheScope: string | null = null;

/** Starts a fresh cache when the signed-in company (or person) is not the one it was filled for. */
export function scopeApiCache(scope: string | null) {
  if (scope === cacheScope) return;
  cache.clear();
  cacheScope = scope;
}

export function useApi<T>(path: string | null) {
  const [result, setResult] = useState<{
    path: string | null;
    data?: T;
    error?: string;
  }>(() => (path && cache.has(path) ? { path, data: cache.get(path) as T } : { path: null }));
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(() => !(path && cache.has(path)));
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          cache.set(path, data);
          setResult({ path, data });
          setLoading(false);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setResult({ path, error: message(error) });
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [path, version]);
  // A path seen before shows its last answer while the new one loads.
  const remembered = path !== null && result.path !== path && cache.has(path);
  return {
    data: result.path === path ? result.data : remembered ? (cache.get(path) as T) : undefined,
    error: result.path === path ? result.error : undefined,
    loading: path !== null && !remembered && (loading || result.path !== path),
    reload,
  };
}
