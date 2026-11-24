"use client";
import Link from "next/link";
import { can } from "@/lib/permissions";
import { TeamToday } from "@/components/crm/team-today";
import { LostReasonsCard } from "@/components/crm/lost-reasons-card";
import { AlertTriangle, ArrowUpRight, RefreshCw, TrendingUp } from "lucide-react";
import { CuriousdevsLogo } from "@/components/shared/curiousdevs-logo";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSession } from "@/components/auth/session-provider";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api/use-api";
import { useAllRows } from "@/lib/api/use-all-rows";
import type { DashboardStats, DailyPoint, FunnelData, RepData, Deal, Lead, Source } from "@/lib/api/types";
import { followUpWords, isDue } from "@/components/crm/follow-up";
import { formatCurrencyINR, formatDateTime, formatRelativeTime } from "@/lib/utils";
import { sourceLabel, sourceMeta, sourceChartColor } from "@/lib/lead-sources";
import { SourceBadge } from "@/components/shared/source-badge";

export default function DashboardPage() {
  const session = useSession();
  const stats = useApi<DashboardStats>("/dashboard/stats?_=1");
  const daily = useApi<DailyPoint[]>("/dashboard/daily?days=180");
  const funnel = useApi<FunnelData[]>("/dashboard/funnel?days=30");
  const reps = useApi<RepData[]>("/dashboard/reps?days=30");
  const leads = useAllRows<Lead>("/leads?_=1");
  const deals = useAllRows<Deal>("/deals?_=1");
  const canViewSources =
    can(session, "sources:manage") &&
    Boolean(session.user.email_verified_at);
  const sources = useApi<Source[]>(
    canViewSources ? "/sources?limit=50&after_id=0" : null,
  );

  const leadRows = leads.data ?? [];
  const dealRows = deals.data ?? [];
  const openDeals = dealRows.filter((deal) => !["won", "lost"].includes(deal.stage));
  const openValue = openDeals.reduce((sum, deal) => sum + Number(deal.amount), 0);
  const biggest = [...openDeals].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
  const unanswered = [...leadRows].filter((lead) => lead.stage === "new" && lead.lastActivityAt === lead.createdAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).sort((a, b) => Number(b.source === "phone_call") - Number(a.source === "phone_call"))[0];
  const connectedSources = (sources.data ?? []).filter(
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
  const growthTrend = daily.data ? daily.data.map((d) => ({ month: d.date.slice(5), leads: d.leads, pipeline: Number(d.wonValue) })) : sixMonths(leadRows, dealRows);

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
              {[...leadRows].reverse().slice(0, 6).map((lead) => {
                const content = (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{lead.contactName || `Lead #${lead.id}`}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><SourceBadge source={lead.source} /> · {lead.stage}</p>
                  </div>
                );
                const row = <>{content}<span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(lead.lastActivityAt)}</span></>;
                return <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2">{row}</Link>;
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
                return <Link key={deal.id} href={`/deals/${deal.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2">{row}</Link>;
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
          <div className="flex items-center gap-2"><CuriousdevsLogo className="size-4 text-accent" /><h2 className="text-[13px] font-semibold">AI operating insights</h2></div>
          <p className="mt-1 text-[11px] text-muted-foreground">The next actions Janus would surface for the sales owner.</p>
          <div className="mt-4 space-y-3">
            {(() => {
              const due = leadRows.filter((lead) => isDue(lead.nextFollowUpOn) && !["won", "lost"].includes(lead.stage)).sort((a, b) => String(a.nextFollowUpOn).localeCompare(String(b.nextFollowUpOn)));
              return due.length ? <div className="rounded-md border border-warning/30 bg-warning-muted/30 p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{due.length} follow-up{due.length === 1 ? "" : "s"} due</p><Link href="/leads?workspace=crm-sales" className="text-[11px] font-medium text-accent hover:underline">All leads</Link></div>
                <ul className="mt-1.5 flex flex-col gap-1">{due.slice(0, 4).map((lead) => <li key={lead.id}><Link href={`/leads/${lead.id}`} className="flex items-center justify-between gap-2 text-[11px] hover:text-accent"><span className="truncate">{lead.contactName || lead.phone || `Lead #${lead.id}`}</span><span className="shrink-0 text-muted-foreground">{followUpWords(String(lead.nextFollowUpOn))}</span></Link></li>)}</ul>
              </div> : null;
            })()}
            {biggest ? <div className="rounded-md border border-accent/20 bg-accent-muted/30 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">Follow up with {biggest.customerName}</p><ArrowUpRight className="size-3.5 text-accent" /></div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{biggest.company} has {formatCurrencyINR(Number(biggest.amount))} in play ({biggest.name}, {biggest.stage}). Next best action: send the approved WhatsApp follow-up.</p></div> : null}
            {unanswered ? <div className="rounded-md border border-warning/30 bg-warning-muted/30 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{unanswered.source === "phone_call" ? "Return the missed call" : "Send a first reply"}</p><AlertTriangle className="size-3.5 text-warning" /></div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{unanswered.contactName}{unanswered.company ? ` (${unanswered.company})` : ""} is a new {unanswered.source.replace("_", " ")} lead with no first response recorded yet.</p></div> : null}
            <div className="rounded-md border border-border bg-surface-2 p-3"><p className="text-xs font-semibold">Pipeline focus</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{openDeals.length === 0 ? "There are no open deals yet. New enquiries will show up here as they become deals." : `${openDeals.length} open deal${openDeals.length === 1 ? "" : "s"} total ${formatCurrencyINR(openValue)}. Keep proposal follow-ups within two business days.`}</p></div>
          </div>
        </section>
      </div>
      {funnel.data && funnel.data.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-5">
          <div className="flex items-center gap-2"><TrendingUp className="size-4 text-info" /><h2 className="text-[13px] font-semibold">Pipeline funnel</h2></div>
          <p className="mt-1 text-[11px] text-muted-foreground">Lead distribution across stages (last 30 days).</p>
          <div className="mt-4 flex gap-1">
            {funnel.data.filter((s) => s.count > 0 || ["new", "contacted", "qualified", "converted", "lost"].includes(s.stage)).map((s) => {
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

      {reps.data && reps.data.length > 0 && (
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

      {leadRows.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center gap-2"><TrendingUp className="size-4 text-success" /><h2 className="text-[13px] font-semibold">Lead quality by source</h2></div>
            <p className="mt-1 text-[11px] text-muted-foreground">Source distribution and progression through the pipeline.</p>
            <div className="mt-4 space-y-2.5">
              {(() => {
                const bySource: Record<string, { total: number; qualified: number; won: number }> = {};
                for (const lead of leadRows) {
                  const src = lead.source || "unknown";
                  if (!bySource[src]) bySource[src] = { total: 0, qualified: 0, won: 0 };
                  bySource[src].total++;
                  if (["qualified", "converted", "won"].includes(lead.stage)) bySource[src].qualified++;
                  if (lead.stage === "won") bySource[src].won++;
                }
                const sorted = Object.entries(bySource).sort((a, b) => b[1].total - a[1].total).slice(0, 6);
                const maxTotal = Math.max(...sorted.map(([, v]) => v.total), 1);
                return sorted.map(([src, v]) => (
                  <div key={src} className="flex items-center gap-3">
                    <SourceBadge source={src} className="w-24 shrink-0" />
                    <div className="flex-1">
                      <div className="flex h-4 overflow-hidden rounded-full bg-surface-3">
                        <div className="bg-success/70 transition-all" style={{ width: `${(v.won / maxTotal) * 100}%` }} title={`${v.won} won`} />
                        <div className="bg-accent/50 transition-all" style={{ width: `${((v.qualified - v.won) / maxTotal) * 100}%` }} title={`${v.qualified - v.won} qualified`} />
                        <div className="bg-surface-3 transition-all" style={{ width: `${((v.total - v.qualified) / maxTotal) * 100}%` }} />
                      </div>
                    </div>
                    <div className="flex w-28 shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{v.total} leads</span>
                      <span className="text-success">{v.total > 0 ? Math.round((v.qualified / v.total) * 100) : 0}% qual</span>
                    </div>
                  </div>
                ));
              })()}
              <div className="flex items-center gap-4 pt-1.5 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-success/70" /> Won</span>
                <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-accent/50" /> Qualified</span>
                <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-surface-3" /> New/Contacted</span>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center gap-2"><CuriousdevsLogo className="size-4 text-info" /><h2 className="text-[13px] font-semibold">Follow-up effectiveness</h2></div>
            <p className="mt-1 text-[11px] text-muted-foreground">How quickly and consistently your team follows up on leads.</p>
            <div className="mt-4 space-y-3">
              {(() => {
                const withFollowUp = leadRows.filter((l) => l.nextFollowUpOn);
                const overdue = withFollowUp.filter((l) => isDue(l.nextFollowUpOn) && !["won", "lost"].includes(l.stage));
                const noActivity = leadRows.filter((l) => l.lastActivityAt === l.createdAt && !["won", "lost"].includes(l.stage));
                const totalActive = leadRows.filter((l) => !["won", "lost"].includes(l.stage)).length;
                const followUpRate = totalActive > 0 ? Math.round((withFollowUp.filter((l) => !["won", "lost"].includes(l.stage)).length / totalActive) * 100) : 0;
                return (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-md bg-surface-2/50 p-2.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Follow-up set</span>
                        <span className="mt-0.5 block text-lg font-bold">{followUpRate}%</span>
                      </div>
                      <div className="rounded-md bg-surface-2/50 p-2.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Overdue</span>
                        <span className="mt-0.5 block text-lg font-bold text-danger">{overdue.length}</span>
                      </div>
                      <div className="rounded-md bg-surface-2/50 p-2.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">No first reply</span>
                        <span className="mt-0.5 block text-lg font-bold text-warning">{noActivity.length}</span>
                      </div>
                      <div className="rounded-md bg-surface-2/50 p-2.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Active leads</span>
                        <span className="mt-0.5 block text-lg font-bold">{totalActive}</span>
                      </div>
                    </div>
                    {overdue.length > 0 && (
                      <div className="rounded-md border border-danger/20 bg-danger/5 p-2.5">
                        <p className="text-[11px] font-medium text-danger">{overdue.length} overdue follow-up{overdue.length === 1 ? "" : "s"} need attention</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Leads with missed follow-up dates tend to go cold within a week.</p>
                      </div>
                    )}
                    {noActivity.length > 0 && (
                      <div className="rounded-md border border-warning/20 bg-warning/5 p-2.5">
                        <p className="text-[11px] font-medium text-warning">{noActivity.length} lead{noActivity.length === 1 ? "" : "s"} with no first response</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">First response within 5 minutes increases conversion by 21x.</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </section>
        </div>
      )}

      {leadRows.length > 0 && (() => {
        const bySource: Record<string, number> = {};
        for (const lead of leadRows) { const src = lead.source || "unknown"; bySource[src] = (bySource[src] || 0) + 1; }
        const pieData = Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([src, count]) => ({ name: sourceLabel(src), value: count, source: src }));
        const total = leadRows.length;
        return (
          <section className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center gap-2"><TrendingUp className="size-4 text-accent" /><h2 className="text-[13px] font-semibold">Source distribution</h2></div>
            <p className="mt-1 text-[11px] text-muted-foreground">Where your leads are coming from across all channels.</p>
            <div className="mt-4 flex flex-wrap items-center gap-6">
              <div className="relative size-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={2} strokeWidth={0}>
                      {pieData.map((d) => <Cell key={d.source} fill={sourceChartColor(d.source)} />)}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} leads (${Math.round((Number(value) / total) * 100)}%)`, ""]} contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold">{total}</span>
                  <span className="text-[10px] text-muted-foreground">total leads</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {pieData.map((d) => (
                  <div key={d.source} className="flex items-center gap-1.5 text-xs">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: sourceChartColor(d.source) }} />
                    <span className="text-muted-foreground">{d.name}</span>
                    <span className="font-semibold">{d.value}</span>
                    <span className="text-[10px] text-muted-foreground">({Math.round((d.value / total) * 100)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })()}

      {(session.permissions.includes("*") || can(session, "leads:assign")) && <>
        <TeamToday leads={leadRows} deals={dealRows} />
        <LostReasonsCard />
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
