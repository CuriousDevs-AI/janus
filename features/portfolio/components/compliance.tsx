"use client";

import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { useRoles } from "@/features/portfolio/lib/companies";
import { day, todayIst } from "@/features/portfolio/lib/format";
import type { PortfolioCompany, PortfolioComplianceDue, PortfolioCompliancePlan } from "@/features/portfolio/types";

const dueTone = { overdue: "danger", due_soon: "warning", upcoming: "neutral", filed: "success" } as const;
const dueName = { overdue: "Overdue", due_soon: "Due this week", upcoming: "Upcoming", filed: "Filed" } as const;

/** The statutory calendar for each company: what applies, what is due, and marking it filed. */
export function ComplianceView({ list, onChanged }: { list: PortfolioCompany[]; onChanged: () => void }) {
  const { handlesMoney } = useRoles();
  const all = list.flatMap((item) => item.compliance.filter((due) => due.status !== "filed").map((due) => ({ ...due, company: item })));
  const overdue = all.filter((due) => due.status === "overdue").length;
  const soon = all.filter((due) => due.status === "due_soon").length;
  return <>
    <SectionCard title={`${overdue} overdue · ${soon} due this week`} description="Standard due dates for GST, TDS, PF and ESI, advance tax and company filings, from 90 days back to 30 ahead. Government extensions and your AGM date can move them: confirm with your CA.">
      <p className="text-sm text-muted-foreground">Set what applies to each company below. A filing stays overdue until it is marked filed.</p>
    </SectionCard>
    {list.map((item) => <SectionCard key={item.id} title={item.name} description={item.compliancePlan?.gstin ? `GSTIN ${item.compliancePlan.gstin}` : "No GSTIN recorded"}>
      {handlesMoney(item) && <PlanForm item={item} onSaved={onChanged} />}
      {item.compliance.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No filings set up for this company yet.</p> : <ul className="mt-3 flex flex-col divide-y divide-border">{item.compliance.map((due) => <DueRow key={due.key} item={item} due={due} canMark={handlesMoney(item)} onChanged={onChanged} />)}</ul>}
    </SectionCard>)}
  </>;
}

function DueRow({ item, due, canMark, onChanged }: { item: PortfolioCompany; due: PortfolioComplianceDue; canMark: boolean; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const change = async (filed: boolean) => {
    setBusy(true);
    try {
      await api(`/portfolio/companies/${item.id}/filings/${encodeURIComponent(due.key)}`, filed ? { method: "PUT", body: JSON.stringify({ filedOn: todayIst() }) } : { method: "DELETE" });
      toast.success(filed ? `${due.label} for ${due.period} marked filed.` : `${due.label} for ${due.period} is open again.`);
      onChanged();
    } catch (failure) { toast.error(message(failure)); }
    setBusy(false);
  };
  return <li className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
    <Badge variant={dueTone[due.status]}>{dueName[due.status]}</Badge>
    <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{due.label}</span> · {due.period} <span className="text-muted-foreground">· {due.area} · due {day(due.dueOn)}{due.filedOn ? ` · filed ${day(due.filedOn)}` : ""}</span></span>
    {canMark && (due.status === "filed" ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void change(false)}>Undo</Button> : <Button size="sm" variant="outline" disabled={busy} onClick={() => void change(true)}>Mark filed today</Button>)}
  </li>;
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
  return <form className="flex flex-col gap-3 border border-border bg-surface-2 p-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-xs text-muted-foreground">GSTIN<Input value={plan.gstin ?? ""} maxLength={15} placeholder="27AAPFU0939F1ZV" onChange={(event) => setPlan({ ...plan, gstin: event.target.value })} aria-invalid={bad} /></label>
      <label className="grid gap-1 text-xs text-muted-foreground">GST returns<select className="h-9 border border-border bg-surface px-3 text-sm text-foreground" value={plan.gstFiling} onChange={(event) => setPlan({ ...plan, gstFiling: event.target.value as PortfolioCompliancePlan["gstFiling"] })}><option value="none">Not registered</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly (QRMP)</option></select></label>
    </div>
    <div className="flex flex-wrap gap-4">{box("tds", "Deducts TDS")}{box("pfEsi", "Pays PF and ESI")}{box("company", "Private or public limited company (ROC and tax filings)")}</div>
    {bad && <p role="alert" className="text-xs text-danger">That GSTIN does not have the right format.</p>}
    <Button type="submit" size="sm" className="self-start" disabled={saving || bad}>{saving ? "Saving…" : "Save what applies"}</Button>
  </form>;
}
