"use client";

import * as React from "react";
import { scoped } from "@/lib/company";
import { useRouter, useSearchParams } from "next/navigation";
import { CompanyWizard } from "@/components/setup/company-wizard";
import { ArrowRight, Building2, Check, CircleHelp, Mail, SkipForward, UsersRound, Waypoints } from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { workspaceDefinitions } from "@/lib/workspace-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/settings/section-ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Setup = { businessName: string; industry: string; companySize: string; timezone: string; setupCompleted: boolean; completedSteps: string[]; nextStep: string | null };
type Workspace = { id: string; type: string; name: string; description: string; status: string };
type WizardStep = "profile" | "workspace" | "members" | "connections";

const defaultSetup: Setup = { businessName: "Acme Traders Pvt Ltd", industry: "Wholesale distribution", companySize: "11–50 employees", timezone: "Asia/Kolkata", setupCompleted: false, completedSteps: [], nextStep: "business_details" };
const steps: Array<{ id: WizardStep; apiId: string; label: string; description: string }> = [
  { id: "profile", apiId: "business_details", label: "Business profile", description: "Tell Janus about your company and operating timezone." },
  { id: "workspace", apiId: "workspaces", label: "Activate a workspace", description: "Choose where your team will work. You can continue with Business Management only." },
  { id: "members", apiId: "members", label: "Invite your team", description: "Add teammates now or skip and invite them later from People & Access." },
  { id: "connections", apiId: "data_connections", label: "Connect data", description: "Connect a source when you are ready. This step is optional for the first session." },
];
const profileStorageKey = scoped("janus.setup.profile");
const activationStorageKey = scoped("janus.setup.active-workspace");

