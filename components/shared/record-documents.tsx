"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DOCUMENT_KINDS, type DocumentKind, type RecordKind, documentsFor, useRecordDocumentsStore } from "@/lib/stores/record-documents-store";

const selectClass = "h-8 rounded-md border border-input bg-surface px-2 text-xs";

/** The documents attached to one record, and a form to add another reference. */
export function RecordDocuments({ recordKind, recordId, addedBy, today }: { recordKind: RecordKind; recordId: string; addedBy: string; today: string }) {
  const documents = useRecordDocumentsStore((state) => state.documents);
  const addDocument = useRecordDocumentsStore((state) => state.addDocument);
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<DocumentKind>("Invoice copy");
  const [link, setLink] = React.useState("");
  const list = documentsFor(documents, recordKind, recordId);

  function add() {
    const problem = addDocument({ recordKind, recordId, name, kind, link, addedBy }, today);
    if (problem) return toast.error(problem);
    toast.success("Document attached");
    setName(""); setLink("");
  }

  return (
    <div className="grid gap-3 text-sm">
      <p className="text-xs text-muted-foreground">The file stays where it is kept. Attach a link to it so the record points to the right copy.</p>
      {list.length === 0 ? <p className="text-muted-foreground">No documents attached yet.</p> : null}
      {list.map((doc) => (
        <p key={doc.id}>
          <a href={doc.link} target="_blank" rel="noopener noreferrer" className="underline">{doc.name}</a>
          <span className="text-xs text-muted-foreground"> · {doc.kind} · added by {doc.addedBy} on {doc.date}</span>
        </p>
      ))}
      <div className="grid gap-2 sm:grid-cols-4">
        <Input aria-label="Document name" placeholder="Name, e.g. Signed challan" value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label="Document type" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
          {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <Input aria-label="Document link" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
        <Button size="sm" disabled={name.trim().length < 3 || !link} onClick={add}>Attach</Button>
      </div>
    </div>
  );
}
