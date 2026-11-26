"use client";
import Link from "next/link";
import { can } from "@/lib/permissions";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, Bell, BellOff, Check, ChevronDown,
  Clock, ExternalLink, Lock, MessageSquare, Pause, Play, Plug, Plus, RefreshCw,
  Search, Send, Settings2, Zap,
} from "lucide-react";
import { useSession } from "@/components/auth/session-provider";
import { api } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { Source, SourceMetrics } from "@/lib/api/types";
import { sourceKindLabel, sourceOptions, comingSoonSources } from "@/lib/lead-source-options";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, cn } from "@/lib/utils";
import { sourceMeta } from "@/lib/lead-sources";

interface ChannelVote { channel: string; notify: boolean; requested: boolean }

type SortKey = "name" | "leads" | "lastEvent" | "status";
type StatusFilter = "all" | "connected" | "paused" | "needs_setup";
type TypeFilter = "all" | "webhook" | "embed" | "api_key" | "oauth";

function relativeAgo(ts: number): string {
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)}h ago`;
}

const MIN_SPIN_MS = 400;

function HealthDot({ status }: { status: Source["healthStatus"] }) {
  const colors: Record<string, string> = {
    healthy: "bg-success",
    warning: "bg-warning",
    error: "bg-danger",
    paused: "bg-muted-foreground/40",
    needs_setup: "bg-warning",
  };
  const labels: Record<string, string> = {
    healthy: "Healthy",
    warning: "Warning",
    error: "Errors",
    paused: "Paused",
    needs_setup: "Needs CRM",
  };
  const key = status || "healthy";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-1.5 shrink-0 rounded-full", colors[key])} />
      <span className="text-[11px] text-muted-foreground">{labels[key]}</span>
    </span>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn("text-lg font-semibold tabular-nums", accent && "text-accent")}>{typeof value === "number" ? value.toLocaleString("en-IN") : value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function UpcomingChannelCard({ name, description, Icon, vote, onVote }: {
  name: string; description: string; Icon: React.ComponentType<{ className?: string }>;
  vote: ChannelVote | undefined;
  onVote: (channel: string, patch: { notify?: boolean; requested?: boolean; requestMessage?: string }) => void;
}) {
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  const notifyMe = vote?.notify ?? false;
  const sent = vote?.requested ?? false;
  const [showChat, setShowChat] = useState(false);
  const [msg, setMsg] = useState("");

  const toggleNotify = useCallback(() => {
    onVote(slug, { notify: !notifyMe });
  }, [slug, notifyMe, onVote]);

  const submitRequest = useCallback(() => {
    onVote(slug, { requested: true, requestMessage: msg });
  }, [slug, msg, onVote]);

  return (
    <div className="group relative flex flex-col gap-3 border border-dashed border-border/70 bg-surface-2/20 p-4 transition-colors hover:border-border hover:bg-surface-2/40">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center bg-surface-2 text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{name}</span>
            <Badge variant="neutral" className="text-[10px]">Coming soon</Badge>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleNotify}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition-colors",
            notifyMe
              ? "bg-accent/10 text-accent"
              : "bg-surface-2 text-muted-foreground hover:bg-surface-2/80 hover:text-foreground",
          )}
        >
          {notifyMe ? <><BellOff className="size-3" /> Subscribed</> : <><Bell className="size-3" /> Notify me</>}
        </button>
        {sent ? (
          <span className="inline-flex items-center gap-1.5 bg-success/10 px-2.5 py-1.5 text-[11px] font-medium text-success">
            <Check className="size-3" /> Requested
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setShowChat(!showChat)}
            className="inline-flex items-center gap-1.5 bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-2/80 hover:text-foreground"
          >
            <MessageSquare className="size-3" /> {showChat ? "Close" : "Request this"}
          </button>
        )}
      </div>

      {showChat && !sent && (
        <div className="flex flex-col gap-2 border border-border/50 bg-surface p-3">
          <p className="text-[11px] text-muted-foreground">Tell us what you need from {name} — we prioritise based on requests</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder={`e.g. "Need ${name} to auto-import enquiries daily"`}
              className="flex-1 border border-border/50 bg-surface-2/50 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none"
              onKeyDown={(e) => { if (e.key === "Enter" && msg.trim()) submitRequest(); }}
            />
            <button
              type="button"
              disabled={!msg.trim()}
              onClick={submitRequest}
              className="flex items-center gap-1 bg-accent px-3 py-1.5 text-[11px] font-medium text-white transition-opacity disabled:opacity-40"
            >
              <Send className="size-3" /> Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeadSourcesPage() {
  const session = useSession();
  const allowed = can(session, "sources:manage") && Boolean(session.user.email_verified_at);
  const [after, setAfter] = useState("0");
  const sources = useApi<Source[]>(allowed ? `/sources?limit=100&after_id=${after}` : null);
  const metrics = useApi<SourceMetrics>(allowed ? "/sources/metrics" : null);
  const sourceRows = useMemo(() => sources.data ?? [], [sources.data]);
  const unverified = can(session, "sources:manage") && !session.user.email_verified_at;

  const votes = useApi<ChannelVote[]>("/channel-votes");
  const reloadVotes = votes.reload;
  const voteMap = new Map((votes.data ?? []).map((v) => [v.channel, v]));
  const handleVote = useCallback(async (channel: string, patch: { notify?: boolean; requested?: boolean; requestMessage?: string }) => {
    try {
      await api<ChannelVote>("/channel-votes", {
        method: "POST",
        body: JSON.stringify({ channel, ...patch }),
      });
      reloadVotes();
    } catch { /* silent */ }
  }, [reloadVotes]);

  // ── Filters and sorting ──
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("leads");
  const [sortAsc, setSortAsc] = useState(false);

  const csvSources = useMemo(() => sourceRows.filter((s) => s.connectionKind === "csv"), [sourceRows]);
  const connectionRows = useMemo(() => sourceRows.filter((s) => s.connectionKind !== "csv"), [sourceRows]);

  const filtered = useMemo(() => {
    let rows = connectionRows;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((s) => s.name.toLowerCase().includes(q) || sourceKindLabel(s).toLowerCase().includes(q));
    }
    if (statusFilter === "connected") rows = rows.filter((s) => s.status === "connected");
    else if (statusFilter === "paused") rows = rows.filter((s) => s.status !== "connected");
    else if (statusFilter === "needs_setup") rows = rows.filter((s) => s.healthStatus === "needs_setup");
    if (typeFilter !== "all") rows = rows.filter((s) => s.connectionKind === typeFilter);
    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "leads") cmp = (a.capturedLeads ?? 0) - (b.capturedLeads ?? 0);
      else if (sortKey === "lastEvent") cmp = (a.lastEventAt ?? "").localeCompare(b.lastEventAt ?? "");
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [connectionRows, search, statusFilter, typeFilter, sortKey, sortAsc]);

  // ── Refresh state ──
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const prevCounts = useRef<Map<string, number>>(new Map());
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());
  const spinStart = useRef(0);
  const snapRef = useRef<Source[] | undefined>(undefined);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!pendingRef.current) return;
    if (sources.data === snapRef.current && !sources.error) return;
    pendingRef.current = false;
    const elapsed = Date.now() - spinStart.current;
    const remaining = Math.max(0, MIN_SPIN_MS - elapsed);
    const err = sources.error;
    const data = sources.data;
    setTimeout(() => {
      setRefreshing(false);
      if (err) {
        setRefreshError(true);
      } else {
        setRefreshError(false);
        setLastRefresh(Date.now());
        const changed = new Set<string>();
        for (const s of data ?? []) {
          const prev = prevCounts.current.get(s.id);
          if (prev !== undefined && prev !== s.capturedLeads) changed.add(s.id);
        }
        if (changed.size) {
          setChangedIds(changed);
          setTimeout(() => setChangedIds(new Set()), 1200);
        }
      }
    }, remaining);
  }, [sources.data, sources.error]);

  useEffect(() => {
    if (!sources.data) return;
    const m = new Map<string, number>();
    for (const s of sources.data) m.set(s.id, s.capturedLeads ?? 0);
    prevCounts.current = m;
  }, [sources.data]);

  const [, bumpTick] = useReducer((c: number) => c + 1, 0);
  const agoText = lastRefresh !== null ? relativeAgo(lastRefresh) : "";
  useEffect(() => {
    if (lastRefresh === null) return;
    const timer = setInterval(bumpTick, 30_000);
    return () => clearInterval(timer);
  }, [lastRefresh]);

  const reloadSources = sources.reload;
  const reloadMetrics = metrics.reload;
  useEffect(() => {
    if (!allowed) return;
    let timer: ReturnType<typeof setInterval>;
    const start = () => { timer = setInterval(() => { if (!document.hidden) { reloadSources(); reloadMetrics(); } }, 60_000); };
    const onVis = () => { clearInterval(timer); if (!document.hidden) start(); };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [allowed, reloadSources, reloadMetrics]);

  const doRefresh = useCallback(() => {
    if (refreshing) return;
    snapRef.current = sources.data;
    pendingRef.current = true;
    setRefreshing(true);
    setRefreshError(false);
    spinStart.current = Date.now();
    setAfter("0");
    reloadSources();
    reloadMetrics();
  }, [refreshing, reloadSources, reloadMetrics, sources.data]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const m = metrics.data;

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Lead Sources</h1>
          <p className="text-xs text-muted-foreground">Capture, route and manage leads from every channel</p>
        </div>
        <div className="flex items-center gap-2">
          {allowed && sourceRows.length > 0 && (
            <Button variant="ghost" size="sm" disabled={refreshing} onClick={doRefresh} className="min-w-[7rem]">
              <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
          )}
          {allowed && (
            <Button size="sm" variant="secondary" asChild>
              <Link href={csvSources.length > 0 ? `/lead-sources/${csvSources[0].id}` : "/lead-sources/new?kind=csv"}>
                <ArrowUpRight className="size-3.5" /> Import CSV
              </Link>
            </Button>
          )}
          {allowed ? (
            <Button size="sm" asChild>
              <Link href="/lead-sources/new"><Plus className="size-3.5" /> Add source</Link>
            </Button>
          ) : (
            <Button size="sm" variant="secondary" disabled><Lock className="size-3" /> Add source</Button>
          )}
        </div>
      </div>

      {!can(session, "sources:manage") && (
        <p className="px-6 pb-4 pt-4 text-sm text-muted-foreground">Ask an owner or admin to configure lead sources.</p>
      )}
      {unverified && (
        <p role="status" className="mx-6 mt-4 border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
          Verify your email to set up lead sources. Use the link in the email Janus sent you, or send it again from the banner at the top.
        </p>
      )}
      {sources.error && !refreshing && (
        <p role="alert" className="mx-6 mt-4 border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          Could not load sources: {sources.error}. Refresh to try again.
        </p>
      )}

      <div className="flex flex-col gap-6 px-6 pb-24 pt-4">
        {/* ── Metrics strip ── */}
        {allowed && m && (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-border/50 pb-4">
            <MetricCard label="Active sources" value={m.activeSources} accent />
            {m.pausedSources > 0 && <MetricCard label="Paused" value={m.pausedSources} />}
            <MetricCard label="Total leads captured" value={m.totalLeadsCaptured} />
            <MetricCard label="Leads today" value={m.leadsToday} />
            {m.failedEvents > 0 && <MetricCard label="Failed events" value={m.failedEvents} />}
            {m.sourcesNeedingAttention > 0 && (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 text-warning" />
                <MetricCard label="Need attention" value={m.sourcesNeedingAttention} />
              </div>
            )}
          </div>
        )}

        {/* ── Connected Sources Table ── */}
        {connectionRows.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Activity className="size-3.5 text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Connected sources</h2>
              <span className="text-[11px] text-muted-foreground">({connectionRows.length})</span>
            </div>

            {/* ── Toolbar ── */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search sources…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-full border border-border bg-surface pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="h-8 border border-border bg-surface px-2 text-xs text-foreground focus:outline-none"
              >
                <option value="all">All statuses</option>
                <option value="connected">Active</option>
                <option value="paused">Paused</option>
                <option value="needs_setup">Needs CRM</option>
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                className="h-8 border border-border bg-surface px-2 text-xs text-foreground focus:outline-none"
              >
                <option value="all">All types</option>
                <option value="webhook">Webhook</option>
                <option value="embed">Website form</option>
                <option value="api_key">REST API</option>
              </select>
              {(search || statusFilter !== "all" || typeFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); setStatusFilter("all"); setTypeFilter("all"); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* ── Table ── */}
            <div className="overflow-x-auto border border-border">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-surface-2">
                  <tr>
                    <SortTh label="Source name" sortKey="name" current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <th className="p-2.5 font-medium text-muted-foreground">Type</th>
                    <th className="p-2.5 font-medium text-muted-foreground">Assigned CRM</th>
                    <SortTh label="Status" sortKey="status" current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <SortTh label="Leads" sortKey="leads" current={sortKey} asc={sortAsc} onSort={handleSort} className="text-right" />
                    <SortTh label="Last received" sortKey="lastEvent" current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <th className="p-2.5 font-medium text-muted-foreground">Health</th>
                    <th className="p-2.5 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((source) => {
                    const sm = sourceMeta(source.source);
                    const Icon = sm.icon;
                    const href = source.connectionKind === "oauth" ? "/lead-sources/whatsapp" : `/lead-sources/${source.id}`;
                    const highlight = changedIds.has(source.id);
                    return (
                      <tr key={source.id} className="border-t border-border/40 transition-colors hover:bg-surface-2/30">
                        <td className="p-2.5">
                          <Link href={href} className="inline-flex items-center gap-2 hover:text-accent">
                            <span className={cn("flex size-7 shrink-0 items-center justify-center", sm.bg, sm.color)}>
                              <Icon className="size-3.5" />
                            </span>
                            <span className="font-medium">{source.name}</span>
                          </Link>
                        </td>
                        <td className="p-2.5 text-muted-foreground">{sourceKindLabel(source)}</td>
                        <td className="p-2.5">
                          {source.crmName ? (
                            <span className="text-foreground">{source.crmName}</span>
                          ) : (
                            <span className="text-warning">Not assigned</span>
                          )}
                        </td>
                        <td className="p-2.5">
                          {source.status === "connected" ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Play className="size-3 text-success" />
                              <span>Active</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              <Pause className="size-3" />
                              <span>Paused</span>
                            </span>
                          )}
                        </td>
                        <td className={cn("p-2.5 text-right tabular-nums font-medium", highlight && "text-success transition-colors duration-1000")}>
                          {(source.capturedLeads ?? 0).toLocaleString("en-IN")}
                        </td>
                        <td className="p-2.5 text-muted-foreground">
                          {source.lastEventAt ? formatDateTime(source.lastEventAt) : "—"}
                        </td>
                        <td className="p-2.5">
                          <HealthDot status={source.healthStatus} />
                        </td>
                        <td className="p-2.5">
                          <div className="flex items-center gap-1">
                            <Link href={href} className="p-1 text-muted-foreground hover:text-foreground" title="View & edit">
                              <Settings2 className="size-3.5" />
                            </Link>
                            <Link href={href} className="p-1 text-muted-foreground hover:text-foreground" title="View events">
                              <ExternalLink className="size-3.5" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-sm text-muted-foreground">
                        {search || statusFilter !== "all" || typeFilter !== "all"
                          ? "No sources match the current filters."
                          : "No connected sources yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Pagination / status ── */}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              {refreshError && (
                <span className="text-danger">
                  Couldn&apos;t refresh —{" "}
                  <button type="button" onClick={doRefresh} className="underline hover:no-underline">Retry</button>
                </span>
              )}
              {!refreshError && lastRefresh !== null && (
                <span aria-live="polite" className="text-muted-foreground">Updated {agoText}</span>
              )}
              {connectionRows.length >= 100 && (
                <button type="button" onClick={() => setAfter(sourceRows.at(-1)!.id)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                  Next page <ArrowRight className="size-3" />
                </button>
              )}
            </div>
          </section>
        )}

        {/* ── Empty state ── */}
        {sourceRows.length === 0 && !sources.loading && !sources.error && allowed && (
          <div className="flex flex-col items-center gap-2 py-16">
            <span className="flex size-12 items-center justify-center bg-accent/10 text-accent">
              <Zap className="size-5" />
            </span>
            <p className="text-sm font-medium">No sources connected yet</p>
            <p className="max-w-xs text-center text-xs text-muted-foreground">Connect your first lead source below — website forms, WhatsApp, phone calls, or APIs — and start capturing enquiries automatically.</p>
            <Button size="sm" asChild className="mt-2">
              <Link href="/lead-sources/new"><Plus className="size-3.5" /> Add your first source</Link>
            </Button>
          </div>
        )}

        {sources.loading && !refreshing && (
          <p className="text-sm text-muted-foreground">Loading sources…</p>
        )}

        {/* ── Available integrations ── */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Plug className="size-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Available integrations</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sourceOptions.map(([name, description, Icon, href]) =>
              allowed ? (
                <Link
                  key={name}
                  href={href}
                  className="group flex items-start gap-3 border border-transparent p-3 transition-all hover:border-accent/30 hover:bg-accent/5"
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center bg-surface-2 text-muted-foreground transition-colors group-hover:bg-accent/10 group-hover:text-accent">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium group-hover:text-accent">{name}</span>
                      <ArrowRight className="size-3 text-transparent transition-colors group-hover:text-accent" />
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
                  </div>
                </Link>
              ) : (
                <div key={name} className="flex items-start gap-3 p-3 opacity-40" aria-disabled="true">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center bg-surface-2 text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-muted-foreground">{name}</span>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
                  </div>
                  <Lock className="mt-1 size-3 shrink-0 text-muted-foreground" />
                </div>
              ),
            )}
          </div>
        </section>

        {/* ── Coming soon ── */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Clock className="size-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Coming soon</h2>
            <span className="text-[10px] text-muted-foreground">Vote to help us prioritise</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {comingSoonSources.map(([name, description, Icon]) => {
              const slug = name.toLowerCase().replace(/\s+/g, "-");
              return (
                <UpcomingChannelCard key={name} name={name} description={description} Icon={Icon} vote={voteMap.get(slug)} onVote={handleVote} />
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function SortTh({ label, sortKey: key, current, asc, onSort, className }: {
  label: string; sortKey: SortKey; current: SortKey; asc: boolean;
  onSort: (key: SortKey) => void; className?: string;
}) {
  const active = current === key;
  return (
    <th className={cn("p-2.5 font-medium text-muted-foreground", className)}>
      <button type="button" onClick={() => onSort(key)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {active && <ChevronDown className={cn("size-3", asc && "rotate-180")} />}
      </button>
    </th>
  );
}
