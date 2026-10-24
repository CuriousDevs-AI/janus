"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Download, FileText, Mail, Receipt, ScrollText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrDocumentStore } from "@/lib/stores/hr-document-store";
import { useHrOperationsStore, type HrLetterRequest } from "@/lib/stores/hr-operations-store";
import { canManageHr } from "@/lib/hr-people-access";
import { parseBlocks, plainText, sampleMarkup } from "@/lib/hr-document-content";
import { downloadHrFile } from "@/lib/hr-payroll";
import { HrEmpty, HrField, HrModal, HrPanel, HrStatus, hrDate, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole, HrDocument } from "@/lib/types";

export const letterTypes = ["Employment verification letter", "Experience letter", "Salary certificate", "Address proof letter", "Bonafide / no-objection letter"] as const;
const link = (view: string, extra = "") => `/workspace/hr-people?view=${view}&workspace=hr-people${extra}`;

const forms: { title: string; fields: string[] }[] = [
  { title: "Address change form", fields: ["New residential address", "Effective from", "Proof document attached (yes or no)"] },
  { title: "Bank account change form", fields: ["Account holder name", "Bank and branch", "Account number", "IFSC code", "Cancelled cheque attached (yes or no)"] },
  { title: "Nomination form (PF and insurance)", fields: ["Nominee name", "Relationship", "Date of birth", "Share (%)"] },
  { title: "Reimbursement claim form", fields: ["Expense date", "Category", "Amount", "Business purpose", "Receipt attached (yes or no)"] },
];
const formText = (form: { title: string; fields: string[] }, name: string) => plainText(parseBlocks(`# ${form.title}\n> Sample form for demonstration.\n\n**Employee:** ${name}\n**Date:** ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}\n\n## Details\n${form.fields.map((field) => `- ${field}: ______________________`).join("\n")}\n\n## Declaration\nI confirm the details above are correct.\n\nSignature: ______________________`));

function Tile({ icon, title, count, hint, href, action }: { icon: React.ReactNode; title: string; count?: number | string; hint: string; href?: string; action?: React.ReactNode }) {
  return <li className="flex flex-col justify-between gap-3 border border-border bg-surface p-4">
    <div className="flex items-center gap-3"><span aria-hidden className="flex size-10 items-center justify-center bg-accent-muted text-accent">{icon}</span><div className="min-w-0"><h3 className="text-sm font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{hint}</p></div></div>
    <div className="flex flex-wrap items-end justify-between gap-2"><p className="text-2xl font-semibold">{count}</p>{href ? <Link href={href} className="text-sm text-accent underline-offset-2 hover:underline" aria-label={`View all ${title.toLowerCase()}`}>View all</Link> : action}</div>
  </li>;
}

