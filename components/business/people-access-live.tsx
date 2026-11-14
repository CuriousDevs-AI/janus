"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Mail, Plus, RotateCw, Search, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/settings/section-ui";
import { StatTile } from "@/components/shared/stat-tile";
import { useSession } from "@/components/auth/session-provider";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { mayOpenWorkspace, roleLabel } from "@/lib/access";
import { workspaceDefinitions } from "@/lib/workspace-config";

type Member = { id: string; user_id: string; name: string; email: string; role: string; status: string; extra_permissions?: string[]; last_active_at?: string | null };
type Role = { id: string; name: string; permissions: string[] };
type Invitation = { id: string; email: string; role: string; created_at: string; expires_at: string; last_sent_at: string };
type Team = { id: string; name: string; description: string; member_count: number };
type AccessEvent = { at: string; actor: string; text: string; kind: "member" | "invitation" | "team" | "sign_in" };

/** What each role is for, in the words an owner would use. */
const roleText: Record<string, string> = {
  owner: "Everything, including billing and sharing the company. Only an Owner makes another Owner.",
  admin: "Runs the business day to day: people, workspaces, settings, reports and every department except Finance & Accounting, which needs billing access.",
  company_admin: "Like Admin, and sees this company on the Portfolio with its money.",
  manager: "Leads a team: their own and their teammates' leads, stock counts, projects and HR approvals for their people.",
  agent: "Works their own leads in CRM & Sales, and their own HR record.",
  finance_manager: "Finance: invoices, bills, payments and approvals, and the company's money on the Portfolio.",
  operations_manager: "Operations and projects with approvals, and the company's figures on the Portfolio without money.",
  group_finance: "The Portfolio only: this company's figures with money. No workspaces.",
  group_analyst: "The Portfolio only: this company's figures without money. No workspaces.",
  group_admin: "The Portfolio only: manages people and sharing for the group. No workspaces.",
};
const roleOrder = ["owner", "admin", "company_admin", "finance_manager", "operations_manager", "manager", "agent", "group_admin", "group_finance", "group_analyst"];
/** Access that can be given to one person on top of their role (the API's GRANTABLE). */
const extras: [string, string, string][] = [
  ["billing:manage", "Finance & Accounting", "Invoices, bills, payments and bank lines"],
  ["stock:adjust", "Operations & Inventory", "Stock, purchases and dispatches"],
  ["projects:manage", "Projects & Delivery", "Projects, milestones and tasks"],
  ["settings:manage", "IT & settings", "IT changes and business settings"],
  ["approvals:manage", "Approvals", "Decide approvals waiting in the workspaces"],
  ["reports:read", "Business Reports", "Read the business's reports"],
];
const workspaces = workspaceDefinitions.filter((item) => !["business", "portfolio", "team-chat"].includes(item.id));
const opens = (permissions: string[]) => workspaces.filter((item) => mayOpenWorkspace(item.id, permissions));
const names = (list: typeof workspaces) => list.map((item) => item.name.replace(" & Success", ""));
/** The department workspaces switched on for this business, by id ("finance-accounting"); null until loaded. */
const OnContext = React.createContext<Set<string> | null>(null);
/** What a set of permissions opens: the switched-on workspaces, then the rest, which open once switched on. */
function useOpens(permissions: string[]) {
  const on = React.useContext(OnContext);
  const all = opens(permissions);
  return on ? { now: names(all.filter((item) => on.has(item.id))), later: names(all.filter((item) => !on.has(item.id))) } : { now: names(all), later: [] };
}
const ago = (iso?: string | null) => {
  if (!iso) return "Never signed in";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 30) return "Active now";
  if (minutes < 24 * 60) return `${Math.round(minutes / 60) || 1} hours ago`;
  const days = Math.round(minutes / 1440);
  return days < 30 ? `${days} day${days === 1 ? "" : "s"} ago` : new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
