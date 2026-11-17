"use client";

import { create } from "zustand";
import { scoped } from "@/lib/company";
import { createJSONStorage, persist } from "zustand/middleware";
import type { HrDemoRole, HrDocument } from "@/lib/types";
import type { SignatureRecord } from "@/lib/hr-document-content";

export interface DocumentEvent { id: string; at: string; actor: string; event: string; version: number; detail?: string }
export interface DocumentVersion { version: number; fileName?: string; mime?: string; size?: number; fileKey?: string; body?: string; savedAt: string; savedBy: string; signatureStatus: HrDocument["signatureStatus"] }
export interface DocumentSigner { employeeId: string; name: string; status: "pending" | "viewed" | "signed" | "rejected"; signedAt?: string; signature?: SignatureRecord; rejectedReason?: string }
export interface DocumentExtras {
  body?: string; fileName?: string; mime?: string; size?: number; fileKey?: string;
  selectedRoles?: HrDemoRole[]; versions: DocumentVersion[]; events: DocumentEvent[]; signers?: DocumentSigner[];
}
export interface CompanyPolicy extends HrDocument { body: string }

const policies: CompanyPolicy[] = [];

interface HrDocumentState {
  extras: Record<string, DocumentExtras>;
  policies: CompanyPolicy[];
  acknowledgements: Record<string, string>;
  patch: (id: string, value: Partial<DocumentExtras>) => void;
  record: (id: string, event: Omit<DocumentEvent, "id" | "at">) => void;
  savePolicy: (policy: CompanyPolicy) => void;
  removePolicy: (id: string) => void;
  acknowledgePolicy: (policyId: string, employeeId: string, version: number) => void;
}
const blank = (): DocumentExtras => ({ events: [], versions: [] });
export const useHrDocumentStore = create<HrDocumentState>()(persist((set) => ({
  extras: {}, policies, acknowledgements: {},
  patch: (id, value) => set((state) => ({ extras: { ...state.extras, [id]: { ...blank(), ...state.extras[id], ...value } } })),
  record: (id, event) => set((state) => ({ extras: { ...state.extras, [id]: { ...blank(), ...state.extras[id], events: [{ ...event, id: crypto.randomUUID(), at: new Date().toISOString() }, ...(state.extras[id]?.events ?? [])] } } })),
  savePolicy: (entry) => set((state) => ({ policies: state.policies.some((item) => item.id === entry.id) ? state.policies.map((item) => item.id === entry.id ? entry : item) : [...state.policies, entry] })),
  removePolicy: (id) => set((state) => ({
    policies: state.policies.filter((item) => item.id !== id),
    acknowledgements: Object.fromEntries(Object.entries(state.acknowledgements).filter(([key]) => !key.startsWith(`${id}:`))),
    extras: Object.fromEntries(Object.entries(state.extras).filter(([key]) => key !== id)),
  })),
  acknowledgePolicy: (policyId, employeeId, version) => set((state) => ({ acknowledgements: { ...state.acknowledgements, [`${policyId}:${version}:${employeeId}`]: new Date().toISOString() } })),
}), {
  name: scoped("janus.hr-document-centre.v1"),
  version: 2,
  storage: createJSONStorage(() => localStorage),
  merge: (persisted, current) => ({ ...current, ...(persisted as Partial<HrDocumentState>) }),
  migrate: (persisted) => persisted as HrDocumentState,
}));

// Binary files stay out of Zustand/localStorage. Each version has an immutable key.
function openFiles(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("janus-hr-demo-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onerror = () => reject(new Error("Your browser could not open local file storage."));
    request.onsuccess = () => resolve(request.result);
  });
}
export async function saveHrFile(key: string, file: File): Promise<void> {
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose a file up to 10 MB.");
  const db = await openFiles();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("files", "readwrite");
      transaction.objectStore("files").add(file, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error("The file could not be stored. Browser storage may be full."));
      transaction.onabort = () => reject(new Error("The local file upload was interrupted."));
    });
  } finally { db.close(); }
}
export async function loadHrFile(key: string): Promise<Blob | null> {
  const db = await openFiles();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const request = db.transaction("files", "readonly").objectStore("files").get(key);
      request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
      request.onerror = () => reject(new Error("The local file could not be read."));
    });
  } finally { db.close(); }
}

export interface HrSignatureProvider {
  kind: "demo" | "external";
  send: (document: HrDocument, signers: DocumentSigner[]) => Promise<{ reference: string }>;
}
export const demoHrSignatureProvider: HrSignatureProvider = {
  kind: "demo",
  async send(document, signers) {
    if (!signers.length) throw new Error("Choose at least one signer.");
    return { reference: `demo:${document.id}:v${document.version}` };
  },
};
