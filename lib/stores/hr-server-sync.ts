"use client";

import * as React from "react";
import { toast } from "sonner";
import type { StoreApi, UseBoundStore } from "zustand";
import { api, APIError, message as errorText } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { useHrCareerStore } from "@/lib/stores/hr-career-store";
import { useHrDocumentStore } from "@/lib/stores/hr-document-store";
import { useHrImportStore } from "@/lib/stores/hr-import-store";
import { useHrLifecycleStore } from "@/lib/stores/hr-lifecycle-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { useHrOrgStore } from "@/lib/stores/hr-org-store";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";

/**
 * HR records live on the server (/v1/hr/records), which decides what each person may see and
 * change. The HR screens keep using their stores; this loads the server's records into them and
 * sends each change the screens make back, one record at a time.
 *
 * A store field is one of three shapes: a list of records with ids, a map from a key to a value
 * (each entry one record), or a single setting (one record for the whole field). The first time
 * an HR admin opens HR, any kind the server does not have yet is uploaded from their browser, so
 * nothing entered before the move is lost.
 */

type Store = UseBoundStore<StoreApi<object>>;
interface Binding { kind: string; store: Store; field: string; shape: "list" | "map" | "setting" }
interface ServerRecord { kind: string; key: string; version: number; data: Record<string, unknown> & { id: string } }
interface Records { me: string | null; admin: boolean; seeded: boolean; records: Record<string, ServerRecord[]> }

const people = useHrPeopleStore as unknown as Store;
const operations = useHrOperationsStore as unknown as Store;
const documents = useHrDocumentStore as unknown as Store;
const org = useHrOrgStore as unknown as Store;
const lifecycle = useHrLifecycleStore as unknown as Store;
const imports = useHrImportStore as unknown as Store;
const career = useHrCareerStore as unknown as Store;

const BINDINGS: Binding[] = [
  { kind: "employee", store: people, field: "employees", shape: "list" },
  { kind: "leave", store: people, field: "leaveRequests", shape: "list" },
  { kind: "attendance", store: people, field: "attendance", shape: "list" },
  // About one person: they, their manager and HR see it; the server decides who changes what.
  { kind: "document", store: people, field: "documents", shape: "list" },
  { kind: "onboarding", store: people, field: "onboardingTasks", shape: "list" },
  { kind: "expense", store: people, field: "expenseClaims", shape: "list" },
  { kind: "expense_evidence", store: operations, field: "evidence", shape: "map" },
  { kind: "review", store: operations, field: "reviews", shape: "list" },
  { kind: "regularisation", store: operations, field: "regularisations", shape: "list" },
  { kind: "policy_question", store: operations, field: "policyQuestions", shape: "list" },
  { kind: "letter", store: operations, field: "letterRequests", shape: "list" },
  { kind: "leave_adjustment", store: operations, field: "leaveAdjustments", shape: "list" },
  { kind: "document_extra", store: documents, field: "extras", shape: "map" },
  { kind: "acknowledgement", store: documents, field: "acknowledgements", shape: "map" },
  { kind: "exit", store: lifecycle, field: "exits", shape: "list" },
  { kind: "career", store: career, field: "changes", shape: "list" },
  // HR's own work: only HR sees it.
  { kind: "candidate", store: people, field: "candidates", shape: "list" },
  { kind: "payroll_issue", store: people, field: "payrollIssues", shape: "list" },
  { kind: "whatsapp", store: people, field: "whatsAppActions", shape: "list" },
  { kind: "signature", store: people, field: "signatureAudits", shape: "list" },
  { kind: "compliance", store: people, field: "complianceItems", shape: "list" },
  { kind: "audit", store: operations, field: "audit", shape: "list" },
  { kind: "filing", store: operations, field: "filingReferences", shape: "map" },
  { kind: "candidate_detail", store: lifecycle, field: "candidateDetails", shape: "map" },
  { kind: "onboarding_note", store: lifecycle, field: "onboardingNotes", shape: "map" },
  { kind: "import", store: imports, field: "batches", shape: "list" },
  // Payroll months: everyone sees which months are final, only HR the totals.
  { kind: "payroll_run", store: people, field: "payrollRuns", shape: "list" },
  // Company-wide HR settings everyone reads.
  { kind: "config", store: operations, field: "settings", shape: "setting" },
  { kind: "config", store: operations, field: "customHolidays", shape: "setting" },
  { kind: "config", store: operations, field: "removedHolidays", shape: "setting" },
  { kind: "config", store: documents, field: "policies", shape: "setting" },
  { kind: "config", store: org, field: "departments", shape: "setting" },
  { kind: "config", store: org, field: "roles", shape: "setting" },
  { kind: "config", store: org, field: "assignments", shape: "setting" },
];
/** What a person who is not HR may send; the server checks each field again. */
const SELF_SERVICE = new Set(["leave", "attendance", "audit", "document", "onboarding", "expense", "expense_evidence", "review", "regularisation", "policy_question", "letter", "document_extra", "acknowledgement", "career"]);
/**
 * Entries that hang off another record (a claim's receipt, a document's extras). The server finds
 * their owner through that record, so they wait in its queue until it has been saved.
 */
