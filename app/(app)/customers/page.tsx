"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { formatCurrencyINR, formatRelativeTime } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { Building2, RefreshCw } from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import type { Contact, Deal, Lead } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { demoDealRows, demoLeadRows } from "@/lib/api/demo-data";

type Filter = "all" | "active" | "won" | "needs_attention";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "won", label: "Won" },
  { key: "needs_attention", label: "Needs attention" },
];

type CustomerRow = {
  contact: Contact;
  leads: Lead[];
  deals: Deal[];
};

function displayName(contact: Contact) {
  return contact.name || contact.phone || contact.email || `Customer #${contact.id}`;
}

function ownerLabel(ownerId: string | null, ownerName: string | null) {
  return ownerName || (ownerId ? `Member #${ownerId}` : "Unassigned");
}

const stageOrder = ["lost", "new", "contacted", "qualified", "demo", "proposal", "negotiation", "approval", "won"];

export default function CustomersPage() {
  const router = useRouter();
  const leads = useApi<Lead[]>("/leads?limit=100&after_id=0");
  const deals = useApi<Deal[]>("/deals?limit=100&after_id=0");
  const usingDemo = Boolean(leads.error || deals.error);
  const leadRows = React.useMemo(() => leads.data ?? (leads.error ? demoLeadRows : []), [leads.data, leads.error]);
  const dealRows = React.useMemo(() => deals.data ?? (deals.error ? demoDealRows : []), [deals.data, deals.error]);

  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");

  const rows = React.useMemo<CustomerRow[]>(() => {
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
        id: lead.customerId,
        name: lead.contactName,
        phone: lead.phone,
        email: lead.email,
        company: lead.company,
        whatsappOptIn: lead.whatsappOptIn,
        doNotContact: lead.doNotContact,
        consentSource: lead.consentSource,
        consentUpdatedAt: lead.consentUpdatedAt,
      });
    }
    return [...contacts.values()].map((contact) => ({
      contact,
      leads: leadsByContact.get(contact.id) ?? [],
      deals: dealsByContact.get(contact.id) ?? [],
    }));
  }, [dealRows, leadRows]);

  const visibleRows = rows
    .filter(({ leads: customerLeads, deals: customerDeals }) => {
      if (filter === "all") return true;
      if (filter === "active") return customerLeads.some((lead) => !["won", "lost"].includes(lead.stage));
      if (filter === "won") return customerDeals.some((deal) => deal.stage === "won") || customerLeads.some((lead) => lead.stage === "won");
      return customerLeads.some((lead) => {
        const age = Date.now() - new Date(lead.lastActivityAt).getTime();
        return age > 3 * 24 * 60 * 60 * 1000 && !["won", "lost"].includes(lead.stage);
      });
    })
    .filter(({ contact }) => {
      if (!query) return true;
      const normalized = query.toLowerCase();
      return [contact.name, contact.phone, contact.email, contact.company]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized));
    })
    .sort((a, b) => {
      const aLast = Math.max(...a.leads.map((lead) => new Date(lead.lastActivityAt).getTime()), 0);
      const bLast = Math.max(...b.leads.map((lead) => new Date(lead.lastActivityAt).getTime()), 0);
      return bLast - aLast;
    });

  const loading = leads.loading || deals.loading;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <PageHeader
        title="Customers"
        description={loading ? "Loading live CRM records…" : `${visibleRows.length} of ${rows.length} customer records`}
        actions={
          <div className="flex items-center gap-2">
            
            <Button size="sm" variant="secondary" onClick={() => { leads.reload(); deals.reload(); }} disabled={loading}>
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

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
      {loading && !usingDemo && <p role="status" className="px-6 py-6 text-sm text-muted-foreground">Loading live leads and deals…</p>}

      {!loading && visibleRows.length === 0 ? (
        <div className="px-6 py-6">
          <EmptyState icon={Building2} title="No live customer records match" description="Connect a lead source or try a different filter or search term." />
        </div>
      ) : !loading && (
        <>
        <p className="px-6 pt-3 text-xs text-muted-foreground md:hidden">Swipe the table sideways to see more columns.</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>CRM stage</TableHead>
              <TableHead>Deal Value</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Last activity</TableHead>
              <TableHead>Leads</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map(({ contact, leads: customerLeads, deals: customerDeals }) => {
              const dealValue = customerDeals.filter((deal) => deal.stage !== "lost").reduce((sum, deal) => sum + Number(deal.amount), 0);
              const lastLead = [...customerLeads].sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1))[0];
              // A customer is as far along as their most advanced enquiry, not just the newest one.
              const furthest = [...customerLeads].sort((a, b) => stageOrder.indexOf(b.stage) - stageOrder.indexOf(a.stage))[0];
              const currentStage = furthest?.stage ?? "new";
              return (
                <TableRow key={contact.id} className={usingDemo ? "" : "cursor-pointer"} onClick={usingDemo ? undefined : () => router.push(`/customers/${contact.id}`)}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CustomerAvatar name={displayName(contact)} color="#4169e1" size="sm" />
                      <span className="font-medium text-foreground">{displayName(contact)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{contact.company || "—"}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{currentStage.replaceAll("_", " ")}</TableCell>
                  <TableCell className="text-mono text-foreground">{dealValue > 0 ? formatCurrencyINR(dealValue) : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{ownerLabel(lastLead?.ownerId ?? customerDeals[0]?.ownerId ?? null, lastLead?.ownerName ?? customerDeals[0]?.ownerName ?? null)}</TableCell>
                  <TableCell className="text-muted-foreground">{lastLead ? formatRelativeTime(lastLead.lastActivityAt) : "—"}</TableCell>
                  <TableCell className="text-mono font-medium">{customerLeads.length}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </>
      )}
    </div>
  );
}
