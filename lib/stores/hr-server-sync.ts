"use client";

import * as React from "react";
import { toast } from "sonner";
import { api, APIError, message as errorText } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import type { HrAttendanceRecord, HrEmployee, HrLeaveRequest } from "@/lib/types";

/**
 * Employees, leave and attendance live on the server (/v1/hr/records), which decides what each
 * person may see and change. The HR screens keep using the HR store; this loads the server's
 * records into it and sends each change the screens make back, one record at a time.
 *
 * The first time an HR admin opens HR after the move, the records their browser held are uploaded
 * once, so nothing they entered before is lost.
 */

type Kind = "employee" | "leave" | "attendance";
type Field = "employees" | "leaveRequests" | "attendance";
interface ServerRecord { kind: Kind; key: string; version: number; data: Record<string, unknown> }
interface Records { me: string | null; admin: boolean; seeded: boolean; employee: ServerRecord[]; leave: ServerRecord[]; attendance: ServerRecord[] }

const FIELDS: Array<[Kind, Field]> = [["employee", "employees"], ["leave", "leaveRequests"], ["attendance", "attendance"]];
const REFRESH_MS = 60_000;

/** The server's version and copy of each record this browser has, by "kind:key". */
const known = new Map<string, { version: number; json: string }>();
let applying = false;
let admin = false;
let inFlight = 0;
const queue = new Map<string, Promise<void>>();

function apply(records: Records) {
  admin = records.admin;
  known.clear();
  const next: Partial<Record<Field, unknown[]>> = {};
  for (const [kind, field] of FIELDS) {
    next[field] = records[kind].map((record) => {
      known.set(`${kind}:${record.key}`, { version: record.version, json: JSON.stringify(record.data) });
      return record.data;
    });
  }
  applying = true;
  useHrPeopleStore.setState(next as { employees: HrEmployee[]; leaveRequests: HrLeaveRequest[]; attendance: HrAttendanceRecord[] });
  applying = false;
}

let pulling: Promise<void> | null = null;

/** Loads the server's records. Calls made while one is running share it, so the upload runs once. */
function pull(): Promise<void> {
  pulling ??= load().finally(() => { pulling = null; });
  return pulling;
}

async function load() {
  let records = await api<Records>("/hr/records");
  if (!records.seeded && records.admin) {
    const local = useHrPeopleStore.getState();
    if (local.employees.length) {
      records = await api<Records>("/hr/records/seed", {
        method: "POST",
        body: JSON.stringify({ employee: local.employees, leave: local.leaveRequests, attendance: local.attendance }),
      });
      toast.success("HR records moved to the server. Everyone now sees the same, by their access.");
    }
  }
  apply(records);
}

/** Saves one record, after any earlier save of the same record, so versions stay in order. */
function enqueue(id: string, run: () => Promise<void>) {
  const before = queue.get(id) ?? Promise.resolve();
  const next = before.then(run, run);
  queue.set(id, next);
  inFlight += 1;
  void next.finally(() => {
    inFlight -= 1;
    if (queue.get(id) === next) queue.delete(id);
  });
}

function push(kind: Kind, field: Field, records: { id: string }[]) {
  const seen = new Set<string>();
  for (const record of records) {
    const id = `${kind}:${record.id}`;
    seen.add(id);
    const json = JSON.stringify(record);
    if (known.get(id)?.json === json) continue;
    known.set(id, { version: known.get(id)?.version ?? 0, json });
    enqueue(id, async () => {
      try {
        const saved = await api<ServerRecord>(`/hr/records/${kind}/${encodeURIComponent(record.id)}`, {
          method: "PUT",
          body: JSON.stringify({ data: record, expected_version: known.get(id)?.version ?? 0 }),
        });
        const savedJson = JSON.stringify(saved.data);
        known.set(id, { version: saved.version, json: savedJson });
        // The server may keep parts of a record this person may not change; show what it kept.
        if (savedJson !== json) {
          applying = true;
          useHrPeopleStore.setState((state) => ({ [field]: (state[field] as { id: string }[]).map((item) => (item.id === record.id ? saved.data : item)) }) as never);
          applying = false;
        }
      } catch (error) {
        toast.error(error instanceof APIError && error.code === "version_conflict" ? "Someone else changed this just now. Showing the latest." : errorText(error));
        void pull().catch(() => undefined);
      }
    });
  }
  // A record removed on screen is deleted on the server; only HR may, and the server checks.
  for (const id of [...known.keys()]) {
    if (!id.startsWith(`${kind}:`) || seen.has(id)) continue;
    known.delete(id);
    if (!admin) continue;
    const key = id.slice(kind.length + 1);
    enqueue(id, async () => {
      try {
        await api(`/hr/records/${kind}/${encodeURIComponent(key)}`, { method: "DELETE" });
      } catch (error) {
        toast.error(errorText(error));
        void pull().catch(() => undefined);
      }
    });
  }
}

/** Keeps the HR store and the server in step while an HR screen is open. Does nothing in the preview. */
export function useHrServerSync() {
  const [ready, setReady] = React.useState(demoMode);
  React.useEffect(() => {
    if (demoMode) return;
    let stopped = false;
    void pull()
      .catch((error) => toast.error(`HR records could not be loaded: ${errorText(error)}`))
      .finally(() => { if (!stopped) setReady(true); });
    const unsubscribe = useHrPeopleStore.subscribe((state, previous) => {
      if (applying) return;
      for (const [kind, field] of FIELDS) {
        if (state[field] !== previous[field]) push(kind, field, state[field] as { id: string }[]);
      }
    });
    // Other people's changes arrive on focus and every minute, when nothing of ours is saving.
    const refresh = () => { if (!inFlight) void pull().catch(() => undefined); };
    const timer = setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => {
      stopped = true;
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return ready;
}
