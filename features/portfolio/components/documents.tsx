"use client";

import * as React from "react";
import { Paperclip, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { day, todayIst } from "@/features/portfolio/lib/format";
import type { PortfolioCompany, PortfolioDocument, PortfolioDocumentKind } from "@/features/portfolio/types";

const kinds: Record<PortfolioDocumentKind, string> = { registration: "Registration", licence: "Licence", insurance: "Insurance", trademark: "Trademark", contract: "Contract", other: "Other" };
const tone = { expired: "danger", expiring: "warning", valid: "success", no_expiry: "neutral" } as const;
const word = (doc: PortfolioDocument) => doc.status === "expired" ? `Expired ${-(doc.daysLeft ?? 0)} days ago` : doc.status === "expiring" ? `Renew in ${doc.daysLeft} day${doc.daysLeft === 1 ? "" : "s"}` : doc.status === "valid" ? "Valid" : "No expiry";
type Draft = { kind: PortfolioDocumentKind; name: string; number: string; issuedOn: string; expiresOn: string; notes: string };
const blank: Draft = { kind: "licence", name: "", number: "", issuedOn: "", expiresOn: "", notes: "" };

const size = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** A company's documents that expire, with renewals 30 days ahead, and the scan of each (PDF or
 * image, up to 5 MB), which only people who may change documents can open. */
