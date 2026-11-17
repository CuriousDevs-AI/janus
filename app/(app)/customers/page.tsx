"use client";

import * as React from "react";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { formatCurrencyINR, formatRelativeTime, cn } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { Building2, RefreshCw, Heart } from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import { Button } from "@/components/ui/button";
import { CustomerDetailPanel } from "@/components/crm/customer-detail";

type Filter = "all" | "active" | "won" | "needs_attention";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "won", label: "Won" },
  { key: "needs_attention", label: "Needs attention" },
];

interface CustomerRow {
  contactId: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string;
  leadCount: number;
  dealValue: string;
  stage: string;
  ownerId: string | null;
  ownerName: string | null;
  lastActivityAt: string | null;
}

function displayName(row: CustomerRow) {
  return row.name || row.phone || row.email || `Customer #${row.contactId}`;
}

function ownerLabel(ownerId: string | null, ownerName: string | null) {
  return ownerName || (ownerId ? `Member #${ownerId}` : "Unassigned");
}

const stageOrder = ["lost", "new", "contacted", "qualified", "demo", "proposal", "negotiation", "approval", "won"];

export default function CustomersPage() {
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [afterId, setAfterId] = React.useState("0");
  const [selectedContactId, setSelectedContactId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQuery(query); setAfterId("0"); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const changeFilter = React.useCallback((v: string) => {
    setFilter(v as Filter);
    setAfterId("0");
  }, []);

  const searchParam = debouncedQuery ? `&q=${encodeURIComponent(debouncedQuery)}` : "";
  const filterParam = filter !== "all" ? `&filter=${filter}` : "";
  const customers = useApi<CustomerRow[]>(
    `/customers?limit=50&after_id=${afterId}${searchParam}${filterParam}`,
  );

  const serverRows = customers.data ?? [];
  const loading = !customers.data && !customers.error;
  const loadError = customers.error;
  const rowCount = serverRows.length;

  function refresh() {
    customers.reload();
  }

  if (selectedContactId) {
    return (
      <div className="mx-auto flex max-w-[1400px] flex-col h-full">
        <CustomerDetailPanel contactId={selectedContactId} onBack={() => setSelectedContactId(null)} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <PageHeader
        title="Customers"
        description={loading ? "Loading customer records..." : `${rowCount} customer records`}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={refresh} disabled={loading}>
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          </div>
        }
      />
      {loadError && <p role="alert" className="mx-6 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">Your customers could not be read: {loadError}. Refresh to try again; nothing is lost.</p>}

      {!loading && rowCount > 0 && (() => {
        const activeDeals = serverRows.filter((r) => !["won", "lost"].includes(r.stage)).length;
        const totalRev = serverRows.reduce((s, r) => s + Number(r.dealValue), 0);
        const needsAtt = serverRows.filter((r) => r.lastActivityAt && (Date.now() - new Date(r.lastActivityAt).getTime()) > 3 * 24 * 60 * 60 * 1000 && !["won", "lost"].includes(r.stage)).length;
        return (
          <div className="grid gap-2 px-6 pb-3 sm:grid-cols-4">
            {([
              ["Total Customers", String(rowCount), "In your CRM", "bg-accent"],
              ["Active Deals", String(activeDeals), "With open pipeline stages", "bg-emerald-500"],
              ["Total Revenue", formatCurrencyINR(totalRev), "Across all deals", "bg-indigo-500"],
              ["Needs Attention", String(needsAtt), "No activity in 3+ days", "bg-amber-500"],
            ] as const).map(([title, value, detail, dot]) => (
              <div key={title} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex items-center gap-1.5">
                  <span className={`size-1.5 rounded-full ${dot}`} />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-bold tabular-nums">{value}</span>
                  <span className="text-[11px] text-muted-foreground">{detail}</span>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 pb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search customers or companies..." className="w-72" />
        <Tabs value={filter} onValueChange={changeFilter}>
          <TabsList className="h-auto border-b-0">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.key} value={f.key} className="h-7 px-2.5 text-[12px]">
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {loading && <p role="status" className="px-6 py-6 text-sm text-muted-foreground">Loading customer records...</p>}

      {!loading && !loadError && rowCount === 0 ? (
        <div className="px-6 py-6">
          <EmptyState icon={Building2} title="No customer records match" description="Connect a lead source or try a different filter or search term." />
        </div>
      ) : !loading && !loadError && (
        <>
        <p className="px-6 pt-3 text-xs text-muted-foreground md:hidden">Swipe the table sideways to see more columns.</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>CRM stage</TableHead>
              <TableHead>Deal Value</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Last activity</TableHead>
              <TableHead>Leads</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {serverRows.map((row) => {
              const dealValue = Number(row.dealValue);
              const name = displayName(row);
              const daysIdleSrv = row.lastActivityAt ? Math.floor((Date.now() - new Date(row.lastActivityAt).getTime()) / 86400000) : 999;
              const srvHealth = row.stage === "won" ? "good" : row.stage === "lost" ? "cold" : daysIdleSrv > 7 ? "cold" : daysIdleSrv > 3 ? "warm" : "good";
              const srvHealthColor = srvHealth === "good" ? "text-success" : srvHealth === "warm" ? "text-warning" : "text-danger";
              const srvHealthLabel = srvHealth === "good" ? "Healthy" : srvHealth === "warm" ? "Needs attention" : "At risk";
              return (
                <TableRow key={row.contactId} className="cursor-pointer" onClick={() => setSelectedContactId(row.contactId)}>
                  <TableCell><div className="flex items-center gap-2"><CustomerAvatar name={name} color="#4169e1" size="sm" /><span className="font-medium text-foreground">{name}</span></div></TableCell>
                  <TableCell className="text-muted-foreground">{row.company || "—"}</TableCell>
                  <TableCell><div className="flex items-center gap-1.5"><Heart className={cn("size-3", srvHealthColor)} /><span className={cn("text-xs", srvHealthColor)}>{srvHealthLabel}</span></div></TableCell>
                  <TableCell className="capitalize text-muted-foreground">{row.stage.replaceAll("_", " ")}</TableCell>
                  <TableCell className="text-mono text-foreground">{dealValue > 0 ? formatCurrencyINR(dealValue) : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{ownerLabel(row.ownerId, row.ownerName)}</TableCell>
                  <TableCell className="text-muted-foreground">{row.lastActivityAt ? formatRelativeTime(row.lastActivityAt) : "—"}</TableCell>
                  <TableCell className="text-mono font-medium">{row.leadCount}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="flex gap-2 p-6">
          <Button size="sm" variant="ghost" onClick={() => { setAfterId("0"); customers.reload(); }}>First page</Button>
          <Button size="sm" variant="secondary" disabled={serverRows.length !== 50} onClick={() => setAfterId(serverRows.at(-1)!.contactId)}>Next page</Button>
        </div>
        </>
      )}
    </div>
  );
}
