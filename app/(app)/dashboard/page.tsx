"use client";
import { demoMode } from "@/lib/demo-mode";

import Link from "next/link";
import { can } from "@/lib/permissions";
import { TeamToday } from "@/components/crm/team-today";
import { LostReasonsCard } from "@/components/crm/lost-reasons-card";
import { demoConnectedSources, demoDealRows, demoLeadRows } from "@/lib/api/demo-data";
import { lakh, monthlyLeads, stats as crm } from "@/lib/demo-universe";
import { AlertTriangle, ArrowUpRight, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSession } from "@/components/auth/session-provider";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api/use-api";
import { useAllRows } from "@/lib/api/use-all-rows";
import type { DashboardStats, DailyPoint, FunnelData, RepData, Deal, Lead, Source } from "@/lib/api/types";
import { followUpWords, isDue } from "@/components/crm/follow-up";
import { formatCurrencyINR, formatDateTime, formatRelativeTime } from "@/lib/utils";

function sourceLabel(source: string) {
  return source.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Leads per month and the pipeline those leads carry, from the shared demo company. */
const demoGrowthTrend = monthlyLeads.map((item) => ({ month: item.label, leads: item.leads, pipeline: Math.round(item.leads * (crm.pipeline / Math.max(1, crm.leads)) * (item.label === "Oct" ? 1 : 0.8)) }));

export default function DashboardPage() {
  const session = useSession();
  const stats = useApi<DashboardStats>(!demoMode ? "/dashboard/stats" : null);
  const daily = useApi<DailyPoint[]>(!demoMode ? "/dashboard/daily?days=180" : null);
  const funnel = useApi<FunnelData[]>(!demoMode ? "/dashboard/funnel?days=30" : null);
  const reps = useApi<RepData[]>(!demoMode ? "/dashboard/reps?days=30" : null);
  const leads = useAllRows<Lead>("/leads");
  const deals = useAllRows<Deal>("/deals");
  const canViewSources =
    can(session, "sources:manage") &&
    Boolean(session.user.email_verified_at);
  const sources = useApi<Source[]>(
    canViewSources ? "/sources?limit=50&after_id=0" : null,
  );

  const usingDemoLeads = demoMode;
  const usingDemoDeals = demoMode;
  const usingDemoSources = demoMode;
  const usingDemo = demoMode;
  const leadRows = leads.data ?? (usingDemoLeads ? demoLeadRows : []);
  const dealRows = deals.data ?? (usingDemoDeals ? demoDealRows : []);
  const openDeals = dealRows.filter((deal) => !["won", "lost"].includes(deal.stage));
  const openValue = openDeals.reduce((sum, deal) => sum + Number(deal.amount), 0);
  const biggest = [...openDeals].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
  const unanswered = [...leadRows].filter((lead) => lead.stage === "new" && lead.lastActivityAt === lead.createdAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).sort((a, b) => Number(b.source === "phone_call") - Number(a.source === "phone_call"))[0];
  const connectedSources = (sources.data ?? (usingDemoSources ? demoConnectedSources : [])).filter(
    (source) => source.status === "connected",
  );
  const refresh = () => {
    stats.reload();
    daily.reload();
    funnel.reload();
    reps.reload();
    leads.reload();
    deals.reload();
    sources.reload();
  };
  const loading = stats.loading || leads.loading || deals.loading || sources.loading;
  const growthTrend = usingDemo ? demoGrowthTrend : daily.data ? daily.data.map((d) => ({ month: d.date.slice(5), leads: d.leads, pipeline: Number(d.wonValue) })) : sixMonths(leadRows, dealRows);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-6 py-6">
      <PageHeader
        title="CRM Overview"
        description={`Live CRM & Sales workspace for ${session.tenant.name}.`}
        actions={
          <div className="flex items-center gap-2">
            
            <Button size="sm" variant="secondary" onClick={refresh} disabled={loading}>
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Leads captured" value={loading ? "…" : String(stats.data?.totalLeads ?? leadRows.length)} />
        <MetricCard label="Open deals" value={loading ? "…" : String(stats.data?.openDeals ?? openDeals.length)} />
        <MetricCard label="Open pipeline" value={loading ? "…" : formatCurrencyINR(Number(stats.data?.pipelineValue ?? openValue))} />
        <MetricCard label="Won this period" value={loading ? "…" : stats.data ? `${stats.data.wonDeals} · ${formatCurrencyINR(Number(stats.data.wonValue))}` : String(connectedSources.length)} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="New today" value={loading ? "…" : String(stats.data?.newLeadsToday ?? "—")} />
        <MetricCard label="New this week" value={loading ? "…" : String(stats.data?.newLeadsWeek ?? "—")} />
        <MetricCard label="Conversion rate" value={loading ? "…" : stats.data?.conversionRate ? `${stats.data.conversionRate}%` : "—"} />
        <MetricCard label="Avg cycle (days)" value={loading ? "…" : stats.data?.avgCycleDays ?? "—"} />
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
          {leadRows.length === 0 && (
            <div className="min-h-[200px] px-4 py-8 text-sm text-muted-foreground">
              {loading ? "Loading live data…" : "No leads yet. Connect a source to capture the first enquiry."}
            </div>
          )}
          {leadRows.length > 0 && (
            <div className="min-h-[200px] divide-y divide-border">
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
              <p className="mt-1 text-[11px] text-muted-foreground">Leads that came in each month, and the value of the deals opened, over the last six months.</p>
            </div>
            
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
                  <Tooltip formatter={(value, name) => [name === "pipeline" ? formatCurrencyINR(Number(value)) : value, name === "pipeline" ? "Deals opened" : "Leads"]} contentStyle={{ borderRadius: 8, borderColor: "var(--border)", background: "var(--surface)", fontSize: 12 }} />
                  <Area yAxisId="pipeline" type="monotone" dataKey="pipeline" stroke="var(--accent)" strokeWidth={2.5} fill="url(#dashboardPipeline)" />
                  <Area yAxisId="leads" type="monotone" dataKey="leads" stroke="var(--success)" strokeWidth={2} fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="mt-5 flex h-64 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">No leads or deals yet. Each month fills in as they come in.</div>}
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <div className="flex items-center gap-2"><Sparkles className="size-4 text-accent" /><h2 className="text-[13px] font-semibold">AI operating insights</h2></div>
          <p className="mt-1 text-[11px] text-muted-foreground">The next actions Janus would surface for the sales owner.</p>
          <div className="mt-4 space-y-3">
            {(() => {
              const due = leadRows.filter((lead) => isDue(lead.nextFollowUpOn) && !["won", "lost"].includes(lead.stage)).sort((a, b) => String(a.nextFollowUpOn).localeCompare(String(b.nextFollowUpOn)));
              return due.length ? <div className="rounded-md border border-warning/30 bg-warning-muted/30 p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{due.length} follow-up{due.length === 1 ? "" : "s"} due</p><Link href="/leads?workspace=crm-sales" className="text-[11px] font-medium text-accent hover:underline">All leads</Link></div>
                <ul className="mt-1.5 flex flex-col gap-1">{due.slice(0, 4).map((lead) => <li key={lead.id}><Link href={`/leads/${lead.id}`} className="flex items-center justify-between gap-2 text-[11px] hover:text-accent"><span className="truncate">{lead.contactName || lead.phone || `Lead #${lead.id}`}</span><span className="shrink-0 text-muted-foreground">{followUpWords(String(lead.nextFollowUpOn))}</span></Link></li>)}</ul>
              </div> : null;
            })()}
            {biggest ? <div className="rounded-md border border-accent/20 bg-accent-muted/30 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">Follow up with {biggest.customerName}</p><ArrowUpRight className="size-3.5 text-accent" /></div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{biggest.company} has {lakh(Number(biggest.amount))} in play ({biggest.name}, {biggest.stage}). Next best action: send the approved WhatsApp follow-up.</p></div> : null}
            {unanswered ? <div className="rounded-md border border-warning/30 bg-warning-muted/30 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{unanswered.source === "phone_call" ? "Return the missed call" : "Send a first reply"}</p><AlertTriangle className="size-3.5 text-warning" /></div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{unanswered.contactName}{unanswered.company ? ` (${unanswered.company})` : ""} is a new {unanswered.source.replace("_", " ")} lead with no first response recorded yet.</p></div> : null}
            <div className="rounded-md border border-border bg-surface-2 p-3"><p className="text-xs font-semibold">Pipeline focus</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{openDeals.length === 0 ? "There are no open deals yet. New enquiries will show up here as they become deals." : `${openDeals.length} open deal${openDeals.length === 1 ? "" : "s"} total ${lakh(openValue)}. Keep proposal follow-ups within two business days.`}</p></div>
          </div>
        </section>
      </div>
      {!demoMode && funnel.data && funnel.data.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-5">
          <div className="flex items-center gap-2"><TrendingUp className="size-4 text-info" /><h2 className="text-[13px] font-semibold">Pipeline funnel</h2></div>
          <p className="mt-1 text-[11px] text-muted-foreground">Lead distribution across stages (last 30 days).</p>
          <div className="mt-4 flex gap-1">
            {funnel.data.filter((s) => s.count > 0 || ["new", "contacted", "qualified", "won", "lost"].includes(s.stage)).map((s) => {
              const maxCount = Math.max(...funnel.data!.map((f) => f.count), 1);
              return (
                <div key={s.stage} className="min-w-0 flex-1 text-center">
                  <div className="mx-auto h-24 w-full max-w-12 rounded-t bg-surface-3 relative">
                    <div className="absolute bottom-0 w-full rounded-t bg-accent transition-all" style={{ height: `${(s.count / maxCount) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-mono text-sm font-semibold">{s.count}</p>
                  <p className="text-[10px] text-muted-foreground capitalize truncate">{s.stage}</p>
                  <p className="text-[10px] text-muted-foreground">{formatCurrencyINR(Number(s.value))}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!demoMode && reps.data && reps.data.length > 0 && (
        <section className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-[13px] font-semibold">Rep leaderboard</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">Performance by sales rep over the last 30 days.</p>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="px-4 py-2 text-left font-medium">Rep</th><th className="px-4 py-2 text-right font-medium">Leads</th><th className="px-4 py-2 text-right font-medium">Open</th><th className="px-4 py-2 text-right font-medium">Won</th><th className="px-4 py-2 text-right font-medium">Won value</th><th className="px-4 py-2 text-right font-medium">Conv %</th></tr></thead>
              <tbody className="divide-y divide-border">
                {reps.data.map((rep) => (
                  <tr key={rep.ownerId ?? "unassigned"} className="hover:bg-surface-2">
                    <td className="px-4 py-2.5 font-medium">{rep.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{rep.leads}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{rep.openLeads}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{rep.wonDeals}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrencyINR(Number(rep.wonValue))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{rep.conversionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(session.permissions.includes("*") || can(session, "leads:assign")) && <>
        <TeamToday leads={leadRows} deals={dealRows} />
        {!demoMode && <LostReasonsCard />}
      </>}
    </div>
  );
}

/** The last six months from the records on this page: leads that came in, and the value of deals opened. */
function sixMonths(leads: Lead[], deals: Deal[]) {
  const monthOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 15);
    return { key: date.toLocaleDateString("en-CA").slice(0, 7), month: date.toLocaleDateString("en-IN", { month: "short" }) };
  });
  if (!leads.length && !deals.length) return [];
  return months.map(({ key, month }) => ({
    month,
    leads: leads.filter((lead) => monthOf(lead.createdAt) === key).length,
    pipeline: deals.filter((deal) => monthOf(deal.createdAt) === key).reduce((sum, deal) => sum + Number(deal.amount), 0),
  }));
}
