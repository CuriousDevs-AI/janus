"use client";

import { create } from "zustand";
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

const policy = (id: string, name: string, category: string, body: string): CompanyPolicy => ({ id, employeeId: "company", employeeName: "Company library", name, category, visibility: "employee", version: 1, status: "current", signatureStatus: "draft", issuedAt: "2026-04-01", expiresAt: null, ownerName: "Shaista Khan", acknowledgedAt: null, body });
const note = "> Sample company policy for demonstration. Replace it with your approved wording.\n\n";
const seedPolicies: CompanyPolicy[] = [
  policy("policy-handbook", "Employee handbook", "Policy acknowledgement", `# Employee handbook\n${note}## Welcome\nWelcome to Acme Traders. Your reporting manager coordinates your role, work schedule and first-week checklist. Keep contact details up to date in My HR.\n\n## Requests and approvals\nRaise leave and attendance corrections in My requests. Your manager reviews requests before HR processes any required correction.\n\n## Confidentiality and conduct\nTreat customer and employee information as confidential. Report safety, harassment or security concerns to the HR team.\n\n- Be respectful to colleagues, customers and partners.\n- Do not share company information outside the business.\n- Raise concerns early. Nobody is penalised for raising a concern in good faith.\n\n## Your acknowledgement\nBy acknowledging this handbook you confirm that you have read and understood it.`),
  policy("policy-leave", "Leave & attendance policy", "Leave policy", `# Leave and attendance policy\n${note}## Applying for leave\nApply for planned leave through My requests and include the dates and handover plan. Your reporting manager receives the request. HR can help correct a request with a recorded reason.\n\n## Attendance\nIf a check-in is missing, submit an attendance correction with the actual times and explanation. Check the holiday calendar before requesting time off.\n\n- Check in when you start work and check out when you finish.\n- Corrections can be requested for up to 30 days back.\n\n## Balances\nBalances shown in this demo are illustrative and do not represent statutory entitlements.`),
  policy("policy-expenses", "Travel & reimbursement guide", "Expense policy", `# Travel and reimbursement guide\n${note}## Submitting a claim\nAdd the expense date, category, business purpose and receipt. Your manager checks the business purpose before Finance verifies the amount. Keep receipts until reimbursement is reconciled.\n\n## Payment\nA submitted claim is not a payment instruction. Approved claims remain pending until Finance records payment.\n\n- A receipt is required for claims above ₹1,000.\n- Claims can go back 90 days at most.`),
  policy("policy-security", "Information security & acceptable use", "Security policy", `# Information security and acceptable use\n${note}## Everyday use\nUse company-approved systems for business records. Do not share passwords or download another employee's personal documents.\n\n## Devices\nReturn assigned devices and revoke access during exit clearance.\n\nReport lost devices and suspected data exposure to IT and HR immediately.`),
];
const policies = seedPolicies;

interface HrDocumentState {
  extras: Record<string, DocumentExtras>;
  policies: CompanyPolicy[];
  acknowledgements: Record<string, string>;
  patch: (id: string, value: Partial<DocumentExtras>) => void;
  record: (id: string, event: Omit<DocumentEvent, "id" | "at">) => void;
  savePolicy: (policy: CompanyPolicy) => void;
  acknowledgePolicy: (policyId: string, employeeId: string, version: number) => void;
}
const blank = (): DocumentExtras => ({ events: [], versions: [] });
export const useHrDocumentStore = create<HrDocumentState>()(persist((set) => ({
  extras: {}, policies, acknowledgements: {},
  patch: (id, value) => set((state) => ({ extras: { ...state.extras, [id]: { ...blank(), ...state.extras[id], ...value } } })),
  record: (id, event) => set((state) => ({ extras: { ...state.extras, [id]: { ...blank(), ...state.extras[id], events: [{ ...event, id: crypto.randomUUID(), at: new Date().toISOString() }, ...(state.extras[id]?.events ?? [])] } } })),
  savePolicy: (entry) => set((state) => ({ policies: state.policies.some((item) => item.id === entry.id) ? state.policies.map((item) => item.id === entry.id ? entry : item) : [...state.policies, entry] })),
  acknowledgePolicy: (policyId, employeeId, version) => set((state) => ({ acknowledgements: { ...state.acknowledgements, [`${policyId}:${version}:${employeeId}`]: new Date().toISOString() } })),
}), {
  name: "janus.hr-document-centre.v1",
  version: 2,
  storage: createJSONStorage(() => localStorage),
  // Version 2 replaced the sample policy wording. Refresh those four and keep any policy HR added.
  migrate: (persisted, version) => {
    const state = persisted as Partial<HrDocumentState>;
    if (version < 2) state.policies = [...seedPolicies, ...(state.policies ?? []).filter((item) => !seedPolicies.some((seed) => seed.id === item.id))];
    return state as HrDocumentState;
  },
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
