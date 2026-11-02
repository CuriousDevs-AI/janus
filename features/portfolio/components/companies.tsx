"use client";

import * as React from "react";
import { ArrowRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { switchTenant } from "@/lib/live-company";
import { TargetsForm } from "@/features/portfolio/components/targets";
import { openIn, useRoles } from "@/features/portfolio/lib/companies";
import type { PortfolioCompany } from "@/features/portfolio/types";

export function Companies({ list, onAdd, onSaved }: { list: PortfolioCompany[]; onAdd?: () => void; onSaved: () => void }) {
  const { owns } = useRoles();
  return <SectionCard title={`${list.length} ${list.length === 1 ? "company" : "companies"}`} description="Each company keeps its own people, records and settings." action={onAdd && <Button size="sm" variant="secondary" onClick={onAdd}><Plus className="mr-1 size-4" />Add company</Button>}>
    <ul className="divide-y divide-border">{list.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}{item.current && <Badge variant="neutral" className="ml-2">Open now</Badge>}</p><p className="text-xs text-muted-foreground">{item.industry || "Industry not set"} · since {item.createdAt} · {item.members} member{item.members === 1 ? "" : "s"}</p></div>
      {owns(item) && <Button size="sm" onClick={() => openIn(item)}>Open<ArrowRight className="ml-1 size-4" /></Button>}
      {owns(item) && <div className="w-full"><p className="mb-2 text-xs font-medium text-muted-foreground">Monthly targets</p><TargetsForm item={item} onSaved={onSaved} /></div>}
    </li>)}</ul>
  </SectionCard>;
}

export function AddCompany({ onClose }: { onClose: () => void }) {
  const [name, setName] = React.useState("");
  const [industry, setIndustry] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const error = name.trim().length < 2 ? "Give the company a name." : "";
  async function save() {
    setTouched(true);
    if (error) return;
    setSaving(true);
    let created: { id: string; name: string };
    try {
      created = await api("/portfolio/companies", { method: "POST", body: JSON.stringify({ name: name.trim(), industry: industry.trim() }) });
    } catch (failure) {
      toast.error(message(failure));
      setSaving(false);
      return;
    }
    toast.success(`${created.name} added. Opening it to finish setup.`);
    try {
      await switchTenant(created.id, "/setup");
    } catch (failure) {
      // The company exists, so the form must not offer to add it again. A full load lists it everywhere,
      // the switcher included, since the session's companies are read once per load.
      toast.error(`${created.name} was added, but could not be opened yet. ${message(failure)}`);
      window.location.assign("/portfolio?view=companies"); // eslint-disable-line @next/next/no-location-assign-relative-destination
    }
  }
  return <Dialog open onOpenChange={(value) => !value && !saving && onClose()}><DialogContent><DialogHeader><DialogTitle>Add a company</DialogTitle><DialogDescription>You become its Owner. It starts empty, with its own people, records and settings, and you set it up next.</DialogDescription></DialogHeader>
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className="grid gap-1.5 text-xs text-muted-foreground">Name<Input autoFocus value={name} maxLength={160} onChange={(event) => setName(event.target.value)} /></label>
      <label className="grid gap-1.5 text-xs text-muted-foreground">Industry (optional)<Input value={industry} maxLength={120} onChange={(event) => setIndustry(event.target.value)} /></label>
      {touched && error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Adding…" : "Add company"}</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}
