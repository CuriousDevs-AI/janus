import { demoMode } from "@/lib/demo-mode";

/**
 * Keeps the server's copy of these fields when a saved browser copy loads. Saved state loads after the
 * page starts, so without this a stale copy could replace what the server just returned. Demo mode keeps
 * the saved copy, because demo data lives only in the browser.
 */
export function mergeServerOwned<S extends object>(keys: (keyof S)[]) {
  return (persisted: unknown, current: S): S => {
    const next = { ...current, ...(persisted as Partial<S>) };
    if (!demoMode) for (const key of keys) next[key] = current[key];
    return next;
  };
}