function LegacySetupPage() {
  const router = useRouter();
  const [setup, setSetup] = React.useState<Setup | null>(null);
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([]);
  const [step, setStep] = React.useState<WizardStep>("profile");
  const [name, setName] = React.useState("");
  const [industry, setIndustry] = React.useState("");
  const [companySize, setCompanySize] = React.useState("11–50 employees");
  const [timezone, setTimezone] = React.useState("Asia/Kolkata");
  const [activeWorkspace, setActiveWorkspace] = React.useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [invited, setInvited] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    Promise.all([api<Setup>("/business/setup"), api<Workspace[]>("/workspaces")])
      .then(([current, items]) => {
        if (!mounted) return;
        const storedProfile = window.localStorage.getItem(profileStorageKey);
        const profile = storedProfile ? JSON.parse(storedProfile) as Partial<Setup> : {};
        const nextSetup = current ?? defaultSetup;
        setSetup(nextSetup);
        setName(profile.businessName ?? nextSetup.businessName);
        setIndustry(profile.industry ?? nextSetup.industry);
        setCompanySize(profile.companySize ?? nextSetup.companySize);
        setTimezone(profile.timezone ?? nextSetup.timezone);
        setWorkspaces(items);
        const storedActivation = window.localStorage.getItem(activationStorageKey);
        setActiveWorkspace(storedActivation === "none" ? null : storedActivation || (nextSetup.completedSteps.includes("workspaces") ? items.find((item) => item.status === "active")?.type ?? null : null));
        const first = steps.find((item) => !nextSetup.completedSteps.includes(item.apiId));
        setStep(first?.id ?? "profile");
        setLoading(false);
      })
      .catch((reason) => {
        if (!mounted) return;
        if (demoMode) { setSetup(defaultSetup); setName(defaultSetup.businessName); setIndustry(defaultSetup.industry); setCompanySize(defaultSetup.companySize); setTimezone(defaultSetup.timezone); setLoading(false); return; }
        setError(message(reason)); setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const completed = setup?.completedSteps ?? [];
  const profilePercent = Math.round(([name, industry, companySize, timezone].filter(Boolean).length / 4) * 100);
  const completeCount = steps.filter((item) => completed.includes(item.apiId)).length;
  const progressPercent = Math.round((completeCount / steps.length) * 100);
  const currentIndex = Math.max(0, steps.findIndex((item) => item.id === step));
  const current = steps[currentIndex] ?? steps[0];
  const canContinue = current.id === "profile" ? Boolean(name.trim() && industry.trim()) : completed.includes(current.apiId);

  async function updateStep(apiId: string, values: Partial<Setup> = {}) {
    if (!setup) return false;
    const completedSteps = [...new Set([...setup.completedSteps, apiId])];
    const next = { ...setup, ...values, completedSteps, nextStep: steps.find((item) => !completedSteps.includes(item.apiId))?.apiId ?? null, setupCompleted: steps.every((item) => completedSteps.includes(item.apiId)) };
    setSetup(next);
    if (demoMode) return true;
    try {
      const updated = await api<Setup>("/business/setup", { method: "PATCH", body: JSON.stringify({ businessName: name.trim(), industry: industry.trim(), companySize, timezone, completedSteps }) });
      setSetup(updated); return true;
    } catch (reason) { toast.error(message(reason)); return false; }
  }

  async function saveProfile() {
    if (!name.trim() || !industry.trim()) return;
    setSaving(true);
    try {
      window.localStorage.setItem(profileStorageKey, JSON.stringify({ businessName: name, industry, companySize, timezone }));
      if (await updateStep("business_details", { businessName: name.trim(), industry: industry.trim(), companySize, timezone })) { toast.success("Business profile saved"); setStep("workspace"); }
    } finally { setSaving(false); }
  }

  async function activateWorkspace(type: string) {
    setSaving(true);
    try {
      const existing = workspaces.find((item) => item.type === type);
      if (!existing && !demoMode) {
        const definition = workspaceDefinitions.find((item) => item.id.replaceAll("-", "_") === type);
        const created = await api<Workspace>("/workspaces", { method: "POST", body: JSON.stringify({ type, name: definition?.name }) });
        setWorkspaces((items) => [...items, created]);
      }
      setActiveWorkspace(type); window.localStorage.setItem(activationStorageKey, type); window.dispatchEvent(new Event("janus:workspace-activation"));
      await updateStep("workspaces");
      toast.success(`${workspaceDefinitions.find((item) => item.id.replaceAll("-", "_") === type)?.name ?? "Workspace"} activated`);
      setStep("members");
    } catch (reason) { toast.error(message(reason)); } finally { setSaving(false); }
  }

  async function skipWorkspace() {
    setActiveWorkspace(null); window.localStorage.setItem(activationStorageKey, "none"); window.dispatchEvent(new Event("janus:workspace-activation"));
    await updateStep("workspaces"); setStep("members"); toast.success("You can activate a workspace later from Business → Workspaces");
  }

  async function skipStep(apiId: string, nextStep: WizardStep) {
    setSaving(true);
    try { await updateStep(apiId); setStep(nextStep); toast.success("Step skipped for now"); } finally { setSaving(false); }
  }

  function sendInvite() {
    if (!inviteEmail.trim()) return;
    setInvited((items) => [...new Set([...items, inviteEmail.trim()])]); setInviteEmail(""); toast.success("Invitation added to this setup session");
  }

  async function finish() {
    setSaving(true);
    try { if (!completed.includes("members")) await updateStep("members"); if (!completed.includes("data_connections")) await updateStep("data_connections"); toast.success("Business setup complete"); router.replace("/settings?tab=workspace&view=overview&workspace=business"); } finally { setSaving(false); }
  }

  if (loading) return <div className="mx-auto max-w-3xl p-8 text-sm text-muted-foreground">Loading your business setup…</div>;
  if (error) return <div className="mx-auto max-w-2xl p-8"><SectionCard title="Business setup unavailable" description={error}><Button onClick={() => router.replace("/settings?tab=workspace&view=overview&workspace=business")}>Open Business Management <ArrowRight className="size-3.5" /></Button></SectionCard></div>;
  if (!setup) return null;

  return <div className="mx-auto flex max-w-5xl flex-col gap-6 p-5 sm:p-8 lg:p-10">
    <header className="flex flex-wrap items-start justify-between gap-5"><div><Badge variant="neutral">Owner setup</Badge><h1 className="mt-2 text-2xl font-semibold tracking-tight">Set up your business in Janus</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Finish the essentials once. You can invite people and activate more workspaces whenever you are ready.</p></div><div className="min-w-[190px] rounded-lg border border-border bg-surface p-3"><div className="flex items-center justify-between text-xs"><span className="font-medium">Setup progress</span><span className="tabular-nums text-muted-foreground">{progressPercent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progressPercent}%` }} /></div><p className="mt-2 text-[11px] text-muted-foreground">{completeCount} of {steps.length} steps completed</p></div></header>
    <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <nav aria-label="Setup steps" className="flex gap-1 overflow-x-auto lg:grid lg:content-start lg:gap-2">{steps.map((item, index) => { const done = completed.includes(item.apiId); const selected = item.id === current.id; return <button key={item.id} type="button" onClick={() => (done || index <= currentIndex) && setStep(item.id)} className={`flex min-w-[180px] items-center gap-3 rounded-lg border p-3 text-left transition-colors lg:min-w-0 ${selected ? "border-accent-border bg-accent-muted" : "border-border bg-surface hover:bg-surface-2"}`}><span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-success text-white" : selected ? "bg-accent text-white" : "bg-surface-3 text-muted-foreground"}`}>{done ? <Check className="size-3.5" /> : index + 1}</span><span className="min-w-0"><span className="block truncate text-xs font-medium">{item.label}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{done ? "Complete" : item.description}</span></span></button>; })}</nav>
      <main className="min-w-0"><SectionCard title={`${currentIndex + 1}. ${current.label}`} description={current.description}>{current.id === "profile" && <ProfileStep name={name} industry={industry} companySize={companySize} timezone={timezone} setName={setName} setIndustry={setIndustry} setCompanySize={setCompanySize} setTimezone={setTimezone} profilePercent={profilePercent} />}{current.id === "workspace" && <WorkspaceStep activeWorkspace={activeWorkspace} onActivate={activateWorkspace} onSkip={skipWorkspace} saving={saving} />}{current.id === "members" && <MembersStep inviteEmail={inviteEmail} setInviteEmail={setInviteEmail} invited={invited} onInvite={sendInvite} onSkip={() => void skipStep("members", "connections")} saving={saving} />}{current.id === "connections" && <ConnectionsStep onConnect={() => router.push("/lead-sources")} onSkip={() => void skipStep("data_connections", "connections")} />}</SectionCard><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={() => router.replace("/settings?tab=workspace&view=overview&workspace=business")}>Save and exit</Button><div className="flex gap-2">{current.id === "profile" ? <Button onClick={() => void saveProfile()} disabled={saving || !canContinue}>{saving ? "Saving…" : "Save and continue"}<ArrowRight className="size-3.5" /></Button> : current.id === "workspace" ? null : current.id === "members" ? <Button onClick={() => void skipStep("members", "connections")} disabled={saving}>Continue to data <ArrowRight className="size-3.5" /></Button> : <Button onClick={() => void finish()} disabled={saving}>{saving ? "Finishing…" : "Open Business Management"}<ArrowRight className="size-3.5" /></Button>}</div></div></main>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><CircleHelp className="size-3.5" />You can change these choices later from Business Settings.</span>{activeWorkspace ? <span className="flex items-center gap-1.5"><Waypoints className="size-3.5 text-success" />Active workspace: {workspaceDefinitions.find((item) => item.id.replaceAll("-", "_") === activeWorkspace)?.name ?? activeWorkspace}</span> : <span className="flex items-center gap-1.5"><Waypoints className="size-3.5" />No workspace active · Business Management only</span>}</div>
  </div>;
}