export function HrDocumentCenterView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees, documents, payrollRuns, addDocument } = useHrPeopleStore();
  const { policies, acknowledgements, patch, record } = useHrDocumentStore();
  const { letterRequests, addLetterRequest, decideLetterRequest, log } = useHrOperationsStore();
  const [requesting, setRequesting] = React.useState(false);
  const [formsOpen, setFormsOpen] = React.useState(false);
  const [declining, setDeclining] = React.useState<HrLetterRequest | null>(null);
  const hr = canManageHr(role);
  const actor = employees.find((item) => item.id === actorId);
  const mineDocs = documents.filter((item) => item.employeeId === actorId && item.status !== "missing" && item.status !== "archived" && ["employee", "employee_manager"].includes(item.visibility));
  const taxDocs = mineDocs.filter((item) => /form 16|tax/i.test(`${item.category} ${item.name}`));
  const toAck = policies.filter((item) => item.status !== "archived" && !acknowledgements[`${item.id}:${item.version}:${actorId}`]);
  const publishedSlips = payrollRuns.filter((item) => item.status === "locked").length;
  const mine = letterRequests.filter((item) => item.employeeId === actorId);
  const queue = letterRequests.filter((item) => item.status === "pending" && item.employeeId !== actorId);
  const nameOf = (id: string) => employees.find((item) => item.id === id)?.name ?? id;

  function generate(request: HrLetterRequest) {
    const person = employees.find((item) => item.id === request.employeeId);
    if (!person) return;
    const id = `doc-${crypto.randomUUID()}`;
    const document: HrDocument = { id, employeeId: person.id, employeeName: person.name, name: `${request.type} — ${person.name}`, category: request.type, visibility: "employee", version: 1, status: "current", signatureStatus: "draft", issuedAt: hrToday(), expiresAt: null, ownerName: actor?.name ?? "HR", acknowledgedAt: null };
    addDocument(document);
    patch(id, { body: sampleMarkup(document, person, { draft: true, addressedTo: request.addressedTo || "Whom it may concern", purpose: request.purpose }) });
    record(id, { actor: actor?.name ?? "HR", event: "Created from a letter request", version: 1, detail: request.purpose });
    decideLetterRequest(request.id, { status: "completed", decidedBy: actorId, documentId: id, reply: "Your letter is ready in My documents." });
    log({ recordId: request.id, actorId, action: "letter_issued", reason: `${request.type} for ${person.name}` });
    toast.success("Letter created. The employee can open it in My documents.");
  }

  return <div className="space-y-6">
    <section className="border border-border bg-surface p-5"><h2 className="text-lg font-semibold">We&apos;ve got it sorted for you</h2><p className="mt-1 text-sm text-muted-foreground">Your documents, payslips, policies and forms are in one place. Can&apos;t find a letter? Request it below.</p></section>
    <section aria-label="Documents"><h2 className="mb-3 text-sm font-semibold">Documents</h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile icon={<FileText className="size-5" />} title="Documents" count={mineDocs.length} hint="Letters, agreements, IDs" href={link("my-documents")} />
        <Tile icon={<Receipt className="size-5" />} title="Payslips" count={publishedSlips} hint="Published months" href={link("my-payslips")} />
        <Tile icon={<ScrollText className="size-5" />} title="Form 16" count={taxDocs.length} hint="Issued after the financial year" href={link("my-documents")} />
        <Tile icon={<ShieldCheck className="size-5" />} title="Company policies" count={policies.filter((item) => item.status !== "archived").length} hint={toAck.length ? `${toAck.length} to acknowledge` : "All acknowledged"} href={link("my-documents", "&tab=company")} />
        <Tile icon={<Download className="size-5" />} title="Forms" count={forms.length} hint="Download and fill in" action={<button type="button" className="text-sm text-accent underline-offset-2 hover:underline" onClick={() => setFormsOpen(true)}>View all</button>} />
      </ul></section>
    <section aria-label="Requests"><h2 className="mb-3 text-sm font-semibold">Request</h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Tile icon={<Mail className="size-5" />} title="Letters" count={mine.filter((item) => item.status === "pending").length} hint={`pending · ${mine.filter((item) => item.status !== "pending").length} closed`} action={actor ? <Button size="sm" onClick={() => setRequesting(true)}>Request a letter</Button> : undefined} /></ul></section>
    <HrPanel title="My letter requests" description="Letters you asked HR for.">{mine.length ? <ul className="divide-y divide-border text-sm">{mine.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><p className="font-medium">{item.type}</p><p className="text-xs text-muted-foreground">{item.purpose} · requested {hrDate(item.createdAt)}{item.reply ? ` · ${item.reply}` : ""}</p></div><div className="flex items-center gap-2">{item.status === "completed" ? <><span className="border border-success/30 bg-success-muted px-2 py-0.5 text-xs text-success">Ready</span>{item.documentId && <Button size="sm" variant="outline" asChild><Link href={link("my-documents")}>Open</Link></Button>}</> : item.status === "declined" ? <HrStatus status="rejected" /> : <HrStatus status="pending" />}</div></li>)}</ul> : <HrEmpty>You haven&apos;t requested a letter yet.</HrEmpty>}</HrPanel>
    {hr && <HrPanel title="Letter requests to process" description="Creating the letter adds it to the employee's documents.">{queue.length ? <ul className="divide-y divide-border text-sm">{queue.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><p className="font-medium">{item.type} · {nameOf(item.employeeId)}</p><p className="text-xs text-muted-foreground">For: {item.purpose} · To: {item.addressedTo || "Whom it may concern"} · {hrDate(item.createdAt)}{item.note ? ` · ${item.note}` : ""}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setDeclining(item)}>Decline</Button><Button size="sm" onClick={() => generate(item)}>Create letter</Button></div></li>)}</ul> : <HrEmpty>No letter requests waiting.</HrEmpty>}</HrPanel>}
    {requesting && actor && <RequestLetterDialog onClose={() => setRequesting(false)} onSend={(request) => { addLetterRequest({ ...request, id: `letter-${crypto.randomUUID()}`, employeeId: actor.id, status: "pending", createdAt: hrToday() }); log({ recordId: actor.id, actorId, action: "letter_requested", reason: request.type }); toast.success("Request sent to HR"); setRequesting(false); }} />}
    {declining && <DeclineLetterDialog request={declining} onClose={() => setDeclining(null)} onSubmit={(reason) => { decideLetterRequest(declining.id, { status: "declined", decidedBy: actorId, reply: reason }); log({ recordId: declining.id, actorId, action: "letter_declined", reason }); toast.success("Request declined"); setDeclining(null); }} />}
    {formsOpen && <HrModal open onOpenChange={(value) => !value && setFormsOpen(false)} title="Forms" description="Sample forms. Download, fill in and hand them to HR."><ul className="divide-y divide-border border border-border text-sm">{forms.map((form) => <li key={form.title} className="flex items-center justify-between gap-3 px-4 py-3"><span>{form.title}</span><Button size="sm" variant="outline" onClick={() => downloadHrFile(`${form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`, formText(form, actor?.name ?? ""))}><Download className="mr-1 size-3.5" />Download</Button></li>)}</ul></HrModal>}
  </div>;
}

