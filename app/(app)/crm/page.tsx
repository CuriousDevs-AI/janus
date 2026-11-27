"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2, Eye, Pencil, Plus, Trash2, Users,
  TrendingUp, UserRoundPlus,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { sessionChanged } from "@/components/auth/session-provider";
import type { CrmWorkspace } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export default function CrmWorkspacesPage() {
  const workspaces = useApi<CrmWorkspace[]>("/crm-workspaces");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CrmWorkspace | null>(null);
  const [archiving, setArchiving] = useState<CrmWorkspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const all = workspaces.data ?? [];
  const list = query
    ? all.filter((c) => `${c.name} ${c.slug} ${c.description}`.toLowerCase().includes(query.toLowerCase()))
    : all;

  async function createCrm(data: { name: string; description: string }) {
    setBusy(true);
    try {
      await api("/crm-workspaces", {
        method: "POST",
        body: JSON.stringify({ name: data.name.trim(), description: data.description.trim() }),
      });
      toast.success(`CRM "${data.name}" created`);
      setCreating(false);
      workspaces.reload();
      window.dispatchEvent(new Event(sessionChanged));
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function updateCrm(id: string, data: { name: string; description: string }) {
    setBusy(true);
    try {
      await api(`/crm-workspaces/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: data.name.trim(), description: data.description.trim() }),
      });
      toast.success("CRM updated");
      setEditing(null);
      workspaces.reload();
      window.dispatchEvent(new Event(sessionChanged));
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function archiveCrm(id: string) {
    setBusy(true);
    try {
      await api(`/crm-workspaces/${id}/archive`, { method: "POST" });
      toast.success("CRM workspace archived");
      setArchiving(null);
      workspaces.reload();
      window.dispatchEvent(new Event(sessionChanged));
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="CRM Workspaces"
        description="Manage separate CRM pipelines for different divisions. Customers are shared; leads, deals and pipeline stages are per-CRM."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" /> New CRM
          </Button>
        }
      />

      {all.length > 1 && (
        <div className="px-6 pb-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search workspaces…" className="w-72" />
        </div>
      )}

      {workspaces.loading && !workspaces.data && (
        <div role="status" className="grid gap-4 px-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2">
                <div className="size-8 animate-pulse rounded-lg bg-surface-2" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-48 animate-pulse rounded bg-surface-2" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="h-10 animate-pulse rounded-lg bg-surface-2" />
                <div className="h-10 animate-pulse rounded-lg bg-surface-2" />
                <div className="h-10 animate-pulse rounded-lg bg-surface-2" />
              </div>
              <div className="h-8 animate-pulse rounded bg-surface-2" />
            </div>
          ))}
        </div>
      )}
      {workspaces.error && (
        <p className="mx-6 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{workspaces.error}</p>
      )}

      <div className="grid gap-4 px-6 pb-8 md:grid-cols-2 lg:grid-cols-3">
        {list.map((crm) => (
          <div
            key={crm.id}
            className="group relative flex flex-col rounded-xl border border-border bg-surface p-5 transition-all hover:border-accent-border hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-accent/10">
                  <Building2 className="size-4.5 text-accent" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold leading-tight">{crm.name}</h3>
                  <p className="text-[11px] text-muted-foreground">{crm.slug}</p>
                </div>
              </div>
              {crm.isDefault && <Badge variant="accent" className="shrink-0 text-[10px]">Default</Badge>}
            </div>

            {crm.description && (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground line-clamp-2">{crm.description}</p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-surface-2 px-3 py-2 text-center">
                <p className="text-base font-semibold text-foreground">{crm.leadCount ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Leads</p>
              </div>
              <div className="rounded-lg bg-surface-2 px-3 py-2 text-center">
                <p className="text-base font-semibold text-foreground">{crm.dealCount ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Deals</p>
              </div>
              <div className="rounded-lg bg-surface-2 px-3 py-2 text-center">
                <p className="text-base font-semibold text-foreground">{crm.memberCount ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Members</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              {crm.pipelineStages.slice(0, 6).map((stage) => (
                <span key={stage.key} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted-foreground">
                  <span className={cn("size-1.5 rounded-full", stage.color)} />
                  {stage.label}
                </span>
              ))}
              {crm.pipelineStages.length > 6 && (
                <span className="text-[10px] text-muted-foreground">+{crm.pipelineStages.length - 6} more</span>
              )}
            </div>

            <div className="mt-4 flex items-center gap-1.5 border-t border-border pt-3">
              <Button size="sm" className="flex-1 text-xs" asChild>
                <Link href={`/leads?crm=${crm.id}`}>Open Leads</Link>
              </Button>
              <Button variant="ghost" size="sm" className="size-7 p-0" title="View" asChild>
                <Link href={`/crm/${crm.id}`}><Eye className="size-3.5" /></Link>
              </Button>
              <Button variant="ghost" size="sm" className="size-7 p-0" title="Edit" onClick={() => setEditing(crm)}>
                <Pencil className="size-3.5" />
              </Button>
              {!crm.isDefault && (
                <Button variant="ghost" size="sm" className="size-7 p-0" title="Archive" onClick={() => setArchiving(crm)}>
                  <Trash2 className="size-3.5 text-danger" />
                </Button>
              )}
            </div>
          </div>
        ))}

        {list.length === 0 && !workspaces.loading && (
          <div className="col-span-full rounded-xl border border-dashed border-border p-12 text-center">
            <Building2 className="mx-auto size-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm font-medium">No CRM workspaces yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Create your first CRM to start tracking leads and deals.</p>
            <Button size="sm" className="mt-4" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" /> Create CRM
            </Button>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <CrmFormDialog
        open={creating}
        onOpenChange={setCreating}
        title="Create CRM Workspace"
        description="A new CRM with its own pipeline. Customers are shared across all CRMs."
        onSubmit={createCrm}
        busy={busy}
      />

      {/* Edit Dialog */}
      {editing && (
        <CrmFormDialog
          open
          onOpenChange={() => setEditing(null)}
          title="Edit CRM Workspace"
          description={`Update settings for "${editing.name}".`}
          initial={{ name: editing.name, description: editing.description }}
          onSubmit={(data) => updateCrm(editing.id, data)}
          busy={busy}
        />
      )}

      {/* Archive Confirmation */}
      {archiving && (
        <ArchiveConfirmDialog
          open
          onOpenChange={() => setArchiving(null)}
          crmName={archiving.name}
          isDefault={archiving.isDefault}
          leadCount={archiving.leadCount ?? 0}
          dealCount={archiving.dealCount ?? 0}
          busy={busy}
          onConfirm={() => archiveCrm(archiving.id)}
        />
      )}

    </div>
  );
}

function CrmFormDialog({
  open,
  onOpenChange,
  title,
  description,
  initial,
  onSubmit,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  initial?: { name: string; description: string };
  onSubmit: (data: { name: string; description: string }) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ name, description: desc });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crm-name">Name</Label>
            <Input
              id="crm-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Domestic Sales, Export Division"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crm-desc">Description</Label>
            <Textarea
              id="crm-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What this CRM is for"
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Saving…" : initial ? "Save Changes" : "Create CRM"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveConfirmDialog({ open, onOpenChange, crmName, isDefault, leadCount, dealCount, busy, onConfirm }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  crmName: string;
  isDefault: boolean;
  leadCount: number;
  dealCount: number;
  busy: boolean;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim().toLowerCase() === crmName.trim().toLowerCase();

  return (
    <Dialog open={open} onOpenChange={(v) => { setTyped(""); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-danger">Archive CRM Workspace</DialogTitle>
          <DialogDescription>
            This will archive <strong>&quot;{crmName}&quot;</strong> and hide it from navigation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-xs">
            <p className="font-semibold text-warning">What happens when you archive:</p>
            <ul className="mt-1.5 list-inside list-disc space-y-1 text-muted-foreground">
              <li><strong>{leadCount}</strong> lead{leadCount !== 1 ? "s" : ""} and <strong>{dealCount}</strong> deal{dealCount !== 1 ? "s" : ""} will be hidden from lists</li>
              <li>Data is preserved and can be restored</li>
              <li>Customers are shared and not affected</li>
              <li>This action is logged in audit logs</li>
            </ul>
          </div>
          <div>
            <Label htmlFor="archive-confirm-list" className="text-xs">
              Type <strong className="text-danger">{crmName}</strong> to confirm
            </Label>
            <Input id="archive-confirm-list" className="mt-1.5" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={crmName} autoComplete="off" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => { setTyped(""); onOpenChange(false); }}>Cancel</Button>
          <Button variant="destructive" disabled={busy || !confirmed || isDefault} onClick={onConfirm}>
            {busy ? "Archiving…" : "I understand, archive this CRM"}
          </Button>
        </DialogFooter>
        {isDefault && <p className="text-xs text-warning">The default CRM cannot be archived.</p>}
      </DialogContent>
    </Dialog>
  );
}