/** Whether a moment is more than `days` days ago. */
const past = (iso: string, days: number) => Date.now() - Date.parse(iso) > days * 864e5;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const select = "h-9 w-full rounded-md border border-input bg-surface-2 px-2 text-sm";

const sections = [["members", "Members"], ["invitations", "Invitations"], ["roles", "Roles"], ["teams", "Teams"], ["activity", "Access history"]] as const;
type Section = (typeof sections)[number][0];

/**
 * People & Access for a real business: who can sign in, with the role they really hold and when
 * they were last in, invitations still open, what each role can do, the teams managers lead, and
 * every change to access in words. Everything is read from and saved to the API.
 */
export function LivePeopleAccess({ initialSection = "members" }: { initialSection?: string }) {
  const session = useSession();
  const [section, setSection] = React.useState<Section>(() => sections.some(([value]) => value === initialSection) ? initialSection as Section : "members");
  const members = useApi<Member[]>("/members");
  const spaces = useApi<Array<{ type: string; status: string }>>("/workspaces");
  const on = React.useMemo(() => spaces.data ? new Set(spaces.data.filter((item) => item.status === "active").map((item) => item.type.replaceAll("_", "-"))) : null, [spaces.data]);
  const roles = useApi<Role[]>("/roles");
  const invitations = useApi<Invitation[]>("/invitations");
  const [inviting, setInviting] = React.useState(false);
  const permissions = roles.data ?? [];
  const mine = session.permissions;
  const iAmOwner = (session.tenant.role ?? "").toLowerCase() === "owner";
  // A role can be given by its Owner, or by someone whose own permissions cover it (as the API checks).
  const assignable = permissions.filter((role) => role.name === "owner" ? iAmOwner : iAmOwner || mine.includes("*") || role.permissions.every((item) => mine.includes(item) || item === "hr:self"));
  const active = (members.data ?? []).filter((item) => item.status === "active");
  const quiet = active.filter((item) => !item.last_active_at || past(item.last_active_at, 30));

  return <OnContext.Provider value={on}><div className="flex flex-col gap-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">People &amp; Access</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Who can sign in to {session.tenant.name}, the role each person holds, and what it lets them open. Employee records are kept in HR &amp; People.</p>
      </div>
      <Button onClick={() => setInviting(true)}><UserPlus className="size-3.5" />Invite someone</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <StatTile label="People who can sign in" value={String(active.length)} detail={`${(members.data ?? []).length - active.length} switched off`} />
      <StatTile label="Invitations open" value={String(invitations.data?.length ?? 0)} detail="Not accepted yet" />
      <StatTile label="Not in for 30 days" value={String(quiet.length)} detail={quiet.length ? "Check they still need access" : "Everyone has been in recently"} />
    </div>
    <div role="tablist" className="janus-tab-strip flex gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1">{sections.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={section === value} onClick={() => setSection(value)} className={`shrink-0 rounded-sm px-3 py-2 text-xs transition-colors ${section === value ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>)}</div>
    {section === "members" && <MembersTab members={members} roles={permissions} assignable={assignable} me={session.user.id} />}
    {section === "invitations" && <InvitationsTab invitations={invitations} onInvite={() => setInviting(true)} />}
    {section === "roles" && <RolesTab roles={permissions} members={members.data ?? []} loading={roles.loading} />}
    {section === "teams" && <TeamsTab members={active} />}
    {section === "activity" && <ActivityTab />}
    {inviting && <InviteDialog roles={assignable} onClose={() => setInviting(false)} onDone={() => { setInviting(false); invitations.reload(); setSection("invitations"); }} />}
  </div></OnContext.Provider>;
}

type Loaded<T> = { data?: T; loading: boolean; error?: string; reload: () => void };

function MembersTab({ members, roles, assignable, me }: { members: Loaded<Member[]>; roles: Role[]; assignable: Role[]; me: string }) {
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [granting, setGranting] = React.useState<Member | null>(null);
  const list = (members.data ?? []).filter((item) => `${item.name} ${item.email} ${roleLabel(item.role)}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) || a.name.localeCompare(b.name));
  async function change(member: Member, body: Record<string, string>, done: string) {
    setBusy(member.id);
    try { await api(`/members/${member.id}`, { method: "PATCH", body: JSON.stringify(body) }); toast.success(done); members.reload(); }
    catch (error) { toast.error(message(error)); } finally { setBusy(null); }
  }
  const permissionsOf = (member: Member) => [...(roles.find((role) => role.name === member.role)?.permissions ?? []), ...(member.extra_permissions ?? [])];
  return <SectionCard title="Members" description="Change a role, give extra access to one department, or switch someone off. Every change is recorded in Access history.">
    <div className="relative mb-3 max-w-sm"><Search className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a person" aria-label="Find a person" className="pl-9" /></div>
    {members.loading ? <p className="text-sm text-muted-foreground">Loading people…</p> : members.error ? <p className="text-sm text-danger">{members.error}</p>
      : <ul className="divide-y divide-border">{list.map((member) => {
        const self = member.user_id === me;
        const off = member.status !== "active";
        const canEdit = !self && (member.role !== "owner" || assignable.some((role) => role.name === "owner"));
        const where = <Opens permissions={permissionsOf(member)} />;
        return <li key={member.id} className={`flex flex-wrap items-start gap-3 py-3 ${off ? "opacity-60" : ""}`}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-muted text-xs font-semibold text-accent">{member.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
          <div className="min-w-[200px] flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{member.name}{self && <Badge variant="neutral">You</Badge>}{off && <Badge variant="warning">Switched off</Badge>}</p>
            <p className="truncate text-xs text-muted-foreground">{member.email} · {ago(member.last_active_at)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{where}{member.extra_permissions?.length ? ` · extra: ${member.extra_permissions.map((key) => extras.find(([value]) => value === key)?.[1] ?? key).join(", ")}` : ""}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && !off ? <select aria-label={`Role of ${member.name}`} className="h-8 rounded-md border border-input bg-surface-2 px-2 text-xs" value={member.role} disabled={busy !== null} onChange={(event) => { const next = event.target.value; if (window.confirm(`Make ${member.name} ${roleLabel(next)}? ${roleText[next] ?? ""}`)) void change(member, { role: next }, `${member.name} is now ${roleLabel(next)}.`); }}>
              {[...new Set([member.role, ...assignable.map((role) => role.name)])].sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b)).map((name) => <option key={name} value={name}>{roleLabel(name)}</option>)}
            </select> : <Badge variant={member.role === "owner" ? "accent" : "neutral"}>{roleLabel(member.role)}</Badge>}
            {canEdit && !off && member.role !== "owner" && <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setGranting(member)}>Extra access</Button>}
            {canEdit && member.role !== "owner" && <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => { if (off || window.confirm(`Switch off ${member.name}? They are signed out and cannot sign in until switched back on.`)) void change(member, { status: off ? "active" : "disabled" }, off ? `${member.name} can sign in again.` : `${member.name} is switched off.`); }}>{busy === member.id ? <Loader2 className="size-3.5 animate-spin" /> : null}{off ? "Switch on" : "Switch off"}</Button>}
          </div>
        </li>;
      })}</ul>}
    {granting && <ExtraAccessDialog member={granting} onClose={() => setGranting(null)} onDone={() => { setGranting(null); members.reload(); }} />}
  </SectionCard>;
}