function RequestLetterDialog({ onSend, onClose }: { onSend: (request: Pick<HrLetterRequest, "type" | "purpose" | "addressedTo" | "note">) => void; onClose: () => void }) {
  const [type, setType] = React.useState<string>(letterTypes[0]);
  const [purpose, setPurpose] = React.useState("");
  const [addressedTo, setAddressedTo] = React.useState("");
  const [note, setNote] = React.useState("");
  const error = purpose.trim().length < 5 ? "Say what the letter is for (at least 5 characters)." : "";
  return <HrModal open onOpenChange={(value) => !value && onClose()} title="Request a letter" description="HR creates it and adds it to My documents.">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!error) onSend({ type, purpose: purpose.trim(), addressedTo: addressedTo.trim(), note: note.trim() }); }}>
      <HrField label="Which letter?"><select className={hrInputClass} value={type} onChange={(event) => setType(event.target.value)}>{letterTypes.map((item) => <option key={item}>{item}</option>)}</select></HrField>
      <HrField label="What is it for?"><Input required maxLength={120} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="e.g. Visa application, bank loan, rental agreement" className="rounded-none" /></HrField>
      <HrField label="Addressed to · optional"><Input maxLength={120} value={addressedTo} onChange={(event) => setAddressedTo(event.target.value)} placeholder="Whom it may concern" className="rounded-none" /></HrField>
      <HrField label="Anything else HR should know? · optional"><Textarea maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} className="rounded-none" /></HrField>
      {error && purpose !== "" && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>Send request</Button></div>
    </form>
  </HrModal>;
}

function DeclineLetterDialog({ request, onSubmit, onClose }: { request: HrLetterRequest; onSubmit: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = React.useState("");
  return <HrModal open onOpenChange={(value) => !value && onClose()} title="Decline letter request" description={`${request.type}. The employee sees your reason.`}>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length >= 5) onSubmit(reason.trim()); }}>
      <Textarea aria-label="Reason" required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-none" />
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={reason.trim().length < 5}>Decline</Button></div>
    </form>
  </HrModal>;
}
