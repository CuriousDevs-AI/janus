"use client";

import * as React from "react";
import { scoped } from "@/lib/company";

/** useState that survives a reload, kept apart for each company. Falls back to the starting value if storage is blocked or the saved copy is unreadable. */
export function usePersistedState<T>(key: string, initial: T | (() => T)) {
  const storageKey = scoped(key);
  const [value, setValue] = React.useState<T>(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved !== null) return JSON.parse(saved) as T;
    } catch { /* unreadable: start fresh */ }
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });
  React.useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  }, [storageKey, value]);
  return [value, setValue] as const;
}
