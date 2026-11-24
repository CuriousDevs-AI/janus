"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import {
  RefreshCw, Building2, Loader2, Search, CalendarClock, Zap,
  LayoutGrid, List, Settings2, ArrowUpDown, ArrowUp, ArrowDown,
  Eye, MoreHorizontal, Pencil, X, SlidersHorizontal,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { can } from "@/lib/permissions";
import { useApi } from "@/lib/api/use-api";
import { useAllRows } from "@/lib/api/use-all-rows";
import { api, message } from "@/lib/api/client";
import type { Deal } from "@/lib/api/types";
import { useSession } from "@/components/auth/session-provider";
import { PageHeader } from "@/components/shared/page-header";
import { formatCurrencyINR, formatRelativeTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePipelineConfig, barColor } from "@/lib/hooks/use-pipeline-config";
import { useCrmContext } from "@/lib/hooks/use-crm-context";
import { columnBg, columnBorder } from "@/components/crm/deals/constants";
import { DealCard } from "@/components/crm/deals/deal-card";
import { StageSettingsDialog } from "@/components/crm/deals/stage-settings-dialog";
import { DealDetailSheet } from "@/components/crm/deals/deal-detail-sheet";

const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

type ViewMode = "board" | "table";
type SortKey = "name" | "amount" | "stage" | "expectedCloseAt" | "updatedAt" | "customerName";
type SortDir = "asc" | "desc";

function useLocalPref<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try { return (localStorage.getItem(key) as T) || fallback; } catch { return fallback; }
  });
  const set = (v: T) => { setVal(v); try { localStorage.setItem(key, v); } catch {} };
  return [val, set];
}