function ProfileStep({ name, industry, companySize, timezone, setName, setIndustry, setCompanySize, setTimezone, profilePercent }: { name: string; industry: string; companySize: string; timezone: string; setName: (value: string) => void; setIndustry: (value: string) => void; setCompanySize: (value: string) => void; setTimezone: (value: string) => void; profilePercent: number }) {
  return <div className="grid gap-5"><div className="flex items-center justify-between rounded-lg border border-accent-border bg-accent-muted/50 p-3"><div><p className="text-sm font-medium">Business profile completion</p><p className="mt-1 text-xs text-muted-foreground">Used in reports, permissions and workspace settings.</p></div><span className="text-xl font-semibold text-accent">{profilePercent}%</span></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-muted-foreground">Business name<Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme Traders Pvt Ltd" /></label><label className="text-xs text-muted-foreground">Industry<Input className="mt-1" value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="e.g. Manufacturing" /></label><label className="text-xs text-muted-foreground">Company size<Select value={companySize} onValueChange={setCompanySize}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1–10 employees">1–10 employees</SelectItem><SelectItem value="11–50 employees">11–50 employees</SelectItem><SelectItem value="51–200 employees">51–200 employees</SelectItem><SelectItem value="200+ employees">200+ employees</SelectItem></SelectContent></Select></label><label className="text-xs text-muted-foreground">Timezone<Select value={timezone} onValueChange={setTimezone}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem><SelectItem value="UTC">UTC</SelectItem><SelectItem value="Asia/Singapore">Asia/Singapore (SGT)</SelectItem></SelectContent></Select></label></div></div>;
}

