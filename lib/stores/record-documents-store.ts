"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { scoped } from "@/lib/company";

/**
 * Documents attached to a record (plan §8.6): invoices, challans and receipts, and the contracts they
 * relate to. A document is a reference: its name, type and a link to where the file is kept (for
 * example a shared drive). The file itself is not stored in Janus. Each company keeps its own list.
 */

export const DOCUMENT_KINDS = ["Invoice copy", "Delivery challan", "Receipt", "Contract", "Other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export type RecordKind = "invoice" | "dispatch" | "credit-note";

export interface RecordDocument { id: string; recordKind: RecordKind; recordId: string; name: string; kind: DocumentKind; link: string; addedBy: string; date: string }

interface RecordDocumentsState {
  documents: RecordDocument[];
  addDocument: (input: Omit<RecordDocument, "id" | "date">, date: string) => string | null;
}

const validLink = (link: string) => /^https?:\/\/\S+$/.test(link.trim());

export const useRecordDocumentsStore = create<RecordDocumentsState>()(
  persist(
    (set, get) => ({
      documents: [],
      addDocument: (input, date) => {
        if (input.name.trim().length < 3) return "Enter the document name.";
        if (!validLink(input.link)) return "Enter a link that starts with https:// so people can open the file.";
        if (get().documents.some((d) => d.recordKind === input.recordKind && d.recordId === input.recordId && d.link === input.link.trim())) return "This link is already attached to the record.";
        const document: RecordDocument = { ...input, id: `doc-${Date.now()}`, name: input.name.trim(), link: input.link.trim(), date };
        set((state) => ({ documents: [document, ...state.documents] }));
        return null;
      },
    }),
    { name: scoped("janus.record-documents.v1"), storage: createJSONStorage(() => localStorage) },
  ),
);

export function documentsFor(documents: RecordDocument[], recordKind: RecordKind, recordId: string) {
  return documents.filter((d) => d.recordKind === recordKind && d.recordId === recordId);
}
