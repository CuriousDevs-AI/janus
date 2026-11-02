"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { inr } from "@/features/portfolio/lib/format";
import type { PortfolioCompany, PortfolioPeriod } from "@/features/portfolio/types";

const months = { week: 7 / 30.4, month: 1, quarter: 3, fy: 12 } as const;

/** Progress against the monthly targets, scaled to the period, with where the pace says it should be today. */
export function TargetsCard({ list, period }: { list: PortfolioCompany[]; period: PortfolioPeriod }) {
  const withTargets = list.filter((item) => item.targets && (item.targets.leads || item.targets.wonValue || item.targets.collected));
  if (withTargets.length === 0) return null;
  const start = new Date(`${period.start}T00:00:00+05:30`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + (period.key === "fy" ? 12 : period.key === "quarter" ? 3 : 1));
  const elapsed = Math.min(1, (new Date(`${period.end}T23:59:59+05:30`).getTime() - start.getTime()) / (end.getTime() - start.getTime()));
  const row = (label: string, actual: number, monthly: string | null, format: (value: number) => string) => {
    if (!monthly) return null;
    const target = Number(monthly) * months[period.key];
    const pace = target * elapsed;
    const share = target ? Math.min(100, (actual / target) * 100) : 0;
    // A gap that rounds to nothing in the figure's own format counts as on pace.
    const onPace = actual >= pace || format(pace - actual) === format(0);
    return <div key={label}><div className="mb-1 flex flex-wrap justify-between gap-2 text-xs"><span className="font-medium">{label}</span><span className="tabular-nums text-muted-foreground">{format(actual)} of {format(target)} · {onPace ? "on pace" : `${format(pace - actual)} behind pace`}</span></div><div className="h-2 bg-surface-2"><div className={`h-2 ${onPace ? "bg-success" : "bg-warning"}`} style={{ width: `${Math.max(2, share)}%` }} /></div></div>;
  };
  return <SectionCard title="Targets" description={`Monthly targets scaled to ${period.label}, against where the pace says each should be today.`}>
    <div className="grid gap-5 md:grid-cols-2">{withTargets.map((item) => <div key={item.id} className="flex flex-col gap-3"><p className="text-sm font-medium">{item.name}</p>
      {row("Leads in", item.period.current.leads, item.targets!.leads, (value) => String(Math.round(value)))}
      {row("Value won", Number(item.period.current.wonValue), item.targets!.wonValue, inr)}
      {row("Collected", Number(item.period.current.collected ?? 0), item.targets!.collected, inr)}
    </div>)}</div>
  </SectionCard>;
}

/** The Owner sets each company's monthly targets; clearing a box removes that target. */
export function TargetsForm({ item, onSaved }: { item: PortfolioCompany; onSaved: () => void }) {
  const [form, setForm] = React.useState({ leads: item.targets?.leads ?? "", wonValue: item.targets?.wonValue ?? "", collected: item.targets?.collected ?? "" });
  const [saving, setSaving] = React.useState(false);
  const bad = Object.values(form).some((value) => value !== "" && !(Number(value) >= 0));
  async function save() {
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value === "" ? null : value]));
      await api(`/portfolio/companies/${item.id}/targets`, { method: "PUT", body: JSON.stringify(body) });
      toast.success(`Targets saved for ${item.name}.`);
      onSaved();
    } catch (failure) { toast.error(message(failure)); }
    setSaving(false);
  }
  return <form className="grid gap-2 sm:grid-cols-4 sm:items-end" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    {([["leads", "Leads a month"], ["wonValue", "Value won a month (₹)"], ["collected", "Collected a month (₹)"]] as const).map(([key, label]) => <label key={key} className="grid gap-1 text-xs text-muted-foreground">{label}<Input inputMode="decimal" value={form[key]} placeholder="No target" onChange={(event) => setForm({ ...form, [key]: event.target.value.replace(/[^0-9.]/g, "") })} /></label>)}
    <Button type="submit" size="sm" disabled={saving || bad}>{saving ? "Saving…" : "Save targets"}</Button>
  </form>;
}
