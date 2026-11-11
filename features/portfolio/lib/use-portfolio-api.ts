"use client";

import * as React from "react";
import { useSession } from "@/components/auth/session-provider";
import { api, message } from "@/lib/api/client";

/**
 * Answers already read on this page load, by person and address. A view opened before shows at once
 * and refreshes quietly, instead of blanking to "Loading…" on every switch. Switching company or
 * signing in again reloads the page, which starts this empty.
 */
const cache = new Map<string, unknown>();

type Entry<T> = { key: string; path: string; data?: T; error?: string };

/**
 * Like useApi, with the answers remembered. `keepPrevious` keeps the last answer on screen while a
 * changed address loads (a new period, a wider range), for reads where the old figures are the
 * same kind of thing; never for one company's record in place of another's.
 */
export function usePortfolioApi<T>(path: string | null, { keepPrevious = false }: { keepPrevious?: boolean } = {}) {
  const who = useSession().user.id;
  const [version, setVersion] = React.useState(0);
  const [state, setState] = React.useState<Entry<T> | null>(null);
  const reload = React.useCallback(() => setVersion((value) => value + 1), []);
  const key = `${who}:${path}#${version}`;
  React.useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        cache.set(`${who}:${path}`, data);
        setState({ key, path, data });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState((last) => ({ key, path, data: last?.path === path ? last.data : undefined, error: message(error) }));
      });
    return () => controller.abort();
  }, [key, path, who]);
  const own = state?.path === path ? state : undefined;
  const data = own?.data ?? (path ? (cache.get(`${who}:${path}`) as T | undefined) : undefined) ?? (keepPrevious ? state?.data : undefined);
  return {
    data,
    // An error shows only when there is nothing to show; a failed refresh keeps the figures.
    error: data === undefined ? own?.error : undefined,
    loading: path !== null && data === undefined && !own?.error,
    // Fetching behind figures already on screen (older, or for the address before).
    refreshing: path !== null && state?.key !== key,
    // Whether what is on screen is the answer for another address, kept while this one loads.
    stale: data !== undefined && own === undefined && !cache.has(`${who}:${path}`),
    reload,
  };
}
