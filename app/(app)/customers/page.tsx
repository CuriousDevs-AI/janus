"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppStore, useCompany } from "@/lib/stores/app-store";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { HealthBadge } from "@/components/shared/status-badge";
import { formatCurrencyINR, formatRelativeTime, cn } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { Building2 } from "lucide-react";
import type { HealthCategory } from "@/lib/types";
import { getCompanyById, getUserById } from "@/lib/mock-data";

const FILTERS: { key: "all" | HealthCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "healthy", label: "Healthy" },
  { key: "at_risk", label: "At Risk" },
  { key: "high_risk", label: "High Risk" },
  { key: "expansion", label: "Expansion" },
  { key: "inactive", label: "Inactive" },
];

export default function CustomersPage() {
  const allCustomers = useAppStore((s) => s.customers);
  const customers = allCustomers.filter((c) => c.stage === "customer");
  const deals = useAppStore((s) => s.deals);
  const tickets = useAppStore((s) => s.tickets);
  const activities = useAppStore((s) => s.activities);
  const router = useRouter();

  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | HealthCategory>("all");

  const rows = customers
    .filter((c) => filter === "all" || c.health.category === filter)
    .filter((c) => {
      if (!query) return true;
      const company = getCompanyById(c.companyId)?.name ?? "";
      return c.name.toLowerCase().includes(query.toLowerCase()) || company.toLowerCase().includes(query.toLowerCase());
    })
    .sort((a, b) => b.health.score - a.health.score);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <PageHeader title="Customers" description={`${rows.length} of ${customers.length} customers`} />

      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 pb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search customers or companies…" className="w-72" />
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList className="h-auto border-b-0">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.key} value={f.key} className="h-7 px-2.5 text-[12px]">
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-6">
          <EmptyState icon={Building2} title="No customers match" description="Try a different filter or search term." />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Deal Value</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Last Contact</TableHead>
              <TableHead>Open Tickets</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((customer) => {
              const company = getCompanyById(customer.companyId);
              const customerDeals = deals.filter((d) => d.customerId === customer.id && !["lost"].includes(d.stage));
              const dealValue = customerDeals.reduce((sum, d) => sum + d.amount, 0);
              const openTickets = tickets.filter((t) => t.customerId === customer.id && t.status !== "closed" && t.status !== "resolved");
              const lastActivity = activities.filter((a) => a.customerId === customer.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
              return (
                <TableRow key={customer.id} className="cursor-pointer" onClick={() => router.push(`/customers/${customer.id}`)}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CustomerAvatar name={customer.name} color={customer.avatarColor} size="sm" />
                      <span className="font-medium text-foreground">{customer.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{company?.name}</TableCell>
                  <TableCell>
                    <HealthBadge category={customer.health.category} score={customer.health.score} />
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">{customer.stage}</TableCell>
                  <TableCell className="text-mono text-foreground">{dealValue > 0 ? formatCurrencyINR(dealValue) : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{getUserById(customer.ownerId)?.name}</TableCell>
                  <TableCell className="text-muted-foreground">{lastActivity ? formatRelativeTime(lastActivity.createdAt) : "—"}</TableCell>
                  <TableCell>
                    <span className={cn("text-mono font-medium", openTickets.length > 0 ? "text-warning" : "text-muted-foreground")}>{openTickets.length}</span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
