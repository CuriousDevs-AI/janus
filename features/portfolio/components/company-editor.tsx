"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, message } from "@/lib/api/client";
import type { EntityType, LeaderRole, PortfolioCompany, PortfolioPersonRecord, PortfolioRegistration } from "@/features/portfolio/types";

export const entityNames: Record<EntityType, string> = { pvt_ltd: "Private limited", public_ltd: "Public limited", opc: "One person company", llp: "LLP", partnership: "Partnership", proprietorship: "Proprietorship", other: "Other" };
export const roleNames: Record<LeaderRole, string> = { founder: "Founder", cofounder: "Co-founder", director: "Director" };
const sizes = ["1–10 employees", "11–50 employees", "51–200 employees", "200+ employees"];
const emptyRegistration: PortfolioRegistration = { entityType: null, legalName: null, cin: null, pan: null, tan: null, epfCode: null, esiCode: null, ptState: null, udyam: null, incorporatedOn: null, registeredAddress: null, website: null, email: null, phone: null, city: null, state: null, directors: [] };
const select = "h-8 rounded-md border border-input bg-surface-2 px-2 text-[13px] text-foreground";

/**
 * Everything about a company in one form: its name and size (its Owner changes these), how to reach
 * it, its legal registration, and its people with their roles. `basics` is false for a role that
 * may change the registration but not rename the company.
 */
