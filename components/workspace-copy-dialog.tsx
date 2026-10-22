"use client";

import * as React from "react";
import { Copy, Layers3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const workspaceCopyOptions = [
  ["crm_sales", "CRM & Sales", "Leads, deals and customer follow-up"],
  ["hr_people", "HR & People", "Employees and people operations"],
  ["finance_accounting", "Finance & Accounting", "Invoices, payments and financial controls"],
  ["projects_delivery", "Projects & Delivery", "Projects, tasks and client delivery"],
  ["customer_support", "Customer Support & Success", "Tickets, queues and customer care"],
  ["operations_inventory", "Operations & Inventory", "Stock, vendors and fulfilment"],
  ["it_infrastructure", "IT & Infrastructure", "Assets, access and incidents"],
] as const;

export type WorkspaceCopyTarget = (typeof workspaceCopyOptions)[number][0];

type WorkspaceCopyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  itemKind: "agent" | "workflow";
  currentWorkspace?: string | null;
  onCopied: (target: WorkspaceCopyTarget) => void;
};

export function WorkspaceCopyDialog({ open, onOpenChange, itemName, itemKind, currentWorkspace, onCopied }: WorkspaceCopyDialogProps) {
  const [target, setTarget] = React.useState<WorkspaceCopyTarget>("crm_sales");
  const firstAvailable = workspaceCopyOptions.find(([key]) => key !== currentWorkspace)?.[0] ?? "crm_sales";
  const effectiveTarget = target === currentWorkspace ? firstAvailable : target;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onCopied(effectiveTarget);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy {itemKind} to another workspace</DialogTitle>
          <DialogDescription>
            Create a separate draft of <span className="font-medium text-foreground">{itemName}</span>. The original stays unchanged.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="border border-accent/30 bg-accent-muted px-3 py-2.5 text-xs leading-5 text-muted-foreground">
            Permissions, approvals and workspace data remain scoped to the destination. Review the copy before activating it.
          </div>
          <div>
            <Label htmlFor="copy-workspace">Destination workspace</Label>
            <select id="copy-workspace" value={effectiveTarget} onChange={(event) => setTarget(event.target.value as WorkspaceCopyTarget)} className="mt-1 h-10 w-full border border-input bg-surface px-3 text-sm">
              {workspaceCopyOptions.map(([key, label, description]) => (
                <option key={key} value={key} disabled={key === currentWorkspace}>
                  {label}{key === currentWorkspace ? " (current)" : ""} — {description}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Layers3 className="size-3.5 text-accent" />
            <span>New copy starts as a draft with approval checks enabled.</span>
            <Badge variant="outline" className="ml-auto">Owner review</Badge>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit"><Copy className="size-3.5" />Copy to workspace</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
