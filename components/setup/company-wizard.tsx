"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Building2, Check, Plus, Trash2, UsersRound, Waypoints } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CompanyLogo } from "@/components/shared/company-logo";
import { LogoPicker } from "@/components/shared/logo-picker";
import { SectionCard } from "@/components/settings/section-ui";
import { addCompany, newCompanyId, readCompanies, switchCompany, updateCompany, type CompanyRecord } from "@/lib/company";

type Team = NonNullable<CompanyRecord["team"]>;
const steps = [
  { id: "profile", label: "Company", description: "What the company is called and where it works." },
  { id: "start", label: "Starting point", description: "Begin empty, or with a sample company to explore." },
  { id: "workspaces", label: "Workspaces", description: "Switch on the areas this company will use." },
  { id: "team", label: "Team", description: "Add the first people. You can add more any time." },
  { id: "review", label: "Review", description: "Check everything, then open the company." },
] as const;
const templates: { id: CompanyRecord["template"]; title: string; detail: string; crm: boolean }[] = [
  { id: "blank", title: "Start empty", detail: "Just you. Add people, leads and policies as you go.", crm: false },
  { id: "nimbus", title: "Services business sample", detail: "6 people, 7 clients, 12 leads and 5 open deals. Good for seeing CRM and HR together.", crm: true },
  { id: "greenleaf", title: "Retail sample", detail: "6 people across stores, purchase and logistics. HR only.", crm: false },
];
const industries = ["Distribution and wholesale", "Digital agency", "Retail", "Manufacturing", "Healthcare", "Education", "Logistics", "Hospitality", "Software", "Other"];
const sizes = ["1–10 employees", "11–50 employees", "51–200 employees", "200+ employees"];
const workspaceOptions = [
  { id: "crm-sales", name: "CRM & Sales", detail: "Leads, deals, conversations and customers." },
  { id: "hr-people", name: "HR & People", detail: "Employees, leave, attendance, payroll and documents." },
];

