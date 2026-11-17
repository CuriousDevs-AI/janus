"use client";
import { demoMode } from "@/lib/demo-mode";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { formatCurrencyINR, formatRelativeTime, cn } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { Building2, RefreshCw, Heart } from "lucide-react";
import { useAllRows } from "@/lib/api/use-all-rows";
import { useApi } from "@/lib/api/use-api";
import type { Contact, Deal, Lead } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { demoDealRows, demoLeadRows } from "@/lib/api/demo-data";
import { CustomerDetailPanel } from "@/components/crm/customer-detail";

type Filter = "all" | "active" | "won" | "needs_attention";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "won", label: "Won" },
  { key: "needs_attention", label: "Needs attention" },
];

/** Server-side customer row from /v1/customers. */
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

// Demo-mode helpers (unchanged from old code).
type DemoCustomerRow = {
  contact: Contact;
  leads: Lead[];
  deals: Deal[];
};

function displayName(row: CustomerRow) {
  return row.name || row.phone || row.email || `Customer #${row.contactId}`;
}

function ownerLabel(ownerId: string | null, ownerName: string | null) {
  return ownerName || (ownerId ? `Member #${ownerId}` : "Unassigned");
}

const stageOrder = ["lost", "new", "contacted", "qualified", "demo", "proposal", "negotiation", "approval", "won"];