const PARENT_KIND: Record<string, string> = { expense_evidence: "expense", document_extra: "document" };
/** What they may withdraw (delete) while it waits. */
const WITHDRAWABLE = new Set(["regularisation"]);
const REFRESH_MS = 60_000;

const STORE_NAMES = new Map<Store, string>([[people, "people"], [operations, "operations"], [documents, "documents"], [org, "org"], [lifecycle, "lifecycle"], [imports, "imports"], [career, "career"]]);
const settingKey = (binding: Binding) => `${STORE_NAMES.get(binding.store)}.${binding.field}`;
const owns = (binding: Binding, id: string) => binding.shape !== "setting" || id === settingKey(binding);

function toRecords(binding: Binding, value: unknown): Array<Record<string, unknown> & { id: string }> {
  if (binding.shape === "list") return ((value as Array<{ id: string }>) ?? []).filter((item) => item && typeof item.id === "string") as never;
  if (binding.shape === "map") return Object.entries((value as Record<string, unknown>) ?? {}).map(([id, entry]) => ({ id, value: entry }));
  return value === undefined ? [] : [{ id: settingKey(binding), value }];
}

function fromRecords(binding: Binding, records: ServerRecord[], current: unknown): unknown {
  if (binding.shape === "list") return records.map((record) => record.data);
  if (binding.shape === "map") return Object.fromEntries(records.map((record) => [record.data.id, record.data.value]));
  // A setting the server does not have yet keeps this browser's default.
  const record = records.find((item) => item.key === settingKey(binding));
  return record ? record.data.value : current;
}

/** The server's version and copy of each record this browser has, by "kind:key". */
const known = new Map<string, { version: number; json: string }>();
let applying = false;
let admin = false;
let inFlight = 0;
const queue = new Map<string, Promise<void>>();

function apply(result: Records) {
  admin = result.admin;
  known.clear();
  applying = true;
  for (const store of STORE_NAMES.keys()) {
    const patch: Record<string, unknown> = {};
    const state = store.getState() as Record<string, unknown>;
    for (const binding of BINDINGS.filter((item) => item.store === store)) {
      const records = (result.records[binding.kind] ?? []).filter((record) => owns(binding, record.key));
      for (const record of records) known.set(`${binding.kind}:${record.key}`, { version: record.version, json: JSON.stringify(record.data) });
      patch[binding.field] = fromRecords(binding, records, state[binding.field]);
    }
    store.setState(patch);
  }
  applying = false;
}

let pulling: Promise<void> | null = null;

/** Loads the server's records. Calls made while one is running share it, so the upload runs once. */
function pull(): Promise<void> {
  pulling ??= load().finally(() => { pulling = null; });
  return pulling;
}

