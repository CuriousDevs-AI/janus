"use client";

import * as React from "react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";

/** When a company turns red for this person; the Portfolio's own defaults until they change them. */
export type Thresholds = { overdueRedAfterDays: 30 | 60; overdueMinimum: number; approvalsRedAbove: number; lateBillsRedShare: number };
/** One person's Portfolio settings, kept on the server so every browser and phone agrees. */
export type Preferences = { read: string[]; snoozed: Record<string, number>; thresholds: Thresholds };

export const defaultThresholds: Thresholds = { overdueRedAfterDays: 60, overdueMinimum: 0, approvalsRedAbove: 5, lateBillsRedShare: 50 };
const empty: Preferences = { read: [], snoozed: {}, thresholds: defaultThresholds };

export function usePreferences() {
  const remote = useApi<Preferences>("/portfolio/preferences");
  const [changed, setChanged] = React.useState<Preferences | null>(null);
  const value = changed ?? remote.data ?? empty;
  const save = React.useCallback(async (next: Preferences) => {
    setChanged(next);
    try { await api("/portfolio/preferences", { method: "PUT", body: JSON.stringify({ ...next, read: next.read.slice(-1000) }) }); return true; }
    catch (error) { toast.error(message(error)); return false; }
  }, []);
  return { value, save, loading: remote.loading && !changed };
}