function WorkspaceStep({ activeWorkspace, onActivate, onSkip, saving }: { activeWorkspace: string | null; onActivate: (type: string) => void; onSkip: () => void; saving: boolean }) {
  const options = workspaceDefinitions.filter((item) => item.id !== "business" && item.id !== "portfolio");
  return <div className="grid gap-4"><div className={`rounded-lg border p-4 ${activeWorkspace ? "border-success/40 bg-success/5" : "border-amber-300/60 bg-amber-50"}`}><div className="flex items-start gap-3"><Building2 className="mt-0.5 size-4" /><div><p className="text-sm font-medium">{activeWorkspace ? "A workspace is active" : "No workspace is active yet"}</p><p className="mt-1 text-xs text-muted-foreground">{activeWorkspace ? "Your team can now enter the selected workspace from the workspace switcher." : "You can still use Business Management to configure the company and activate a workspace later."}</p></div></div></div><div className="grid gap-2 sm:grid-cols-2">{options.map((item) => { const type = item.id.replaceAll("-", "_"); const active = activeWorkspace === type; return <div key={item.id} className={`flex items-center gap-3 rounded-lg border p-3 ${active ? "border-success/40 bg-success/5" : "border-border bg-surface"}`}><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.name}</span><span className="mt-1 block text-xs text-muted-foreground">{item.description}</span></span>{active ? <Badge variant="success">Active</Badge> : <Button size="sm" variant="secondary" onClick={() => onActivate(type)} disabled={saving}>Activate</Button>}</div>; })}</div><Button variant="ghost" className="w-fit" onClick={onSkip} disabled={saving}><SkipForward className="size-3.5" />Skip for now</Button></div>;
}

function MembersStep({ inviteEmail, setInviteEmail, invited, onInvite, onSkip, saving }: { inviteEmail: string; setInviteEmail: (value: string) => void; invited: string[]; onInvite: () => void; onSkip: () => void; saving: boolean }) {
  return <div className="grid gap-4"><div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-4"><UsersRound className="mt-0.5 size-4 text-accent" /><div><p className="text-sm font-medium">Invite teammates when the foundation is ready</p><p className="mt-1 text-xs text-muted-foreground">Invites can be assigned to a workspace and role later from People & Access.</p></div></div><div className="flex flex-col gap-2 sm:flex-row"><Input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="teammate@company.com" /><Button onClick={onInvite} disabled={!inviteEmail.trim()}><Mail className="size-3.5" />Add invite</Button></div>{invited.length > 0 && <div className="divide-y divide-border rounded-lg border border-border">{invited.map((email) => <div key={email} className="flex items-center gap-2 p-3 text-sm"><Mail className="size-3.5 text-muted-foreground" />{email}<Badge className="ml-auto" variant="neutral">Pending</Badge></div>)}</div>}<Button variant="ghost" className="w-fit" onClick={onSkip} disabled={saving}><SkipForward className="size-3.5" />Skip team invites</Button></div>;
}

function ConnectionsStep({ onConnect, onSkip }: { onConnect: () => void; onSkip: () => void }) {
  return <div className="grid gap-4"><div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-4"><Waypoints className="mt-0.5 size-4 text-accent" /><div><p className="text-sm font-medium">Connect your first source</p><p className="mt-1 text-xs text-muted-foreground">Website forms, WhatsApp, phone calls, webhooks, API and CSV imports are available from Lead Sources.</p></div></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={onConnect}>Open Lead Sources <ArrowRight className="size-3.5" /></Button><Button variant="ghost" onClick={onSkip}><SkipForward className="size-3.5" />Skip for now</Button></div></div>;
}

/** The preview adds and finishes companies with its own wizard. The live product keeps the API-driven setup. */
export default function SetupPage() {
  const params = useSearchParams();
  if (demoMode) return <CompanyWizard key={params.get("finish") ?? "new"} finishId={params.get("finish") ?? undefined} />;
  return <LegacySetupPage />;
}