export default function CustomersPage() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [afterId, setAfterId] = React.useState("0");
  const [selectedContactId, setSelectedContactId] = React.useState<string | null>(null);

  // Debounce search to avoid a request per keystroke.
  React.useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQuery(query); setAfterId("0"); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const changeFilter = React.useCallback((v: string) => {
    setFilter(v as Filter);
    setAfterId("0");
  }, []);

  // Server-paged customers for real companies.
  const searchParam = debouncedQuery ? `&q=${encodeURIComponent(debouncedQuery)}` : "";
  const filterParam = filter !== "all" ? `&filter=${filter}` : "";
  const customers = useApi<CustomerRow[]>(
    !demoMode ? `/customers?limit=50&after_id=${afterId}${searchParam}${filterParam}` : null,
  );

  // Demo mode: keep the old client-side approach for the preview.
  const leads = useAllRows<Lead>(demoMode ? "/leads" : null);
  const deals = useAllRows<Deal>(demoMode ? "/deals" : null);
  const usingDemo = demoMode && Boolean(leads.error || deals.error);
  const leadRows = React.useMemo(() => leads.data ?? (usingDemo ? demoLeadRows : []), [leads.data, usingDemo]);
  const dealRows = React.useMemo(() => deals.data ?? (usingDemo ? demoDealRows : []), [deals.data, usingDemo]);
  const demoRows = React.useMemo<DemoCustomerRow[]>(() => {
    if (!demoMode) return [];
    const leadsByContact = new Map<string, Lead[]>();
    for (const lead of leadRows) {
      const list = leadsByContact.get(lead.customerId) ?? [];
      list.push(lead);
      leadsByContact.set(lead.customerId, list);
    }
    const dealsByContact = new Map<string, Deal[]>();
    for (const deal of dealRows) {
      const list = dealsByContact.get(deal.customerId) ?? [];
      list.push(deal);
      dealsByContact.set(deal.customerId, list);
    }
    const contacts = new Map<string, Contact>();
    for (const lead of leadRows) {
      contacts.set(lead.customerId, {
        id: lead.customerId, name: lead.contactName, phone: lead.phone, email: lead.email,
        company: lead.company, whatsappOptIn: lead.whatsappOptIn, doNotContact: lead.doNotContact,
        consentSource: lead.consentSource, consentUpdatedAt: lead.consentUpdatedAt,
      });
    }
    return [...contacts.values()]
      .map((contact) => ({
        contact,
        leads: leadsByContact.get(contact.id) ?? [],
        deals: dealsByContact.get(contact.id) ?? [],
      }))
      .filter(({ leads: cls, deals: cds }) => {
        if (filter === "all") return true;
        if (filter === "active") return cls.some((l) => !["won", "lost"].includes(l.stage));
        if (filter === "won") return cds.some((d) => d.stage === "won") || cls.some((l) => l.stage === "won");
        return cls.some((l) => { const age = Date.now() - new Date(l.lastActivityAt).getTime(); return age > 3 * 24 * 60 * 60 * 1000 && !["won", "lost"].includes(l.stage); });
      })
      .filter(({ contact }) => {
        if (!debouncedQuery) return true;
        const n = debouncedQuery.toLowerCase();
        return [contact.name, contact.phone, contact.email, contact.company].filter(Boolean).some((v) => v!.toLowerCase().includes(n));
      })
      .sort((a, b) => {
        const aLast = Math.max(...a.leads.map((l) => new Date(l.lastActivityAt).getTime()), 0);
        const bLast = Math.max(...b.leads.map((l) => new Date(l.lastActivityAt).getTime()), 0);
        return bLast - aLast;
      });
  }, [dealRows, leadRows, filter, debouncedQuery]);

  const serverRows = customers.data ?? [];
  const loading = demoMode ? (leads.loading || deals.loading) : (!customers.data && !customers.error);
  const loadError = demoMode ? undefined : customers.error;
  const rowCount = demoMode ? demoRows.length : serverRows.length;

  function refresh() {
    if (demoMode) { leads.reload(); deals.reload(); }
    else customers.reload();
  }

  if (selectedContactId && !demoMode) {
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
        const activeDeals = demoMode
          ? demoRows.filter(({ leads: cls }) => cls.some((l) => !["won", "lost"].includes(l.stage))).length
          : serverRows.filter((r) => !["won", "lost"].includes(r.stage)).length;
        const totalRev = demoMode
          ? demoRows.reduce((s, { deals: ds }) => s + ds.filter((d) => d.stage !== "lost").reduce((a, d) => a + Number(d.amount), 0), 0)
          : serverRows.reduce((s, r) => s + Number(r.dealValue), 0);
        const needsAtt = demoMode
          ? demoRows.filter(({ leads: cls }) => cls.some((l) => { const age = Date.now() - new Date(l.lastActivityAt).getTime(); return age > 3 * 24 * 60 * 60 * 1000 && !["won", "lost"].includes(l.stage); })).length
          : serverRows.filter((r) => r.lastActivityAt && (Date.now() - new Date(r.lastActivityAt).getTime()) > 3 * 24 * 60 * 60 * 1000 && !["won", "lost"].includes(r.stage)).length;
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
            {demoMode ? demoRows.map(({ contact, leads: customerLeads, deals: customerDeals }) => {
              const dealValue = customerDeals.filter((deal) => deal.stage !== "lost").reduce((sum, deal) => sum + Number(deal.amount), 0);
              const lastLead = [...customerLeads].sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1))[0];
              const furthest = [...customerLeads].sort((a, b) => stageOrder.indexOf(b.stage) - stageOrder.indexOf(a.stage))[0];
              const currentStage = furthest?.stage ?? "new";
              const dName = contact.name || contact.phone || contact.email || `Customer #${contact.id}`;
              const daysIdle = lastLead ? Math.floor((Date.now() - new Date(lastLead.lastActivityAt).getTime()) / 86400000) : 999;
              const health = currentStage === "won" ? "good" : currentStage === "lost" ? "cold" : daysIdle > 7 ? "cold" : daysIdle > 3 ? "warm" : "good";
              const healthColor = health === "good" ? "text-success" : health === "warm" ? "text-warning" : "text-danger";
              const healthLabel = health === "good" ? "Healthy" : health === "warm" ? "Needs attention" : "At risk";
              return (
                <TableRow key={contact.id} className={usingDemo ? "" : "cursor-pointer"} onClick={usingDemo ? undefined : () => router.push(`/customers/${contact.id}`)}>
                  <TableCell><div className="flex items-center gap-2"><CustomerAvatar name={dName} color="#4169e1" size="sm" /><span className="font-medium text-foreground">{dName}</span></div></TableCell>
                  <TableCell className="text-muted-foreground">{contact.company || "—"}</TableCell>
                  <TableCell><div className="flex items-center gap-1.5"><Heart className={cn("size-3", healthColor)} /><span className={cn("text-xs", healthColor)}>{healthLabel}</span></div></TableCell>
                  <TableCell className="capitalize text-muted-foreground">{currentStage.replaceAll("_", " ")}</TableCell>
                  <TableCell className="text-mono text-foreground">{dealValue > 0 ? formatCurrencyINR(dealValue) : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{ownerLabel(lastLead?.ownerId ?? customerDeals[0]?.ownerId ?? null, lastLead?.ownerName ?? customerDeals[0]?.ownerName ?? null)}</TableCell>
                  <TableCell className="text-muted-foreground">{lastLead ? formatRelativeTime(lastLead.lastActivityAt) : "—"}</TableCell>
                  <TableCell className="text-mono font-medium">{customerLeads.length}</TableCell>
                </TableRow>
              );
            }) : serverRows.map((row) => {
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
        {!demoMode && (
          <div className="flex gap-2 p-6">
            <Button size="sm" variant="ghost" onClick={() => { setAfterId("0"); customers.reload(); }}>First page</Button>
            <Button size="sm" variant="secondary" disabled={serverRows.length !== 50} onClick={() => setAfterId(serverRows.at(-1)!.contactId)}>Next page</Button>
          </div>
        )}
        </>
      )}
    </div>
  );
}
