"use client";

import { useState } from "react";
import {
  Building2, Pencil, Plus,
  Trash2, Users, TrendingUp, UserRoundPlus,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { sessionChanged } from "@/components/auth/session-provider";
import type { CrmWorkspace } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export function CrmManagementSection() {
  const workspaces = useApi<CrmWorkspace[]>("/crm-workspaces");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CrmWorkspace | null>(null);
  const [deleting, setDeleting] = useState<CrmWorkspace | null>(null);
  const [busy, setBusy] = useState(false);

  const list = workspaces.data ?? [];

  async function createCrm(data: { name: string; description: string }) {
    setBusy(true);
    try {
      await api("/crm-workspaces", {
        method: "POST",
        body: JSON.stringify({
          name: data.name.trim(),
          description: data.description.trim(),
        }),
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
        body: JSON.stringify({
          name: data.name.trim(),
          description: data.description.trim(),
        }),
      });
      toast.success("CRM updated");
      setEditing(null);
      workspaces.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteCrm(id: string) {
    setBusy(true);
    try {
      await api(`/crm-workspaces/${id}/archive`, { method: "POST" });
      toast.success("CRM workspace archived");
      setDeleting(null);
      workspaces.reload();
      window.dispatchEvent(new Event(sessionChanged));
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">CRM Workspaces</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create separate CRM pipelines for different divisions. Contacts are shared; leads, deals and pipeline stages are per-CRM.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" /> New CRM
        </Button>
      </div>

      {workspaces.loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {workspaces.error && <p className="text-sm text-danger">{workspaces.error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {list.map((crm) => (
          <CrmCard
            key={crm.id}
            crm={crm}
            onEdit={() => setEditing(crm)}
            onDelete={() => setDeleting(crm)}
          />
        ))}
      </div>

      {list.length === 0 && !workspaces.loading && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Building2 className="mx-auto size-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm font-medium">No CRM workspaces</p>
          <p className="mt-1 text-xs text-muted-foreground">Create your first CRM to start tracking leads and deals.</p>
        </div>
      )}

      <CrmFormDialog
        open={creating}
        onOpenChange={setCreating}
        title="Create CRM Workspace"
        description="A new CRM with its own pipeline. Customers are shared across all CRMs."
        onSubmit={createCrm}
        busy={busy}
      />

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

      <Dialog open={Boolean(deleting)} onOpenChange={() => setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete CRM Workspace?</DialogTitle>
            <DialogDescription>
              This permanently removes &quot;{deleting?.name}&quot; and all its leads, deals and pipeline stages. Contacts are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy || Boolean(deleting?.isDefault)}
              onClick={() => deleting && deleteCrm(deleting.id)}
            >
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
          {deleting?.isDefault && (
            <p className="text-xs text-warning">The default CRM cannot be deleted. Set another CRM as default first.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CrmCard({
  crm,
  onEdit,
  onDelete,
}: {
  crm: CrmWorkspace;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent-border">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-accent" />
          <h3 className="text-sm font-semibold">{crm.name}</h3>
          {crm.isDefault && <Badge variant="accent" className="text-[10px]">Default</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={onEdit}>
            <Pencil className="size-3.5" />
          </Button>
          {!crm.isDefault && (
            <Button variant="ghost" size="sm" className="size-7 p-0" onClick={onDelete}>
              <Trash2 className="size-3.5 text-danger" />
            </Button>
          )}
        </div>
      </div>
      {crm.description && (
        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{crm.description}</p>
      )}
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <UserRoundPlus className="size-3" /> {crm.leadCount ?? 0} leads
        </span>
        <span className="flex items-center gap-1">
          <TrendingUp className="size-3" /> {crm.dealCount ?? 0} deals
        </span>
        <span className="flex items-center gap-1">
          <Users className="size-3" /> {crm.memberCount ?? 0} members
        </span>
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
