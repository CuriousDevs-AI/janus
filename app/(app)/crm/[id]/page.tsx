"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  Building2, Calendar, ChevronRight, Clock,
  Pencil, Plus, Trash2, UserMinus, Users, Shield, ShieldCheck, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { sessionChanged } from "@/components/auth/session-provider";
import type { CrmWorkspace, CrmMember, DashboardStats, FunnelData } from "@/lib/api/types";
import { cn, formatCurrencyINR, formatDateTime, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/shared/metric-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface TeamMember { id: string; user_id: string; name: string; role: string; status: string }

export default function CrmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const crm = useApi<CrmWorkspace>(`/crm-workspaces/${id}`);
  const members = useApi<CrmMember[]>(`/crm-workspaces/${id}/members`);
  const team = useApi<TeamMember[]>("/members?limit=100");
  const stats = useApi<DashboardStats>(`/dashboard/stats?crm_id=${id}`);
  const funnel = useApi<FunnelData[]>(`/dashboard/funnel?crm_id=${id}&days=30`);

  const [editingGeneral, setEditingGeneral] = useState(false);
  const [editingStages, setEditingStages] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [removingMember, setRemovingMember] = useState<CrmMember | null>(null);
  const [busy, setBusy] = useState(false);

  const ws = crm.data;

  async function patchCrm(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await api(`/crm-workspaces/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast.success("Updated");
      crm.reload();
      window.dispatchEvent(new Event(sessionChanged));
      return true;
    } catch (e) { toast.error(message(e)); return false; } finally { setBusy(false); }
  }

  async function archiveCrm() {
    setBusy(true);
    try {
      await api(`/crm-workspaces/${id}/archive`, { method: "POST" });
      toast.success("CRM archived");
      setArchiving(false);
      window.dispatchEvent(new Event(sessionChanged));
      window.location.href = "/crm";
    } catch (e) { toast.error(message(e)); } finally { setBusy(false); }
  }

  async function addMember(membershipId: string, role: string) {
    setBusy(true);
    try {
      await api(`/crm-workspaces/${id}/members`, { method: "POST", body: JSON.stringify({ membershipId, role }) });
      toast.success("Member added");
      setAddingMember(false);
      members.reload();
      crm.reload();
    } catch (e) { toast.error(message(e)); } finally { setBusy(false); }
  }

  async function removeMember(memberId: string) {
    setBusy(true);
    try {
      await api(`/crm-workspaces/${id}/members/${memberId}`, { method: "DELETE" });
      toast.success("Removed");
      setRemovingMember(null);
      members.reload();
      crm.reload();
    } catch (e) { toast.error(message(e)); } finally { setBusy(false); }
  }

  if (crm.error) {
    return (
      <div className="px-4 py-12 text-center">
        <Building2 className="mx-auto size-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm text-danger">{crm.error}</p>
        <Button asChild size="sm" variant="secondary" className="mt-4">
          <Link href="/crm">Back</Link>
        </Button>
      </div>
    );
  }
  if (!ws) return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-6">
      <div className="h-3 w-32 animate-pulse rounded bg-surface-2" />
      <div className="flex items-center gap-2.5">
        <div className="size-9 animate-pulse rounded-lg bg-surface-2" />
        <div className="space-y-1.5"><div className="h-5 w-40 animate-pulse rounded bg-surface-2" /><div className="h-3 w-56 animate-pulse rounded bg-surface-2" /></div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-surface-2" />)}
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="h-40 animate-pulse rounded-lg border border-border bg-surface-2" />
        <div className="h-40 animate-pulse rounded-lg border border-border bg-surface-2" />
      </div>
    </div>
  );

  const ml = members.data ?? [];
  const existing = new Set(ml.map((m) => m.membershipId));
  const available = (team.data ?? []).filter((t) => !existing.has(t.id) && t.status === "active");
  const s = stats.data;
  const fd = funnel.data ?? [];

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/crm" className="hover:text-foreground transition-colors">CRM Workspaces</Link>
        <ChevronRight className="size-3" />
        <span className="text-foreground">{ws.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-accent/10">
            <Building2 className="size-4.5 text-accent" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold">{ws.name}</h1>
              {ws.isDefault && <Badge variant="accent" className="text-[9px]">Default</Badge>}
            </div>
            <p className="text-[11px] text-muted-foreground">{ws.description || ws.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" className="h-7 text-xs" asChild>
            <Link href={`/leads?crm=${id}&new=1`}><Plus className="size-3" /> New Lead</Link>
          </Button>
          <Button size="sm" variant="secondary" className="h-7 text-xs" asChild>
            <Link href={`/leads?crm=${id}`}>Leads</Link>
          </Button>
          <Button size="sm" variant="secondary" className="h-7 text-xs" asChild>
            <Link href={`/deals?crm=${id}`}>Deals</Link>
          </Button>
          <Button size="sm" variant="ghost" className="size-7 p-0" title="Edit" onClick={() => setEditingGeneral(true)}>
            <Pencil className="size-3.5" />
          </Button>
          {!ws.isDefault && (
            <>
              <Button size="sm" variant="ghost" className="size-7 p-0" title="Archive" onClick={() => setArchiving(true)}>
                <Trash2 className="size-3.5 text-danger" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Leads" value={String(ws.leadCount ?? 0)}
          delta={s && (s.newLeadsToday > 0 || s.newLeadsWeek > 0) ? `+${s.newLeadsToday} today · +${s.newLeadsWeek} week` : undefined}
          trend={s && s.newLeadsToday > 0 ? "up" : undefined} />
        <MetricCard label="Open deals" value={String(s?.openDeals ?? ws.dealCount ?? 0)}
          delta={formatCurrencyINR(Number(s?.pipelineValue ?? 0)) + " pipeline"} />
        <MetricCard label="Won" value={String(s?.wonDeals ?? 0)}
          delta={s ? formatCurrencyINR(Number(s.wonValue)) : undefined} trend={s && Number(s.wonValue) > 0 ? "up" : undefined} />
        <MetricCard label="Conversion" value={s?.conversionRate ? `${s.conversionRate}%` : "—"}
          delta={s?.avgCycleDays ? `${s.avgCycleDays}d avg cycle` : undefined} />
      </div>

      {/* Pipeline + Members */}
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        {/* Pipeline */}
        <section className="rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <h2 className="text-xs font-semibold">Pipeline</h2>
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => setEditingStages(true)}>
              <Pencil className="size-3" /> Edit
            </Button>
          </div>
          {/* Stage flow chips */}
          <div className="flex items-center gap-1 overflow-x-auto px-4 py-3">
            {ws.pipelineStages.map((stage, i) => {
              const c = fd.find((f) => f.stage === String(stage.key))?.count ?? 0;
              return (
                <div key={String(stage.key)} className="flex items-center gap-1">
                  <div className="flex flex-col items-center">
                    <div className={cn("flex items-center justify-center rounded-md px-2 py-1 text-xs font-bold text-white min-w-[32px]", String(stage.color))}>
                      {c}
                    </div>
                    <p className="mt-1 max-w-[56px] text-center text-[9px] leading-tight text-muted-foreground truncate">{String(stage.label)}</p>
                  </div>
                  {i < ws.pipelineStages.length - 1 && <div className="h-px w-2.5 bg-border mt-[-10px]" />}
                </div>
              );
            })}
          </div>
          {/* Funnel bars */}
          {fd.length > 0 && (
            <div className="space-y-1 px-4 pb-3">
              {fd.filter((f) => f.count > 0).map((f) => {
                const max = Math.max(...fd.map((d) => d.count), 1);
                const sc = ws.pipelineStages.find((st) => String(st.key) === f.stage);
                return (
                  <div key={f.stage} className="flex items-center gap-2">
                    <span className="w-16 text-right text-[10px] text-muted-foreground capitalize truncate">{f.stage}</span>
                    <div className="flex-1 h-4 rounded-sm bg-surface-2 overflow-hidden">
                      <div
                        className={cn("h-full rounded-sm", sc ? String(sc.color) : "bg-accent")}
                        style={{ width: `${(f.count / max) * 100}%`, minWidth: f.count > 0 ? "3px" : 0 }}
                      />
                    </div>
                    <span className="w-6 text-right text-[11px] font-medium tabular-nums">{f.count}</span>
                    <span className="w-14 text-right text-[9px] text-muted-foreground tabular-nums">{formatCurrencyINR(Number(f.value))}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Access & Permissions */}
        <section className="rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <h2 className="text-xs font-semibold flex items-center gap-1.5">
                <Shield className="size-3.5 text-accent" />
                Access &amp; Permissions
              </h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {ml.length === 0 ? "Open to all team members" : `${ml.length} member${ml.length > 1 ? "s" : ""} with restricted access`}
              </p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => setAddingMember(true)}>
              <Plus className="size-3" /> Add
            </Button>
          </div>

          {/* Role comparison */}
          <div className="grid grid-cols-2 border-b border-border">
            <div className="px-4 py-3 border-r border-border">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-accent/10">
                  <ShieldCheck className="size-3.5 text-accent" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold">Manager</p>
                  <p className="text-[9px] text-muted-foreground">Full control</p>
                </div>
              </div>
              <div className="space-y-1">
                {["All leads & deals", "Create, edit, delete", "Assign to others", "Import & export", "Manage members"].map((p) => (
                  <div key={p} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="size-1 rounded-full bg-accent shrink-0" />
                    {p}
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-surface-2">
                  <Eye className="size-3.5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold">Member</p>
                  <p className="text-[9px] text-muted-foreground">Own records</p>
                </div>
              </div>
              <div className="space-y-1">
                {["Own leads & deals", "Create & edit own", "Log activities", "View reports", "No delete or assign"].map((p) => (
                  <div key={p} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="size-1 rounded-full bg-border-strong shrink-0" />
                    {p}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Member list */}
          {ml.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-surface-2">
                <Users className="size-5 text-muted-foreground/40" />
              </div>
              <p className="mt-3 text-xs font-medium">No restrictions</p>
              <p className="mt-1 max-w-[260px] mx-auto text-[10px] leading-relaxed text-muted-foreground">
                Everyone on the team can access this CRM. Add members to restrict it to specific people.
              </p>
              <Button size="sm" variant="outline" className="mt-3 h-7 text-[11px] gap-1" onClick={() => setAddingMember(true)}>
                <Plus className="size-3" /> Restrict access
              </Button>
            </div>
          ) : (
            <div>
              <div className="px-4 py-2 border-b border-border">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Members</p>
              </div>
              <div className="divide-y divide-border">
                {ml.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3 group hover:bg-surface-2/50 transition-colors">
                    <div className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                      m.role === "manager" ? "bg-accent/10 text-accent" : "bg-surface-3 text-muted-foreground",
                    )}>
                      {(m.memberName || "?")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium leading-tight truncate">{m.memberName || `#${m.membershipId}`}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {m.role === "manager"
                          ? "Can view all data, assign leads, and manage this CRM"
                          : "Can view and edit their own leads and deals"}
                      </p>
                    </div>
                    <Select value={m.role} onValueChange={async (role) => {
                      setBusy(true);
                      try {
                        await api(`/crm-workspaces/${id}/members/${m.id}`, { method: "PATCH", body: JSON.stringify({ role }) });
                        toast.success(`${m.memberName ?? "Member"} is now ${role}`);
                        members.reload();
                      } catch (e) { toast.error(message(e)); } finally { setBusy(false); }
                    }}>
                      <SelectTrigger className={cn(
                        "w-[106px] h-7 text-[11px] font-medium",
                        m.role === "manager" ? "border-accent/30 text-accent" : "",
                      )}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">
                          <span className="flex items-center gap-1.5"><Eye className="size-3" /> Member</span>
                        </SelectItem>
                        <SelectItem value="manager">
                          <span className="flex items-center gap-1.5"><ShieldCheck className="size-3" /> Manager</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" className="size-7 shrink-0 p-0 opacity-0 group-hover:opacity-100 transition-opacity" title="Remove access" onClick={() => setRemovingMember(m)}>
                      <UserMinus className="size-3.5 text-danger" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-border bg-surface-2/30 px-4 py-2.5 flex items-start gap-2">
            <Shield className="size-3 mt-0.5 shrink-0 text-muted-foreground/50" />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              When members are added, <strong className="text-foreground/70">only they</strong> can access this CRM&rsquo;s leads and deals. Without members, the workspace is open to everyone with CRM permission.
            </p>
          </div>
        </section>
      </div>

      {/* Details */}
      <section className="rounded-lg border border-border bg-surface">
        <div className="px-4 py-2.5 border-b border-border">
          <h2 className="text-xs font-semibold">Details</h2>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-4">
          <InfoCell label="Slug" value={ws.slug} mono />
          <InfoCell label="Status" value={ws.active ? "Active" : "Archived"} />
          <InfoCell label="Default CRM" value={ws.isDefault ? "Yes" : "No"} />
          <InfoCell label="Win stage" value={ws.winStage} />
          <InfoCell label="Created by" value={ws.createdByName || "—"} />
          <InfoCell label="Created" value={formatDateTime(ws.createdAt)} />
          <InfoCell label="Updated" value={formatRelativeTime(ws.updatedAt)} />
        </div>
      </section>

      {/* ── Dialogs ── */}

      {editingGeneral && (
        <GeneralEditDialog open onOpenChange={() => setEditingGeneral(false)} ws={ws} busy={busy}
          onSave={async (d) => { if (await patchCrm(d)) setEditingGeneral(false); }} />
      )}

      {editingStages && (
        <PipelineStagesDialog open onOpenChange={() => setEditingStages(false)}
          stages={ws.pipelineStages} winStage={ws.winStage} busy={busy}
          onSubmit={async (stages, win) => {
            const c = stages.map((s) => ({ key: String(s.key), label: String(s.label).trim(), color: String(s.color), probability: Number(s.probability) || 0 }));
            if (await patchCrm({ pipelineStages: c, winStage: win })) setEditingStages(false);
          }} />
      )}

      <ArchiveDialog open={archiving} onOpenChange={setArchiving} crmName={ws.name}
        isDefault={ws.isDefault} leadCount={ws.leadCount ?? 0} dealCount={ws.dealCount ?? 0}
        busy={busy} onConfirm={archiveCrm} />

      <AddMemberDialog open={addingMember} onOpenChange={setAddingMember}
        available={available} busy={busy} onAdd={addMember} />

      <Dialog open={Boolean(removingMember)} onOpenChange={() => setRemovingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member?</DialogTitle>
            <DialogDescription>Remove <strong>{removingMember?.memberName}</strong> from this CRM.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRemovingMember(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={() => removingMember && removeMember(removingMember.id)}>
              {busy ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Components ── */

function InfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-surface px-4 py-2.5">
      <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-xs", mono && "font-mono")}>{value}</p>
    </div>
  );
}

function GeneralEditDialog({ open, onOpenChange, ws, busy, onSave }: {
  open: boolean; onOpenChange: (v: boolean) => void; ws: CrmWorkspace; busy: boolean;
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(ws.name);
  const [desc, setDesc] = useState(ws.description);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit workspace</DialogTitle>
          <DialogDescription>Update &quot;{ws.name}&quot;.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); onSave({ name: name.trim(), description: desc.trim() }); }}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-n">Name</Label>
            <Input id="g-n" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-d">Description</Label>
            <Textarea id="g-d" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="What this CRM is for" />
          </div>
          <p className="text-[11px] text-muted-foreground">Slug: <code className="font-mono">{ws.slug}</code> (auto-generated)</p>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveDialog({ open, onOpenChange, crmName, isDefault, leadCount, dealCount, busy, onConfirm }: {
  open: boolean; onOpenChange: (v: boolean) => void; crmName: string; isDefault: boolean;
  leadCount: number; dealCount: number; busy: boolean; onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const ok = typed.trim().toLowerCase() === crmName.trim().toLowerCase();
  return (
    <Dialog open={open} onOpenChange={(v) => { setTyped(""); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-danger">Archive CRM</DialogTitle>
          <DialogDescription>Archive <strong>&quot;{crmName}&quot;</strong> and hide from navigation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs">
            <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
              <li><strong>{leadCount}</strong> lead{leadCount !== 1 && "s"}, <strong>{dealCount}</strong> deal{dealCount !== 1 && "s"} hidden</li>
              <li>Data preserved, can be restored</li>
              <li>Contacts not affected</li>
            </ul>
          </div>
          <div>
            <Label htmlFor="ac" className="text-xs">Type <strong className="text-danger">{crmName}</strong> to confirm</Label>
            <Input id="ac" className="mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={crmName} autoComplete="off" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => { setTyped(""); onOpenChange(false); }}>Cancel</Button>
          <Button variant="destructive" disabled={busy || !ok || isDefault} onClick={onConfirm}>
            {busy ? "Archiving…" : "Archive this CRM"}
          </Button>
        </DialogFooter>
        {isDefault && <p className="text-xs text-warning">Default CRM cannot be archived.</p>}
      </DialogContent>
    </Dialog>
  );
}

function AddMemberDialog({ open, onOpenChange, available, busy, onAdd }: {
  open: boolean; onOpenChange: (v: boolean) => void; available: TeamMember[];
  busy: boolean; onAdd: (id: string, role: string) => void;
}) {
  const [sel, setSel] = useState("");
  const [role, setRole] = useState("member");
  return (
    <Dialog open={open} onOpenChange={(v) => { setSel(""); setRole("member"); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>Give access to this CRM.</DialogDescription>
        </DialogHeader>
        {available.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">All team members are already in this CRM.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label>Team member</Label>
              <Select value={sel} onValueChange={setSel}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{available.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.role})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || !sel} onClick={() => onAdd(sel, role)}>{busy ? "Adding…" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const COLORS = [
  { key: "bg-slate-500", l: "Slate" }, { key: "bg-cyan-500", l: "Cyan" },
  { key: "bg-indigo-500", l: "Indigo" }, { key: "bg-amber-500", l: "Amber" },
  { key: "bg-orange-500", l: "Orange" }, { key: "bg-purple-500", l: "Purple" },
  { key: "bg-emerald-500", l: "Green" }, { key: "bg-red-500", l: "Red" },
  { key: "bg-blue-500", l: "Blue" }, { key: "bg-pink-500", l: "Pink" },
];

function PipelineStagesDialog({ open, onOpenChange, stages: init, winStage: initWin, onSubmit, busy }: {
  open: boolean; onOpenChange: (o: boolean) => void; stages: CrmWorkspace["pipelineStages"];
  winStage: string; onSubmit: (s: CrmWorkspace["pipelineStages"], w: string) => void; busy: boolean;
}) {
  const [stages, setStages] = useState([...init]);
  const [win, setWin] = useState(initWin);
  const up = (i: number, f: string, v: string | number) => setStages((p) => p.map((s, j) => j === i ? { ...s, [f]: v } : s));
  const rm = (i: number) => { if (String(stages[i].key) !== win) setStages((p) => p.filter((_, j) => j !== i)); };
  const add = () => setStages((p) => [...p, { key: `s_${Date.now()}`, label: "New Stage", color: "bg-slate-500", probability: 50 }]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pipeline stages</DialogTitle>
          <DialogDescription>Add, remove or reorder. Win stage marks a closed deal.</DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {stages.map((st, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 p-1.5">
              <select value={String(st.color)} onChange={(e) => up(i, "color", e.target.value)}
                className="h-6 w-14 rounded border border-input bg-surface px-1 text-[9px]" aria-label="Color">
                {COLORS.map((c) => <option key={c.key} value={c.key}>{c.l}</option>)}
              </select>
              <Input value={String(st.label)} onChange={(e) => up(i, "label", e.target.value)} className="h-6 flex-1 text-xs" />
              <Input type="number" value={String(st.probability)} onChange={(e) => up(i, "probability", parseInt(e.target.value) || 0)}
                className="h-6 w-12 text-xs" min={0} max={100} aria-label="%" />
              <span className="text-[9px] text-muted-foreground">%</span>
              <label className="flex items-center gap-0.5 text-[9px]">
                <input type="radio" name="ws" checked={win === String(st.key)} onChange={() => setWin(String(st.key))} /> Win
              </label>
              <Button type="button" variant="ghost" size="sm" className="size-5 p-0"
                disabled={stages.length <= 2 || String(st.key) === win} onClick={() => rm(i)}>
                <Trash2 className="size-2.5 text-danger" />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={add}>
          <Plus className="size-3" /> Add stage
        </Button>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || stages.length < 2 || !stages.every((s) => String(s.label).trim())}
            onClick={() => onSubmit(stages, win)}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