export default function DealsPage() {
  const session = useSession();
  const { crms, multiCrm } = useCrmContext();
  const [crmFilter, setCrmFilter] = useState<string>("all");
  const crmParam = multiCrm && crmFilter !== "all" ? `&crm_id=${crmFilter}` : "";
  const canWrite = can(session, "leads:write");
  const canAdmin = can(session, "settings:manage");
  const canReadTeam = can(session, "leads:read_team");
  const writable = canWrite;

  const pipeline = usePipelineConfig(canAdmin || canReadTeam);
  const { stages, stageMap } = pipeline;
  const stageOrder = stages.map((s) => s.key);

  const [view, setView] = useLocalPref<ViewMode>("janus:deals:view", "board");
  const [perPage, setPerPage] = useLocalPref("janus:deals:perPage", "50");
  const pageSize = Number(perPage) || 50;

  const [cursors, setCursors] = useState(["0"]);
  const result = useApi<Deal[]>(`/deals?after_id=${cursors.at(-1)}&limit=${pageSize}${crmParam}`);
  const deals = result.data ?? [];
  const everyDeal = useAllRows<Deal>(`/deals?_=1${crmParam}`);
  const allDeals = everyDeal.data ?? deals;
  const [query, setQuery] = useState("");
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [busy, setBusy] = useState(false);
  const [closeFilter, setCloseFilter] = useState<"all" | "closing" | "slipped" | "undated" | "mine">("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stageSettingsOpen, setStageSettingsOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);

  const today = todayIst();
  const monthEnd = `${today.slice(0, 7)}-31`;

  const open = allDeals.filter((d) => !["won", "lost"].includes(d.stage));
  const closing = open.filter((d) => d.expectedCloseAt && d.expectedCloseAt >= today && d.expectedCloseAt <= monthEnd);
  const slipped = open.filter((d) => d.expectedCloseAt && d.expectedCloseAt < today);
  const undated = open.filter((d) => !d.expectedCloseAt);
  const sumOf = (list: Deal[]) => list.reduce((s, d) => s + Number(d.amount), 0);

  const inView = closeFilter === "closing" ? closing : closeFilter === "slipped" ? slipped : closeFilter === "undated" ? undated : closeFilter === "mine" ? allDeals.filter((d) => d.ownerId === session.user.id) : deals;
  const searched = inView.filter((d) => `${d.name} ${d.customerName} ${d.company}`.toLowerCase().includes(query.toLowerCase()));
  const filtered = stageFilter === "all" ? searched : searched.filter((d) => d.stage === stageFilter);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "amount") cmp = Number(a.amount) - Number(b.amount);
      else if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "customerName") cmp = (a.customerName ?? "").localeCompare(b.customerName ?? "");
      else if (sortKey === "stage") cmp = stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage);
      else if (sortKey === "expectedCloseAt") cmp = (a.expectedCloseAt ?? "9999").localeCompare(b.expectedCloseAt ?? "9999");
      else cmp = (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "");
      return cmp * dir;
    });
    return list;
  }, [filtered, sortKey, sortDir, stageOrder]);

  const openValue = filtered.filter((d) => !["won", "lost"].includes(d.stage)).reduce((s, d) => s + Number(d.amount), 0);
  const weightedValue = filtered.filter((d) => !["won", "lost"].includes(d.stage)).reduce((s, d) => {
    const prob = stageMap.get(d.stage)?.probability ?? 0;
    return s + Number(d.amount) * prob / 100;
  }, 0);

  const pipelineStages = stages.filter((s) => s.key !== "won" && s.key !== "lost");
  const pipelineTotal = Math.max(1, pipelineStages.reduce((s, stage) => s + filtered.filter((d) => d.stage === stage.key).reduce((a, d) => a + Number(d.amount), 0), 0));

  const reload = useCallback(() => {
    setRefreshing(true);
    result.reload();
    everyDeal.reload();
    setTimeout(() => setRefreshing(false), 600);
  }, [result, everyDeal]);

  async function move(deal: Deal, stage: string) {
    if (!writable || busy || deal.stage === stage) return;
    if (stage === "lost") { setEditing({ ...deal, stage: stage as Deal["stage"] }); return; }
    setBusy(true);
    try {
      await api<Deal>(`/deals/${deal.id}`, { method: "PUT", body: JSON.stringify({ name: deal.name, amount: deal.amount, stage, expectedCloseAt: deal.expectedCloseAt, lostReason: "", version: deal.version }) });
      const meta = stageMap.get(stage);
      toast.success(`Moved to ${meta?.label ?? stage}`);
      reload();
    } catch (e) { toast.error(message(e)); reload(); }
    finally { setBusy(false); }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "amount" ? "desc" : "asc"); }
  }

  const sortIcon = (col: SortKey) => {
    if (sortKey !== col) return <ArrowUpDown className="size-3 text-muted-foreground/50" />;
    return sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
  };

  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = sorted.length > 0 && sorted.every((d) => selectedIds.has(d.id));

  const stageMeta = (key: string) => stageMap.get(key) ?? { key, label: key, color: "bg-slate-500", probability: 0 };

  const myDeals = allDeals.filter((d) => d.ownerId === session.user.id);
  const wonCount = allDeals.filter((d) => d.stage === "won").length;
  const wonPct = allDeals.length ? Math.round((wonCount / allDeals.length) * 100) : 0;
  const filtersActive = query !== "" || stageFilter !== "all" || closeFilter !== "all" || crmFilter !== "all";
  const clearFilters = () => { setQuery(""); setStageFilter("all"); setCloseFilter("all"); setCrmFilter("all"); };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Deal Pipeline"
        description="Your sales pipeline at a glance."
        actions={<>
          <Button size="sm" variant="secondary" onClick={reload} disabled={refreshing} aria-label="Refresh">
            {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          </Button>
          {canAdmin && <Button size="sm" variant="outline" onClick={() => setStageSettingsOpen(true)}><Settings2 className="size-3.5" /> Stages</Button>}
        </>}
      />

      {result.error && <p role="alert" className="mx-6 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{result.error}</p>}

      {/* ── Toolbar (matches leads) ── */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-border px-6 pb-2.5">
        <div className="relative mr-2 w-full sm:w-52">
          <Search className="pointer-events-none absolute left-0 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search deals..." className="h-7 w-full border-0 bg-transparent pl-5 pr-6 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none" />
          {query && <button type="button" onClick={() => setQuery("")} className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="size-3" /></button>}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn("inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors", stageFilter !== "all" ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
              <SlidersHorizontal className="size-3" />{stageFilter === "all" ? "Stage" : stages.find((s) => s.key === stageFilter)?.label ?? "Stage"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setStageFilter("all")} className={stageFilter === "all" ? "font-semibold" : ""}>All stages</DropdownMenuItem>
            {stages.map((s) => (
              <DropdownMenuItem key={s.key} onSelect={() => setStageFilter(s.key)} className={stageFilter === s.key ? "font-semibold" : ""}>
                <span className={cn("size-2 rounded-full", s.color)} /> {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn("inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors", closeFilter !== "all" ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
              <CalendarClock className="size-3" />{closeFilter === "all" ? "Close date" : closeFilter === "closing" ? "This month" : closeFilter === "slipped" ? "Past due" : closeFilter === "undated" ? "No date" : "My deals"}
              {closeFilter === "all" && slipped.length > 0 && <span className="ml-0.5 tabular-nums text-warning">({slipped.length})</span>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setCloseFilter("all")} className={closeFilter === "all" ? "font-semibold" : ""}>All</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setCloseFilter("closing")} className={closeFilter === "closing" ? "font-semibold" : ""}>Closing this month <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{closing.length}</span></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setCloseFilter("slipped")} className={cn(closeFilter === "slipped" ? "font-semibold" : "", slipped.length > 0 && "text-warning")}>Past close date <span className="ml-auto text-[10px] tabular-nums">{slipped.length}</span></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setCloseFilter("undated")} className={closeFilter === "undated" ? "font-semibold" : ""}>No close date <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{undated.length}</span></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" aria-pressed={closeFilter === "mine"} onClick={() => setCloseFilter(closeFilter === "mine" ? "all" : "mine")} className={cn("inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors", closeFilter === "mine" ? "font-semibold text-accent" : "text-muted-foreground hover:text-foreground")}>
          My deals{myDeals.length > 0 && <span className="ml-0.5 tabular-nums">({myDeals.length})</span>}
        </button>
        <button type="button" aria-pressed={closeFilter === "slipped"} onClick={() => setCloseFilter(closeFilter === "slipped" ? "all" : "slipped")} className={cn("inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors", closeFilter === "slipped" ? "font-semibold text-warning" : "text-muted-foreground hover:text-foreground")}>
          <Zap className="size-3" />Overdue{slipped.length > 0 && <span className="ml-0.5 tabular-nums text-warning">({slipped.length})</span>}
        </button>
        {multiCrm && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn("inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors", crmFilter !== "all" ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <Building2 className="size-3" />{crmFilter === "all" ? "CRM" : crms.find((c) => c.id === crmFilter)?.name ?? "CRM"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => setCrmFilter("all")} className={crmFilter === "all" ? "font-semibold" : ""}>All CRMs</DropdownMenuItem>
              {crms.map((c) => (
                <DropdownMenuItem key={c.id} onSelect={() => setCrmFilter(c.id)} className={crmFilter === c.id ? "font-semibold" : ""}>{c.name}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {filtersActive && (
          <button type="button" onClick={clearFilters} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="size-3 inline" /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-1">
          {result.data && <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:inline">{filtered.length} deals</span>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowUpDown className="size-3" />{sortKey === "updatedAt" ? "Newest" : sortKey === "amount" ? "Value" : sortKey === "name" ? "Name" : sortKey === "expectedCloseAt" ? "Close date" : "Stage"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {([["updatedAt", "Newest"], ["amount", "Value"], ["name", "Name"], ["expectedCloseAt", "Close date"], ["stage", "Stage"]] as const).map(([k, l]) => (
                <DropdownMenuItem key={k} onSelect={() => toggleSort(k)} className={sortKey === k ? "font-semibold" : ""}>{l}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="hidden h-4 w-px bg-border sm:block" />
          {([["board", LayoutGrid], ["table", List]] as const).map(([v, Icon]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v as ViewMode)} className={cn("p-1 transition-colors", view === v ? "text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground")}><Icon className="size-3.5" /></button>
          ))}
        </div>
      </div>

      {/* ── Stats strip ── */}
      {result.data && filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-1.5 text-[11px] tabular-nums text-muted-foreground">
          <span><span className="font-semibold text-foreground">{open.length}</span> open</span>
          <span><span className="font-semibold text-foreground">{formatCurrencyINR(openValue)}</span> pipeline</span>
          <span><span className="font-semibold text-foreground">{formatCurrencyINR(weightedValue)}</span> weighted</span>
          <span><span className="font-semibold text-foreground">{wonPct}%</span> won</span>
          {slipped.length > 0 && <span className="text-warning"><span className="font-semibold">{slipped.length}</span> overdue</span>}
          {closing.length > 0 && <span className="text-success"><span className="font-semibold">{closing.length}</span> closing this month</span>}
        </div>
      )}

      {/* Pipeline bar */}
      {result.data && view === "board" && (
        <div className="px-6 pb-2">
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2">
            {pipelineStages.map((stage) => {
              const stageVal = filtered.filter((d) => d.stage === stage.key).reduce((a, d) => a + Number(d.amount), 0);
              const pct = (stageVal / pipelineTotal) * 100;
              if (pct < 0.5) return null;
              return (
                <button
                  key={stage.key}
                  type="button"
                  onClick={() => setStageFilter(stageFilter === stage.key ? "all" : stage.key)}
                  className={cn("h-full transition-all hover:brightness-110", barColor(stage.color), stageFilter === stage.key && "ring-1 ring-foreground/20")}
                  style={{ width: `${pct}%` }}
                  title={`${stage.label}: ${formatCurrencyINR(stageVal)} (${filtered.filter((d) => d.stage === stage.key).length})`}
                />
              );
            })}
          </div>
        </div>
      )}

      {!result.data && !result.error && (
        <div role="status" className="space-y-1 px-6 py-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <div className="h-4 w-4 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-16 animate-pulse rounded bg-surface-2" />
              <div className="h-4 flex-1 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-20 animate-pulse rounded bg-surface-2" />
            </div>
          ))}
        </div>
      )}

      {/* Board View */}
      {result.data && view === "board" && (
        <>
          {filtered.length === 0 && <p className="px-6 pt-4 text-sm text-muted-foreground">No deals match your filters.</p>}
          <div className="flex min-h-0 flex-1 overflow-x-auto px-6 py-3">
            <div className="flex min-h-0 flex-1 gap-3">
              {stages.map((stage) => {
                const items = filtered.filter((d) => d.stage === stage.key);
                const stageVal = items.reduce((s, d) => s + Number(d.amount), 0);
                const colBg = columnBg(stage.color);
                const colBorder = columnBorder(stage.color);
                return (
                  <section
                    key={stage.key}
                    aria-label={`${stage.label} deals`}
                    onDragOver={(e) => { if (writable && !busy) { e.preventDefault(); setDragOverStage(stage.key); } }}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={(e) => { e.preventDefault(); setDragOverStage(null); const deal = deals.find((d) => d.id === e.dataTransfer.getData("text/plain")); if (deal) void move(deal, stage.key); }}
                    className={cn(
                      "flex min-w-[250px] flex-1 flex-col border transition-colors",
                      colBorder,
                      dragOverStage === stage.key && "ring-2 ring-accent/40",
                    )}
                  >
                    {/* Column header */}
                    <div className={cn("flex items-center gap-2 px-3 py-2.5 shrink-0", colBg)}>
                      <span className={cn("size-2.5 shrink-0 rounded-full", stage.color)} />
                      <h2 className="flex-1 text-xs font-bold uppercase tracking-wider">{stage.label}</h2>
                      <span className={cn("inline-flex size-5 items-center justify-center text-[10px] font-bold tabular-nums text-white", stage.color)}>{items.length}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="rounded-md p-0.5 text-muted-foreground/50 hover:text-muted-foreground"><MoreHorizontal className="size-3.5" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setStageFilter(stageFilter === stage.key ? "all" : stage.key)}>
                            <Eye className="size-3.5 mr-2" />{stageFilter === stage.key ? "Show all" : "Filter to this stage"}
                          </DropdownMenuItem>
                          {canAdmin && <DropdownMenuItem onSelect={() => setStageSettingsOpen(true)}>
                            <Settings2 className="size-3.5 mr-2" />Edit stages
                          </DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Value sub-header */}
                    <div className={cn("flex items-baseline justify-between px-3 py-1.5 border-b shrink-0", colBorder, colBg)}>
                      <span className="text-sm font-bold tabular-nums">{formatCurrencyINR(stageVal)}</span>
                      <span className="text-[10px] text-muted-foreground">{items.length} deal{items.length !== 1 ? "s" : ""}</span>
                    </div>

                    {/* Cards */}
                    <div className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2", colBg)}>
                      {items.map((deal) => (
                        <DealCard key={deal.id} deal={deal} writable={writable} busy={busy} today={today} sessionUserId={session.user.id} sessionUserName={session.user.name} stageColor={stage.color} stages={stages} onEdit={() => setEditing(deal)} onMove={(s) => move(deal, s)} onDragStart={(e) => { e.dataTransfer.setData("text/plain", deal.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragOverStage(null)} />
                      ))}
                      {items.length === 0 && (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
                          <p className="text-xs font-medium text-muted-foreground">No deals here</p>
                          <p className="text-[11px] text-muted-foreground/70">Drag a deal or add a new one.</p>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Table View */}
      {result.data && view === "table" && (
        <div className="flex-1 overflow-auto px-6 py-3">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <LayoutGrid className="size-8 text-muted-foreground/20" />
              <p className="text-sm font-medium">No deals match your filters</p>
              <p className="text-xs text-muted-foreground">Try adjusting your search or filters.</p>
            </div>
          ) : (
            <>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="w-8 pb-2 pr-2"><Checkbox checked={allSelected} onCheckedChange={(c) => setSelectedIds(c ? new Set(sorted.map((d) => d.id)) : new Set())} /></th>
                    <th className="cursor-pointer select-none pb-2 pr-3" onClick={() => toggleSort("name")}><span className="inline-flex items-center gap-1">Deal {sortIcon("name")}</span></th>
                    {multiCrm && <th className="pb-2 pr-3">CRM</th>}
                    <th className="cursor-pointer select-none pb-2 pr-3" onClick={() => toggleSort("customerName")}><span className="inline-flex items-center gap-1">Customer {sortIcon("customerName")}</span></th>
                    <th className="cursor-pointer select-none pb-2 pr-3 text-right" onClick={() => toggleSort("amount")}><span className="inline-flex items-center gap-1 justify-end">Value {sortIcon("amount")}</span></th>
                    <th className="cursor-pointer select-none pb-2 pr-3" onClick={() => toggleSort("stage")}><span className="inline-flex items-center gap-1">Stage {sortIcon("stage")}</span></th>
                    <th className="cursor-pointer select-none pb-2 pr-3" onClick={() => toggleSort("expectedCloseAt")}><span className="inline-flex items-center gap-1">Close {sortIcon("expectedCloseAt")}</span></th>
                    <th className="pb-2 pr-3">Assignment</th>
                    <th className="cursor-pointer select-none pb-2 pr-3" onClick={() => toggleSort("updatedAt")}><span className="inline-flex items-center gap-1">Updated {sortIcon("updatedAt")}</span></th>
                    <th className="w-10 pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((deal) => {
                    const overdue = deal.expectedCloseAt && deal.expectedCloseAt < today && !["won", "lost"].includes(deal.stage);
                    const sm = stageMeta(deal.stage);
                    return (
                      <tr key={deal.id} className={cn("group border-b border-border/30 transition-colors hover:bg-surface-2/40", selectedIds.has(deal.id) && "bg-accent/5")}>
                        <td className="py-2 pr-2"><Checkbox checked={selectedIds.has(deal.id)} onCheckedChange={() => toggleSelect(deal.id)} /></td>
                        <td className="py-2 pr-3">
                          <Link href={`/deals/${deal.id}`} className="text-xs font-medium hover:text-accent">{deal.name}</Link>
                        </td>
                        {multiCrm && <td className="py-2 pr-3 text-xs text-muted-foreground">{crms.find((c) => c.id === deal.crmId)?.name ?? "—"}</td>}
                        <td className="max-w-[140px] truncate py-2 pr-3 text-xs text-muted-foreground">{deal.customerName || deal.company || "—"}</td>
                        <td className="py-2 pr-3 text-right text-xs font-semibold tabular-nums">{formatCurrencyINR(Number(deal.amount), false)}</td>
                        <td className="py-2 pr-3">
                          {writable ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button type="button" className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-xs transition-colors hover:bg-surface-2">
                                  <span className={cn("size-2 rounded-full", sm.color)} /> {sm.label}
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                {stages.map((s) => (
                                  <DropdownMenuItem key={s.key} onSelect={() => move(deal, s.key)} className={deal.stage === s.key ? "font-semibold" : ""}>
                                    <span className={cn("size-2 rounded-full", s.color)} /> {s.label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : <span className="inline-flex items-center gap-1.5 text-xs"><span className={cn("size-2 rounded-full", sm.color)} />{sm.label}</span>}
                        </td>
                        <td className={cn("py-2 pr-3 text-xs", overdue ? "text-warning font-medium" : "text-muted-foreground")}>{deal.expectedCloseAt || "—"}</td>
                        <td className="max-w-[100px] truncate py-2 pr-3 text-xs text-muted-foreground">{deal.ownerId === session.user.id ? session.user.name : deal.ownerName || "—"}</td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{formatRelativeTime(deal.updatedAt)}</td>
                        <td className="py-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><button type="button" className="rounded p-1 opacity-0 transition-opacity hover:bg-surface-2 group-hover:opacity-100"><MoreHorizontal className="size-3.5 text-muted-foreground" /></button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild><Link href={`/deals/${deal.id}`}><Eye className="size-3.5 mr-2" /> View</Link></DropdownMenuItem>
                              {writable && <DropdownMenuItem onClick={() => setEditing(deal)}><Pencil className="size-3.5 mr-2" /> Edit</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {selectedIds.size > 0 && (
                <div className="sticky bottom-0 mt-2 flex items-center gap-3 rounded-md bg-accent/10 px-4 py-2 text-xs">
                  <span className="font-semibold text-accent">{selectedIds.size} selected</span>
                  <span className="text-muted-foreground tabular-nums">{formatCurrencyINR([...selectedIds].reduce((s, id) => { const d = sorted.find((x) => x.id === id); return s + Number(d?.amount ?? 0); }, 0))}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Pagination */}
      {result.data && view === "table" && (
        <div className="flex items-center justify-between border-t border-border/40 px-6 py-2.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Rows per page</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="inline-flex items-center gap-1 rounded-md bg-surface-2/60 px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-2">{pageSize}</button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {["25", "50", "100"].map((n) => (
                  <DropdownMenuItem key={n} onSelect={() => { setPerPage(n as typeof perPage); setCursors(["0"]); }} className={perPage === n ? "font-semibold" : ""}>{n}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Page {cursors.length}</span>
            <button
              type="button"
              disabled={cursors.length === 1}
              onClick={() => setCursors(cursors.slice(0, -1))}
              className="rounded-md p-1 transition-colors hover:bg-surface-2 disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              disabled={deals.length < pageSize}
              onClick={() => setCursors([...cursors, deals.at(-1)!.id])}
              className="rounded-md p-1 transition-colors hover:bg-surface-2 disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      <StageSettingsDialog open={stageSettingsOpen} onOpenChange={setStageSettingsOpen} pipeline={pipeline} allDeals={allDeals} />

      {editing && (
        <DealDetailSheet
          deal={editing}
          open
          onOpenChange={(o) => { if (!o) setEditing(null); }}
          stages={stages}
          writable={writable}
          sessionUserId={session.user.id}
          sessionUserName={session.user.name}
          onMove={(stage) => { move(editing, stage); setEditing(null); }}
          onSaved={() => { setEditing(null); reload(); toast.success("Deal saved"); }}
        />
      )}
    </div>
  );
}