export function CompanyEditor({ item, basics, onClose, onSaved }: { item: PortfolioCompany; basics: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = React.useState(item.name);
  const [industry, setIndustry] = React.useState(item.industry);
  const [size, setSize] = React.useState(item.companySize);
  const [form, setForm] = React.useState<PortfolioRegistration>(() => ({ ...emptyRegistration, ...item.registration, directors: (item.registration?.directors ?? []).map((person) => ({ ...person, roles: person.roles?.length ? person.roles : ["director"] })) }));
  const [saving, setSaving] = React.useState(false);
  const set = (key: keyof PortfolioRegistration, value: string) => setForm({ ...form, [key]: value === "" ? null : value });
  const setPerson = (index: number, change: Partial<PortfolioPersonRecord>) => setForm({ ...form, directors: form.directors.map((person, at) => at === index ? { ...person, ...change } : person) });
  const upper = (value: string | null) => (value ?? "").trim().toUpperCase();
  const people = form.directors.filter((person) => person.name.trim());
  const errors = [
    basics && name.trim().length < 2 ? "Give the company a name." : "",
    upper(form.pan) && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(upper(form.pan)) ? "PAN is 5 letters, 4 digits and a letter, like AAPFU0939F." : "",
    upper(form.tan) && !/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(upper(form.tan)) ? "TAN is 4 letters, 5 digits and a letter, like BLRA12345B." : "",
    upper(form.ptState) && !/^[A-Z]{2}$/.test(upper(form.ptState)) ? "Professional tax state is two letters, like KA or MH." : "",
    form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(form.email.trim()) ? "That company email does not look right." : "",
    people.some((person) => person.din && !/^[0-9]{8}$/.test(person.din.trim())) ? "A DIN is 8 digits." : "",
    people.some((person) => person.roles.length === 0) ? "Tick at least one role for each person: founder, co-founder or director." : "",
  ].filter(Boolean);
  async function save() {
    setSaving(true);
    try {
      if (basics && (name.trim() !== item.name || industry.trim() !== item.industry || size !== item.companySize)) {
        await api(`/portfolio/companies/${item.id}/details`, { method: "PUT", body: JSON.stringify({ name: name.trim(), industry: industry.trim(), companySize: size }) });
      }
      await api(`/portfolio/companies/${item.id}/registration`, { method: "PUT", body: JSON.stringify({ ...form, directors: people.map((person) => ({ name: person.name.trim(), din: person.din?.trim() || null, roles: person.roles, title: person.title?.trim() || null })) }) });
      toast.success(`${basics ? name.trim() : item.name} saved.`);
      onSaved();
      onClose();
    } catch (failure) { toast.error(message(failure)); setSaving(false); }
  }
  const field = (key: keyof PortfolioRegistration, label: string, placeholder = "", type = "text") => <label className="grid gap-1 text-xs text-muted-foreground">{label}<Input type={type} value={(form[key] as string | null) ?? ""} placeholder={placeholder} onChange={(event) => set(key, event.target.value)} /></label>;
  const heading = (text: string, note?: string) => <div className="border-b border-border pb-1 pt-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text}</p>{note && <p className="text-[11px] text-muted-foreground">{note}</p>}</div>;
  return <Dialog open onOpenChange={(value) => !value && !saving && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Edit {item.name}</DialogTitle><DialogDescription>Leave anything you do not have blank. The legal details decide which filings apply.</DialogDescription></DialogHeader>
    <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (!errors.length) void save(); }}>
      {heading("The company")}
      {basics ? <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-muted-foreground">Name<Input value={name} maxLength={160} onChange={(event) => setName(event.target.value)} /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">Industry<Input value={industry} maxLength={120} placeholder="Textiles" onChange={(event) => setIndustry(event.target.value)} /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">Size<select className={select} value={size} onChange={(event) => setSize(event.target.value)}><option value="">Not chosen</option>{[...new Set([...sizes, ...(size ? [size] : [])])].map((value) => <option key={value}>{value}</option>)}</select></label>
        {field("incorporatedOn", "Founded or incorporated on", "", "date")}
      </div> : <p className="text-xs text-muted-foreground">Only the company&apos;s Owner changes its name, industry and size.</p>}

      {heading("How to reach it")}
      <div className="grid gap-3 sm:grid-cols-2">
        {field("website", "Website", "https://example.in")}
        {field("email", "Email", "hello@example.in", "email")}
        {field("phone", "Phone", "+91 98765 43210")}
        {field("city", "City", "Bengaluru")}
        {field("state", "State", "Karnataka")}
      </div>
      {field("registeredAddress", "Registered address")}

      {heading("People", "Tick every role a person holds. A founder can also be a director.")}
      <div className="grid gap-2">
        {form.directors.map((person, index) => <div key={index} className="grid gap-2 rounded-md border border-border bg-surface-2 p-2">
          <div className="flex flex-wrap gap-2">
            <Input aria-label="Name" placeholder="Name" className="min-w-[160px] flex-1" value={person.name} onChange={(event) => setPerson(index, { name: event.target.value })} />
            <Input aria-label="Title" placeholder="Title, like CEO" className="w-40" value={person.title ?? ""} onChange={(event) => setPerson(index, { title: event.target.value })} />
            <Input aria-label="DIN" placeholder="DIN (8 digits)" className="w-36" value={person.din ?? ""} onChange={(event) => setPerson(index, { din: event.target.value })} />
            <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${person.name || "this person"}`} onClick={() => setForm({ ...form, directors: form.directors.filter((_, at) => at !== index) })}><Trash2 className="size-3.5" /></Button>
          </div>
          <div className="flex flex-wrap gap-4 px-1">{(Object.keys(roleNames) as LeaderRole[]).map((role) => <label key={role} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={person.roles.includes(role)} onChange={() => setPerson(index, { roles: person.roles.includes(role) ? person.roles.filter((value) => value !== role) : [...person.roles, role] })} />{roleNames[role]}</label>)}</div>
        </div>)}
        <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setForm({ ...form, directors: [...form.directors, { name: "", din: null, roles: form.directors.length ? ["director"] : ["founder", "director"], title: null }] })}><Plus className="size-3.5" />Add a person</Button>
      </div>

      {heading("Legal registration")}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-muted-foreground">Entity type<select className={select} value={form.entityType ?? ""} onChange={(event) => setForm({ ...form, entityType: (event.target.value || null) as EntityType | null })}><option value="">Not chosen</option>{(Object.keys(entityNames) as EntityType[]).map((kind) => <option key={kind} value={kind}>{entityNames[kind]}</option>)}</select></label>
        {field("legalName", "Legal name", item.name)}
        {field("pan", "PAN", "AAPFU0939F")}
        {field("tan", "TAN", "BLRA12345B")}
        {field("cin", form.entityType === "llp" ? "LLPIN" : "CIN", form.entityType === "llp" ? "AAB-1234" : "U51909KA2020PTC123456")}
        {field("udyam", "Udyam (MSME) number", "UDYAM-KR-03-0012345")}
        {field("epfCode", "EPF establishment code")}
        {field("esiCode", "ESI code")}
        {field("ptState", "Professional tax state", "KA")}
      </div>
      {errors.length > 0 && <ul role="alert" className="grid gap-1 text-xs text-danger">{errors.map((text) => <li key={text}>{text}</li>)}</ul>}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || errors.length > 0}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}

/** The company's people, grouped by role, with titles and DINs. */
export function PeopleList({ people }: { people: PortfolioPersonRecord[] }) {
  if (!people.length) return <p className="text-sm text-muted-foreground">No founders or directors recorded yet.</p>;
  return <ul className="grid gap-2 sm:grid-cols-2">{people.map((person, index) => <li key={`${person.name}-${index}`} className="flex items-start gap-3 rounded-md border border-border p-2.5">
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-muted text-xs font-semibold text-accent" aria-hidden>{person.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
    <div className="min-w-0"><p className="truncate text-sm font-medium">{person.name}{person.title && <span className="font-normal text-muted-foreground"> · {person.title}</span>}</p>
      <p className="flex flex-wrap gap-1 pt-0.5">{(person.roles?.length ? person.roles : ["director" as LeaderRole]).map((role) => <span key={role} className="rounded border border-border bg-surface-2 px-1.5 text-[11px]">{roleNames[role]}</span>)}{person.din && <span className="text-[11px] text-muted-foreground">DIN {person.din}</span>}</p></div>
  </li>)}</ul>;
}
