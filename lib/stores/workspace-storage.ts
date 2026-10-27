"use client";

import { toast } from "sonner";
import type { StateStorage } from "zustand/middleware";
import { api, APIError } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";

/**
 * Saves the operational stores on the server, one document per store and company (the backend's
 * workspace_state table). The browser keeps a copy in localStorage so a screen still works when the
 * server cannot be reached.
 *
 * Every save names the version it was based on. If someone else saved first, the server refuses it
 * with a version conflict, and this browser keeps its own edits and asks the user what to do, rather
 * than overwriting newer data or quietly dropping its own. In the preview (demo accounts) nothing
 * reaches a server, so the stores stay in localStorage as before.
 */

/** The stores that sync. Each name must match the backend's STORE_PERMISSIONS keys. */
export const SYNCED_STORES = new Set([
  "janus.finance.v1",
  "janus.vendors.v1",
  "janus.period-lock.v1",
  "janus.workflow-rules.v1",
  "janus.operations.v1",
  "janus.locations.v1",
  "janus.projects.v1",
  "janus.it.v1",
  "janus.renewals.v1",
  "janus.feedback.v1",
  "janus.record-documents.v1",
]);

const DEBOUNCE_MS = 400;
/** The server version this browser last saw or saved, per store. */
const knownVersion = new Map<string, number>();
const queued = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>();
const dirtyKey = (name: string) => `${name}:unsaved`;

const synced = (name: string) => !demoMode && SYNCED_STORES.has(name);

function local(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function setDirty(name: string, dirty: boolean) {
  try {
    if (dirty) local()?.setItem(dirtyKey(name), "1");
    else local()?.removeItem(dirtyKey(name));
  } catch {
    /* private mode: the flag is simply not kept */
  }
}

function isDirty(name: string) {
  try {
    return local()?.getItem(dirtyKey(name)) === "1";
  } catch {
    return false;
  }
}

/** Sends one save. Returns false when the server refused it because someone else saved first. */
async function send(name: string, value: string): Promise<boolean> {
  const expected_version = knownVersion.get(name) ?? 0;
  try {
    const saved = await api<{ version: number }>(`/workspace-state/${name}`, {
      method: "PUT",
      body: JSON.stringify({ data: JSON.parse(value), expected_version }),
    });
    knownVersion.set(name, saved.version);
    setDirty(name, false);
    return true;
  } catch (error) {
    if (error instanceof APIError && error.code === "version_conflict") {
      setDirty(name, true);
      toast.warning(`${name} was changed somewhere else. Your edits here are kept until you choose.`, {
        duration: Infinity,
        action: {
          label: "Load the latest",
          onClick: () => {
            // Discarding this browser's copy is the user's explicit choice.
            setDirty(name, false);
            local()?.removeItem(name);
            window.location.reload();
          },
        },
      });
      return false;
    }
    // The server could not be reached: keep the edit, and send it again on the next save or load.
    setDirty(name, true);
    return false;
  }
}

function flush(name: string) {
  const entry = queued.get(name);
  queued.delete(name);
  if (entry) void send(name, entry.value);
}

/** The store's stored value: the server copy when it is newer, or this browser's unsaved edits. */
async function load(name: string): Promise<string | null> {
  const cached = local()?.getItem(name) ?? null;
  let doc: { version: number; data: Record<string, unknown> | null };
  try {
    doc = await api(`/workspace-state/${name}`);
  } catch {
    return cached;
  }
  knownVersion.set(name, doc.version);
  if (isDirty(name) && cached) {
    // Unsaved edits from before: send them now. A refusal keeps them and warns the user.
    await send(name, cached);
    return cached;
  }
  if (doc.data === null) {
    if (cached) await send(name, cached);
    return cached;
  }
  const fresh = JSON.stringify(doc.data);
  try {
    local()?.setItem(name, fresh);
  } catch {
    /* private mode: the server copy is still used for this load */
  }
  return fresh;
}

export const workspaceStorage: StateStorage = {
  getItem: (name) => {
    // On the server there is no browser copy and no session, so the store starts empty and loads in the browser.
    if (typeof window === "undefined") return null;
    if (!synced(name)) return local()?.getItem(name) ?? null;
    return load(name);
  },
  setItem: (name, value) => {
    try {
      local()?.setItem(name, value);
    } catch {
      /* private mode: the value is kept in memory only */
    }
    if (!synced(name)) return;
    setDirty(name, true);
    const pending = queued.get(name);
    if (pending) clearTimeout(pending.timer);
    queued.set(name, { value, timer: setTimeout(() => flush(name), DEBOUNCE_MS) });
  },
  removeItem: (name) => {
    local()?.removeItem(name);
  },
};
