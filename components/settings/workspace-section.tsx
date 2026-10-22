"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Bell, CreditCard, LockKeyhole, Plus, RefreshCw, Sparkles, UserRound, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { tenant } from "@/lib/mock-data";
import { SectionCard, FieldRow } from "@/components/settings/section-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ChannelType } from "@/lib/types";
import { workspaceDefinitions } from "@/lib/workspace-config";
import { api, message } from "@/lib/api/client";
import { useApi as apiUse } from "@/lib/api/use-api";
import { demoMode } from "@/lib/demo-mode";
import { useSession } from "@/components/auth/session-provider";
import { CompanyProfileSection } from "@/components/settings/company-profile-section";
import { BillingSection } from "@/components/settings/billing-section";

const timezones = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
  { value: "America/New_York", label: "America/New York (ET)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST)" },
  { value: "UTC", label: "UTC" },
];

const defaultChannelOptions: { value: ChannelType; label: string }[] = [
  { value: "website_chat", label: "Website Chat" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
];

export function WorkspaceSection() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const requestedSection = searchParams.get("section");
  const session = useSession();
  const [timezone, setTimezone] = React.useState(tenant.timezone);
  const [hoursStart, setHoursStart] = React.useState(tenant.businessHours.start);
  const [hoursEnd, setHoursEnd] = React.useState(tenant.businessHours.end);
  const [defaultChannel, setDefaultChannel] = React.useState<ChannelType>(tenant.defaultChannel);
  const [settingsSection, setSettingsSection] = React.useState(() => requestedSection || "profile");
  const [profileName, setProfileName] = React.useState(session.user.name);
  const [profilePhone, setProfilePhone] = React.useState(session.user.phone ?? "");
  const [profileTimezone, setProfileTimezone] = React.useState(session.user.timezone || tenant.timezone);
  const [profileLanguage, setProfileLanguage] = React.useState(session.user.language || "en");

  const [regionalSaving, setRegionalSaving] = React.useState(false);

  async function handleSave() {
    setRegionalSaving(true);
    try {
      await api("/business/setup", {
        method: "PATCH",
        body: JSON.stringify({ timezone, businessHoursStart: hoursStart, businessHoursEnd: hoursEnd, defaultChannel }),
      });
      toast.success("Regional settings saved");
    } catch (error) {
      toast.error(message(error));
    } finally {
      setRegionalSaving(false);
    }
  }

  async function handleProfileSave() {
    try {
      await api("/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: profileName.trim(),
          phone: profilePhone.trim() || null,
          timezone: profileTimezone,
          language: profileLanguage,
        }),
      });
      toast.success("Profile saved");
    } catch (error) {
      toast.error(message(error));
    }
  }

  if (view === "overview") return <BusinessOverviewPanel />;
  if (view === "workspaces") return <WorkspacesPanel />;
  if (view === "administration") return <AdministrationPanel section={requestedSection} session={session} name={profileName} phone={profilePhone} timezone={profileTimezone} language={profileLanguage} onNameChange={setProfileName} onPhoneChange={setProfilePhone} onTimezoneChange={setProfileTimezone} onLanguageChange={setProfileLanguage} onSave={handleProfileSave} />;
  // Keep old deep links working while Billing now lives under Administration.
  if (view === "settings" && requestedSection === "billing") return <BillingSection />;

  const settingsSections = [["profile", "Company Profile"], ["structure", "Organization Structure"], ["locale", "Currency & Timezone"], ["security", "Security & Privacy"], ["data", "Data Management"]];
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Business Settings</h1>
      <SectionTabs items={settingsSections} value={settingsSection} onChange={setSettingsSection} />
      <main className="min-w-0">
          {settingsSection === "profile" && <CompanyProfileSection />}
          {settingsSection === "structure" && <SectionCard title="Organization structure" description="Organize your teams, departments and workspace ownership.">{demoMode ? <><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-border bg-surface-2 p-4"><p className="text-sm font-medium">Acme Traders Pvt Ltd</p><p className="mt-1 text-xs text-muted-foreground">Owner: Pankaj Neema · 24 members</p><Badge className="mt-3" variant="success">Active organization</Badge></div><div className="rounded-lg border border-border bg-surface-2 p-4"><p className="text-sm font-medium">Departments</p><p className="mt-1 text-xs text-muted-foreground">Sales, Operations, Finance and Support</p><Badge className="mt-3" variant="neutral">4 departments</Badge></div></div><div className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface"><div className="flex items-center justify-between p-3"><div><p className="text-sm font-medium">Sales & Marketing</p><p className="text-xs text-muted-foreground">8 members · CRM & Sales workspace</p></div><Badge variant="neutral">Manager assigned</Badge></div><div className="flex items-center justify-between p-3"><div><p className="text-sm font-medium">Operations & Support</p><p className="text-xs text-muted-foreground">10 members · 2 workspaces</p></div><Badge variant="neutral">Manager assigned</Badge></div></div></> : <UnavailableMessage text="Organization records are not connected yet. Add members and departments from People & Access to populate this view." />}</SectionCard>}
          {settingsSection === "locale" && <SectionCard title="Locale & hours" description="Timezone and business hours used for scheduling and AI handoff rules."><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FieldRow label="Timezone"><Select value={timezone} onValueChange={setTimezone}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{timezones.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></FieldRow><FieldRow label="Default communication channel"><Select value={defaultChannel} onValueChange={(v) => setDefaultChannel(v as ChannelType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{defaultChannelOptions.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></FieldRow><FieldRow label="Business hours start"><Input type="time" value={hoursStart} onChange={(e) => setHoursStart(e.target.value)} /></FieldRow><FieldRow label="Business hours end"><Input type="time" value={hoursEnd} onChange={(e) => setHoursEnd(e.target.value)} /></FieldRow></div><div className="mt-4 flex justify-end"><Button disabled={regionalSaving} onClick={handleSave}>{regionalSaving ? "Saving…" : "Save regional settings"}</Button></div></SectionCard>}
          {settingsSection === "security" && <SectionCard title="Security & privacy" description="Control account protection and business data safeguards.">{demoMode ? <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-border bg-surface-2 p-4"><p className="text-sm font-medium">Two-step verification</p><p className="mt-1 text-xs text-muted-foreground">Required for owners and administrators.</p><Badge className="mt-3" variant="success">Enabled</Badge></div><div className="rounded-lg border border-border bg-surface-2 p-4"><p className="text-sm font-medium">Audit logging</p><p className="mt-1 text-xs text-muted-foreground">Security and access events are retained for 180 days.</p><Badge className="mt-3" variant="success">Active</Badge></div></div> : <UnavailableMessage text="Security policy status is not connected yet. Configure sessions and two-step verification from the account security area." />}</SectionCard>}
          {settingsSection === "data" && <SectionCard title="Data management" description="Review connected data, exports, retention and backup status.">{demoMode ? <><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-border bg-surface-2 p-4"><p className="text-sm font-medium">Connected records</p><p className="mt-1 text-xs text-muted-foreground">1,248 contacts · 86 deals · 42 conversations</p><Badge className="mt-3" variant="success">Healthy sync</Badge></div><div className="rounded-lg border border-border bg-surface-2 p-4"><p className="text-sm font-medium">Latest backup</p><p className="mt-1 text-xs text-muted-foreground">Today at 02:15 IST · retained for 90 days</p><Badge className="mt-3" variant="neutral">Completed</Badge></div></div><div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => toast.success("Data export prepared")}>Export business data</Button><Button variant="ghost" onClick={() => toast.success("Backup check completed")}>Check backup status</Button></div></> : <UnavailableMessage text="Data exports, retention and backups are not connected yet. Janus will show verified counts once the data management service is available." />}</SectionCard>}
      </main>
    </div>
  );
}

function AdministrationPanel({
  section,
  session,
  name,
  phone,
  timezone,
  language,
  onNameChange,
  onPhoneChange,
  onTimezoneChange,
  onLanguageChange,
  onSave,
}: {
  section: string | null;
  session: ReturnType<typeof useSession>;
  name: string;
  phone: string;
  timezone: string;
  language: string;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onSave: () => void;
}) {
  if (section === "profile") return <ProfilePanel session={session} name={name} phone={phone} timezone={timezone} language={language} onNameChange={onNameChange} onPhoneChange={onPhoneChange} onTimezoneChange={onTimezoneChange} onLanguageChange={onLanguageChange} onSave={onSave} />;
  if (section === "billing") return <BillingSection />;

  const sections = [
    { title: "Profile", description: "Your name, contact details, language and personal preferences.", href: "/settings?tab=workspace&view=administration&section=profile&workspace=business", icon: UserRound },
    { title: "People & Access", description: "Members, invitations, roles, permissions and workspace access.", href: "/settings?tab=team&workspace=business", icon: UsersRound },
    { title: "Notifications", description: "Choose which business events and approvals reach your team.", href: "/settings?tab=notifications&workspace=business", icon: Bell },
    { title: "Security & Sessions", description: "Password, sign-in sessions, audit history and account protection.", href: "/settings?tab=security&workspace=business", icon: LockKeyhole },
    { title: "Billing & Subscription", description: "Seats, usage, payment method, invoices and subscription controls.", href: "/settings?tab=workspace&view=administration&section=billing&workspace=business", icon: CreditCard },
  ];

  return <div className="flex flex-col gap-5">
    <div><p className="text-[11px] font-medium uppercase tracking-wide text-accent">Administration</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Administration</h2><p className="mt-1 text-sm text-muted-foreground">Manage your Janus account, team access and everyday preferences from one place.</p></div>
    <SectionCard title="Account administration" description="Common controls for the people and settings that keep your business running.">
      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map(({ title, description, href, icon: Icon }) => <Link key={title} href={href} className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent-border hover:bg-surface-2"><div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent"><Icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">{title}<ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" /></span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span></span></div></Link>)}
      </div>
    </SectionCard>
  </div>;
}

function ProfilePanel({
  session,
  name,
  phone,
  timezone,
  language,
  onNameChange,
  onPhoneChange,
  onTimezoneChange,
  onLanguageChange,
  onSave,
}: {
  session: ReturnType<typeof useSession>;
  name: string;
  phone: string;
  timezone: string;
  language: string;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onSave: () => void;
}) {
  const initials = name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "U";
  return <div className="flex flex-col gap-4">
    <SectionCard title="Profile" description="The details your team sees when you create, approve or assign work.">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-muted text-sm font-semibold text-accent">{initials}</span>
          <div className="min-w-0"><p className="text-sm font-medium">{name || "Your profile"}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{session.user.email}</p></div>
          <Badge variant="neutral" className="ml-auto">{session.role}</Badge>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldRow label="Full name"><Input value={name} onChange={(event) => onNameChange(event.target.value)} autoComplete="name" /></FieldRow>
          <FieldRow label="Email"><Input value={session.user.email} readOnly disabled aria-describedby="profile-email-help" /><span id="profile-email-help" className="text-[11px] text-muted-foreground">Contact an owner to change your sign-in email.</span></FieldRow>
          <FieldRow label="Phone"><Input value={phone} onChange={(event) => onPhoneChange(event.target.value)} type="tel" autoComplete="tel" placeholder="+91 98xxx xxxxx" /></FieldRow>
          <FieldRow label="Language"><Select value={language} onValueChange={onLanguageChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="hi">Hindi</SelectItem></SelectContent></Select></FieldRow>
          <FieldRow label="Timezone"><Select value={timezone} onValueChange={onTimezoneChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{timezones.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></FieldRow>
        </div>
      </div>
    </SectionCard>
    <div className="flex justify-end"><Button onClick={onSave} disabled={!name.trim()}>Save profile</Button></div>
  </div>;
}

function BusinessOverviewPanel() {
  const live = apiUse<{ leads: number; openDeals: number; wonDeals: number; pipelineValue: string; unavailable: string[] }>("/business/reports/summary");
  const data = demoMode ? demoOverview : live.data;
  const loading = demoMode ? false : live.loading;
  const error = demoMode ? undefined : live.error;
  const [metric, setMetric] = React.useState<"growth" | "revenue">("growth");
  const leads = data?.leads ?? 0;
  const openDeals = data?.openDeals ?? 0;
  const wonDeals = data?.wonDeals ?? 0;
  const pipeline = data?.pipelineValue ?? "—";
  const unavailable = loading ? "Loading verified CRM records…" : error ? "CRM summary is unavailable right now." : null;
  return (
    <div className="mt-3 flex flex-col gap-6 rounded-xl bg-[#faf9f5] p-1 sm:mt-4 sm:p-2">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Business</p>
            <Badge variant="neutral">{demoMode ? "Demo data" : "Owner view"}</Badge>
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Business overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">{demoMode ? "Preview the complete owner experience with sample business records." : "A live view of verified activity from your connected workspaces."}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </div>

      <section className="flex flex-col justify-between gap-4 rounded-xl border border-[#e4e4df] bg-white p-5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent"><Sparkles className="size-4" /></span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Janus brief</p>
            <p className="mt-1 text-sm leading-6 text-foreground">{unavailable ?? `You have ${leads} captured lead${leads === 1 ? "" : "s"}, ${openDeals} active deal${openDeals === 1 ? "" : "s"}, and ${pipeline} in open pipeline.`}</p>
          </div>
        </div>
        <Link href="/ai?workspace=business" className="shrink-0 text-sm font-medium text-accent hover:underline">Ask Janus →</Link>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <OverviewKpi label="Leads" value={loading || error ? "—" : String(leads)} detail="Captured leads" />
        <OverviewKpi label="Open deals" value={loading || error ? "—" : String(openDeals)} detail="Active deals" />
        <OverviewKpi label="Pipeline" value={loading || error ? "—" : pipeline} detail="Open CRM pipeline" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <OverviewChart metric={metric} onMetricChange={setMetric} loading={loading} error={error} demoMode={demoMode} leads={leads} openDeals={openDeals} wonDeals={wonDeals} />
        {demoMode ? <AttentionPanel /> : <SectionCard title="Owner attention" description="Only verified alerts and approvals appear here."><UnavailableMessage text={unavailable ?? "No verified alerts or pending approvals yet."} /></SectionCard>}
      </div>

      {demoMode && <>
        <div className="grid gap-4 xl:grid-cols-2">
          <PipelineSnapshot />
          <TargetSnapshot />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <ApprovalSnapshot />
          <ActivitySnapshot />
        </div>
      </>}

      <SectionCard title="Data coverage" description="Business metrics will expand as additional workspaces are connected.">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={demoMode ? "neutral" : error ? "neutral" : "success"}>{demoMode ? "Demo CRM records" : "CRM & Sales connected"}</Badge>
          <Badge variant="neutral">{demoMode ? "Demo Finance records" : "Finance awaiting data"}</Badge>
          <Badge variant="neutral">{demoMode ? "Demo workspace records" : "Other workspaces awaiting data"}</Badge>
        </div>
      </SectionCard>
    </div>
  );
}

function OverviewKpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-[#e4e4df] bg-white p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function OverviewChart({ metric, onMetricChange, loading, error, demoMode, leads, openDeals, wonDeals }: { metric: "growth" | "revenue"; onMetricChange: (metric: "growth" | "revenue") => void; loading: boolean; error?: string; demoMode: boolean; leads: number; openDeals: number; wonDeals: number }) {
  const bars = [{ label: "Captured leads", value: leads }, { label: "Open deals", value: openDeals }, { label: "Won deals", value: wonDeals }];
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  return <SectionCard title={metric === "growth" ? "Growth snapshot" : "Revenue vs target"} description={metric === "growth" ? `${demoMode ? "Demo" : "Verified"} CRM counts from the current reporting summary.` : demoMode ? "Demo revenue trend for the owner dashboard preview." : "Revenue history requires a connected Finance & Accounting workspace."}>
    <div className="mb-5 flex w-fit gap-1 rounded-lg border border-border bg-surface-2 p-1" role="group" aria-label="Business chart metric">
      {([["growth", "Growth"], ["revenue", "Revenue"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => onMetricChange(value)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${metric === value ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
    </div>
    {metric === "revenue" && demoMode ? <RevenueChart /> : metric === "revenue" ? <UnavailableMessage text={loading ? "Loading verified finance records…" : error ? "Revenue is unavailable because the connected report could not be loaded." : "No verified revenue records are connected yet. Janus will not estimate revenue from CRM pipeline value."} /> : <div className="flex flex-col gap-4">
      {bars.map((bar) => <div key={bar.label} className="flex flex-col gap-2"><div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">{bar.label}</span><span className="tabular-nums text-muted-foreground">{loading || error ? "—" : bar.value}</span></div><div className="h-2 rounded-full bg-[#efefea]"><div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${loading || error ? 0 : Math.max((bar.value / max) * 100, bar.value ? 8 : 0)}%` }} /></div></div>)}
      <p className="text-xs text-muted-foreground">This is a current CRM snapshot. Historical growth will appear when period history is connected.</p>
    </div>}
  </SectionCard>;
}

const demoOverview = { leads: 312, openDeals: 161, wonDeals: 27, pipelineValue: "₹84L", unavailable: [] as string[] };

function RevenueChart() {
  return <div className="flex flex-col gap-3"><div className="flex items-center gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-accent" />Revenue</span><span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t border-dashed border-muted-foreground" />Target</span></div><svg viewBox="0 0 540 210" role="img" aria-label="Demo revenue trend" className="h-auto w-full"><g stroke="#efefea" strokeWidth="1"><line x1="40" y1="180" x2="520" y2="180" /><line x1="40" y1="123" x2="520" y2="123" /><line x1="40" y1="66" x2="520" y2="66" /><line x1="40" y1="10" x2="520" y2="10" /></g><g fill="#5b616e" fontSize="11" textAnchor="end"><text x="32" y="184">0</text><text x="32" y="127">₹20L</text><text x="32" y="70">₹40L</text><text x="32" y="14">₹60L</text></g><polyline points="40,66 136,61 232,56 328,50 424,44 520,38" fill="none" stroke="#8a8f99" strokeWidth="2" strokeDasharray="5 5" /><polyline points="40,92 136,84 232,87 328,75 424,72 520,59" fill="none" stroke="hsl(var(--accent))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><g fill="hsl(var(--accent))"><circle cx="40" cy="92" r="3.5" /><circle cx="136" cy="84" r="3.5" /><circle cx="232" cy="87" r="3.5" /><circle cx="328" cy="75" r="3.5" /><circle cx="424" cy="72" r="3.5" /><circle cx="520" cy="59" r="5" /></g><g fill="#5b616e" fontSize="11" textAnchor="middle"><text x="40" y="202">May</text><text x="136" y="202">Jun</text><text x="232" y="202">Jul</text><text x="328" y="202">Aug</text><text x="424" y="202">Sep</text><text x="520" y="202">Oct</text></g></svg><p className="text-xs text-muted-foreground">Demo data · ₹42.8L revenue against a ₹50L target.</p></div>;
}

function AttentionPanel() {
  const items = [["High", "6 deals stuck in Proposal for 10+ days", "₹14.2L"], ["High", "4 invoices overdue by 30+ days", "₹3.1L"], ["Medium", "12 follow-ups due today, 5 overdue", "17"], ["Medium", "3 approvals waiting for you", "3"], ["Due", "GSTR-3B filing deadline is approaching", "20 Nov"], ["Low", "1 automation failed overnight", "1"]];
  return <SectionCard title="Needs your attention" description="Demo items showing how Janus prioritises owner actions."><div className="flex flex-col divide-y divide-border">{items.map(([severity, title, value]) => <div key={title} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"><Badge variant={severity === "High" ? "danger" : severity === "Medium" ? "warning" : "neutral"}>{severity}</Badge><span className="min-w-0 flex-1 text-sm font-medium">{title}</span><span className="text-sm font-semibold tabular-nums">{value}</span></div>)}</div></SectionCard>;
}

function PipelineSnapshot() {
  const stages = [["New", 84, "₹31L"], ["Qualified", 46, "₹24L"], ["Proposal", 22, "₹18L"], ["Negotiation", 9, "₹11L"], ["Won", 27, "₹21.5L"]];
  return <SectionCard title="Pipeline by stage" description="Demo CRM pipeline distribution."><div className="flex flex-col gap-4">{stages.map(([stage, count, value], index) => <div key={stage} className="flex flex-col gap-1.5"><div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">{stage}</span><span className="text-muted-foreground">{count} · {value}</span></div><div className="h-2 rounded-full bg-[#efefea]"><div className={`h-2 rounded-full ${index === 2 ? "bg-orange-600" : index === 4 ? "bg-green-700" : "bg-accent"}`} style={{ width: `${Math.max(Number(count) / 84 * 100, 8)}%` }} /></div></div>)}</div></SectionCard>;
}

function TargetSnapshot() {
  const targets = [["Revenue", "₹42.8L of ₹50L", 86], ["New customers", "23 of 30", 77], ["Collections", "₹28.4L of ₹31.5L", 90], ["Hiring", "2 of 3", 67]];
  return <SectionCard title="Monthly targets" description="Demo targets for the owner dashboard preview."><div className="flex flex-col gap-4">{targets.map(([name, progress, percentage]) => <div key={name} className="flex flex-col gap-1.5"><div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">{name}</span><span className="text-muted-foreground">{progress} · {percentage}%</span></div><div className="h-2 rounded-full bg-[#efefea]"><div className="h-2 rounded-full bg-accent" style={{ width: `${percentage}%` }} /></div></div>)}</div></SectionCard>;
}

function ApprovalSnapshot() {
  const approvals = [["15% discount for Nova Clinics", "Requested by Arjun Mehta · ₹42,000 off"], ["Refund for order #4471", "Requested by Support · ₹8,500"], ["Send overdue reminders to 4 customers", "Collections agent · WhatsApp + email"]];
  return <SectionCard title="Approvals" description="Demo approval queue for the owner preview."><div className="flex flex-col divide-y divide-border">{approvals.map(([title, detail]) => <div key={title} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><Button size="sm" variant="secondary">Review</Button></div>)}</div></SectionCard>;
}

function ActivitySnapshot() {
  const activity = [["Riya won the Sharma Logistics renewal · ₹3.6L", "2h ago"], ["Meera imported 14 leads from IndiaMART", "4h ago"], ["HR & People workspace created", "Yesterday"], ["Weekly sales report sent to owners", "Yesterday"]];
  return <SectionCard title="Recent activity" description="Demo activity showing how owner history will read."><div className="flex flex-col divide-y divide-border">{activity.map(([text, time]) => <div key={text} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><span className="text-sm">{text}</span><span className="shrink-0 text-xs text-muted-foreground">{time}</span></div>)}</div></SectionCard>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function OverviewDashboard({ signals, loading, error }: { signals: string[][]; loading: boolean; error?: string }) {
  return <>
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3"><div><p className="text-sm font-medium">Current reporting period</p><p className="text-xs text-muted-foreground">Verified records available from connected workspaces.</p></div><Button size="sm" variant="secondary" onClick={() => window.location.reload()}>Refresh</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{signals.map(([label, description]) => <div key={label} className="rounded-lg border border-border bg-surface p-4"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span><Badge variant={label === "Finance" || error ? "neutral" : "success"}>{label === "Finance" || error ? "Awaiting data" : "Connected"}</Badge></div><p className="mt-3 text-sm text-muted-foreground">{description}</p></div>)}</div>
    <SectionCard title="Workspace performance" description="Only metrics available from connected workspaces are shown."><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><WorkspaceSummary name="CRM & Sales" detail={error ? "Unavailable" : "Leads, deals and pipeline connected"} /><WorkspaceSummary name="Finance & Accounting" detail="Awaiting verified financial records" /><WorkspaceSummary name="HR & People" detail="Awaiting connected employee records" /><WorkspaceSummary name="Projects & Delivery" detail="Awaiting project records" /><WorkspaceSummary name="Customer Support" detail="Awaiting support records" /><WorkspaceSummary name="Operations & Inventory" detail="Awaiting operations records" /></div></SectionCard>
    <SectionCard title="Owner attention" description="Janus will surface insights and approvals from verified activity."><UnavailableMessage text={loading ? "Loading connected records…" : error ? "Business metrics are unavailable: " + error : "No business alerts yet."} /></SectionCard>
  </>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function FinancialPerformance({ data, loading, error }: { data?: { leads: number; openDeals: number; wonDeals: number; pipelineValue: string; unavailable: string[] }; loading: boolean; error?: string }) {
  return <div className="flex flex-col gap-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Revenue" value="—" /><Metric label="Expenses" value="—" /><Metric label="Net profit" value="—" /><Metric label="Cash flow" value="—" /><Metric label="CRM pipeline" value={loading || error ? "—" : data?.pipelineValue ?? "—"} /></div><SectionCard title="Financial performance" description="Financial statements are unavailable until Finance & Accounting or a supported financial integration is connected."><UnavailableMessage text={error ? "Unavailable: " + error : "No verified financial records are connected yet. Janus will not estimate revenue, expenses or profit."} /></SectionCard></div>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function WorkspacePerformance({ data, loading, error }: { data?: { leads: number; openDeals: number; wonDeals: number; pipelineValue: string; unavailable: string[] }; loading: boolean; error?: string }) {
  return <SectionCard title="Workspace performance" description="Workspace-specific metrics are shown only when verified records are available."><div className="flex flex-col gap-2"><WorkspaceRow name="CRM & Sales" type="Active" metric={loading || error ? "Unavailable" : (data?.leads ?? 0) + " leads · " + (data?.openDeals ?? 0) + " open deals"} /><WorkspaceRow name="HR & People" type="Planned" metric="Awaiting data" /><WorkspaceRow name="Finance & Accounting" type="Planned" metric="Awaiting data" /><WorkspaceRow name="Projects & Delivery" type="Planned" metric="Awaiting data" /><WorkspaceRow name="Customer Support & Success" type="Planned" metric="Awaiting data" /><WorkspaceRow name="Operations & Inventory" type="Planned" metric="Awaiting data" /></div></SectionCard>;
}

function WorkspaceSummary({ name, detail }: { name: string; detail: string }) { return <div className="rounded-md border border-border bg-surface-2 p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{name}</span><span className="size-2 rounded-full bg-muted-foreground/50" /></div><p className="mt-2 text-xs text-muted-foreground">{detail}</p></div>; }
function WorkspaceRow({ name, type, metric }: { name: string; type: string; metric: string }) { return <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-3"><div><p className="text-sm font-medium">{name}</p><p className="text-xs text-muted-foreground">{type}</p></div><span className="text-xs text-muted-foreground">{metric}</span></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border bg-surface p-4"><span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span><p className="mt-2 text-xl font-semibold">{value}</p></div>; }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function UnavailableSection({ title, description }: { title: string; description: string }) { return <SectionCard title={title} description={description}><UnavailableMessage text="No verified records are available for this section yet." /></SectionCard>; }
function UnavailableMessage({ text }: { text: string }) { return <div className="rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">{text}</div>; }

function WorkspacesPanel() {
  const searchParams = useSearchParams();
  const activate = searchParams.get("activate");
  const activationDefinition = workspaceDefinitions.find((workspace) => workspace.id === activate && workspace.status === "planned");
  const [createOpen, setCreateOpen] = React.useState(Boolean(activationDefinition));
  const [workspaceName, setWorkspaceName] = React.useState(activationDefinition?.name ?? "");
  const [workspaceType, setWorkspaceType] = React.useState(activationDefinition?.id ?? "hr_people");
  const [createdWorkspaces, setCreatedWorkspaces] = React.useState<{ id: string; type: string; name: string; description: string }[]>([]);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const created = workspaceDefinitions.filter(
    (workspace) => workspace.id === "crm-sales",
  );
  const available = workspaceDefinitions.filter(
    (workspace) => workspace.status === "planned",
  );

  React.useEffect(() => {
    api<{ id: string; type: string; name: string; description: string }[]>("/workspaces")
      .then((items) => setCreatedWorkspaces(items.filter((item) => item.type !== "crm_sales")))
      .catch((error) => setLoadError(message(error)));
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-accent">Business setup</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Workspace management</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Keep each department’s records and access separate while the business owner manages them from one place.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="size-3.5" />Activate workspace</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <WorkspaceMetric label="Active workspaces" value={String(created.length + createdWorkspaces.length)} detail="Ready for your team" />
        <WorkspaceMetric label="Available to activate" value={String(available.length)} detail="Department workspaces" />
      </div>

      <SectionCard title="Active workspaces" description="These are the workspaces currently enabled for this business. Open one to enter its workflow.">
        <div className="grid gap-3 lg:grid-cols-2">
          {created.map((workspace) => (
            <WorkspaceCard key={workspace.id} name={workspace.name} description={workspace.description} href="/dashboard?workspace=crm-sales" primary />
          ))}
          {createdWorkspaces.map((workspace) => (
            <WorkspaceCard key={workspace.id} name={workspace.name} description={workspace.description || "Ready for manager and access configuration."} href={`/workspace/${workspace.type.replaceAll("_", "-")}?workspace=${workspace.type.replaceAll("_", "-")}`} />
          ))}
        </div>
        {loadError && <div className="mt-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">Additional workspace records are unavailable: {loadError}. CRM & Sales remains available locally.</div>}
      </SectionCard>

      <SectionCard title="Available workspaces" description="Activate a department when you are ready. Each activation opens the same simple create workflow.">
        <div className="grid gap-3 sm:grid-cols-2">
          {available.map((workspace) => (
            <div key={workspace.id} className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent"><Plus className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">{workspace.name}</span><span className="mt-1 block text-xs text-muted-foreground">{workspace.description}</span></span>
              <Button size="sm" variant="secondary" onClick={() => { setWorkspaceType(workspace.id); setCreateOpen(true); }}>Activate</Button>
            </div>
          ))}
        </div>
      </SectionCard>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
              <DialogTitle>Activate workspace</DialogTitle>
            <DialogDescription>
              Create a tenant-scoped workspace. Its records and access will stay isolated from CRM & Sales.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="workspace-name" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Workspace name
            </label>
            <Input
              id="workspace-name"
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="e.g. Customer Support"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="workspace-type" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Workspace type</label>
            <Select value={workspaceType} onValueChange={setWorkspaceType}>
              <SelectTrigger id="workspace-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {available.map((workspace) => <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!workspaceName.trim() || saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const created = await api<{ id: string; type: string; name: string; description: string }>("/workspaces", {
                    method: "POST",
                    body: JSON.stringify({ type: workspaceType.replaceAll("-", "_"), name: workspaceName.trim() }),
                  });
                  setCreatedWorkspaces((items) => [...items, created]);
                  setWorkspaceName("");
                  setCreateOpen(false);
                  toast.success("Workspace activated");
                } catch (error) {
                  toast.error(message(error));
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Activating…" : "Activate workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkspaceMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-lg border border-border bg-surface p-4"><span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span><p className="mt-2 text-xl font-semibold text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function WorkspaceCard({ name, description, href, primary = false }: { name: string; description: string; href: string; primary?: boolean }) {
  return <Link href={href} className={`group flex items-center gap-3 rounded-lg border px-4 py-4 transition-colors ${primary ? "border-accent-border bg-accent-muted/40 hover:bg-accent-muted" : "border-border bg-surface hover:border-accent-border hover:bg-surface-2"}`}><span className="flex min-w-0 flex-1 flex-col gap-1"><span className="flex items-center gap-2 text-sm font-medium text-foreground">{name}<Badge variant="success">Active</Badge></span><span className="text-xs text-muted-foreground">{description}</span></span><ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" /></Link>;
}

function SectionTabs({ items, value, onChange }: { items: string[][]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2 p-1" role="tablist">
      {items.map(([itemValue, label]) => (
        <button
          key={itemValue}
          type="button"
          role="tab"
          aria-selected={value === itemValue}
          onClick={() => onChange(itemValue)}
          className={`rounded-md px-3 py-2 text-xs transition-colors ${value === itemValue ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-surface/70 hover:text-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