/** Adds a company, or finishes setting one up. Ends by opening the company. */
export function CompanyWizard({ finishId }: { finishId?: string }) {
  const existing = React.useMemo(() => readCompanies(), []);
  const finishing = existing.find((item) => item.id === finishId);
  const [step, setStep] = React.useState(finishing ? 2 : 0);
  const [name, setName] = React.useState(finishing?.name ?? "");
  const [industry, setIndustry] = React.useState(finishing?.industry ?? industries[0]);
  const [city, setCity] = React.useState(finishing?.city ?? "");
  const [logo, setLogo] = React.useState<string | undefined>(finishing?.logo);
  const [size, setSize] = React.useState(finishing?.size ?? sizes[1]);
  const [template, setTemplate] = React.useState<CompanyRecord["template"]>(finishing?.template ?? "blank");
  const [workspaces, setWorkspaces] = React.useState<string[]>(finishing?.workspaces ?? ["crm-sales", "hr-people"]);
  const [team, setTeam] = React.useState<Team>(finishing?.team ?? []);
  const [draft, setDraft] = React.useState({ name: "", email: "", title: "", department: "" });

  const taken = existing.some((item) => item.id !== finishId && item.name.trim().toLowerCase() === name.trim().toLowerCase());
  const profileError = name.trim().length < 2 ? "Give the company a name (at least 2 characters)." : taken ? `${name.trim()} already exists in your account.` : city.trim().length < 2 ? "Where does it work? Add a city." : "";
  const draftError = !draft.name.trim() ? "Enter their name." : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(draft.email.trim()) ? "Enter a work email." : team.some((item) => item.email.toLowerCase() === draft.email.trim().toLowerCase()) ? "That email is already added." : !draft.title.trim() ? "Enter their job title." : "";
  const stepError = step === 0 ? profileError : step === 2 && workspaces.length === 0 ? "Switch on at least one workspace." : "";

  function addPerson() {
    if (draftError) { toast.error(draftError); return; }
    setTeam((current) => [...current, { name: draft.name.trim(), email: draft.email.trim(), title: draft.title.trim(), department: draft.department.trim() }]);
    setDraft({ name: "", email: "", title: "", department: "" });
  }
  function pickTemplate(id: CompanyRecord["template"]) {
    setTemplate(id);
    // A sample with CRM records is only useful with CRM switched on.
    if (templates.find((item) => item.id === id)?.crm) setWorkspaces((current) => current.includes("crm-sales") ? current : [...current, "crm-sales"]);
  }
  function finish() {
    if (profileError) { setStep(0); return; }
    const record: CompanyRecord = { id: finishId ?? newCompanyId(name, existing), name: name.trim(), industry, city: city.trim(), template, workspaces, setupDone: true, size, team, logo, createdAt: finishing?.createdAt ?? new Date().toISOString().slice(0, 10) };
    if (finishing) updateCompany(record.id, record); else addCompany(record);
    toast.success(`${record.name} is ready.`);
    switchCompany(record.id);
  }

  return <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-6 py-8">
    <header>
      <Badge variant="neutral">{finishing ? "Finish setup" : "New company"}</Badge>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{finishing ? `Finish setting up ${finishing.name}` : "Add a company"}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Each company keeps its own people, records and settings. You move between them from the company menu.</p>
    </header>
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <nav aria-label="Setup steps" className="flex gap-1 overflow-x-auto lg:grid lg:content-start lg:gap-2">
        {steps.map((item, index) => <button key={item.id} type="button" aria-current={step === index ? "step" : undefined} disabled={index > step && Boolean(stepError)} onClick={() => setStep(index)} className={`flex min-w-36 items-center gap-3 border px-3 py-2 text-left text-sm lg:min-w-0 ${step === index ? "border-accent bg-accent-muted/40" : "border-border bg-surface"} disabled:opacity-50`}><span className={`flex size-6 shrink-0 items-center justify-center text-xs font-semibold ${index < step ? "bg-success text-background" : "bg-surface-3"}`}>{index < step ? <Check className="size-3.5" /> : index + 1}</span><span>{item.label}</span></button>)}
      </nav>
      <main className="min-w-0">
        <SectionCard title={`${step + 1}. ${steps[step].label}`} description={steps[step].description}>
          {step === 0 && <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><LogoPicker id={finishId ?? "new"} name={name} value={logo} onChange={setLogo} /></div>
            <label className="grid gap-1.5 text-xs text-muted-foreground sm:col-span-2">Company name<Input autoFocus value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="e.g. Sunrise Foods Pvt Ltd" /></label>
            <label className="grid gap-1.5 text-xs text-muted-foreground">Industry<select className="h-9 border border-border bg-surface px-3 text-sm text-foreground" value={industry} onChange={(event) => setIndustry(event.target.value)}>{industries.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="grid gap-1.5 text-xs text-muted-foreground">City<Input value={city} maxLength={40} onChange={(event) => setCity(event.target.value)} placeholder="e.g. Jaipur" /></label>
            <label className="grid gap-1.5 text-xs text-muted-foreground">Company size<select className="h-9 border border-border bg-surface px-3 text-sm text-foreground" value={size} onChange={(event) => setSize(event.target.value)}>{sizes.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>}
          {step === 1 && <div role="radiogroup" aria-label="Starting point" className="grid gap-3">
            {templates.map((item) => <button key={item.id} type="button" role="radio" aria-checked={template === item.id} onClick={() => pickTemplate(item.id)} className={`flex items-start gap-3 border p-4 text-left ${template === item.id ? "border-accent bg-accent-muted/40" : "border-border bg-surface"}`}><Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><span className="block text-sm font-medium">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{item.detail}</span></span></button>)}
          </div>}
          {step === 2 && <div className="grid gap-3">
            {workspaceOptions.map((item) => { const on = workspaces.includes(item.id); return <label key={item.id} className={`flex cursor-pointer items-start gap-3 border p-4 ${on ? "border-accent bg-accent-muted/40" : "border-border bg-surface"}`}><input type="checkbox" className="mt-1" checked={on} onChange={() => setWorkspaces((current) => on ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span><span className="flex items-center gap-2 text-sm font-medium"><Waypoints className="size-4 text-muted-foreground" aria-hidden />{item.name}</span><span className="mt-1 block text-xs text-muted-foreground">{item.detail}</span></span></label>; })}
            <p className="text-xs text-muted-foreground">Business Management is always on for the Owner. More workspaces can be switched on later from Business → Workspaces.</p>
            {templates.find((item) => item.id === template)?.crm && !workspaces.includes("crm-sales") && <p role="alert" className="text-xs text-warning">The sample you chose has CRM records. Switch CRM & Sales on to see them.</p>}
          </div>}
          {step === 3 && <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs text-muted-foreground">Name<Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label className="grid gap-1.5 text-xs text-muted-foreground">Work email<Input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
              <label className="grid gap-1.5 text-xs text-muted-foreground">Job title<Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
              <label className="grid gap-1.5 text-xs text-muted-foreground">Department<Input value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} placeholder="e.g. Sales" /></label>
            </div>
            <div><Button type="button" size="sm" variant="outline" onClick={addPerson}><Plus className="mr-1 size-4" />Add person</Button></div>
            {team.length === 0 ? <p className="text-sm text-muted-foreground">No one added yet. You can skip this and add people later from HR & People.</p> : <ul className="divide-y divide-border border border-border">{team.map((person) => <li key={person.email} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><span className="flex min-w-0 items-center gap-2"><UsersRound className="size-4 shrink-0 text-muted-foreground" aria-hidden /><span className="truncate"><span className="font-medium">{person.name}</span> <span className="text-muted-foreground">· {person.title}{person.department ? ` · ${person.department}` : ""}</span></span></span><Button type="button" size="sm" variant="ghost" aria-label={`Remove ${person.name}`} onClick={() => setTeam((current) => current.filter((item) => item.email !== person.email))}><Trash2 className="size-4" /></Button></li>)}</ul>}
          </div>}
          {step === 4 && <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Company</dt><dd className="flex items-center gap-2 font-medium"><CompanyLogo company={{ id: finishId ?? "new", name, logo }} size={24} />{name.trim()}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Industry and city</dt><dd>{industry} · {city.trim()}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Starting point</dt><dd>{templates.find((item) => item.id === template)?.title}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Workspaces</dt><dd>{workspaces.map((id) => workspaceOptions.find((item) => item.id === id)?.name).join(", ") || "Business Management only"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">People you added</dt><dd>{team.length ? team.map((item) => item.name).join(", ") : "None yet"}</dd></div>
          </dl>}
          {stepError && step < 4 && <p role="alert" className="mt-4 text-xs text-danger">{stepError}</p>}
          <div className="mt-6 flex items-center justify-between gap-2">
            <Button type="button" variant="outline" disabled={step === 0 || (Boolean(finishing) && step === 2)} onClick={() => setStep(step - 1)}><ArrowLeft className="mr-1 size-4" />Back</Button>
            {step < 4 ? <Button type="button" disabled={Boolean(stepError)} onClick={() => setStep(step + 1)}>{step === 3 && team.length === 0 ? "Skip for now" : "Continue"}<ArrowRight className="ml-1 size-4" /></Button> : <Button type="button" onClick={finish}>{finishing ? "Finish setup" : "Create company"}</Button>}
          </div>
        </SectionCard>
      </main>
    </div>
  </div>;
}