function ExtraAccessDialog({ member, onClose, onDone }: { member: Member; onClose: () => void; onDone: () => void }) {
  const [chosen, setChosen] = React.useState<string[]>(member.extra_permissions ?? []);
  const [saving, setSaving] = React.useState(false);
  async function save() {
    setSaving(true);
    try { await api(`/members/${member.id}/workspace-access`, { method: "PUT", body: JSON.stringify({ permissions: chosen }) }); toast.success(`${member.name}'s access is saved.`); onDone(); }
    catch (error) { toast.error(message(error)); setSaving(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent className="max-w-md">
    <DialogHeader><DialogTitle>Extra access for {member.name}</DialogTitle><DialogDescription>On top of their role ({roleLabel(member.role)}). Use this for one department instead of a broader role. You can only give access you hold yourself.</DialogDescription></DialogHeader>
    <div className="grid gap-1.5">{extras.map(([key, label, text]) => <label key={key} className="flex items-start gap-2.5 rounded-md border border-border p-2.5 text-sm hover:bg-surface-2"><input type="checkbox" className="mt-0.5" checked={chosen.includes(key)} onChange={() => setChosen((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])} /><span><span className="font-medium">{label}</span><span className="block text-xs text-muted-foreground">{text}</span></span></label>)}</div>
    <DialogFooter><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving && <Loader2 className="size-3.5 animate-spin" />}Save access</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function InviteDialog({ roles, onClose, onDone }: { roles: Role[]; onClose: () => void; onDone: () => void }) {
  const offered = roles.filter((role) => role.name !== "owner").sort((a, b) => roleOrder.indexOf(a.name) - roleOrder.indexOf(b.name));
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState(offered.find((item) => item.name === "agent")?.name ?? offered[0]?.name ?? "agent");
  const [saving, setSaving] = React.useState(false);
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim());
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    try { await api("/invitations", { method: "POST", body: JSON.stringify({ email: email.trim(), role }) }); toast.success(`Invitation emailed to ${email.trim()}. It lasts 7 days.`); onDone(); }
    catch (error) { toast.error(message(error)); setSaving(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent className="max-w-md">
    <form onSubmit={send}>
      <DialogHeader><DialogTitle>Invite someone</DialogTitle><DialogDescription>They get an email with a link to join. Choose the narrowest role that lets them do their job.</DialogDescription></DialogHeader>
      <div className="my-4 grid gap-3">
        <div className="grid gap-1.5"><Label htmlFor="invite-email">Email</Label><Input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.in" autoFocus /></div>
        <div className="grid gap-1.5"><Label htmlFor="invite-role">Role</Label><select id="invite-role" className={select} value={role} onChange={(event) => setRole(event.target.value)}>{offered.map((item) => <option key={item.name} value={item.name}>{roleLabel(item.name)}</option>)}</select><p className="text-xs text-muted-foreground">{roleText[role]}</p></div>
      </div>
      <DialogFooter><Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={!valid || saving}>{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}Send invitation</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}

function InvitationsTab({ invitations, onInvite }: { invitations: Loaded<Invitation[]>; onInvite: () => void }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  async function act(item: Invitation, resend: boolean) {
    if (!resend && !window.confirm(`Cancel the invitation to ${item.email}? Their link stops working.`)) return;
    setBusy(item.id);
    try { await api(`/invitations/${item.id}${resend ? "/resend" : ""}`, { method: resend ? "POST" : "DELETE" }); toast.success(resend ? `Sent again to ${item.email}.` : "Invitation cancelled."); invitations.reload(); }
    catch (error) { toast.error(message(error)); } finally { setBusy(null); }
  }
  const list = invitations.data ?? [];
  return <SectionCard title="Invitations" description="Sent but not accepted yet. Whoever has the link can join, so cancel any you no longer mean to send.">
    {invitations.loading ? <p className="text-sm text-muted-foreground">Loading invitations…</p> : invitations.error ? <p className="text-sm text-danger">{invitations.error}</p>
      : list.length === 0 ? <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-5 py-10 text-center"><Mail className="size-6 text-muted-foreground" /><p className="text-sm font-medium">No invitation is waiting</p><Button size="sm" onClick={onInvite}><UserPlus className="size-3.5" />Invite someone</Button></div>
      : <ul className="divide-y divide-border">{list.map((item) => { const expired = past(item.expires_at, 0); return <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-[200px] flex-1"><p className="text-sm font-medium">{item.email}</p><p className="text-xs text-muted-foreground">{roleLabel(item.role)} · sent {day(item.last_sent_at)} · {expired ? "link expired" : `link works until ${day(item.expires_at)}`}</p></div>
        {expired && <Badge variant="warning">Expired</Badge>}
        <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void act(item, true)}>{busy === item.id ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}Send again</Button>
        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void act(item, false)}><X className="size-3.5" />Cancel</Button>
      </li>; })}</ul>}
  </SectionCard>;
}

function RolesTab({ roles, members, loading }: { roles: Role[]; members: Member[]; loading: boolean }) {
  const sorted = [...roles].sort((a, b) => roleOrder.indexOf(a.name) - roleOrder.indexOf(b.name));
  return <SectionCard title="Roles" description="What each role lets a person do. Roles are set by Janus; to let one person into one more department, give them extra access in Members.">
    {loading ? <p className="text-sm text-muted-foreground">Loading roles…</p> : <ul className="grid gap-3 md:grid-cols-2">{sorted.map((role) => {
      const holders = members.filter((item) => item.role === role.name && item.status === "active");

      return <li key={role.id} className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-2"><p className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="size-3.5 text-accent" />{roleLabel(role.name)}</p><span className="text-xs text-muted-foreground">{holders.length} {holders.length === 1 ? "person" : "people"}</span></div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{roleText[role.name] ?? ""}</p>
        <p className="mt-2 text-xs"><Opens permissions={role.permissions} label /></p>
        <p className="mt-1 text-xs"><span className="font-medium">Can:</span> <span className="text-muted-foreground">{[role.permissions.includes("members:manage") && "invite and manage people", role.permissions.includes("approvals:manage") && "decide approvals", role.permissions.includes("portfolio:finance") ? "see the company's money" : role.permissions.includes("portfolio:read") && "see the company's figures", role.permissions.includes("settings:manage") && "change settings", role.permissions.includes("billing:manage") && "handle billing and Finance"].filter(Boolean).join(", ") || "work in what it opens"}</span></p>
        {holders.length > 0 && <p className="mt-1 truncate text-xs text-muted-foreground">{holders.map((item) => item.name).join(", ")}</p>}
      </li>;
    })}</ul>}
  </SectionCard>;
}

function TeamsTab({ members }: { members: Member[] }) {
  const teams = useApi<Team[]>("/teams");
  const [open, setOpen] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try { const made = await api<Team>("/teams", { method: "POST", body: JSON.stringify({ name: name.trim() }) }); setName(""); teams.reload(); setOpen(made.id); toast.success(`${made.name} team created. Add its people below.`); }
    catch (error) { toast.error(message(error)); } finally { setSaving(false); }
  }
  async function remove(team: Team) {
    if (!window.confirm(`Delete the ${team.name} team? Its people keep their roles.`)) return;
    try { await api(`/teams/${team.id}`, { method: "DELETE" }); teams.reload(); toast.success("Team deleted."); } catch (error) { toast.error(message(error)); }
  }
  return <SectionCard title="Teams" description="A Manager sees the leads of everyone in their teams, besides their own. Put each manager in the team they lead.">
    <form onSubmit={create} className="mb-4 flex max-w-md gap-2"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New team, like Mumbai sales" aria-label="New team name" maxLength={120} /><Button type="submit" disabled={!name.trim() || saving}>{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}Create</Button></form>
    {teams.loading ? <p className="text-sm text-muted-foreground">Loading teams…</p> : teams.error ? <p className="text-sm text-danger">{teams.error}</p>
      : !(teams.data ?? []).length ? <p className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">No teams yet. Without one, each Manager sees only their own leads.</p>
      : <ul className="divide-y divide-border">{(teams.data ?? []).map((team) => <li key={team.id} className="py-3">
        <div className="flex flex-wrap items-center gap-3"><button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open === team.id} onClick={() => setOpen(open === team.id ? null : team.id)}><Users className="size-4 text-muted-foreground" /><span className="text-sm font-medium">{team.name}</span><span className="text-xs text-muted-foreground">{team.member_count} {team.member_count === 1 ? "person" : "people"}</span></button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(open === team.id ? null : team.id)}>{open === team.id ? "Close" : "People"}</Button>
          <Button size="icon" variant="ghost" aria-label={`Delete the ${team.name} team`} onClick={() => void remove(team)}><Trash2 className="size-3.5 text-danger" /></Button></div>
        {open === team.id && <TeamPeople team={team} members={members} onChanged={teams.reload} />}
      </li>)}</ul>}
  </SectionCard>;
}