export function DocumentsCard({ item, canEdit, onSaved }: { item: PortfolioCompany; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = React.useState<{ id: string | null; draft: Draft; renewing?: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const docs = item.documents ?? [];
  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const { draft } = editing;
    try {
      await api(`/portfolio/companies/${item.id}/documents${editing.id ? `/${editing.id}` : ""}`, { method: editing.id ? "PUT" : "POST", body: JSON.stringify({ kind: draft.kind, name: draft.name, number: draft.number || null, issuedOn: draft.issuedOn || null, expiresOn: draft.expiresOn || null, notes: draft.notes || null }) });
      setEditing(null); onSaved(); toast.success(`${draft.name} saved.`);
    } catch (error) { toast.error(message(error)); } finally { setBusy(false); }
  };
  const remove = async (doc: PortfolioDocument) => {
    try { await api(`/portfolio/companies/${item.id}/documents/${doc.id}`, { method: "DELETE" }); onSaved(); }
    catch (error) { toast.error(message(error)); }
  };
  const attach = async (doc: PortfolioDocument, file: File) => {
    if (file.size > 5 * 1024 * 1024) { toast.error("Attach a file no larger than 5 MB."); return; }
    setBusy(true);
    const form = new FormData();
    form.append("file", file);
    try { await api(`/portfolio/companies/${item.id}/documents/${doc.id}/file`, { method: "PUT", body: form }); onSaved(); toast.success(`File kept with ${doc.name}.`); }
    catch (error) { toast.error(message(error)); } finally { setBusy(false); }
  };
  const detach = async (doc: PortfolioDocument) => {
    if (!window.confirm(`Remove the file of ${doc.name}? The document stays.`)) return;
    try { await api(`/portfolio/companies/${item.id}/documents/${doc.id}/file`, { method: "DELETE" }); onSaved(); }
    catch (error) { toast.error(message(error)); }
  };
  const picker = (doc: PortfolioDocument, label: string) => <label className={`inline-flex h-7 cursor-pointer items-center rounded-md border border-border px-2 text-xs ${busy ? "opacity-50" : ""}`}><Paperclip className="mr-1 size-3.5" />{label}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void attach(doc, file); }} /></label>;
  const set = (patch: Partial<Draft>) => setEditing((current) => current && { ...current, draft: { ...current.draft, ...patch } });
  return <SectionCard title="Documents and renewals" description="Registrations, licences, insurance and trademarks with their expiry dates and the scan of each (PDF or image, up to 5 MB). Janus flags a renewal 30 days ahead, and an expired document turns the company red. Everyone who sees the company sees the register; only people who may change documents open the scans." action={canEdit && !editing ? <Button size="sm" variant="outline" onClick={() => setEditing({ id: null, draft: blank })}><Plus className="mr-1 size-4" />Add document</Button> : undefined}>
    {docs.length === 0 && !editing && <p className="text-sm text-muted-foreground">No documents recorded. Add licences, insurance and registrations that need renewing, such as FSSAI, trade licence, shop and establishment, or fire insurance.</p>}
    {docs.length > 0 && <ul className="flex flex-col divide-y divide-border">{docs.map((doc) => <li key={doc.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <Badge variant={tone[doc.status]}>{word(doc)}</Badge>
      <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{doc.name}</span> <span className="text-muted-foreground">· {kinds[doc.kind]}{doc.number ? ` · ${doc.number}` : ""}{doc.expiresOn ? ` · expires ${day(doc.expiresOn)}` : ""}</span>{doc.notes && <span className="block text-xs text-muted-foreground">{doc.notes}</span>}
        {doc.file ? <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Paperclip className="size-3.5" />{canEdit ? <a className="text-foreground underline-offset-2 hover:underline" href={`/api/backend/portfolio/companies/${item.id}/documents/${doc.id}/file`} target="_blank" rel="noopener noreferrer">{doc.file.name}</a> : <span title="Only people who may change documents can open the file">{doc.file.name}</span>} · {size(doc.file.size)}{canEdit && <>{picker(doc, "Replace")}<button type="button" className="hover:text-foreground hover:underline" onClick={() => void detach(doc)}>Remove file</button></>}</span>
          : canEdit && <span className="mt-1 block">{picker(doc, "Attach the scan")}</span>}</span>
      {canEdit && <span className="flex gap-1">{(doc.status === "expired" || doc.status === "expiring") && <Button size="sm" variant="outline" onClick={() => setEditing({ id: doc.id, renewing: doc.name, draft: { kind: doc.kind, name: doc.name, number: doc.number ?? "", issuedOn: todayIst(), expiresOn: "", notes: [doc.notes, doc.expiresOn ? `Renewed; the last one ran to ${day(doc.expiresOn)}.` : "Renewed."].filter(Boolean).join(" ") } })}><RefreshCw className="mr-1 size-3.5" />Renew</Button>}<Button size="sm" variant="ghost" aria-label={`Edit ${doc.name}`} onClick={() => setEditing({ id: doc.id, draft: { kind: doc.kind, name: doc.name, number: doc.number ?? "", issuedOn: doc.issuedOn ?? "", expiresOn: doc.expiresOn ?? "", notes: doc.notes ?? "" } })}><Pencil className="size-4" /></Button><Button size="sm" variant="ghost" aria-label={`Remove ${doc.name}`} onClick={() => void remove(doc)}><Trash2 className="size-4" /></Button></span>}
    </li>)}</ul>}
    {editing && <form className="mt-3 grid gap-2 rounded-md border border-border bg-surface-2 p-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      {editing.renewing && <p className="text-sm sm:col-span-2">Renew {editing.renewing}: enter the new number if it changed and the new expiry date, save, then attach the new scan.</p>}
      <label className="grid gap-1 text-xs text-muted-foreground">Kind<select className="h-9 rounded-md border border-input bg-surface px-2 text-sm text-foreground" value={editing.draft.kind} onChange={(event) => set({ kind: event.target.value as PortfolioDocumentKind })}>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-1 text-xs text-muted-foreground">Name<Input required minLength={2} maxLength={160} value={editing.draft.name} placeholder="FSSAI licence" onChange={(event) => set({ name: event.target.value })} /></label>
      <label className="grid gap-1 text-xs text-muted-foreground">Number (optional)<Input maxLength={80} value={editing.draft.number} onChange={(event) => set({ number: event.target.value })} /></label>
      <span className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-xs text-muted-foreground">Issued on<Input type="date" value={editing.draft.issuedOn} onChange={(event) => set({ issuedOn: event.target.value })} /></label><label className="grid gap-1 text-xs text-muted-foreground">Expires on<Input type="date" value={editing.draft.expiresOn} onChange={(event) => set({ expiresOn: event.target.value })} /></label></span>
      <label className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">Notes (optional)<Input maxLength={400} value={editing.draft.notes} placeholder="Who renews it, where the original is kept" onChange={(event) => set({ notes: event.target.value })} /></label>
      <span className="flex gap-2 sm:col-span-2"><Button type="submit" size="sm" disabled={busy || editing.draft.name.trim().length < 2}>Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></span>
    </form>}
  </SectionCard>;
}
