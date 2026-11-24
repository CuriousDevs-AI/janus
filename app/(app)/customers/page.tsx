"use client";

import * as React from "react";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { formatCurrencyINR, formatRelativeTime, cn } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { Building2, RefreshCw, Heart, Phone, Mail } from "lucide-react";
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
  return row.name || row.phone || row.email || `Contact #${row.contactId}`;
}

function ownerLabel(ownerId: string | null, ownerName: string | null) {
  return ownerName || (ownerId ? `Member #${ownerId}` : "Unassigned");
}

const stageOrder = ["lost", "new", "contacted", "qualified", "converted", "won"];

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
        title="Contacts"
        description={loading ? "Loading contacts..." : `${rowCount} contacts`}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={refresh} disabled={loading}>
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          </div>
        }
      />
      {loadError && <p role="alert" className="mx-6 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">Your contacts could not be loaded: {loadError}. Refresh to try again; nothing is lost.</p>}

      {!loading && rowCount > 0 && (() => {
        const activeDeals = serverRows.filter((r) => r.stage && !["won", "lost"].includes(r.stage)).length;
        const totalRev = serverRows.reduce((s, r) => s + Number(r.dealValue), 0);
        const needsAtt = serverRows.filter((r) => r.lastActivityAt && (Date.now() - new Date(r.lastActivityAt).getTime()) > 3 * 24 * 60 * 60 * 1000 && !["won", "lost"].includes(r.stage)).length;
        return (
          <div className="grid gap-3 px-6 pb-3 sm:grid-cols-4">
            <MetricCard label="Contacts loaded" value={String(rowCount)} delta="On this page" />
            <MetricCard label="Active deals" value={String(activeDeals)} delta="Open pipeline stages" />
            <MetricCard label="Deal revenue" value={formatCurrencyINR(totalRev)} delta="From loaded contacts" />
            <MetricCard label="Needs attention" value={String(needsAtt)} delta="No activity in 3+ days" trend={needsAtt > 0 ? "down" : undefined} />
          </div>
        );
      })()}

      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 pb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by name, phone, email or company..." className="w-72" />
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
      {loading && (
        <div role="status" className="space-y-1 px-6 py-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <div className="size-7 animate-pulse rounded-full bg-surface-2" />
              <div className="h-4 w-28 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-20 animate-pulse rounded bg-surface-2" />
              <div className="h-4 flex-1 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-16 animate-pulse rounded bg-surface-2" />
            </div>
          ))}
        </div>
      )}

      {!loading && !loadError && rowCount === 0 ? (
        <div className="px-6 py-6">
          <EmptyState icon={Building2} title="No contacts match" description="Contacts are created when leads are captured. Try a different search or filter." />
        </div>
      ) : !loading && !loadError && (
        <>
        <p className="px-6 pt-3 text-xs text-muted-foreground md:hidden">Swipe the table sideways to see more columns.</p>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Deal value</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Last activity</TableHead>
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
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{row.phone ? <span className="inline-flex items-center gap-1"><Phone className="size-3" />{row.phone}</span> : "—"}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">{row.email ? <span className="inline-flex items-center gap-1"><Mail className="size-3" />{row.email}</span> : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.company || "—"}</TableCell>
                  <TableCell><div className="flex items-center gap-1.5"><Heart className={cn("size-3", srvHealthColor)} /><span className={cn("text-xs", srvHealthColor)}>{srvHealthLabel}</span></div></TableCell>
                  <TableCell className="capitalize text-muted-foreground">{row.stage.replaceAll("_", " ")}</TableCell>
                  <TableCell className="text-mono text-foreground">{dealValue > 0 ? formatCurrencyINR(dealValue) : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{ownerLabel(row.ownerId, row.ownerName)}</TableCell>
                  <TableCell className="text-muted-foreground">{row.lastActivityAt ? formatRelativeTime(row.lastActivityAt) : "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
        <div className="flex gap-2 p-6">
          <Button size="sm" variant="ghost" onClick={() => { setAfterId("0"); customers.reload(); }}>First page</Button>
          <Button size="sm" variant="secondary" disabled={serverRows.length !== 50} onClick={() => setAfterId(serverRows.at(-1)!.contactId)}>Next page</Button>
        </div>
        </>
      )}
    </div>
  );
}
