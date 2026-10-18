"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, message } from "@/lib/api/client";
import type { Deal, Lead } from "@/lib/api/types";
import type { DealStage } from "@/lib/types";
import { dealStageOrder, dealStageMeta } from "@/lib/status-meta";
import { useSession } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function DealForm({
  deal,
  leadId,
  customerName,
  onSaved,
}: {
  deal?: Deal;
  leadId?: string;
  customerName?: string;
  onSaved: (deal: Deal) => void;
}) {
  const [stage, setStage] = useState<DealStage>(deal?.stage ?? "new");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setBusy(true);
        setError("");
        try {
          const saved = await api<Deal>(
            deal ? `/deals/${deal.id}` : `/leads/${leadId}/deal`,
            {
              method: deal ? "PUT" : "POST",
              body: JSON.stringify({
                name: data.get("name"),
                amount: data.get("amount"),
                stage,
                expectedCloseAt: data.get("expectedCloseAt") || null,
                lostReason: data.get("lostReason") || "",
                ...(deal ? { version: deal.version } : {}),
              }),
            },
          );
          onSaved(saved);
        } catch (error) {
          setError(message(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="deal-name">Deal name</Label>
          <Input
            id="deal-name"
            name="name"
            required
            maxLength={200}
            defaultValue={deal?.name ?? customerName ?? ""}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="deal-amount">Value (₹)</Label>
            <Input
              id="deal-amount"
              name="amount"
              type="number"
              min="0"
              max="999999999999.99"
              step="0.01"
              required
              defaultValue={deal?.amount ?? ""}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deal-close">Expected close</Label>
            <Input
              id="deal-close"
              name="expectedCloseAt"
              type="date"
              defaultValue={deal?.expectedCloseAt ?? ""}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deal-stage">Stage</Label>
          <select
            id="deal-stage"
            value={stage}
            onChange={(event) => setStage(event.target.value as DealStage)}
            className="h-8 w-full rounded-md border border-input bg-surface-2 px-2 text-sm focus:ring-2 focus:ring-ring"
          >
            {dealStageOrder.map((value) => (
              <option key={value} value={value}>
                {dealStageMeta[value].label}
              </option>
            ))}
          </select>
        </div>
        {stage === "lost" && (
          <div className="space-y-1.5">
            <Label htmlFor="deal-loss">Why was this deal lost?</Label>
            <Input
              id="deal-loss"
              name="lostReason"
              required
              maxLength={1000}
              defaultValue={deal?.lostReason ?? ""}
            />
          </div>
        )}
        {stage === "approval" && (
          <p className="text-xs text-muted-foreground">
            Tracks a pending decision. Moving this card does not approve a
            discount, refund or payment.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : deal ? "Save deal" : "Create deal"}
        </Button>
      </fieldset>
    </form>
  );
}

export function LeadDeal({
  lead,
  customerName,
}: {
  lead: Lead;
  customerName: string;
}) {
  const [open, setOpen] = useState(false);
  const session = useSession();
  const router = useRouter();
  if (lead.dealId)
    return (
      <Button size="sm" asChild>
        <Link href={`/deals/${lead.dealId}`}>Open deal</Link>
      </Button>
    );
  if (!session.permissions.includes("leads:write")) return null;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Create deal
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create deal</DialogTitle>
            <DialogDescription>
              Track this lead through your pipeline. Values are in INR.
            </DialogDescription>
          </DialogHeader>
          <DealForm
            leadId={lead.id}
            customerName={customerName}
            onSaved={(deal) => {
              setOpen(false);
              router.push(`/deals/${deal.id}`);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
