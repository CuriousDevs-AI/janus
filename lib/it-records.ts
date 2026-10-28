"use client";

import { api, message } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { type ITChange, useITStore } from "@/lib/stores/it-store";

/**
 * IT change requests are recorded on the server: the server numbers them, checks who may decide, and
 * writes the audit row. The screen keeps a copy of what the server returned. Demo mode keeps the local path.
 */

interface ServerChange {
  id: string;
  number: string;
  title: string;
  risk: ITChange["risk"];
  status: ITChange["status"];
  requested_by: string;
  decided_by: string | null;
  raised_on: string;
}

const toLocal = (row: ServerChange): ITChange => ({
  id: row.id,
  number: row.number,
  title: row.title,
  risk: row.risk,
  status: row.status,
  requestedBy: row.requested_by,
  decidedBy: row.decided_by,
  raisedOn: row.raised_on,
});

function keep(change: ITChange) {
  useITStore.setState((state) => ({
    changes: state.changes.some((item) => item.id === change.id)
      ? state.changes.map((item) => (item.id === change.id ? change : item))
      : [change, ...state.changes],
  }));
}

/** Loads the company's IT changes from the server, newest first. */
export async function syncITChanges(): Promise<void> {
  if (demoMode) return;
  const rows = await api<ServerChange[]>("/it/changes");
  useITStore.setState({ changes: rows.map(toLocal) });
}

export async function requestITChange(input: { title: string; risk: ITChange["risk"] }, by: string): Promise<string | null> {
  if (demoMode) return useITStore.getState().requestChange(input, by);
  try {
    keep(toLocal(await api<ServerChange>("/it/changes", { method: "POST", body: JSON.stringify(input) })));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

export async function decideITChange(id: string, approve: boolean, by: string): Promise<string | null> {
  if (demoMode) return useITStore.getState().decideChange(id, approve, by);
  try {
    keep(toLocal(await api<ServerChange>(`/it/changes/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify({ approve }) })));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}

export async function completeITChange(id: string, by: string): Promise<string | null> {
  if (demoMode) return useITStore.getState().completeChange(id, by);
  try {
    keep(toLocal(await api<ServerChange>(`/it/changes/${encodeURIComponent(id)}/complete`, { method: "POST" })));
    return null;
  } catch (error: unknown) {
    return message(error);
  }
}
