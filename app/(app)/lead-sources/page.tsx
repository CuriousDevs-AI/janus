"use client";
import Link from "next/link";
import { can } from "@/lib/permissions";
import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, FileSpreadsheet, Globe, IndianRupee, Key, Lock, MessageCircle, Phone, Plus, Settings2, Star, Target, TrendingUp, Users, Webhook } from "lucide-react";
import { useSession } from "@/components/auth/session-provider";
import { useApi } from "@/lib/api/use-api";
import type { Source } from "@/lib/api/types";
import { sourceKindLabel, sourceOptions } from "@/lib/lead-source-options";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDateTime, cn } from "@/lib/utils";

type ViewTab = "sources" | "performance";

interface SourcePerf {
  sourceId: string;
  name: string;
  kind: string;
  leads: number;
  qualified: number;
  converted: number;
  conversionRate: number;
  qualificationRate: number;
  avgResponseTime: string;
  costPerLead: number;
  revenue: number;
  roi: number;
  qualityScore: number;
  trend: "up" | "down" | "flat";
}


function QualityBar({ score }: { score: number }) {
  const color = score >= 85 ? "bg-emerald-500" : score >= 70 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium">{score}</span>
    </div>
  );
}

function SourcePerformanceView({ data }: { data: SourcePerf[] }) {
  const [sort, setSort] = useState<"leads" | "conversionRate" | "qualityScore" | "roi">("qualityScore");
  const sorted = [...data].sort((a, b) => b[sort] - a[sort]);

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source comparison</h2>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Sort by:
            {(["qualityScore", "conversionRate", "leads", "roi"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setSort(k)} className={cn("rounded-md px-2 py-0.5 text-xs transition-colors", sort === k ? "bg-accent text-white" : "hover:bg-surface-2")}>
                {k === "qualityScore" ? "Quality" : k === "conversionRate" ? "Conversion" : k === "leads" ? "Volume" : "ROI"}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Qualified</TableHead>
                <TableHead className="text-right">Converted</TableHead>
                <TableHead className="text-right">Conv. Rate</TableHead>
                <TableHead className="text-right">Avg Response</TableHead>
                <TableHead className="text-right">Cost/Lead</TableHead>
                <TableHead className="text-right">ROI</TableHead>
                <TableHead>Quality</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((s) => (
                <TableRow key={s.sourceId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{s.name}</span>
                      {s.trend === "up" && <ArrowUpRight className="size-3 text-success" />}
                      {s.trend === "down" && <ArrowDownRight className="size-3 text-danger" />}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{s.kind}</span>
                  </TableCell>
                  <TableCell className="text-right font-medium">{s.leads}</TableCell>
                  <TableCell className="text-right">{s.qualified}<span className="ml-1 text-[10px] text-muted-foreground">({s.qualificationRate}%)</span></TableCell>
                  <TableCell className="text-right font-medium">{s.converted}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={s.conversionRate >= 25 ? "success" : s.conversionRate >= 15 ? "warning" : "danger"}>
                      {s.conversionRate}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{s.avgResponseTime}</TableCell>
                  <TableCell className="text-right">₹{s.costPerLead}</TableCell>
                  <TableCell className="text-right">
                    <span className={cn("font-medium", s.roi >= 8 ? "text-success" : "text-foreground")}>{s.roi}x</span>
                  </TableCell>
                  <TableCell><QualityBar score={s.qualityScore} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source quality breakdown</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {sorted.map((s) => (
            <article key={s.sourceId} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{s.name}</span>
                <Badge variant={s.qualityScore >= 85 ? "success" : s.qualityScore >= 70 ? "warning" : "danger"}>
                  {s.qualityScore >= 85 ? "Excellent" : s.qualityScore >= 70 ? "Good" : "Needs work"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Qualification</p>
                  <p className="mt-0.5 text-lg font-semibold">{s.qualificationRate}%</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Conversion</p>
                  <p className="mt-0.5 text-lg font-semibold">{s.conversionRate}%</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Revenue</p>
                  <p className="mt-0.5 text-sm font-semibold">₹{(s.revenue / 100000).toFixed(1)}L</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Response</p>
                  <p className="mt-0.5 text-sm font-semibold">{s.avgResponseTime}</p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border/50 pt-3 text-xs text-muted-foreground">
                <span>{s.leads} leads this month</span>
                <span className={cn("font-medium", s.roi >= 8 ? "text-success" : "text-foreground")}>ROI: {s.roi}x</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function LeadSourcesPage() {
  const session = useSession();
  const allowed =
    can(session, "sources:manage") &&
    Boolean(session.user.email_verified_at);
  const [after, setAfter] = useState("0");
  const [viewTab, setViewTab] = useState<ViewTab>("sources");
  const sources = useApi<Source[]>(
    allowed ? `/sources?limit=50&after_id=${after}` : null,
  );
  const sourceRows = sources.data ?? [];
  const enabledSources = sourceRows;
  const pausedCount = sourceRows.filter((source) => source.status !== "connected").length;
  const unverified = can(session, "sources:manage") && !session.user.email_verified_at;
  const availableSources = sourceRows.filter((source) => source.status === "available");

  const perfData: SourcePerf[] = [];
  const totalLeads = perfData.reduce((s, p) => s + p.leads, 0);
  const totalConverted = perfData.reduce((s, p) => s + p.converted, 0);
  const avgConversion = totalLeads > 0 ? ((totalConverted / totalLeads) * 100).toFixed(1) : "0";
  const bestSource = perfData.length > 0 ? perfData.reduce((a, b) => a.qualityScore > b.qualityScore ? a : b) : null;
  const avgCPL = perfData.length > 0 ? Math.round(perfData.reduce((s, p) => s + p.costPerLead, 0) / perfData.length) : 0;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <PageHeader
        title="Lead Sources"
        description="Connect the places your enquiries already come from."
        actions={
          <div className="flex items-center gap-2">
            {allowed ? (
              <Button asChild>
                <Link href="/lead-sources/new">
                  <Plus />
                  Add a new lead source
                </Link>
              </Button>
            ) : (
              <Button variant="secondary" disabled>
                <Lock className="size-3.5" />
                Add a new lead source
              </Button>
            )}
          </div>
        }
      />

      <div className="border-b border-border px-6">
        <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as ViewTab)}>
          <TabsList>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {viewTab === "performance" ? (
        <SourcePerformanceView data={perfData} />
      ) : (
      <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
        {!can(session, "sources:manage") && (
          <p className="text-sm text-muted-foreground">
            Ask an owner or admin to configure lead sources.
          </p>
        )}
        {unverified && (
          <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
            Verify your email address to set up lead sources: a source receives customers&apos; details, so it needs a confirmed owner. Use the link in the email Janus sent you, or send it again from the banner at the top of the page.
          </p>
        )}
        {sources.error && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            Your lead sources could not be read: {sources.error}. Refresh to try again; leads keep arriving meanwhile.
          </p>
        )}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {`Your sources (${enabledSources.length})${pausedCount ? ` · ${pausedCount} paused` : ""}`}
          </h2>

          {allowed && sources.loading && (
            <p role="status" className="text-sm">
              Loading connections…
            </p>
          )}
          {enabledSources.length === 0 && !sources.loading && !sources.error && (
            <p className="text-sm text-muted-foreground">
              {after === "0"
                ? "No enabled sources yet. Add your first lead source to begin."
                : "No more connections."}
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {enabledSources.map((source) => {
              const perf = perfData.find((p) => p.sourceId === source.id);
              return (
              <article key={source.id} className="flex min-h-[168px] flex-col gap-4 border border-border bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2">
                      {source.source === "website" ? <Globe className="size-5 text-accent" /> : source.source === "whatsapp" ? <MessageCircle className="size-5 text-accent" /> : source.source === "phone_call" ? <Phone className="size-5 text-accent" /> : source.source === "api" ? <Key className="size-5 text-accent" /> : source.source === "csv_import" ? <FileSpreadsheet className="size-5 text-accent" /> : <Webhook className="size-5 text-accent" />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{source.name}</p>
                      <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">{sourceKindLabel(source)}{source.status !== "connected" && <Badge variant="neutral">Paused: not taking leads</Badge>}</p>
                    </div>
                  </div>
                  <Link href={source.connectionKind === "oauth" ? "/lead-sources/whatsapp" : `/lead-sources/${source.id}`} aria-label={`Edit ${source.name}`} title="Edit source" className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                    <Settings2 className="size-4" />
                  </Link>
                </div>
                <div className={cn("grid gap-4 border-t border-border/70 pt-3", perf ? "grid-cols-4" : "grid-cols-2")}>
                  <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Leads captured</p><p className="mt-1 text-xl font-semibold">{source.capturedLeads}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Last received</p><p className="mt-1 text-sm font-medium">{source.lastEventAt ? formatDateTime(source.lastEventAt) : "No activity yet"}</p></div>
                  {perf && (
                    <>
                      <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Conversion</p><p className="mt-1 text-lg font-semibold text-success">{perf.conversionRate}%</p></div>
                      <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Quality</p><QualityBar score={perf.qualityScore} /></div>
                    </>
                  )}
                </div>
                <Link href={source.connectionKind === "oauth" ? "/lead-sources/whatsapp" : `/lead-sources/${source.id}`} className="mt-auto text-xs font-medium text-accent hover:underline">View source details →</Link>
              </article>
              );
            })}
          </div>
          {allowed && (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAfter("0");
                  sources.reload();
                }}
              >
                Refresh / first page
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={sources.data?.length !== 50}
                onClick={() => setAfter(sources.data!.at(-1)!.id)}
              >
                Next page
              </Button>
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Add another source
            </h2>
            <p className="text-xs text-muted-foreground">Connect when you are ready to capture more enquiries.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {sourceOptions.map(([name, description, Icon, href]) =>
                allowed ? (
                  <Link key={name} href={href} className="group flex min-h-[120px] gap-3 border border-border bg-surface p-5 shadow-sm transition hover:border-accent">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2"><Icon className="size-5 text-muted-foreground group-hover:text-accent" /></span>
                    <span className="flex flex-col gap-1"><span className="text-sm font-medium">{name}</span><span className="text-xs leading-relaxed text-muted-foreground">{description}</span></span>
                  </Link>
                ) : (
                  <div key={name} className="relative flex min-h-[120px] gap-3 border border-border bg-surface p-5 opacity-50" aria-disabled="true">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2"><Icon className="size-5 text-muted-foreground" /></span>
                    <span className="flex flex-col gap-1"><span className="text-sm font-medium text-muted-foreground">{name}</span><span className="text-xs leading-relaxed text-muted-foreground">{description}</span></span>
                    <Lock className="absolute right-3 top-3 size-4 text-muted-foreground" />
                  </div>
                ),
              )}
            </div>
        </section>
      </div>
      )}
    </div>
  );
}
