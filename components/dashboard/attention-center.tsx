"use client";

import Link from "next/link";
import { AlertTriangle, ShieldCheck, LifeBuoy, Clock, ArrowRight } from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { getCustomerById, getCompanyById } from "@/lib/mock-data";
import { formatCurrencyINR, formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomerAvatar } from "@/components/shared/customer-avatar";

interface AttentionItem {
  id: string;
  icon: typeof AlertTriangle;
  tone: "danger" | "warning" | "accent";
  priority: "Urgent" | "High" | "Normal";
  customerName: string;
  customerId: string;
  avatarColor: string;
  description: string;
  timestamp: string;
  href: string;
  actionLabel: string;
}

export function AttentionCenter() {
  const approvals = useAppStore((s) => s.approvals);
  const tickets = useAppStore((s) => s.tickets);
  const deals = useAppStore((s) => s.deals);

  const items: AttentionItem[] = [];

  for (const t of tickets.filter((t) => t.status === "escalated")) {
    const customer = getCustomerById(t.customerId);
    if (!customer) continue;
    items.push({
      id: `ticket-${t.id}`,
      icon: LifeBuoy,
      tone: "danger",
      priority: "Urgent",
      customerName: customer.name,
      customerId: customer.id,
      avatarColor: customer.avatarColor,
      description: `${getCompanyById(customer.companyId)?.name} — ${t.subject}`,
      timestamp: t.updatedAt,
      href: `/tickets/${t.id}`,
      actionLabel: "Review",
    });
  }

  for (const a of approvals.filter((a) => a.status === "pending").sort((x) => (x.risk === "high" ? -1 : 1))) {
    const customer = getCustomerById(a.customerId);
    if (!customer) continue;
    items.push({
      id: `approval-${a.id}`,
      icon: ShieldCheck,
      tone: a.risk === "high" ? "danger" : "warning",
      priority: a.risk === "high" ? "High" : "Normal",
      customerName: customer.name,
      customerId: customer.id,
      avatarColor: customer.avatarColor,
      description: a.actionLabel + (a.amount ? ` — ${formatCurrencyINR(a.amount)}` : ""),
      timestamp: a.requestedAt,
      href: `/approvals/${a.id}`,
      actionLabel: "Review",
    });
  }

  const highValueDeal = deals
    .filter((d) => !["won", "lost"].includes(d.stage))
    .sort((a, b) => b.amount - a.amount)[0];
  if (highValueDeal) {
    const customer = getCustomerById(highValueDeal.customerId);
    if (customer) {
      items.push({
        id: `deal-${highValueDeal.id}`,
        icon: AlertTriangle,
        tone: "accent",
        priority: "High",
        customerName: customer.name,
        customerId: customer.id,
        avatarColor: customer.avatarColor,
        description: `${getCompanyById(customer.companyId)?.name} — ${formatCurrencyINR(highValueDeal.amount)} opportunity waiting`,
        timestamp: highValueDeal.lastActivityAt,
        href: `/deals/${highValueDeal.id}`,
        actionLabel: "Open deal",
      });
    }
  }

  for (const d of deals.filter((d) => !["won", "lost"].includes(d.stage) && d.nextAction?.toLowerCase().includes("follow up"))) {
    const customer = getCustomerById(d.customerId);
    if (!customer) continue;
    items.push({
      id: `followup-${d.id}`,
      icon: Clock,
      tone: "warning",
      priority: "Normal",
      customerName: customer.name,
      customerId: customer.id,
      avatarColor: customer.avatarColor,
      description: `${d.name} — ${d.nextAction}`,
      timestamp: d.lastActivityAt,
      href: `/deals/${d.id}`,
      actionLabel: "Follow up",
    });
  }

  const sorted = items.slice(0, 6);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-[13px] font-semibold text-foreground">Needs your attention</h2>
        <Badge variant="warning">{sorted.length} open</Badge>
      </div>
      <div className="divide-y divide-border">
        {sorted.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className={
                "flex size-7 shrink-0 items-center justify-center rounded-md " +
                (item.tone === "danger" ? "bg-danger-muted text-danger" : item.tone === "warning" ? "bg-warning-muted text-warning" : "bg-accent-muted text-accent")
              }
            >
              <item.icon className="size-3.5" />
            </span>
            <CustomerAvatar name={item.customerName} color={item.avatarColor} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-medium text-foreground">{item.customerName}</span>
                <Badge variant={item.priority === "Urgent" ? "danger" : item.priority === "High" ? "warning" : "neutral"}>
                  {item.priority}
                </Badge>
              </div>
              <p className="truncate text-[12px] text-muted-foreground">{item.description}</p>
            </div>
            <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">{formatRelativeTime(item.timestamp)}</span>
            <Button size="sm" variant="secondary" asChild>
              <Link href={item.href}>
                {item.actionLabel}
                <ArrowRight className="size-3" />
              </Link>
            </Button>
          </div>
        ))}
        {sorted.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">Nothing needs attention right now.</p>}
      </div>
    </div>
  );
}
