"use client";

import * as React from "react";
import { AlertTriangle, Lightbulb, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { useRoles } from "@/features/portfolio/lib/companies";
import { day, todayIst } from "@/features/portfolio/lib/format";
import type { EntityType, PortfolioCompany, PortfolioComplianceDue, PortfolioCompliancePlan, PortfolioRegistration } from "@/features/portfolio/types";

const dueTone = { overdue: "danger", due_soon: "warning", upcoming: "neutral", filed: "success" } as const;
// Janus cannot see the government portals, so a past date with no record is "not confirmed", not "late".
const dueName = { overdue: "Past due · not confirmed", due_soon: "Due this week", upcoming: "Upcoming", filed: "Filed" } as const;
export const entityNames: Record<EntityType, string> = { pvt_ltd: "Private limited", public_ltd: "Public limited", opc: "One person company", llp: "LLP", partnership: "Partnership", proprietorship: "Proprietorship", other: "Other" };
const emptyRegistration: PortfolioRegistration = { entityType: null, legalName: null, cin: null, pan: null, tan: null, epfCode: null, esiCode: null, ptState: null, udyam: null, incorporatedOn: null, registeredAddress: null, directors: [] };

/** The statutory calendar for each company: what applies, what is due, what is missing, and recording a filing. */
export function ComplianceView({ list, onChanged }: { list: PortfolioCompany[]; onChanged: () => void }) {
  const { handlesMoney } = useRoles();
  const [filter, setFilter] = React.useState<"open" | "all">("open");
  const open = list.flatMap((item) => item.compliance.filter((due) => due.status !== "filed"));
  const pastDue = open.filter((due) => due.status === "overdue").length;
  const soon = open.filter((due) => due.status === "due_soon").length;
  const missing = list.reduce((sum, item) => sum + item.complianceGaps.filter((gap) => gap.kind === "missing").length, 0);
  return <>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Stat label="Past due, not confirmed" value={pastDue} tone={pastDue ? "danger" : "neutral"} />
      <Stat label="Due in the next 7 days" value={soon} tone={soon ? "warning" : "neutral"} />
      <Stat label="Registration details missing" value={missing} tone={missing ? "warning" : "neutral"} />
    </div>
    <p className="text-xs text-muted-foreground">Standard due dates for GST, TDS, PF and ESI, professional tax, advance tax and company or LLP filings, from 90 days back to 30 ahead. Janus is not linked to the government portals: a filing counts as filed only when someone records it here. Extensions and your AGM date can move dates, so confirm with your CA.</p>
    <div role="group" aria-label="Show" className="flex gap-2"><Button size="sm" variant={filter === "open" ? "default" : "outline"} aria-pressed={filter === "open"} onClick={() => setFilter("open")}>Still to file</Button><Button size="sm" variant={filter === "all" ? "default" : "outline"} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Everything, filed too</Button></div>
    {list.map((item) => {
      const dues = item.compliance.filter((due) => filter === "all" || due.status !== "filed");
      return <SectionCard key={item.id} title={item.name} description={item.registration?.entityType ? `${entityNames[item.registration.entityType]}${item.compliancePlan?.gstin ? ` · GSTIN ${item.compliancePlan.gstin}` : ""}` : item.compliancePlan?.gstin ? `GSTIN ${item.compliancePlan.gstin}` : "No registration details yet"}>
        <div className="grid gap-4">
          <RegistrationCard item={item} canEdit={handlesMoney(item)} onSaved={onChanged} />
          {item.complianceGaps.length > 0 && <ul className="grid gap-1.5">{item.complianceGaps.map((gap) => <li key={gap.text} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${gap.kind === "missing" ? "border-warning/30 bg-warning-muted" : "border-accent-border bg-accent-muted/50"}`}>{gap.kind === "missing" ? <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" aria-hidden /> : <Lightbulb className="mt-px size-3.5 shrink-0 text-accent" aria-hidden />}<span><span className="font-medium">{gap.kind === "missing" ? "Missing: " : "Suggested: "}</span>{gap.text}</span></li>)}</ul>}
          {handlesMoney(item) && <PlanForm item={item} onSaved={onChanged} />}
          {item.compliance.length === 0 ? <p className="text-sm text-muted-foreground">No filings set up for this company yet. Choose what applies above.</p>
            : dues.length === 0 ? <p className="text-sm text-muted-foreground">Nothing left to file in this window.</p>
            : <ul className="flex flex-col divide-y divide-border">{dues.map((due) => <DueRow key={due.key} item={item} due={due} canMark={handlesMoney(item)} onChanged={onChanged} />)}</ul>}
        </div>
      </SectionCard>;
    })}
  </>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "danger" | "warning" | "neutral" }) {
  return <div className="rounded-xl border border-border bg-surface p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-semibold tabular-nums ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : ""}`}>{value}</p></div>;
}

function DueRow({ item, due, canMark, onChanged }: { item: PortfolioCompany; due: PortfolioComplianceDue; canMark: boolean; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [filedOn, setFiledOn] = React.useState(todayIst());
  const [ack, setAck] = React.useState("");
  const save = async (filed: boolean) => {
    setBusy(true);
    try {
      await api(`/portfolio/companies/${item.id}/filings/${encodeURIComponent(due.key)}`, filed ? { method: "PUT", body: JSON.stringify({ filedOn, acknowledgement: ack.trim() || null }) } : { method: "DELETE" });
      toast.success(filed ? `${due.label} for ${due.period} recorded as filed.` : `${due.label} for ${due.period} is open again.`);
      setRecording(false);
      onChanged();
    } catch (failure) { toast.error(message(failure)); }
    setBusy(false);
  };
  return <li className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0">
    <div className="flex flex-wrap items-center gap-3">
      <Badge variant={dueTone[due.status]}>{dueName[due.status]}</Badge>
      <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{due.label}</span> · {due.period} <span className="text-muted-foreground">· {due.area} · due {day(due.dueOn)}{due.filedOn ? ` · filed ${day(due.filedOn)}` : ""}{due.acknowledgement ? ` · ack ${due.acknowledgement}` : ""}</span></span>
      {canMark && (due.status === "filed" ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(false)}>Undo</Button> : !recording && <Button size="sm" variant="outline" disabled={busy} onClick={() => setRecording(true)}>Record filing</Button>)}
    </div>
    {recording && <form className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface-2 p-2" onSubmit={(event) => { event.preventDefault(); void save(true); }}>
      <label className="grid gap-1 text-xs text-muted-foreground">Filed on<Input type="date" value={filedOn} max={todayIst()} onChange={(event) => setFiledOn(event.target.value)} className="w-40" /></label>
      <label className="grid flex-1 gap-1 text-xs text-muted-foreground">Acknowledgement number (optional)<Input value={ack} maxLength={60} placeholder="ARN, challan or SRN" onChange={(event) => setAck(event.target.value)} /></label>
      <Button type="submit" size="sm" disabled={busy || !filedOn}>Save</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setRecording(false)}>Cancel</Button>
    </form>}
  </li>;
}

function RegistrationCard({ item, canEdit, onSaved }: { item: PortfolioCompany; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = React.useState(false);
  const reg = item.registration;
  const facts: [string, string | null | undefined][] = [["Entity", reg?.entityType ? entityNames[reg.entityType] : null], ["PAN", reg?.pan], ["TAN", reg?.tan], [reg?.entityType === "llp" ? "LLPIN" : "CIN", reg?.cin], ["EPF code", reg?.epfCode], ["ESI code", reg?.esiCode], ["Professional tax state", reg?.ptState], ["Udyam", reg?.udyam], ["Incorporated", reg?.incorporatedOn ? day(reg.incorporatedOn) : null], [reg?.entityType === "llp" ? "Designated partners" : "Directors", reg?.directors.length ? reg.directors.map((person) => person.din ? `${person.name} (DIN ${person.din})` : person.name).join(", ") : null]];
  return <div className="rounded-md border border-border p-3">
    <div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Registration</p>{canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="size-3.5" />{reg ? "Edit" : "Add details"}</Button>}</div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3 lg:grid-cols-5">{facts.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className={`truncate ${value ? "font-medium" : "text-muted-foreground/70"}`}>{value || "Not recorded"}</dd></div>)}</dl>
    {editing && <RegistrationForm item={item} onClose={() => setEditing(false)} onSaved={onSaved} />}
  </div>;
}

export function RegistrationForm({ item, onClose, onSaved }: { item: PortfolioCompany; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = React.useState<PortfolioRegistration>(item.registration ?? emptyRegistration);
  const [saving, setSaving] = React.useState(false);
  const set = (key: keyof PortfolioRegistration, value: string) => setForm({ ...form, [key]: value === "" ? null : value });
  const upper = (value: string | null) => (value ?? "").trim().toUpperCase();
  const errors = [
    upper(form.pan) && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(upper(form.pan)) ? "PAN is 5 letters, 4 digits and a letter, like AAPFU0939F." : "",
    upper(form.tan) && !/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(upper(form.tan)) ? "TAN is 4 letters, 5 digits and a letter, like BLRA12345B." : "",
    upper(form.ptState) && !/^[A-Z]{2}$/.test(upper(form.ptState)) ? "State is two letters, like KA or MH." : "",
    form.directors.some((person) => person.din && !/^[0-9]{8}$/.test(person.din.trim())) ? "A DIN is 8 digits." : "",
  ].filter(Boolean);
  async function save() {
    setSaving(true);
    try {
      await api(`/portfolio/companies/${item.id}/registration`, { method: "PUT", body: JSON.stringify({ ...form, directors: form.directors.filter((person) => person.name.trim()).map((person) => ({ name: person.name.trim(), din: person.din?.trim() || null })) }) });
      toast.success(`Registration details saved for ${item.name}.`);
      onSaved();
      onClose();
    } catch (failure) { toast.error(message(failure)); setSaving(false); }
  }
  const field = (key: keyof PortfolioRegistration, label: string, placeholder = "", type = "text") => <label className="grid gap-1 text-xs text-muted-foreground">{label}<Input type={type} value={(form[key] as string | null) ?? ""} placeholder={placeholder} onChange={(event) => set(key, event.target.value)} /></label>;
  return <Dialog open onOpenChange={(value) => !value && !saving && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Registration details · {item.name}</DialogTitle><DialogDescription>These decide which filings apply and what is missing. Leave anything you do not have blank.</DialogDescription></DialogHeader>
    <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (!errors.length) void save(); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-muted-foreground">Entity type<select className="h-8 rounded-md border border-input bg-surface-2 px-2 text-[13px] text-foreground" value={form.entityType ?? ""} onChange={(event) => setForm({ ...form, entityType: (event.target.value || null) as EntityType | null })}><option value="">Not chosen</option>{(Object.keys(entityNames) as EntityType[]).map((kind) => <option key={kind} value={kind}>{entityNames[kind]}</option>)}</select></label>
        {field("legalName", "Legal name", item.name)}
        {field("pan", "PAN", "AAPFU0939F")}
        {field("tan", "TAN", "BLRA12345B")}
        {field("cin", form.entityType === "llp" ? "LLPIN" : "CIN", form.entityType === "llp" ? "AAB-1234" : "U51909KA2020PTC123456")}
        {field("udyam", "Udyam (MSME) number", "UDYAM-KR-03-0012345")}
        {field("epfCode", "EPF establishment code")}
        {field("esiCode", "ESI code")}
        {field("ptState", "Professional tax state", "KA")}
        {field("incorporatedOn", "Date of incorporation", "", "date")}
      </div>
      {field("registeredAddress", "Registered address")}
      <fieldset className="grid gap-2"><legend className="mb-1 text-xs text-muted-foreground">{form.entityType === "llp" ? "Designated partners" : "Directors"}</legend>
        {form.directors.map((person, index) => <div key={index} className="flex gap-2"><Input aria-label="Name" placeholder="Name" value={person.name} onChange={(event) => setForm({ ...form, directors: form.directors.map((entry, at) => at === index ? { ...entry, name: event.target.value } : entry) })} /><Input aria-label="DIN" placeholder="DIN (8 digits)" className="w-40" value={person.din ?? ""} onChange={(event) => setForm({ ...form, directors: form.directors.map((entry, at) => at === index ? { ...entry, din: event.target.value } : entry) })} /><Button type="button" size="sm" variant="ghost" aria-label={`Remove ${person.name || "this person"}`} onClick={() => setForm({ ...form, directors: form.directors.filter((_, at) => at !== index) })}><Trash2 className="size-3.5" /></Button></div>)}
        <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setForm({ ...form, directors: [...form.directors, { name: "", din: null }] })}><Plus className="size-3.5" />Add a person</Button>
      </fieldset>
      {errors.length > 0 && <ul role="alert" className="grid gap-1 text-xs text-danger">{errors.map((text) => <li key={text}>{text}</li>)}</ul>}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || errors.length > 0}>{saving ? "Saving…" : "Save details"}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}

function PlanForm({ item, onSaved }: { item: PortfolioCompany; onSaved: () => void }) {
  const [plan, setPlan] = React.useState<PortfolioCompliancePlan>(item.compliancePlan ?? { gstin: null, gstFiling: "none", tds: false, pfEsi: false, company: false });
  const [saving, setSaving] = React.useState(false);
  const gstin = (plan.gstin ?? "").trim().toUpperCase();
  const bad = gstin !== "" && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gstin);
  async function save() {
    setSaving(true);
    try {
      await api(`/portfolio/companies/${item.id}/compliance`, { method: "PUT", body: JSON.stringify({ ...plan, gstin: gstin || null }) });
      toast.success(`Filings updated for ${item.name}.`);
      onSaved();
    } catch (failure) { toast.error(message(failure)); }
    setSaving(false);
  }
  const box = (key: "tds" | "pfEsi" | "company", label: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={plan[key]} onChange={() => setPlan({ ...plan, [key]: !plan[key] })} />{label}</label>;
  return <form className="flex flex-col gap-3 rounded-md border border-border bg-surface-2 p-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What applies</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-xs text-muted-foreground">GSTIN<Input value={plan.gstin ?? ""} maxLength={15} placeholder="27AAPFU0939F1ZV" onChange={(event) => setPlan({ ...plan, gstin: event.target.value })} aria-invalid={bad} /></label>
      <label className="grid gap-1 text-xs text-muted-foreground">GST returns<select className="h-8 rounded-md border border-input bg-surface px-2 text-[13px] text-foreground" value={plan.gstFiling} onChange={(event) => setPlan({ ...plan, gstFiling: event.target.value as PortfolioCompliancePlan["gstFiling"] })}><option value="none">Not registered</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly (QRMP)</option></select></label>
    </div>
    <div className="flex flex-wrap gap-4">{box("tds", "Deducts TDS")}{box("pfEsi", "Pays PF and ESI")}{box("company", "Limited company filings (ROC, tax return, advance tax)")}</div>
    {bad && <p role="alert" className="text-xs text-danger">That GSTIN does not have the right format.</p>}
    <Button type="submit" size="sm" className="self-start" disabled={saving || bad}>{saving ? "Saving…" : "Save what applies"}</Button>
  </form>;
}
