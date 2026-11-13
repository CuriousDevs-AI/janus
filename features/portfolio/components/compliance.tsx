"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Download, Lightbulb, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { useRoles } from "@/features/portfolio/lib/companies";
import { day, inr, monthsOrPart, todayIst } from "@/features/portfolio/lib/format";
import { CompanyEditor, entityNames, roleNames } from "@/features/portfolio/components/company-editor";
import { DocumentsCard } from "@/features/portfolio/components/documents";
import type { PortfolioCompany, PortfolioComplianceDue, PortfolioCompliancePlan, PortfolioRegisterRow } from "@/features/portfolio/types";

const dueTone = { overdue: "danger", due_soon: "warning", upcoming: "neutral", filed: "success" } as const;
// Janus cannot see the government portals, so a past date with no record is "not confirmed", not "late".
const dueName = { overdue: "Past due · not confirmed", due_soon: "Due this week", upcoming: "Upcoming", filed: "Filed" } as const;

/** The statutory calendar for each company: what applies, what is due, what is missing, and recording a filing. */
export function ComplianceView({ list: all, onChanged }: { list: PortfolioCompany[]; onChanged: () => void }) {
  const { handlesMoney } = useRoles();
  // Opened for one company (from a notification or the Overview): its filings only.
  const only = useSearchParams().get("company");
  const focused = all.find((item) => item.id === only);
  const list = focused ? [focused] : all;
  const [filter, setFilter] = React.useState<"open" | "all">("open");
  const open = list.flatMap((item) => item.compliance.filter((due) => due.status !== "filed"));
  const pastDue = list.reduce((sum, item) => sum + item.unfiledCount, 0);
  const listed = open.filter((due) => due.status === "overdue").length;
  const fees = open.reduce((sum, due) => sum + (due.status === "overdue" && due.lateFee ? Number(due.lateFee) : 0), 0);
  const since = list.find((item) => item.unfiledSince)?.unfiledSince;
  const download = async () => {
    try {
      const rows = await api<PortfolioRegisterRow[]>("/portfolio/compliance/register");
      const cell = (value: string | null) => `"${(value ?? "").replace(/"/g, '""')}"`;
      const lines = [["Company", "Filing", "Period", "Area", "Due on", "Status", "Filed on", "Acknowledgement", "Late fee so far (₹, estimate)", "Late cost"].map(cell).join(","), ...rows.map((row) => [row.company, row.label, row.period, row.area, row.dueOn, dueName[row.status], row.filedOn, row.acknowledgement, row.lateFee, row.lateNote].map(cell).join(","))];
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([`\ufeff${lines.join("\n")}`], { type: "text/csv;charset=utf-8" }));
      link.download = `filing-register-${todayIst()}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (failure) { toast.error(message(failure)); }
  };
  const soon = open.filter((due) => due.status === "due_soon").length;
  const missing = list.reduce((sum, item) => sum + item.complianceGaps.filter((gap) => gap.kind === "missing").length, 0);
  return <>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Stat label={`Past due, not confirmed${since ? ` since ${day(since)}` : ""}`} value={pastDue} tone={pastDue ? "danger" : "neutral"} />
      <Stat label="Due in the next 7 days" value={soon} tone={soon ? "warning" : "neutral"} />
      <Stat label="Registration details missing" value={missing} tone={missing ? "warning" : "neutral"} />
    </div>
    {(pastDue > listed || fees > 0) && <p role="status" className="rounded-md border border-danger/30 bg-danger-muted px-3 py-2 text-sm">{pastDue > listed ? `${pastDue} filings are past due and not recorded as filed since ${since ? day(since) : "last April"}; ${listed} of them are in the last 90 days, listed below. ` : ""}{fees > 0 ? `Late fees on those listed come to about ${inr(fees)} so far (an estimate: interest on tax due is extra).` : ""}</p>}
    <div className="flex justify-end"><Button size="sm" variant="outline" onClick={download}><Download className="mr-1 size-4" />Filing register (CSV)</Button></div>
    <p className="text-xs text-muted-foreground">Standard due dates for GST, TDS, PF and ESI, professional tax, advance tax and company or LLP filings, from 90 days back to 30 ahead. Janus is not linked to the government portals: a filing counts as filed only when someone records it here. Extensions and your AGM date can move dates, so confirm with your CA.</p>
    <div role="group" aria-label="Show" className="flex gap-2"><Button size="sm" variant={filter === "open" ? "default" : "outline"} aria-pressed={filter === "open"} onClick={() => setFilter("open")}>Still to file</Button><Button size="sm" variant={filter === "all" ? "default" : "outline"} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Everything, filed too</Button></div>
    {focused && <p className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">Showing {focused.name} only.<a className="text-accent hover:underline" href="/portfolio?view=compliance">Show all companies</a></p>}
    {list.map((item) => {
      const dues = item.compliance.filter((due) => filter === "all" || due.status !== "filed");
      return <SectionCard key={item.id} title={item.name} description={item.registration?.entityType ? `${entityNames[item.registration.entityType]}${item.compliancePlan?.gstin ? ` · GSTIN ${item.compliancePlan.gstin}` : ""}` : item.compliancePlan?.gstin ? `GSTIN ${item.compliancePlan.gstin}` : "No registration details yet"}>
        <div className="grid gap-4">
          {!item.complianceSetUp && <p role="status" className="rounded-md border border-warning/40 bg-warning-muted px-3 py-2 text-sm"><span className="font-medium">Not set up.</span> No filings are tracked for {item.name}, so nothing here can be called up to date. Choose what applies below{item.complianceGaps.some((gap) => gap.switch) ? ", or switch on what its records suggest" : ""}.</p>}
          <RegistrationCard item={item} canEdit={handlesMoney(item)} onSaved={onChanged} />
          <DocumentsCard item={item} canEdit={handlesMoney(item)} onSaved={onChanged} />
          {item.complianceGaps.length > 0 && <ul className="grid gap-1.5">{item.complianceGaps.map((gap) => <li key={gap.text} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${gap.kind === "missing" ? "border-warning/30 bg-warning-muted" : "border-accent-border bg-accent-muted/50"}`}>{gap.kind === "missing" ? <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" aria-hidden /> : <Lightbulb className="mt-px size-3.5 shrink-0 text-accent" aria-hidden />}<span className="flex-1"><span className="font-medium">{gap.kind === "missing" ? "Missing: " : "Suggested: "}</span>{gap.text}</span>{gap.switch && handlesMoney(item) && <SwitchOn item={item} part={gap.switch} onSaved={onChanged} />}</li>)}</ul>}
          {handlesMoney(item) && <PlanForm item={item} onSaved={onChanged} />}
          {item.compliance.length === 0 ? <p className="text-sm text-muted-foreground">No filings set up for this company yet. Choose what applies above.</p>
            : dues.length === 0 ? <p className="text-sm text-muted-foreground">Nothing left to file in this window.</p>
            : <ul className="flex flex-col divide-y divide-border">{dues.map((due) => <DueRow key={due.key} item={item} due={due} canMark={handlesMoney(item)} onChanged={onChanged} />)}</ul>}
        </div>
      </SectionCard>;
    })}
  </>;
}