function TeamPeople({ team, members, onChanged }: { team: Team; members: Member[]; onChanged: () => void }) {
  const people = useApi<Member[]>(`/teams/${team.id}/members`);
  const inside = new Set((people.data ?? []).map((item) => item.id));
  const [adding, setAdding] = React.useState("");
  async function change(member: string, add: boolean) {
    try { await api(`/teams/${team.id}/members/${member}`, { method: add ? "PUT" : "DELETE" }); people.reload(); onChanged(); setAdding(""); }
    catch (error) { toast.error(message(error)); }
  }
  return <div className="mt-2 rounded-md bg-surface-2 p-3">
    {people.loading ? <p className="text-xs text-muted-foreground">Loading…</p> : <ul className="flex flex-wrap gap-1.5">{(people.data ?? []).map((item) => <li key={item.id} className="flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs">{item.name} <span className="text-muted-foreground">· {roleLabel(item.role)}</span><button type="button" aria-label={`Remove ${item.name} from ${team.name}`} onClick={() => void change(item.id, false)} className="ml-0.5 text-muted-foreground hover:text-danger"><X className="size-3" /></button></li>)}{!(people.data ?? []).length && <li className="text-xs text-muted-foreground">Nobody in this team yet.</li>}</ul>}
    <div className="mt-2 flex max-w-sm gap-2"><select aria-label={`Add someone to ${team.name}`} className="h-8 flex-1 rounded-md border border-input bg-surface px-2 text-xs" value={adding} onChange={(event) => setAdding(event.target.value)}><option value="">Add someone…</option>{members.filter((item) => !inside.has(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name} · {roleLabel(item.role)}</option>)}</select><Button size="sm" disabled={!adding} onClick={() => void change(adding, true)}>Add</Button></div>
  </div>;
}

