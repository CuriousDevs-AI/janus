"use client";

import Link from "next/link";
import { demoConnectedSources, demoDealRows, demoLeadRows } from "@/lib/api/demo-data";
import { monthlyLeads, stats as crm } from "@/lib/demo-universe";
import { AlertTriangle, ArrowUpRight, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSession } from "@/components/auth/session-provider";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api/use-api";
import type { Deal, Lead, Source } from "@/lib/api/types";
import { formatCurrencyINR, formatDateTime, formatRelativeTime } from "@/lib/utils";

function sourceLabel(source: string) {
  return source.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Leads per month and the pipeline those leads carry, from the shared demo company. */
const demoGrowthTrend = monthlyLeads.map((item) => ({ month: item.label, leads: item.leads, pipeline: Math.round(item.leads * (crm.pipeline / Math.max(1, crm.leads)) * (item.label === "Oct" ? 1 : 0.8)) }));

export default function DashboardPage() {
  const session = useSession();
  const leads = useApi<Lead[]>("/leads?limit=100&after_id=0");
  const deals = useApi<Deal[]>("/deals?limit=100&after_id=0");
  const canViewSources =
    session.permissions.includes("sources:manage") &&
    Boolean(session.user.email_verified_at);
  const sources = useApi<Source[]>(
    canViewSources ? "/sources?limit=50&after_id=0" : null,
  );

  const usingDemoLeads = Boolean(leads.error);
  const usingDemoDeals = Boolean(deals.error);
  const usingDemoSources = !canViewSources || Boolean(sources.error);
  const usingDemo = usingDemoLeads || usingDemoDeals || usingDemoSources;
  const leadRows = leads.data ?? (usingDemoLeads ? demoLeadRows : []);
  const dealRows = deals.data ?? (usingDemoDeals ? demoDealRows : []);
  const openDeals = dealRows.filter((deal) => !["won", "lost"].includes(deal.stage));
  const openValue = openDeals.reduce((sum, deal) => sum + Number(deal.amount), 0);
  const connectedSources = (sources.data ?? (usingDemoSources ? demoConnectedSources : [])).filter(
    (source) => source.status === "connected",
  );
  const refresh = () => {
    leads.reload();
    deals.reload();
    sources.reload();
  };
  const loading = leads.loading || deals.loading || sources.loading;
  const growthTrend = usingDemo ? demoGrowthTrend : [];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-6 py-6">
      <PageHeader
        title="CRM Overview"
        description={`Live CRM & Sales workspace for ${session.tenant.name}.`}
        actions={
          <div className="flex items-center gap-2">
            {usingDemo && <span className="rounded-none border border-warning/30 bg-warning-muted px-2.5 py-1 text-[11px] font-medium text-warning">Demo data</span>}
            <Button size="sm" variant="secondary" onClick={refresh} disabled={loading}>
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Leads captured" value={loading ? "…" : String(leadRows.length)} />
        <MetricCard label="Open deals" value={loading ? "…" : String(openDeals.length)} />
        <MetricCard label="Open pipeline" value={loading ? "…" : formatCurrencyINR(openValue)} />
        <MetricCard label="Connected sources" value={!sources.loading ? String(connectedSources.length) : "—"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-[13px] font-semibold">Recent leads</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">Newest enquiries from connected sources.</p>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/leads">View all</Link>
            </Button>
          </div>
          {loading && <p className="px-4 py-5 text-sm text-muted-foreground">Loading live data…</p>}
          {!loading && leadRows.length === 0 && (
            <div className="px-4 py-8 text-sm text-muted-foreground">
              No leads yet. Connect a source to capture the first enquiry.
            </div>
          )}
          {!loading && leadRows.length > 0 && (
            <div className="divide-y divide-border">
              {leadRows.slice(0, 6).map((lead) => {
                const content = (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{lead.contactName || `Lead #${lead.id}`}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{sourceLabel(lead.source)} · {lead.stage}</p>
                  </div>
                );
                const row = <>{content}<span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(lead.lastActivityAt)}</span></>;
                return usingDemoLeads ? <div key={lead.id} className="flex items-center justify-between gap-4 px-4 py-3">{row}</div> : <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2">{row}</Link>;
              })}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-[13px] font-semibold">Pipeline snapshot</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">Open deals and expected close dates.</p>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/deals">View deals</Link>
            </Button>
          </div>
          {!loading && openDeals.length === 0 && (
            <div className="px-4 py-8 text-sm text-muted-foreground">No open deals yet.</div>
          )}
          {!loading && openDeals.length > 0 && (
            <div className="divide-y divide-border">
              {openDeals.slice(0, 6).map((deal) => {
                const row = (
                  <>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{deal.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{deal.customerName} · {deal.stage}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">{formatCurrencyINR(Number(deal.amount))}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{deal.expectedCloseAt ? formatDateTime(deal.expectedCloseAt) : "No close date"}</p>
                    </div>
                  </>
                );
                return usingDemoDeals ? <div key={deal.id} className="flex items-center justify-between gap-4 px-4 py-3">{row}</div> : <Link key={deal.id} href={`/deals/${deal.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2">{row}</Link>;
              })}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-lg border border-border bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><TrendingUp className="size-4 text-accent" /><h2 className="text-[13px] font-semibold">Growth snapshot</h2></div>
              <p className="mt-1 text-[11px] text-muted-foreground">Lead volume and open pipeline movement over the last six months.</p>
            </div>
            {usingDemo && <span className="text-[11px] text-warning">Demo trend</span>}
          </div>
          {growthTrend.length > 0 ? (
            <div className="mt-5 h-64" role="img" aria-label="Six month lead and pipeline growth trend">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growthTrend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs><linearGradient id="dashboardPipeline" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} /><stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis yAxisId="pipeline" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(value) => `₹${Math.round(value / 100000)}L`} />
                  <YAxis yAxisId="leads" orientation="right" hide />
                  <Tooltip formatter={(value, name) => [name === "pipeline" ? formatCurrencyINR(Number(value)) : value, name === "pipeline" ? "Pipeline" : "Leads"]} contentStyle={{ borderRadius: 8, borderColor: "var(--border)", background: "var(--surface)", fontSize: 12 }} />
                  <Area yAxisId="pipeline" type="monotone" dataKey="pipeline" stroke="var(--accent)" strokeWidth={2.5} fill="url(#dashboardPipeline)" />
                  <Area yAxisId="leads" type="monotone" dataKey="leads" stroke="var(--success)" strokeWidth={2} fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="mt-5 flex h-64 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">Trend charts will populate from connected CRM records.</div>}
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <div className="flex items-center gap-2"><Sparkles className="size-4 text-accent" /><h2 className="text-[13px] font-semibold">AI operating insights</h2></div>
          <p className="mt-1 text-[11px] text-muted-foreground">The next actions Janus would surface for the sales owner.</p>
          <div className="mt-4 space-y-3">
            <div className="rounded-md border border-accent/20 bg-accent-muted/30 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">Follow up with Riya Kapoor</p><ArrowUpRight className="size-3.5 text-accent" /></div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Qualified website lead with ₹4.8L potential. Next best action: send the approved WhatsApp follow-up.</p></div>
            <div className="rounded-md border border-warning/30 bg-warning-muted/30 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">Respond to the missed call</p><AlertTriangle className="size-3.5 text-warning" /></div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Amit Shah is a new phone lead with no first response recorded yet.</p></div>
            <div className="rounded-md border border-border bg-surface-2 p-3"><p className="text-xs font-semibold">Pipeline focus</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Two open deals total ₹7.5L. Keep proposal follow-ups within two business days.</p></div>
          </div>
        </section>
      </div>
    </div>
  );
}
