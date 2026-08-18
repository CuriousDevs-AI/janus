"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, GripVertical } from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { getCompanyById, users } from "@/lib/mock-data";
import { dealStageOrder, dealStageMeta } from "@/lib/status-meta";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { formatCurrencyINR, formatRelativeTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DealStage } from "@/lib/types";

const dealSchema = z.object({
  name: z.string().min(2, "Enter a deal name"),
  customerId: z.string().min(1, "Select a customer"),
  amount: z.coerce.number().min(1, "Enter an amount"),
  stage: z.string(),
});
type DealFormValues = z.infer<typeof dealSchema>;

export default function DealsPage() {
  return (
    <React.Suspense fallback={null}>
      <DealsPageInner />
    </React.Suspense>
  );
}

function DealsPageInner() {
  const deals = useAppStore((s) => s.deals);
  const customers = useAppStore((s) => s.customers);
  const moveDealStage = useAppStore((s) => s.moveDealStage);
  const createDeal = useAppStore((s) => s.createDeal);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = React.useState("");
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = React.useState<DealStage | null>(null);
  const [createOpen, setCreateOpen] = React.useState(searchParams.get("new") === "1");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DealFormValues>({ resolver: zodResolver(dealSchema), defaultValues: { stage: "new", customerId: customers[0]?.id } });

  const filteredDeals = deals.filter((d) => {
    if (!query) return true;
    const c = customers.find((cu) => cu.id === d.customerId);
    const company = c ? getCompanyById(c.companyId)?.name ?? "" : "";
    return d.name.toLowerCase().includes(query.toLowerCase()) || company.toLowerCase().includes(query.toLowerCase()) || c?.name.toLowerCase().includes(query.toLowerCase());
  });

  const totalValue = filteredDeals.filter((d) => !["won", "lost"].includes(d.stage)).reduce((sum, d) => sum + d.amount, 0);

  function onCreate(values: DealFormValues) {
    const id = createDeal({
      name: values.name,
      customerId: values.customerId,
      amount: values.amount,
      stage: values.stage as DealStage,
      expectedCloseAt: new Date(Date.now() + 45 * 86400000).toISOString(),
    });
    toast.success("Deal created", { description: values.name });
    setCreateOpen(false);
    reset();
    router.push(`/deals/${id}`);
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Deals"
        description={`${filteredDeals.length} active · ${formatCurrencyINR(totalValue)} open pipeline`}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            New Deal
          </Button>
        }
      />
      <div className="flex items-center gap-2 border-b border-border px-6 pb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search deals, customers, companies…" className="w-72" />
      </div>

      <div className="flex-1 overflow-x-auto px-6 py-4">
        <div className="flex h-full gap-3" style={{ minWidth: dealStageOrder.length * 268 }}>
          {dealStageOrder.map((stage) => {
            const stageDeals = filteredDeals.filter((d) => d.stage === stage);
            const stageValue = stageDeals.reduce((sum, d) => sum + d.amount, 0);
            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverStage(stage);
                }}
                onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  const dealId = e.dataTransfer.getData("text/plain");
                  if (dealId) {
                    const deal = deals.find((d) => d.id === dealId);
                    moveDealStage(dealId, stage);
                    if (deal && deal.stage !== stage) {
                      toast.success(`${deal.name} moved to ${dealStageMeta[stage].label}`);
                    }
                  }
                  setDragging(null);
                  setDragOverStage(null);
                }}
                className={cn(
                  "flex w-64 shrink-0 flex-col rounded-lg border bg-surface-2/40 transition-colors",
                  dragOverStage === stage ? "border-accent-border bg-accent-muted/30" : "border-border"
                )}
              >
                <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                  <span className="text-[12px] font-semibold text-foreground">{dealStageMeta[stage].label}</span>
                  <Badge variant="neutral">{stageDeals.length}</Badge>
                </div>
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground">{formatCurrencyINR(stageValue)}</div>
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {stageDeals.map((deal) => {
                    const customer = customers.find((c) => c.id === deal.customerId);
                    if (!customer) return null;
                    const company = getCompanyById(customer.companyId);
                    return (
                      <Link
                        key={deal.id}
                        href={`/deals/${deal.id}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", deal.id);
                          setDragging(deal.id);
                        }}
                        onDragEnd={() => setDragging(null)}
                        className={cn(
                          "group flex flex-col gap-2 rounded-md border border-border bg-surface p-2.5 shadow-sm transition-all hover:border-border-strong",
                          dragging === deal.id && "opacity-40"
                        )}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-[12.5px] font-medium leading-tight text-foreground">{deal.name}</span>
                          <GripVertical className="size-3 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <CustomerAvatar name={customer.name} color={customer.avatarColor} size="sm" />
                          <span className="truncate text-[11px] text-muted-foreground">{company?.name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-mono text-[13px] font-semibold text-foreground">{formatCurrencyINR(deal.amount)}</span>
                          <span className={cn("text-[11px] font-medium", deal.probability >= 70 ? "text-success" : deal.probability >= 40 ? "text-warning" : "text-muted-foreground")}>
                            {deal.probability}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{users.find((u) => u.id === deal.ownerId)?.name}</span>
                          <span>{formatRelativeTime(deal.lastActivityAt)}</span>
                        </div>
                      </Link>
                    );
                  })}
                  {stageDeals.length === 0 && (
                    <div className="rounded-md border border-dashed border-border px-2 py-4 text-center text-[11px] text-muted-foreground/60">Drop here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New deal</DialogTitle>
            <DialogDescription>Create a deal for an existing customer.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deal-name">Deal name</Label>
              <Input id="deal-name" placeholder="e.g. Enterprise AI Support" {...register("name")} />
              {errors.name && <p className="text-[11px] text-danger">{errors.name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Customer</Label>
              <Select value={watch("customerId")} onValueChange={(v) => setValue("customerId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {getCompanyById(c.companyId)?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.customerId && <p className="text-[11px] text-danger">{errors.customerId.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="deal-amount">Amount (₹)</Label>
                <Input id="deal-amount" type="number" placeholder="800000" {...register("amount")} />
                {errors.amount && <p className="text-[11px] text-danger">{errors.amount.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Stage</Label>
                <Select value={watch("stage")} onValueChange={(v) => setValue("stage", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dealStageOrder.map((s) => (
                      <SelectItem key={s} value={s}>
                        {dealStageMeta[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                Create deal
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
