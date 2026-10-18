"use client";
import { useCallback, useEffect, useState } from "react";
import { api, message } from "./client";

export function useApi<T>(path: string | null) {
  const [result, setResult] = useState<{
    path: string | null;
    data?: T;
    error?: string;
  }>({ path: null });
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
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
  return {
    data: result.path === path ? result.data : undefined,
    error: result.path === path ? result.error : undefined,
    loading: path !== null && (loading || result.path !== path),
    reload,
  };
}
