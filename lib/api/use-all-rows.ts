"use client";
import { useCallback, useEffect, useState } from "react";
import { api, message } from "./client";

const PAGE = 100;
// Enough for any one company's leads or deals on a screen; past it the screen says so.
const MAX_PAGES = 50;

/**
 * Every row of a list the API pages by id (`?after_id=…&limit=100`), read page after page, so a
 * company with more than a hundred leads or deals is counted in full. `capped` is true when the
 * list was longer than the screen reads.
 */
export function useAllRows<T extends { id: string }>(path: string | null) {
  const [result, setResult] = useState<{ path: string | null; data?: T[]; error?: string; capped?: boolean }>({ path: null });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    const join = path.includes("?") ? "&" : "?";
    (async () => {
      const rows: T[] = [];
      let after = "0";
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const batch = await api<T[]>(`${path}${join}limit=${PAGE}&after_id=${after}`, { signal: controller.signal });
        rows.push(...batch);
        if (batch.length < PAGE) return { rows, capped: false };
        after = batch[batch.length - 1].id;
      }
      return { rows, capped: true };
    })()
      .then(({ rows, capped }) => { if (!controller.signal.aborted) setResult({ path, data: rows, capped }); })
      .catch((error) => { if (!controller.signal.aborted) setResult({ path, error: message(error) }); });
    return () => controller.abort();
  }, [path, version]);
  const current = result.path === path;
  return {
    data: current ? result.data : undefined,
    error: current ? result.error : undefined,
    capped: current ? Boolean(result.capped) : false,
    loading: path !== null && (!current || (!result.data && !result.error)),
    reload,
  };
}
