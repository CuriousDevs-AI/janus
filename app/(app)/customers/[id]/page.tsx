"use client";
import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, CalendarClock, ChevronRight, CircleDollarSign, Mail, Pencil, Phone, RefreshCw, UserRound } from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import { api, message } from "@/lib/api/client";
import type { Contact, Deal, Lead, WhatsAppConversation } from "@/lib/api/types";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrencyINR, formatDateTime, formatRelativeTime } from "@/lib/utils";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayName(contact: Contact) {
  return contact.name || contact.phone || contact.email || `Customer #${contact.id}`;
}

type TimelineEvent = {
  id: string;
  title: string;
  detail: string;
  at: string;
  href?: string;
};

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const contact = useApi<Contact>(`/contacts/${encodeURIComponent(id)}`);
  const leads = useApi<Lead[]>(contact.data ? "/leads?limit=100&after_id=0" : null);
  const deals = useApi<Deal[]>(contact.data ? "/deals?limit=100&after_id=0" : null);
  const conversations = useApi<WhatsAppConversation[]>(
    contact.data ? "/whatsapp/conversations?limit=100&before_id=0" : null,
  );
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", company: "" });
  const [saveError, setSaveError] = useState("");
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentError, setConsentError] = useState("");
  const customerLeads = (leads.data ?? []).filter((lead) => lead.customerId === id);
  const customerDeals = (deals.data ?? []).filter((deal) => deal.customerId === id);
  const customerConversations = (conversations.data ?? []).filter(
    (conversation) => conversation.contactId === id,
  );
  const timeline = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = customerLeads.flatMap((lead) => [
      {
        id: `lead-created-${lead.id}`,
        title: "Lead captured",
        detail: `${label(lead.source)} source · ${label(lead.stage)} stage`,
        at: lead.createdAt,
        href: `/leads/${lead.id}`,
      },
      ...(lead.lastActivityAt !== lead.createdAt
        ? [{
            id: `lead-activity-${lead.id}`,
            title: "Lead activity updated",
            detail: `Current stage: ${label(lead.stage)}`,
            at: lead.lastActivityAt,
            href: `/leads/${lead.id}`,
          }]
        : []),
    ]);
    for (const deal of customerDeals) {
      events.push({
        id: `deal-created-${deal.id}`,
        title: "Deal added",
        detail: `${deal.name} · ${formatCurrencyINR(Number(deal.amount))} · ${label(deal.stage)}`,
        at: deal.createdAt,
        href: `/deals/${deal.id}`,
      });
      if (deal.updatedAt !== deal.createdAt) {
        events.push({
          id: `deal-updated-${deal.id}`,
          title: "Deal updated",
          detail: `${deal.name} · ${label(deal.stage)}`,
          at: deal.updatedAt,
          href: `/deals/${deal.id}`,
        });
      }
    }
    for (const conversation of customerConversations) {
      events.push({
        id: `conversation-${conversation.id}`,
        title: "WhatsApp conversation updated",
        detail: conversation.lastInboundAt ? "Latest inbound message received" : "Latest outbound message sent",
        at: conversation.lastMessageAt,
        href: `/inbox?c=${conversation.id}`,
      });
    }
    return events.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [customerConversations, customerDeals, customerLeads]);

  const reload = () => {
    contact.reload();
    leads.reload();
    deals.reload();
    conversations.reload();
  };

  function openEdit() {
    if (!contact.data) return;
    setForm({ name: contact.data.name, phone: contact.data.phone ?? "", email: contact.data.email ?? "", company: contact.data.company });
    setSaveError("");
    setEditing(true);
  }

  async function saveContact() {
    if (!contact.data) return;
    setSaving(true);
    setSaveError("");
    try {
      await api<Contact>(`/contacts/${encodeURIComponent(contact.data.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ ...form, phone: form.phone.trim() || null, email: form.email.trim() || null }),
      });
      setEditing(false);
      contact.reload();
      leads.reload();
      deals.reload();
    } catch (error) {
      setSaveError(message(error));
    } finally {
      setSaving(false);
    }
  }

  async function updateConsent(next: { whatsappOptIn: boolean; doNotContact: boolean }) {
    if (!contact.data) return;
    setConsentSaving(true);
    setConsentError("");
    try {
      await api<Contact>(`/contacts/${encodeURIComponent(contact.data.id)}/consent`, {
        method: "PATCH",
        body: JSON.stringify({ ...next, consentSource: "customer_record" }),
      });
      contact.reload();
    } catch (error) {
      setConsentError(message(error));
    } finally {
      setConsentSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-6">
      <PageHeader
        title={contact.data ? displayName(contact.data) : "Customer record"}
        description="Live CRM context from connected leads and deals."
        actions={<Button size="sm" variant="secondary" onClick={reload}><RefreshCw className="size-3.5" />Refresh</Button>}
      />
      {contact.data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Leads</p><p className="mt-1 text-2xl font-semibold">{customerLeads.length}</p><p className="mt-1 text-xs text-muted-foreground">Captured enquiries</p></div>
            <div className="rounded-lg border border-border bg-surface p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Deals</p><p className="mt-1 text-2xl font-semibold">{customerDeals.length}</p><p className="mt-1 text-xs text-muted-foreground">Linked opportunities</p></div>
            <div className="rounded-lg border border-border bg-surface p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Open value</p><p className="mt-1 text-2xl font-semibold">{formatCurrencyINR(customerDeals.filter((deal) => !["won", "lost"].includes(deal.stage)).reduce((sum, deal) => sum + Number(deal.amount), 0))}</p><p className="mt-1 text-xs text-muted-foreground">Live pipeline total</p></div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <main className="flex min-w-0 flex-col gap-5">
              <section className="rounded-lg border border-border bg-surface p-5">
                <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Customer timeline</h2><p className="mt-1 text-xs text-muted-foreground">Lead and deal events linked to this contact.</p></div><CalendarClock className="size-4 text-accent" /></div>
                {(leads.loading || deals.loading || conversations.loading) && <p role="status" className="mt-5 text-sm text-muted-foreground">Loading related CRM activity…</p>}
                {(leads.error || deals.error || conversations.error) && <p role="alert" className="mt-5 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">Some related CRM activity is unavailable. Refresh to try again; the records shown below may be incomplete.</p>}
                {!leads.loading && !deals.loading && !conversations.loading && !leads.error && !deals.error && !conversations.error && timeline.length === 0 && <p className="mt-5 text-sm text-muted-foreground">No linked lead, deal or conversation activity yet.</p>}
                <ol className="mt-5 space-y-4">
                  {timeline.map((event) => <li key={event.id} className="relative flex gap-3 border-l border-border pl-4"><span className="absolute -left-1.5 top-1 size-2.5 rounded-full bg-accent" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-medium">{event.href ? <Link href={event.href} className="hover:text-accent">{event.title}<ChevronRight className="ml-1 inline size-3" /></Link> : event.title}</p><time className="text-[11px] text-muted-foreground">{formatDateTime(event.at)}</time></div><p className="mt-1 text-xs text-muted-foreground">{event.detail} · {formatRelativeTime(event.at)}</p></div></li>)}
                </ol>
              </section>

              <section className="rounded-lg border border-border bg-surface p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Linked deals</h2><p className="mt-1 text-xs text-muted-foreground">Open, won and lost opportunities for this customer.</p></div><CircleDollarSign className="size-4 text-success" /></div>{customerDeals.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">No deals linked yet.</p> : <div className="mt-4 divide-y divide-border">{customerDeals.map((deal) => <Link key={deal.id} href={`/deals/${deal.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-accent"><span className="min-w-0"><span className="block truncate text-sm font-medium">{deal.name}</span><span className="mt-1 block text-xs text-muted-foreground">{label(deal.stage)} · Updated {formatRelativeTime(deal.updatedAt)}</span></span><span className="shrink-0 text-sm font-semibold">{formatCurrencyINR(Number(deal.amount))}</span></Link>)}</div>}</section>
            </main>

            <aside className="flex min-w-0 flex-col gap-5">
              <section className="rounded-lg border border-border bg-surface p-5"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><UserRound className="size-4 text-accent" /><h2 className="text-sm font-semibold">Contact details</h2></div><Button size="icon" variant="ghost" aria-label="Edit contact" onClick={openEdit}><Pencil className="size-3.5" /></Button></div><dl className="mt-4 space-y-4 text-sm"><div><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Company</dt><dd className="mt-1 flex items-center gap-1.5">{contact.data.company ? <><Building2 className="size-3.5 text-muted-foreground" />{contact.data.company}</> : "—"}</dd></div><div><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Phone</dt><dd className="mt-1">{contact.data.phone ? <a href={`tel:${contact.data.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 text-accent hover:underline"><Phone className="size-3.5" />{contact.data.phone}</a> : "—"}</dd></div><div><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</dt><dd className="mt-1 break-all">{contact.data.email ? <a href={`mailto:${encodeURIComponent(contact.data.email)}`} className="inline-flex items-center gap-1.5 text-accent hover:underline"><Mail className="size-3.5 shrink-0" />{contact.data.email}</a> : "—"}</dd></div><div><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Customer ID</dt><dd className="mt-1 font-mono text-xs">{contact.data.id}</dd></div></dl></section>
              <section className="rounded-lg border border-border bg-surface p-5"><h2 className="text-sm font-semibold">Communication consent</h2><p className="mt-1 text-xs text-muted-foreground">Control outbound WhatsApp eligibility and suppression for this customer.</p><div className="mt-4 space-y-3 text-sm"><label className="flex items-start gap-2"><input type="checkbox" checked={contact.data.whatsappOptIn} disabled={consentSaving || contact.data.doNotContact} onChange={(event) => void updateConsent({ whatsappOptIn: event.target.checked, doNotContact: false })} /><span><span className="block font-medium">WhatsApp opt-in</span><span className="block text-xs text-muted-foreground">Required for template messages.</span></span></label><label className="flex items-start gap-2"><input type="checkbox" checked={contact.data.doNotContact} disabled={consentSaving} onChange={(event) => void updateConsent({ whatsappOptIn: event.target.checked ? false : (contact.data?.whatsappOptIn ?? false), doNotContact: event.target.checked })} /><span><span className="block font-medium">Do not contact</span><span className="block text-xs text-muted-foreground">Blocks all outbound communication.</span></span></label></div>{contact.data.consentSource && <p className="mt-3 text-[11px] text-muted-foreground">Recorded from {contact.data.consentSource} · {formatDateTime(contact.data.consentUpdatedAt ?? "")}</p>}{consentError && <p role="alert" className="mt-3 text-xs text-danger">{consentError}</p>}</section>
              <section className="rounded-lg border border-border bg-surface p-5"><h2 className="text-sm font-semibold">Linked leads</h2>{customerLeads.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No linked leads.</p> : <div className="mt-3 space-y-2">{customerLeads.map((lead) => <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs hover:border-accent-border hover:bg-accent-muted"><span>Lead #{lead.id} · {label(lead.stage)}</span><Badge variant="neutral">{label(lead.source)}</Badge></Link>)}</div>}</section>
              <section className="rounded-lg border border-border bg-surface p-5"><h2 className="text-sm font-semibold">WhatsApp conversations</h2>{customerConversations.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No connected WhatsApp conversation yet.</p> : <div className="mt-3 space-y-2">{customerConversations.map((conversation) => <Link key={conversation.id} href={`/inbox?c=${conversation.id}`} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs hover:border-accent-border hover:bg-accent-muted"><span>Conversation · {formatRelativeTime(conversation.lastMessageAt)}</span><ChevronRight className="size-3.5 text-muted-foreground" /></Link>)}</div>}</section>
            </aside>
          </div>
        </>
      ) : (
        <p role={contact.error ? "alert" : "status"} className={contact.error ? "text-sm text-danger" : "text-sm"}>{contact.error || "Loading customer…"}</p>
      )}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit contact</DialogTitle><DialogDescription>Update the shared customer record used by linked leads and deals.</DialogDescription></DialogHeader>
          <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void saveContact(); }}>
            <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="customer-name">Name</Label><Input id="customer-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div><div className="grid gap-1.5"><Label htmlFor="customer-company">Company</Label><Input id="customer-company" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></div></div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="customer-phone">Phone</Label><Input id="customer-phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div><div className="grid gap-1.5"><Label htmlFor="customer-email">Email</Label><Input id="customer-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div></div>
            {saveError && <p role="alert" className="text-xs text-danger">{saveError}</p>}
            <DialogFooter><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save contact"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
