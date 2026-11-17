/**
 * Keeps the server's copy of these fields when a saved browser copy loads. Saved state loads after the
 * page starts, so without this a stale copy could replace what the server just returned.
 */
export function mergeServerOwned<S extends object>(keys: (keyof S)[]) {
  return (persisted: unknown, current: S): S => {
    const next = { ...current, ...(persisted as Partial<S>) };
    for (const key of keys) next[key] = current[key];
    return next;
  };
}
