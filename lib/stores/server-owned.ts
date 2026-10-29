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

/**
 * Outside demo mode, a saved copy drops the demo records it holds, matched by id. `demo` is the demo
 * seed; its lists are read even for a real account, so a copy saved in demo mode can still be recognised.
 */
export function withoutDemoRecords<S extends object>(saved: S, demo: object): S {
  if (demoMode) return saved;
  const next: Record<string, unknown> = { ...saved } as Record<string, unknown>;
  for (const [key, records] of Object.entries(demo)) {
    const seeded = new Set((records as { id: string }[]).map((item) => item.id));
    const kept = ((saved as Record<string, unknown>)[key] as { id: string }[] | undefined) ?? [];
    next[key] = kept.filter((item) => !seeded.has(item.id));
  }
  return next as S;
}