async function load() {
  let result = await api<Records>("/hr/records");
  if (result.admin) {
    // Kinds the server has none of yet, but this HR admin's browser does: upload them once.
    const upload: Record<string, unknown[]> = {};
    for (const binding of BINDINGS) {
      if ((result.records[binding.kind] ?? []).some((record) => owns(binding, record.key))) continue;
      const local = toRecords(binding, (binding.store.getState() as Record<string, unknown>)[binding.field]);
      if (local.length) upload[binding.kind] = [...(upload[binding.kind] ?? []), ...local];
    }
    if (Object.keys(upload).length) {
      result = await api<Records>("/hr/records/seed", { method: "POST", body: JSON.stringify({ records: upload }) });
      toast.success("HR records moved to the server. Everyone now sees the same, by their access.");
    }
  }
  apply(result);
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

function failed(error: unknown) {
  toast.error(error instanceof APIError && error.code === "version_conflict" ? "Someone else changed this just now. Showing the latest." : errorText(error));
  void pull().catch(() => undefined);
}

function push(binding: Binding, value: unknown) {
  // Someone who is not HR only sends what they may change; the rest stays as the server has it.
  if (!admin && !SELF_SERVICE.has(binding.kind)) return;
  const seen = new Set<string>();
  for (const record of toRecords(binding, value)) {
    const id = `${binding.kind}:${record.id}`;
    seen.add(id);
    const json = JSON.stringify(record);
    if (known.get(id)?.json === json) continue;
    known.set(id, { version: known.get(id)?.version ?? 0, json });
    const parent = PARENT_KIND[binding.kind];
    enqueue(parent ? `${parent}:${record.id}` : id, async () => {
      try {
        const saved = await api<ServerRecord>(`/hr/records/${binding.kind}/${encodeURIComponent(record.id)}`, {
          method: "PUT",
          body: JSON.stringify({ data: record, expected_version: known.get(id)?.version ?? 0 }),
        });
        const savedJson = JSON.stringify(saved.data);
        known.set(id, { version: saved.version, json: savedJson });
        // The server may keep parts of a record this person may not change; show what it kept.
        if (savedJson !== json && binding.shape !== "setting") {
          applying = true;
          binding.store.setState((state: object) => {
            const current = (state as Record<string, unknown>)[binding.field];
            return binding.shape === "list"
              ? { [binding.field]: ((current as Array<{ id: string }>) ?? []).map((item) => (item.id === record.id ? saved.data : item)) }
              : { [binding.field]: { ...((current as Record<string, unknown>) ?? {}), [record.id]: saved.data.value } };
          });
          applying = false;
        }
      } catch (error) {
        failed(error);
      }
    });
  }
  if (binding.shape === "setting") return;
  // A record removed on screen is deleted on the server; only HR may, and the server checks.
  for (const id of [...known.keys()]) {
    if (!id.startsWith(`${binding.kind}:`) || seen.has(id)) continue;
    known.delete(id);
    if (!admin && !WITHDRAWABLE.has(binding.kind)) continue;
    const key = id.slice(binding.kind.length + 1);
    enqueue(id, async () => {
      try {
        await api(`/hr/records/${binding.kind}/${encodeURIComponent(key)}`, { method: "DELETE" });
      } catch (error) {
        failed(error);
      }
    });
  }
}

/** Keeps the HR stores and the server in step while an HR screen is open. Does nothing in the preview. */
export function useHrServerSync() {
  const [ready, setReady] = React.useState(demoMode);
  React.useEffect(() => {
    if (demoMode) return;
    let stopped = false;
    void pull()
      .catch((error) => toast.error(`HR records could not be loaded: ${errorText(error)}`))
      .finally(() => { if (!stopped) setReady(true); });
    const unsubscribers = [...STORE_NAMES.keys()].map((store) =>
      store.subscribe((state, previous) => {
        if (applying) return;
        for (const binding of BINDINGS.filter((item) => item.store === store)) {
          const next = (state as Record<string, unknown>)[binding.field];
          if (next !== (previous as Record<string, unknown>)[binding.field]) push(binding, next);
        }
      }),
    );
    // Other people's changes arrive on focus and every minute, when nothing of ours is saving.
    const refresh = () => { if (!inFlight) void pull().catch(() => undefined); };
    const timer = setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => {
      stopped = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return ready;
}
