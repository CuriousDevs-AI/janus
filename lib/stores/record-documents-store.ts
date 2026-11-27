"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { workspaceStorage } from "@/lib/stores/workspace-storage";
import { scoped } from "@/lib/company";

export const DOCUMENT_KINDS = [
  "Proposal", "Contract", "Agreement", "Invoice copy", "Receipt",
  "Delivery challan", "ID proof", "PO / Work order", "NDA",
  "Meeting notes", "Presentation", "Specification", "Report", "Other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export type RecordKind = "invoice" | "dispatch" | "credit-note" | "lead" | "deal" | "customer";

export interface RecordDocument {
  id: string;
  recordKind: RecordKind;
  recordId: string;
  name: string;
  kind: DocumentKind;
  link: string;
  notes: string;
  addedBy: string;
  date: string;
}

interface RecordDocumentsState {
  documents: RecordDocument[];
  addDocument: (input: Omit<RecordDocument, "id" | "date">, date: string) => string | null;
  removeDocument: (id: string) => void;
}

const validLink = (link: string) => !link.trim() || /^https?:\/\/\S+$/.test(link.trim());

export const useRecordDocumentsStore = create<RecordDocumentsState>()(
  persist(
    (set, get) => ({
      documents: [],
      addDocument: (input, date) => {
        if (input.name.trim().length < 3) return "Enter the document name (at least 3 characters).";
        if (input.link && !validLink(input.link)) return "Enter a valid link starting with https://, or leave it empty.";
        if (input.link && get().documents.some((d) => d.recordKind === input.recordKind && d.recordId === input.recordId && d.link === input.link.trim())) return "This link is already attached to the record.";
        const document: RecordDocument = {
          ...input,
          id: `doc-${Date.now()}`,
          name: input.name.trim(),
          link: input.link.trim(),
          notes: (input.notes ?? "").trim(),
          date,
        };
        set((state) => ({ documents: [document, ...state.documents] }));
        return null;
      },
      removeDocument: (id) => {
        set((state) => ({ documents: state.documents.filter((d) => d.id !== id) }));
      },
    }),
    { name: scoped("janus.record-documents.v1"), storage: createJSONStorage(() => workspaceStorage) },
  ),
);

export function documentsFor(documents: RecordDocument[], recordKind: RecordKind, recordId: string) {
  return documents.filter((d) => d.recordKind === recordKind && d.recordId === recordId);
}