/** Turns on one part of the filing plan that the company's own records suggest. */
function SwitchOn({ item, part, onSaved }: { item: PortfolioCompany; part: "tds" | "pfEsi" | "company"; onSaved: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const names = { tds: "TDS", pfEsi: "PF and ESI", company: "company filings" };
  async function turnOn() {
    setBusy(true);
    try {
      const plan = item.compliancePlan ?? { gstin: null, gstFiling: "none", tds: false, pfEsi: false, company: false };
      await api(`/portfolio/companies/${item.id}/compliance`, { method: "PUT", body: JSON.stringify({ ...plan, [part]: true }) });
      toast.success(`${names[part]} switched on for ${item.name}. Its dues are now in the calendar.`);
      onSaved();
    } catch (failure) { toast.error(message(failure)); setBusy(false); }
  }
  return <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 px-2 text-xs" disabled={busy} onClick={() => void turnOn()}>{busy ? "Switching on…" : "Switch on"}</Button>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "danger" | "warning" | "neutral" }) {
  return <div className="rounded-xl border border-border bg-surface p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-semibold tabular-nums ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : ""}`}>{value}</p></div>;
}

function DueRow({ item, due, canMark, onChanged }: { item: PortfolioCompany; due: PortfolioComplianceDue; canMark: boolean; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [filedOn, setFiledOn] = React.useState(todayIst());
  const [ack, setAck] = React.useState("");
  const [paid, setPaid] = React.useState("");
  // A TDS payment, PF or ESI is paid with a challan: its amount is kept beside the filing.
  const paysAmount = /^(tds|pf|esi)_/.test(due.key);
  // TDS for last month is known, so its interest (1.5% a month or part) can be worked out.
  const tdsInterest = due.status === "overdue" && item.tds && due.key === `tds_${item.tds.month}` && Number(item.tds.toDeposit) > 0
    ? Number(item.tds.toDeposit) * 0.015 * monthsOrPart(due.dueOn, todayIst())
    : 0;
  const save = async (filed: boolean) => {
    setBusy(true);
    try {
      await api(`/portfolio/companies/${item.id}/filings/${encodeURIComponent(due.key)}`, filed ? { method: "PUT", body: JSON.stringify({ filedOn, acknowledgement: ack.trim() || null, amount: paysAmount && paid ? paid : null }) } : { method: "DELETE" });
      toast.success(filed ? `${due.label} for ${due.period} recorded as filed.` : `${due.label} for ${due.period} is open again.`);
      setRecording(false);
      onChanged();
    } catch (failure) { toast.error(message(failure)); }
    setBusy(false);
  };
  return <li className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0">
    <div className="flex flex-wrap items-center gap-3">
      <Badge variant={dueTone[due.status]}>{dueName[due.status]}</Badge>
      <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{due.label}</span> · {due.period} <span className="text-muted-foreground">· {due.area} · due {day(due.dueOn)}{due.filedOn ? ` · filed ${day(due.filedOn)}` : ""}{due.acknowledgement ? ` · ack ${due.acknowledgement}` : ""}{due.amount ? ` · paid ${inr(Number(due.amount))}` : ""}</span>{due.status === "overdue" && due.lateNote && <span className="block text-xs text-danger">{due.lateFee ? `${due.key.startsWith("tds_") ? "Interest" : "Late fee"} so far about ${inr(Number(due.lateFee))} (estimate). ` : tdsInterest ? `Interest so far about ${inr(tdsInterest)} on ${inr(Number(item.tds!.toDeposit))} of TDS not deposited (estimate). ` : "Late cost: "}{due.lateNote}.</span>}</span>
      {canMark && (due.status === "filed" ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(false)}>Undo</Button> : !recording && <Button size="sm" variant="outline" disabled={busy} onClick={() => setRecording(true)}>Record filing</Button>)}
    </div>
    {recording && <form className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface-2 p-2" onSubmit={(event) => { event.preventDefault(); void save(true); }}>
      <label className="grid gap-1 text-xs text-muted-foreground">Filed on<Input type="date" value={filedOn} max={todayIst()} onChange={(event) => setFiledOn(event.target.value)} className="w-40" /></label>
      {paysAmount && <label className="grid gap-1 text-xs text-muted-foreground">Challan amount (₹)<Input type="number" min={0} value={paid} onChange={(event) => setPaid(event.target.value)} className="w-36" /></label>}
      <label className="grid flex-1 gap-1 text-xs text-muted-foreground">Acknowledgement number (optional)<Input value={ack} maxLength={60} placeholder="ARN, challan or SRN" onChange={(event) => setAck(event.target.value)} /></label>
      <Button type="submit" size="sm" disabled={busy || !filedOn}>Save</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setRecording(false)}>Cancel</Button>
    </form>}
  </li>;
}

