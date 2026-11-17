"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus, GripVertical, RefreshCw, Building2, User, CalendarClock,
  LayoutGrid, List, Settings2, ArrowUpDown, ArrowUp, ArrowDown,
  Eye, MoreHorizontal, Pencil, Trash2, ChevronUp, ChevronDown as ChevronDownIcon,
} from "lucide-react";
import { toast } from "sonner";
import { demoMode } from "@/lib/demo-mode";
import { can } from "@/lib/permissions";
import { useApi } from "@/lib/api/use-api";
import { useAllRows } from "@/lib/api/use-all-rows";
import { api, message } from "@/lib/api/client";
import type { Deal } from "@/lib/api/types";
import { useSession } from "@/components/auth/session-provider";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { DealForm } from "@/components/deals/deal-form";
import { formatCurrencyINR, formatRelativeTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { demoDealRows } from "@/lib/api/demo-data";
import { usePipelineConfig, barColor, AVAILABLE_COLORS, toSlug, DEFAULT_STAGES, type PipelineStage } from "@/lib/hooks/use-pipeline-config";

const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

type ViewMode = "board" | "table";
type SortKey = "name" | "amount" | "stage" | "expectedCloseAt" | "updatedAt" | "customerName";
type SortDir = "asc" | "desc";

function useLocalView(): [ViewMode, (v: ViewMode) => void] {
  const [view, setViewState] = useState<ViewMode>(() => {
    try { return (localStorage.getItem("janus:deals:view") as ViewMode) || "board"; } catch { return "board"; }
  });
  const setView = (v: ViewMode) => { setViewState(v); try { localStorage.setItem("janus:deals:view", v); } catch {} };
  return [view, setView];
}

export default function DealsPage() {
  const session = useSession();
  const canWrite = can(session, "leads:write");
  const canAdmin = can(session, "settings:manage");
  const usingDemo = demoMode;
  const writable = canWrite && !usingDemo;

  const pipeline = usePipelineConfig();
  const { stages, stageMap } = pipeline;
  const stageOrder = stages.map((s) => s.key);

  const [cursors, setCursors] = useState(["0"]);
  const result = useApi<Deal[]>(`/deals?after_id=${cursors.at(-1)}&limit=100`);
  const deals = result.data ?? (usingDemo ? demoDealRows : []);
  const everyDeal = useAllRows<Deal>(usingDemo ? null : "/deals");
  const allDeals = everyDeal.data ?? deals;

  const [view, setView] = useLocalView();
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

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="size-3 text-muted-foreground/50" />;
    return sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
  }

  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = sorted.length > 0 && sorted.every((d) => selectedIds.has(d.id));

  const stageMeta = (key: string) => stageMap.get(key) ?? { key, label: key, color: "bg-slate-500", probability: 0 };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Deal Pipeline"
        description={result.data ? `${filtered.length} deal${filtered.length === 1 ? "" : "s"} · ${formatCurrencyINR(openValue)} open · ${formatCurrencyINR(weightedValue)} weighted` : usingDemo ? "Sales pipeline" : "Your sales pipeline"}
        actions={<>
          <Button size="sm" variant="secondary" onClick={reload} aria-label="Refresh"><RefreshCw className="size-3.5" /></Button>
          {canAdmin && <Button size="sm" variant="outline" onClick={() => setStageSettingsOpen(true)}><Settings2 className="size-3.5" /> Stages</Button>}
          {writable && <Button size="sm" asChild><Link href="/leads"><Plus className="size-3.5" /> New Deal</Link></Button>}
        </>}
      />

      {!demoMode && result.error && <p role="alert" className="mx-6 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{result.error}</p>}

      {/* Pipeline value bar */}
      <div className="px-6 pb-3">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
          {pipelineStages.map((stage) => {
            const stageVal = filtered.filter((d) => d.stage === stage.key).reduce((a, d) => a + Number(d.amount), 0);
            const pct = (stageVal / pipelineTotal) * 100;
            if (pct < 0.5) return null;
            return <div key={stage.key} className={cn("h-full transition-all", barColor(stage.color))} style={{ width: `${pct}%` }} title={`${stage.label}: ${formatCurrencyINR(stageVal)}`} />;
          })}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {pipelineStages.map((stage) => {
            const count = filtered.filter((d) => d.stage === stage.key).length;
            return <button key={stage.key} type="button" onClick={() => setStageFilter(stageFilter === stage.key ? "all" : stage.key)} className={cn("flex items-center gap-1.5 text-[10px] transition-colors", stageFilter === stage.key ? "font-bold" : "text-muted-foreground hover:text-foreground")}>
              <span className={cn("size-2 rounded-full", stage.color)} />
              {stage.label} ({count})
            </button>;
          })}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-2 px-6 pb-3 sm:grid-cols-4" aria-label="Pipeline summary">
        {([
          ["closing", "Closing This Month", closing, "bg-emerald-500"],
          ["slipped", "Past Close Date", slipped, "bg-amber-500"],
          ["undated", "No Close Date", undated, "bg-slate-400"],
          ["mine", "My Deals", allDeals.filter((d) => d.ownerId === session.user.id), "bg-accent"],
        ] as const).map(([key, title, list, dot]) => (
          <button key={key} type="button" aria-pressed={closeFilter === key} onClick={() => setCloseFilter(closeFilter === key ? "all" : key)} className={cn("rounded-xl border p-3 text-left transition-all", closeFilter === key ? "border-accent bg-accent-muted shadow-sm" : "border-border bg-surface hover:bg-surface-2")}>
            <div className="flex items-center gap-1.5">
              <span className={cn("size-1.5 rounded-full", dot)} />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={cn("text-lg font-bold tabular-nums", key === "slipped" && list.length ? "text-warning" : "")}>{list.length}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{formatCurrencyINR(sumOf(list))}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 pb-3">
        <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
          <button type="button" onClick={() => setView("board")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors", view === "board" ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}><LayoutGrid className="size-3.5" /> Board</button>
          <button type="button" onClick={() => setView("table")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors", view === "table" ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}><List className="size-3.5" /> Table</button>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search deals…" className="w-60" />
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="All stages" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {stages.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" disabled={cursors.length === 1} onClick={() => setCursors(cursors.slice(0, -1))}>Prev</Button>
          <span className="text-xs text-muted-foreground">Page {cursors.length}</span>
          <Button size="sm" variant="ghost" disabled={deals.length < 100} onClick={() => setCursors([...cursors, deals.at(-1)!.id])}>Next</Button>
        </div>
      </div>

      {!result.data && !result.error && <p role="status" className="px-6 py-4 text-sm">Loading deals…</p>}

      {/* Board View */}
      {(result.data || usingDemo) && view === "board" && (
        <>
          {filtered.length === 0 && <p className="px-6 pt-4 text-sm text-muted-foreground">No deals match your filters.</p>}
          <div className="flex-1 overflow-auto px-6 py-4">
            <div className="flex h-full min-h-[32rem] gap-3" style={{ minWidth: stages.length * 272 }}>
              {stages.map((stage) => {
                const items = filtered.filter((d) => d.stage === stage.key);
                const stageVal = items.reduce((s, d) => s + Number(d.amount), 0);
                return (
                  <section
                    key={stage.key}
                    aria-label={`${stage.label} deals`}
                    onDragOver={(e) => { if (writable && !busy) { e.preventDefault(); setDragOverStage(stage.key); } }}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={(e) => { e.preventDefault(); setDragOverStage(null); const deal = deals.find((d) => d.id === e.dataTransfer.getData("text/plain")); if (deal) void move(deal, stage.key); }}
                    className={cn("flex w-64 shrink-0 flex-col rounded-xl border transition-all", dragOverStage === stage.key ? "border-accent bg-accent-muted/30 shadow-md" : "border-border bg-surface-2/30")}
                  >
                    <div className="flex items-center gap-2 px-3 py-3 border-b border-border bg-surface/50 rounded-t-xl">
                      <span className={cn("size-2.5 rounded-full shrink-0", stage.color)} />
                      <h2 className="text-xs font-semibold flex-1 uppercase tracking-wide">{stage.label}</h2>
                      <Badge variant="neutral" className="text-[10px] px-1.5 py-0">{items.length}</Badge>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-surface/30">
                      <span className="text-[11px] font-medium tabular-nums text-muted-foreground">{formatCurrencyINR(stageVal)}</span>
                      {stage.key !== "won" && stage.key !== "lost" && <span className="text-[9px] font-medium text-muted-foreground">{stage.probability}%</span>}
                    </div>
                    <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 py-2">
                      {items.map((deal) => (
                        <DealCard key={deal.id} deal={deal} writable={writable} busy={busy} usingDemo={usingDemo} today={today} sessionUserId={session.user.id} sessionUserName={session.user.name} onEdit={() => setEditing(deal)} onDragStart={(e) => { e.dataTransfer.setData("text/plain", deal.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragOverStage(null)} stageMeta={stageMeta} />
                      ))}
                      {items.length === 0 && (
                        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground py-8">Drop deals here</div>
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
      {(result.data || usingDemo) && view === "table" && (
        <div className="flex-1 overflow-auto px-6 py-4">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <LayoutGrid className="size-10 text-muted-foreground/30" />
              <p className="text-sm font-medium">No deals match your filters</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface-2">
                    <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={(c) => setSelectedIds(c ? new Set(sorted.map((d) => d.id)) : new Set())} /></TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}><div className="flex items-center gap-1">Deal <SortIcon col="name" /></div></TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("customerName")}><div className="flex items-center gap-1">Customer <SortIcon col="customerName" /></div></TableHead>
                    <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("amount")}><div className="flex items-center justify-end gap-1">Value <SortIcon col="amount" /></div></TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("stage")}><div className="flex items-center gap-1">Stage <SortIcon col="stage" /></div></TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("expectedCloseAt")}><div className="flex items-center gap-1">Close Date <SortIcon col="expectedCloseAt" /></div></TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("updatedAt")}><div className="flex items-center gap-1">Updated <SortIcon col="updatedAt" /></div></TableHead>
                    <TableHead className="w-14" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((deal) => {
                    const overdue = deal.expectedCloseAt && deal.expectedCloseAt < today && !["won", "lost"].includes(deal.stage);
                    const sm = stageMeta(deal.stage);
                    return (
                      <TableRow key={deal.id} className={cn("group", selectedIds.has(deal.id) && "bg-accent-muted/30")}>
                        <TableCell><Checkbox checked={selectedIds.has(deal.id)} onCheckedChange={() => toggleSelect(deal.id)} /></TableCell>
                        <TableCell>{usingDemo ? <span className="text-sm font-medium">{deal.name}</span> : <Link href={`/deals/${deal.id}`} className="text-sm font-medium hover:text-accent hover:underline">{deal.name}</Link>}</TableCell>
                        <TableCell><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Building2 className="size-3 shrink-0" /><span className="truncate max-w-[140px]">{deal.customerName || deal.company || "—"}</span></div></TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-sm">{formatCurrencyINR(Number(deal.amount), false)}</TableCell>
                        <TableCell>
                          {writable ? (
                            <Select value={deal.stage} onValueChange={(v) => move(deal, v)}>
                              <SelectTrigger className="h-7 w-32 text-xs border-0 bg-transparent px-1 hover:bg-surface-2">
                                <div className="flex items-center gap-1.5"><span className={cn("size-2 rounded-full", sm.color)} /><SelectValue /></div>
                              </SelectTrigger>
                              <SelectContent>{stages.map((s) => <SelectItem key={s.key} value={s.key}><div className="flex items-center gap-2"><span className={cn("size-2 rounded-full", s.color)} />{s.label}</div></SelectItem>)}</SelectContent>
                            </Select>
                          ) : <div className="flex items-center gap-1.5 text-xs"><span className={cn("size-2 rounded-full", sm.color)} />{sm.label}</div>}
                        </TableCell>
                        <TableCell className={cn("text-xs", overdue ? "text-warning font-medium" : "text-muted-foreground")}>{deal.expectedCloseAt ? <div className="flex items-center gap-1"><CalendarClock className="size-3" />{deal.expectedCloseAt}</div> : <span className="text-muted-foreground/50">—</span>}</TableCell>
                        <TableCell><div className="flex items-center gap-1 text-xs text-muted-foreground"><User className="size-3" /><span className="truncate max-w-[80px]">{deal.ownerId === session.user.id ? session.user.name : deal.ownerName || "Unassigned"}</span></div></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatRelativeTime(deal.updatedAt)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="size-7 p-0 opacity-0 group-hover:opacity-100"><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!usingDemo && <DropdownMenuItem asChild><Link href={`/deals/${deal.id}`}><Eye className="size-3.5 mr-2" /> View</Link></DropdownMenuItem>}
                              {writable && <DropdownMenuItem onClick={() => setEditing(deal)}><Pencil className="size-3.5 mr-2" /> Edit</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 border-t border-border bg-surface-2 px-4 py-2">
                  <span className="text-xs font-medium">{selectedIds.size} selected</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatCurrencyINR([...selectedIds].reduce((s, id) => { const d = sorted.find((x) => x.id === id); return s + Number(d?.amount ?? 0); }, 0))}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stage Settings Dialog */}
      <StageSettingsDialog open={stageSettingsOpen} onOpenChange={setStageSettingsOpen} pipeline={pipeline} allDeals={allDeals} />

      {/* Edit Deal Dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit deal</DialogTitle>
            <DialogDescription>Save changes to this deal and its linked lead.</DialogDescription>
          </DialogHeader>
          {editing && <DealForm key={`${editing.id}-${editing.version}-${editing.stage}`} deal={editing} onSaved={() => { setEditing(null); reload(); toast.success("Deal saved"); }} />}
        </DialogContent>
      </Dialog>
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
function DealCard({ deal, writable, busy, usingDemo, today, sessionUserId, sessionUserName, onEdit, onDragStart, onDragEnd, stageMeta }: {
  deal: Deal; writable: boolean; busy: boolean; usingDemo: boolean; today: string;
  sessionUserId: string; sessionUserName: string;
  onEdit: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void;
  stageMeta: (key: string) => PipelineStage;
}) {
  const overdue = deal.expectedCloseAt && deal.expectedCloseAt < today;
  return (
    <article
      draggable={writable && !busy}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3 shadow-sm transition-all hover:shadow-md hover:border-border-strong cursor-pointer"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-2">
        {usingDemo
          ? <span className="text-[13px] font-semibold leading-tight line-clamp-2">{deal.name}</span>
          : <Link className="text-[13px] font-semibold leading-tight line-clamp-2 hover:text-accent" href={`/deals/${deal.id}`} onClick={(e) => e.stopPropagation()}>{deal.name}</Link>}
        {writable && <GripVertical aria-hidden className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />}
      </div>
      {(deal.customerName || deal.company) && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Building2 className="size-3 shrink-0" />
          <span className="truncate">{deal.customerName}{deal.company && ` · ${deal.company}`}</span>
        </div>
      )}
      <p className="text-sm font-bold tabular-nums">{formatCurrencyINR(Number(deal.amount), false)}</p>
      {deal.expectedCloseAt && (
        <div className={cn("flex items-center gap-1 text-[10px]", overdue ? "text-warning font-medium" : "text-muted-foreground")}>
          <CalendarClock className="size-3" />
          {overdue ? "Overdue: " : "Close: "}{deal.expectedCloseAt}
        </div>
      )}
      <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-border/50">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <User className="size-2.5" />
          <span className="truncate max-w-[100px]">{deal.ownerId === sessionUserId ? sessionUserName : deal.ownerName || "Unassigned"}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{formatRelativeTime(deal.updatedAt)}</span>
      </div>
    </article>
  );
}
