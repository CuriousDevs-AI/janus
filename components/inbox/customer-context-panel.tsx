"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Sparkles, ListChecks, ArrowRight } from "lucide-react";
import { useAppStore, useCompany } from "@/lib/stores/app-store";
import { getMemoryForCustomer } from "@/lib/mock-data";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { HealthBadge, TicketStatusBadge } from "@/components/shared/status-badge";
import { formatCurrencyINR, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function CustomerContextPanel({ customerId, className }: { customerId: string | undefined; className?: string }) {
  const customer = useAppStore((s) => s.customers.find((c) => c.id === customerId));
  const allLeads = useAppStore((s) => s.leads);
  const allDeals = useAppStore((s) => s.deals);
  const allTickets = useAppStore((s) => s.tickets);
  const allActivities = useAppStore((s) => s.activities);
  const customerLeads = allLeads.filter((l) => l.customerId === customerId);
  const lead = customerLeads.find((l) => l.stage !== "won" && l.stage !== "lost") ?? customerLeads[0];
  const deals = allDeals.filter((d) => d.customerId === customerId);
  const tickets = allTickets.filter((t) => t.customerId === customerId && t.status !== "closed");
  const activities = allActivities.filter((a) => a.customerId === customerId);
  const company = useCompany(customer?.companyId);

  if (!customer) return <div className={cn("w-[300px] shrink-0 border-l border-border bg-surface", className)} />;

  const openDeal = deals.find((d) => !["won", "lost"].includes(d.stage));
  const memory = getMemoryForCustomer(customer.id).filter((m) => m.kind === "derived_insight").slice(0, 3);
  const recent = [...activities].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 4);

  return (
    <div className={cn("flex w-[300px] shrink-0 flex-col overflow-y-auto border-l border-border bg-surface", className)}>
      <div className="flex flex-col items-center gap-2 border-b border-border px-4 py-5 text-center">
        <CustomerAvatar name={customer.name} color={customer.avatarColor} size="lg" />
        <div>
          <p className="text-[14px] font-medium text-foreground">{customer.name}</p>
          <p className="text-[12px] text-muted-foreground">{company?.name}</p>
        </div>
        <HealthBadge category={customer.health.category} score={customer.health.score} />
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          {lead && (
            <div className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Lead</p>
              <p className="font-medium text-foreground capitalize">{lead.stage}</p>
            </div>
          )}
          {openDeal && (
            <div className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Deal</p>
              <p className="font-medium text-foreground">{formatCurrencyINR(openDeal.amount)}</p>
            </div>
          )}
          <div className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Owner</p>
            <p className="font-medium text-foreground">{customer.ownerId ? "Assigned" : "Unassigned"}</p>
          </div>
          <div className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Open tickets</p>
            <p className="font-medium text-foreground">{tickets.length}</p>
          </div>
        </div>

        <div className="rounded-md border border-accent-border bg-accent-muted p-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">AI Summary</span>
          </div>
          <p className="text-[12px] leading-relaxed text-foreground">
            {memory[0]?.value ?? `${customer.name.split(" ")[0]} has no derived insights yet.`}
          </p>
        </div>

        {memory.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Memory</p>
            <div className="flex flex-col gap-1.5">
              {memory.map((m) => (
                <p key={m.id} className="text-[11.5px] text-muted-foreground">
                  · {m.value}
                </p>
              ))}
            </div>
          </div>
        )}

        {tickets.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Open tickets</p>
            <div className="flex flex-col gap-1.5">
              {tickets.map((t) => (
                <Link key={t.id} href={`/tickets/${t.id}`} className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-2.5 py-1.5 hover:border-border-strong">
                  <span className="truncate text-[11.5px] text-foreground">{t.number} {t.subject}</span>
                  <TicketStatusBadge status={t.status} />
                </Link>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</p>
          <div className="flex flex-col gap-2">
            {recent.map((a) => (
              <div key={a.id} className="text-[11.5px] text-muted-foreground">
                <span className="text-foreground">{a.title}</span>
                <span className="block text-[10.5px]">{formatRelativeTime(a.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="rounded-md border border-border bg-surface-2 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <ListChecks className="size-3.5" /> Next best action
          </p>
          <p className="text-[12px] text-foreground">{openDeal?.nextAction ?? "Follow up with a check-in message."}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Button size="sm" variant="secondary" asChild>
            <Link href={`/customers/${customer.id}`}>
              View Profile
              <ArrowRight className="size-3" />
            </Link>
          </Button>
          <Button size="sm" variant="secondary" asChild>
            <Link href={`/ai?customer=${customer.id}`}>
              <Sparkles className="size-3 text-accent" />
              Ask AI
            </Link>
          </Button>
          <Button size="sm" variant="secondary" onClick={() => toast.success("Task created", { description: `Follow up with ${customer.name}` })}>
            Create Task
          </Button>
        </div>
      </div>
    </div>
  );
}