export function RegistrationCard({ item, canEdit, onSaved }: { item: PortfolioCompany; canEdit: boolean; onSaved: () => void }) {
  const { owns } = useRoles();
  const [editing, setEditing] = React.useState(false);
  const reg = item.registration;
  const facts: [string, string | null | undefined][] = [["Entity", reg?.entityType ? entityNames[reg.entityType] : null], ["PAN", reg?.pan], ["TAN", reg?.tan], [reg?.entityType === "llp" ? "LLPIN" : "CIN", reg?.cin], ["EPF code", reg?.epfCode], ["ESI code", reg?.esiCode], ["Professional tax state", reg?.ptState], ["Udyam", reg?.udyam], ["Incorporated", reg?.incorporatedOn ? day(reg.incorporatedOn) : null], ["People", reg?.directors.length ? reg.directors.map((person) => `${person.name} (${(person.roles?.length ? person.roles : ["director" as const]).map((role) => roleNames[role]).join(", ")})`).join("; ") : null]];
  return <div className="rounded-md border border-border p-3">
    <div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Registration</p>{canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="size-3.5" />{reg ? "Edit" : "Add details"}</Button>}</div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3 lg:grid-cols-5">{facts.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className={`truncate ${value ? "font-medium" : "text-muted-foreground/70"}`}>{value || "Not recorded"}</dd></div>)}</dl>
    {editing && <CompanyEditor item={item} basics={owns(item)} onClose={() => setEditing(false)} onSaved={onSaved} />}
  </div>;
}

function PlanForm({ item, onSaved }: { item: PortfolioCompany; onSaved: () => void }) {
  const [plan, setPlan] = React.useState<PortfolioCompliancePlan>(item.compliancePlan ?? { gstin: null, gstFiling: "none", tds: false, pfEsi: false, company: false });
  const [saving, setSaving] = React.useState(false);
  const gstin = (plan.gstin ?? "").trim().toUpperCase();
  const bad = gstin !== "" && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gstin);
  async function save() {
    setSaving(true);
    try {
      await api(`/portfolio/companies/${item.id}/compliance`, { method: "PUT", body: JSON.stringify({ ...plan, company: item.registration?.entityType === "llp" ? false : plan.company, gstin: gstin || null }) });
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
    <div className="flex flex-wrap gap-4">{box("tds", "Deducts TDS")}{box("pfEsi", "Pays PF and ESI")}{item.registration?.entityType === "llp" ? <p className="text-xs text-muted-foreground">An LLP: Janus tracks LLP Forms 8 and 11, its tax return, advance tax and DIR-3 KYC from the registration. Company filings (AOC-4, MGT-7) do not apply.</p> : box("company", "Limited company filings (ROC, tax return, advance tax)")}</div>
    {bad && <p role="alert" className="text-xs text-danger">That GSTIN does not have the right format.</p>}
    <Button type="submit" size="sm" className="self-start" disabled={saving || bad}>{saving ? "Saving…" : "Save what applies"}</Button>
  </form>;
}