function ActivityTab() {
  const log = useApi<AccessEvent[]>("/access-log");
  const tone = { member: "accent", invitation: "neutral", team: "neutral", sign_in: "success" } as const;
  const word = { member: "Access", invitation: "Invitation", team: "Team", sign_in: "Joined" } as const;
  return <SectionCard title="Access history" description="Every change to who can get in, newest first: invitations, roles, extra access, switching people off, and teams.">
    {log.loading ? <p className="text-sm text-muted-foreground">Loading history…</p> : log.error ? <p className="text-sm text-danger">{log.error}</p>
      : !(log.data ?? []).length ? <p className="text-sm text-muted-foreground">No access changes recorded yet.</p>
      : <ul className="divide-y divide-border">{(log.data ?? []).map((item, index) => <li key={index} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
        <Badge variant={tone[item.kind]}>{word[item.kind]}</Badge>
        <span className="min-w-0 flex-1"><span className="font-medium">{item.actor}</span> {item.text}</span>
        <span className="text-xs text-muted-foreground">{new Date(item.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
      </li>)}</ul>}
  </SectionCard>;
}

/** "Opens CRM & Sales", only what is switched on, with the rest named as opening once switched on. */
function Opens({ permissions, label }: { permissions: string[]; label?: boolean }) {
  const { now, later } = useOpens(permissions);
  const text = now.length ? now.join(", ") : "no department workspace switched on";
  return <>{label ? <><span className="font-medium">Opens:</span> <span className="text-muted-foreground">{text}</span></> : `Opens ${text}`}{later.length > 0 && <span className="text-muted-foreground/80">{` · once switched on: ${later.join(", ")}`}</span>}</>;
}
