"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus, RefreshCw, Building2, CalendarClock,
  LayoutGrid, List, Settings2, ArrowUpDown, ArrowUp, ArrowDown,
  Eye, MoreHorizontal, Pencil, Trash2, ChevronUp, ChevronDown as ChevronDownIcon,
  ChevronLeft, ChevronRight, Phone, User, Clock, ExternalLink,
  StickyNote, Video, Mail, ClipboardList, Send,
} from "lucide-react";
import { toast } from "sonner";
import { can } from "@/lib/permissions";
import { useApi } from "@/lib/api/use-api";
import { useAllRows } from "@/lib/api/use-all-rows";
import { api, message } from "@/lib/api/client";
import type { Deal, DealEvent, Activity } from "@/lib/api/types";
import { useSession } from "@/components/auth/session-provider";
import { PageHeader } from "@/components/shared/page-header";
import { DealForm } from "@/components/deals/deal-form";
import { formatCurrencyINR, formatRelativeTime, formatDateTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { usePipelineConfig, barColor, AVAILABLE_COLORS, toSlug, DEFAULT_STAGES, type PipelineStage } from "@/lib/hooks/use-pipeline-config";
import { useCrmContext } from "@/lib/hooks/use-crm-context";
import { dealStageMeta } from "@/lib/status-meta";

const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const BG_MAP: Record<string, string> = {
  "bg-slate-500": "bg-slate-50 dark:bg-slate-950/30", "bg-blue-500": "bg-blue-50 dark:bg-blue-950/30",
  "bg-cyan-500": "bg-cyan-50 dark:bg-cyan-950/30", "bg-indigo-500": "bg-indigo-50 dark:bg-indigo-950/30",
  "bg-amber-500": "bg-amber-50 dark:bg-amber-950/30", "bg-orange-500": "bg-orange-50 dark:bg-orange-950/30",
  "bg-purple-500": "bg-purple-50 dark:bg-purple-950/30", "bg-pink-500": "bg-pink-50 dark:bg-pink-950/30",
  "bg-teal-500": "bg-teal-50 dark:bg-teal-950/30", "bg-lime-500": "bg-lime-50 dark:bg-lime-950/30",
  "bg-fuchsia-500": "bg-fuchsia-50 dark:bg-fuchsia-950/30", "bg-sky-500": "bg-sky-50 dark:bg-sky-950/30",
  "bg-emerald-500": "bg-emerald-50 dark:bg-emerald-950/30", "bg-red-500": "bg-red-50 dark:bg-red-950/30",
};
const BORDER_MAP: Record<string, string> = {
  "bg-slate-500": "border-slate-200 dark:border-slate-800", "bg-blue-500": "border-blue-200 dark:border-blue-800",
  "bg-cyan-500": "border-cyan-200 dark:border-cyan-800", "bg-indigo-500": "border-indigo-200 dark:border-indigo-800",
  "bg-amber-500": "border-amber-200 dark:border-amber-800", "bg-orange-500": "border-orange-200 dark:border-orange-800",
  "bg-purple-500": "border-purple-200 dark:border-purple-800", "bg-pink-500": "border-pink-200 dark:border-pink-800",
  "bg-teal-500": "border-teal-200 dark:border-teal-800", "bg-lime-500": "border-lime-200 dark:border-lime-800",
  "bg-fuchsia-500": "border-fuchsia-200 dark:border-fuchsia-800", "bg-sky-500": "border-sky-200 dark:border-sky-800",
  "bg-emerald-500": "border-emerald-200 dark:border-emerald-800", "bg-red-500": "border-red-200 dark:border-red-800",
};
function columnBg(color: string) { return BG_MAP[color] ?? "bg-muted/30"; }
function columnBorder(color: string) { return BORDER_MAP[color] ?? "border-border"; }

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

  function reload() { result.reload(); everyDeal.reload(); }

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

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Deal Pipeline"
        description={result.data ? `${filtered.length} deal${filtered.length === 1 ? "" : "s"} · ${formatCurrencyINR(openValue)} open · ${formatCurrencyINR(weightedValue)} weighted` : "Your sales pipeline"}
        actions={<>
          <Button size="sm" variant="secondary" onClick={reload} aria-label="Refresh"><RefreshCw className="size-3.5" /></Button>
          {canAdmin && <Button size="sm" variant="outline" onClick={() => setStageSettingsOpen(true)}><Settings2 className="size-3.5" /> Stages</Button>}
          {writable && <Button size="sm" asChild><Link href="/leads" title="Deals are created by converting a lead"><Plus className="size-3.5" /> Convert Lead</Link></Button>}
        </>}
      />

      {result.error && <p role="alert" className="mx-6 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{result.error}</p>}

      {/* Pipeline bar + quick filters */}
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
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {pipelineStages.map((stage) => {
            const count = filtered.filter((d) => d.stage === stage.key).length;
            const active = stageFilter === stage.key;
            return (
              <button key={stage.key} type="button" onClick={() => setStageFilter(active ? "all" : stage.key)} className={cn("flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[10px] transition-all", active ? "bg-surface-2 font-bold text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-surface-2/50")}>
                <span className={cn("size-2 rounded-full transition-transform", stage.color, active && "scale-125")} />
                {stage.label} <span className="tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-2 px-6 pb-3 sm:grid-cols-4" aria-label="Pipeline summary">
        {([
          ["closing", "Closing this month", closing, "bg-emerald-500"],
          ["slipped", "Past close date", slipped, "bg-amber-500"],
          ["undated", "No close date", undated, "bg-slate-400"],
          ["mine", "My deals", allDeals.filter((d) => d.ownerId === session.user.id), "bg-accent"],
        ] as const).map(([key, title, list, dot]) => {
          const active = closeFilter === key;
          return (
            <button key={key} type="button" aria-pressed={active} onClick={() => setCloseFilter(active ? "all" : key)} className={cn("group/card rounded-md p-3 text-left transition-all", active ? "bg-accent/10 shadow-sm ring-1 ring-accent/30" : "bg-surface-2/40 hover:bg-surface-2/70")}>
              <div className="flex items-center gap-1.5">
                <span className={cn("size-1.5 rounded-full transition-transform", dot, active && "scale-150")} />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{title}</span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className={cn("text-xl font-bold tabular-nums transition-colors", key === "slipped" && list.length ? "text-warning" : active ? "text-accent" : "")}>{list.length}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{formatCurrencyINR(sumOf(list))}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border/50 px-6 pb-2">
        <div className="flex bg-surface-2/60 p-0.5 rounded-md">
          <button type="button" onClick={() => setView("board")} className={cn("flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium transition-colors", view === "board" ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}><LayoutGrid className="size-3" /> Board</button>
          <button type="button" onClick={() => setView("table")} className={cn("flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium transition-colors", view === "table" ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}><List className="size-3" /> Table</button>
        </div>
        <span className="mx-1 h-4 w-px bg-border/50" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search deals…"
          className="w-44 border-0 bg-transparent px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
        <span className="mx-1 h-4 w-px bg-border/50" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn("inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors", stageFilter !== "all" ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {stageFilter === "all" ? "Stage" : stages.find((s) => s.key === stageFilter)?.label ?? "Stage"}
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
        {multiCrm && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn("inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors", crmFilter !== "all" ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <Building2 className="size-3" /> {crmFilter === "all" ? "CRM" : crms.find((c) => c.id === crmFilter)?.name ?? "CRM"}
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
      </div>

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
                        <DealCard key={deal.id} deal={deal} writable={writable} busy={busy} today={today} sessionUserId={session.user.id} sessionUserName={session.user.name} sessionAvatarUrl={session.user.avatar_url} stageColor={stage.color} stages={stages} onEdit={() => setEditing(deal)} onMove={(s) => move(deal, s)} onDragStart={(e) => { e.dataTransfer.setData("text/plain", deal.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragOverStage(null)} />
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

      {/* Stage Settings Dialog */}
      <StageSettingsDialog open={stageSettingsOpen} onOpenChange={setStageSettingsOpen} pipeline={pipeline} allDeals={allDeals} />

      {/* Deal Detail Sheet */}
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

/* ── Stage Settings Dialog ── */
function StageSettingsDialog({ open, onOpenChange, pipeline, allDeals }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  pipeline: ReturnType<typeof usePipelineConfig>; allDeals: Deal[];
}) {
  const [draft, setDraft] = useState<PipelineStage[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(AVAILABLE_COLORS[0]);
  const [newProb, setNewProb] = useState(50);

  const stages = draft.length ? draft : pipeline.stages;

  function openDialog() {
    setDraft([...pipeline.stages]);
  }

  function moveStage(idx: number, dir: -1 | 1) {
    const list = [...stages];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    if (list[idx].key === "won" || list[idx].key === "lost") return;
    if (list[target].key === "won" || list[target].key === "lost") return;
    [list[idx], list[target]] = [list[target], list[idx]];
    setDraft(list);
  }

  function removeStage(key: string) {
    if (key === "won" || key === "lost" || key === "new") { toast.error("Cannot remove this stage"); return; }
    const count = allDeals.filter((d) => d.stage === key).length;
    if (count > 0) { toast.error(`${count} deal${count !== 1 ? "s" : ""} still in this stage — move them first`); return; }
    setDraft(stages.filter((s) => s.key !== key));
  }

  function addStage() {
    if (!newLabel.trim()) { toast.error("Enter a stage name"); return; }
    const key = toSlug(newLabel);
    if (stages.some((s) => s.key === key)) { toast.error("Stage already exists"); return; }
    const wonIdx = stages.findIndex((s) => s.key === "won");
    const list = [...stages];
    list.splice(wonIdx >= 0 ? wonIdx : list.length, 0, { key, label: newLabel.trim(), color: newColor, probability: newProb });
    setDraft(list);
    setNewLabel("");
    setNewProb(50);
    setAddOpen(false);
  }

  function updateStage(key: string, patch: Partial<PipelineStage>) {
    setDraft(stages.map((s) => s.key === key ? { ...s, ...patch } : s));
  }

  async function save() {
    await pipeline.save(stages);
    onOpenChange(false);
    setDraft([]);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) openDialog(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pipeline Stages</DialogTitle>
          <DialogDescription>Add, remove, rename, reorder and color your deal stages. Changes apply to everyone.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {stages.map((stage, idx) => {
            const count = allDeals.filter((d) => d.stage === stage.key).length;
            const isFixed = stage.key === "won" || stage.key === "lost";
            return (
              <div key={stage.key} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <button type="button" disabled={idx === 0 || isFixed} onClick={() => moveStage(idx, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-20"><ChevronUp className="size-3" /></button>
                  <button type="button" disabled={idx === stages.length - 1 || isFixed} onClick={() => moveStage(idx, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-20"><ChevronDownIcon className="size-3" /></button>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={cn("size-5 rounded-full shrink-0 ring-2 ring-transparent hover:ring-accent transition-all", stage.color)} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="grid grid-cols-6 gap-1 p-2">
                    {AVAILABLE_COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => updateStage(stage.key, { color: c })} className={cn("size-6 rounded-full transition-all", c, c === stage.color && "ring-2 ring-accent ring-offset-1")} />
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex-1 min-w-0">
                  {isFixed ? (
                    <span className="text-sm font-medium">{stage.label}</span>
                  ) : (
                    <Input value={stage.label} onChange={(e) => updateStage(stage.key, { label: e.target.value })} className="h-7 text-sm font-medium border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0" />
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{stage.key}</span>
                    <span className="text-[10px] text-muted-foreground">· {count} deal{count !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                {!isFixed && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Input type="number" min={0} max={100} value={stage.probability} onChange={(e) => updateStage(stage.key, { probability: Number(e.target.value) })} className="h-7 w-14 text-xs text-center" />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                )}
                {!isFixed && stage.key !== "new" && (
                  <Button variant="ghost" size="sm" className="size-7 p-0 shrink-0" onClick={() => removeStage(stage.key)}><Trash2 className="size-3.5 text-danger" /></Button>
                )}
              </div>
            );
          })}
        </div>

        {/* Add stage */}
        {addOpen ? (
          <div className="rounded-lg border border-accent/30 bg-accent-muted/20 p-3 space-y-3">
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <div>
                <Label className="text-xs">Stage Name</Label>
                <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Discovery" className="h-8" autoFocus />
              </div>
              <div>
                <Label className="text-xs">Probability</Label>
                <div className="flex items-center gap-1">
                  <Input type="number" min={0} max={100} value={newProb} onChange={(e) => setNewProb(Number(e.target.value))} className="h-8 text-xs" />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs">Color</Label>
              <div className="flex gap-1.5 mt-1">
                {AVAILABLE_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setNewColor(c)} className={cn("size-6 rounded-full transition-all", c, c === newColor && "ring-2 ring-accent ring-offset-1")} />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={addStage}>Add Stage</Button>
              <Button size="sm" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)} className="w-full"><Plus className="size-3.5" /> Add Stage</Button>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { setDraft(DEFAULT_STAGES); }}>Reset to Default</Button>
          <Button variant="outline" onClick={() => { onOpenChange(false); setDraft([]); }}>Cancel</Button>
          <Button onClick={save} disabled={pipeline.saving}>{pipeline.saving ? "Saving…" : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Deal Card ── */

const AVATAR_COLORS = ["bg-emerald-500", "bg-blue-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-cyan-500", "bg-orange-500", "bg-teal-500"];
const avatarColor = (name: string) => AVATAR_COLORS[Math.abs([...name].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)) % AVATAR_COLORS.length];

function DealCard({ deal, writable, busy, today, sessionUserId, sessionUserName, sessionAvatarUrl, stageColor, stages, onEdit, onMove, onDragStart, onDragEnd }: {
  deal: Deal; writable: boolean; busy: boolean; today: string;
  sessionUserId: string; sessionUserName: string; sessionAvatarUrl?: string | null; stageColor: string;
  stages: PipelineStage[];
  onEdit: () => void; onMove: (stage: string) => void;
  onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void;
}) {
  const overdue = deal.expectedCloseAt && deal.expectedCloseAt < today && !["won", "lost"].includes(deal.stage);
  const ownerDisplay = deal.ownerId === sessionUserId ? sessionUserName : deal.ownerName || "Unassigned";
  const isMe = deal.ownerId === sessionUserId;
  const customerDisplay = deal.company || deal.customerName || "";

  return (
    <article
      draggable={writable && !busy}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group flex flex-col gap-1.5 border border-border bg-surface p-3 shadow-sm transition-shadow hover:shadow-md cursor-pointer"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">{deal.name}</p>
          {customerDisplay && <p className="truncate text-[11px] text-muted-foreground">{customerDisplay}</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" onClick={(e) => e.stopPropagation()} className="shrink-0 p-0.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground">
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem asChild><Link href={`/deals/${deal.id}`}><Eye className="size-3.5 mr-2" />View full page</Link></DropdownMenuItem>
            {writable && <DropdownMenuItem onClick={() => onEdit()}><Pencil className="size-3.5 mr-2" />Edit</DropdownMenuItem>}
            {writable && (
              <>
                <DropdownMenuSeparator />
                {stages.filter((s) => s.key !== deal.stage).map((s) => (
                  <DropdownMenuItem key={s.key} onSelect={() => onMove(s.key)}>
                    <span className={cn("size-2 rounded-full mr-2", s.color)} />
                    Move to {s.label}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {deal.phone && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Phone className="size-3 shrink-0" />
          <span className="tabular-nums">{deal.phone}</span>
        </div>
      )}

      <p className="text-sm font-bold tabular-nums">{formatCurrencyINR(Number(deal.amount), false)}</p>

      <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-1.5">
        <div className="flex items-center gap-1.5 min-w-0 text-[10px] text-muted-foreground">
          <OwnerAvatar name={ownerDisplay} avatarUrl={isMe ? sessionAvatarUrl : null} />
          <span className="truncate">{ownerDisplay}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {deal.expectedCloseAt && (
            <span className={cn("flex items-center gap-0.5 text-[10px]", overdue ? "text-warning font-semibold" : "text-muted-foreground")}>
              <CalendarClock className="size-2.5" />
              {deal.expectedCloseAt.slice(5)}
            </span>
          )}
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Clock className="size-2.5" />
            {formatRelativeTime(deal.updatedAt)}
          </span>
        </div>
      </div>
    </article>
  );
}

function OwnerAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className="size-5 shrink-0 object-cover" />;
  }
  const initial = name.charAt(0).toUpperCase();
  return (
    <span className={cn("flex size-5 shrink-0 items-center justify-center text-[9px] font-semibold text-white", avatarColor(name))}>
      {initial}
    </span>
  );
}

/* ── Deal Detail Sheet ── */

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  call: Phone, meeting: Video, email: Mail, task: ClipboardList, note: StickyNote,
};
const ACTIVITY_COLORS: Record<string, string> = {
  call: "text-blue-500", meeting: "text-violet-500", email: "text-amber-500", task: "text-cyan-500", note: "text-muted-foreground",
};

const todayIst2 = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const inDays = (days: number) => {
  const d = new Date(`${todayIst2()}T12:00:00+05:30`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
};

function followUpLabel(day: string) {
  const days = Math.round((new Date(`${day}T12:00:00+05:30`).getTime() - new Date(`${todayIst2()}T12:00:00+05:30`).getTime()) / 86_400_000);
  const date = new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return days < 0 ? `${date} · ${-days}d overdue` : days === 0 ? `${date} · today` : days === 1 ? `${date} · tomorrow` : `${date} · in ${days}d`;
}

function DealDetailSheet({ deal, open, onOpenChange, stages, writable, sessionUserId, sessionUserName, onMove, onSaved }: {
  deal: Deal; open: boolean; onOpenChange: (o: boolean) => void;
  stages: PipelineStage[]; writable: boolean;
  sessionUserId: string; sessionUserName: string;
  onMove: (stage: string) => void; onSaved: () => void;
}) {
  const [tab, setTab] = useState<"details" | "edit">("details");
  const [noteBody, setNoteBody] = useState("");
  const [noteDate, setNoteDate] = useState<string | null>(() => inDays(3));
  const [noteSaving, setNoteSaving] = useState(false);
  const activities = useApi<Activity[]>(open ? `/activities?deal_id=${deal.id}&limit=20` : null);
  const events = useApi<DealEvent[]>(open ? `/deals/${deal.id}/events?limit=20` : null);
  const ownerDisplay = deal.ownerId === sessionUserId ? sessionUserName : deal.ownerName || "Unassigned";
  const customerDisplay = deal.company || deal.customerName || "";
  const sm = dealStageMeta[deal.stage];
  const today = todayIst2();
  const overdue = deal.expectedCloseAt && deal.expectedCloseAt < today && !["won", "lost"].includes(deal.stage);

  async function saveNote() {
    if (noteBody.trim().length < 2) return;
    setNoteSaving(true);
    try {
      await api<Activity>("/activities", {
        method: "POST",
        body: JSON.stringify({
          kind: "note",
          subject: "Follow-up note",
          description: noteBody.trim(),
          dealId: deal.id,
          contactId: deal.customerId,
          dueAt: noteDate ? `${noteDate}T09:00:00+05:30` : null,
          outcome: noteDate ? "follow_up" : null,
        }),
      });
      setNoteBody("");
      toast.success(noteDate ? `Follow-up saved — ${followUpLabel(noteDate)}` : "Note saved");
      activities.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setNoteSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col w-full max-w-lg">
        <SheetHeader className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base font-bold">{deal.name}</SheetTitle>
              <SheetDescription className="mt-0.5 text-xs">{customerDisplay || "No company"}</SheetDescription>
            </div>
            <Link href={`/deals/${deal.id}`} className="shrink-0 text-xs font-medium text-accent hover:underline flex items-center gap-1">
              <ExternalLink className="size-3" /> Full page
            </Link>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={sm?.tone ?? "neutral"}>{sm?.label ?? deal.stage}</Badge>
            <span className="text-sm font-bold tabular-nums">{formatCurrencyINR(Number(deal.amount))}</span>
            {deal.expectedCloseAt && (
              <span className={cn("text-xs", overdue ? "font-semibold text-warning" : "text-muted-foreground")}>
                Close: {deal.expectedCloseAt.slice(5)}{overdue ? " (overdue)" : ""}
              </span>
            )}
          </div>
          {/* Tab toggle */}
          <div className="mt-3 flex gap-1 border-b border-border">
            <button type="button" onClick={() => setTab("details")} className={cn("px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors", tab === "details" ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground")}>Details</button>
            {writable && <button type="button" onClick={() => setTab("edit")} className={cn("px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors", tab === "edit" ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground")}>Edit</button>}
          </div>
        </SheetHeader>

        <SheetBody className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "details" && (
            <div className="flex flex-col gap-5">
              {/* Key details */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Owner</p>
                  <p className="mt-0.5 font-medium">{ownerDisplay}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Customer</p>
                  <p className="mt-0.5 font-medium">{deal.customerName || "—"}</p>
                </div>
                {deal.phone && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone</p>
                    <p className="mt-0.5 font-medium tabular-nums">{deal.phone}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Created</p>
                  <p className="mt-0.5 font-medium">{formatDateTime(deal.createdAt)}</p>
                </div>
              </div>

              {/* Stage move */}
              {writable && !["won", "lost"].includes(deal.stage) && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Move stage</p>
                  <div className="flex flex-wrap gap-1.5">
                    {stages.filter((s) => s.key !== deal.stage).map((s) => (
                      <button key={s.key} type="button" onClick={() => onMove(s.key)} className="inline-flex items-center gap-1.5 border border-border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-surface-2">
                        <span className={cn("size-2 rounded-full", s.color)} /> {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick follow-up note */}
              <div className="border border-border p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Quick follow-up</p>
                <Textarea
                  placeholder="Add a note or follow-up..."
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  className="min-h-[60px] text-xs"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {([["Tomorrow", () => inDays(1)], ["3 days", () => inDays(3)], ["1 week", () => inDays(7)], ["No date", () => null]] as const).map(([label, fn]) => (
                      <button key={label} type="button" onClick={() => setNoteDate(fn())} className={cn("px-2 py-0.5 text-[10px] border transition-colors", noteDate === fn() ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground hover:text-foreground")}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <Button size="sm" onClick={saveNote} disabled={noteSaving || noteBody.trim().length < 2} className="h-7 text-xs gap-1">
                    <Send className="size-3" /> Save
                  </Button>
                </div>
              </div>

              {/* Recent activity */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Recent activity</p>
                <div className="flex flex-col gap-1.5">
                  {(activities.data ?? []).length === 0 && (events.data ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground py-4 text-center">No activity yet. Add a note above to get started.</p>
                  )}
                  {(activities.data ?? []).slice(0, 10).map((act) => {
                    const Icon = ACTIVITY_ICONS[act.kind] ?? ClipboardList;
                    const color = ACTIVITY_COLORS[act.kind] ?? "text-muted-foreground";
                    return (
                      <div key={act.id} className="flex items-start gap-2.5 border border-border border-l-[3px] border-l-accent bg-surface px-3 py-2">
                        <Icon className={cn("mt-0.5 size-3.5 shrink-0", color)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-xs font-medium">{act.subject}</p>
                            <time className="shrink-0 text-[10px] text-muted-foreground">{formatRelativeTime(act.createdAt)}</time>
                          </div>
                          {act.description && <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">{act.description}</p>}
                        </div>
                      </div>
                    );
                  })}
                  {(events.data ?? []).slice(0, 5).map((ev) => (
                    <div key={ev.id} className="flex items-start gap-2.5 border border-border border-l-[3px] border-l-info bg-surface px-3 py-2">
                      <Clock className="mt-0.5 size-3.5 shrink-0 text-info" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-xs font-medium">{ev.action.replace(/_/g, " ")}</p>
                          <time className="shrink-0 text-[10px] text-muted-foreground">{formatRelativeTime(ev.createdAt)}</time>
                        </div>
                        {ev.userName && <p className="text-[10px] text-muted-foreground">by {ev.userName}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "edit" && (
            <DealForm key={`${deal.id}-${deal.version}-${deal.stage}`} deal={deal} onSaved={onSaved} />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
