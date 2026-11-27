"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Tag,
  MessageCircle,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { useSession } from "@/components/auth/session-provider";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/page-header";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatCurrencyINR, formatRelativeTime, formatDate, cn } from "@/lib/utils";
import { useCrmContext } from "@/lib/hooks/use-crm-context";
import { CustomerDetailPanel } from "@/components/crm/customer-detail";

type Filter = "all" | "active" | "won" | "needs_attention";
type TypeFilter = "all" | "leads_only" | "has_deals";
type SortKey = "name" | "stage" | "lastActivity" | "value" | "followUp" | "owner";
type SortDir = "asc" | "desc";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "won", label: "Won" },
  { key: "needs_attention", label: "Needs attention" },
];

const stageOrder = ["lost", "new", "contacted", "qualified", "converted", "won"];

function ownerInitials(name: string | null): string {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

interface CrmTag {
  id: string;
  name: string;
  color: string;
}

interface CustomerRow {
  contactId: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string;
  leadCount: number;
  dealCount: number;
  dealValue: string;
  dealStage: string | null;
  stage: string;
  ownerId: string | null;
  ownerName: string | null;
  lastActivityAt: string | null;
  nextFollowUpOn: string | null;
  source: string | null;
  tags: CrmTag[];
}

function displayName(row: CustomerRow) {
  return row.name || row.phone || row.email || `Customer #${row.contactId}`;
}

function followUpStatus(dateStr: string | null): { label: string; cls: string } {
  if (!dateStr) return { label: "—", cls: "text-muted-foreground/40" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: formatDate(dateStr), cls: "text-danger font-medium" };
  if (diff <= 2) return { label: diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : formatDate(dateStr), cls: "text-warning font-medium" };
  return { label: formatDate(dateStr), cls: "text-muted-foreground" };
}

export default function CustomersPage() {
  const router = useRouter();
  const session = useSession();
  const canWrite = can(session, "leads:write");
  const { crms, multiCrm } = useCrmContext();
  const [crmFilter, setCrmFilter] = useState<string>("all");
  const crmParam =
    multiCrm && crmFilter !== "all" ? `&crm_id=${crmFilter}` : "";

  const [query, setQuery] = useState("");
  const [serverQuery, setServerQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [myOnly, setMyOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("lastActivity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showArchived, setShowArchived] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingContact, setDeletingContact] = useState<{ id: string; name: string } | null>(null);

  const DRAWER_MIN = 420;
  const DRAWER_MAX = 1200;
  const [drawerWidth, setDrawerWidth] = useState(() => {
    try {
      const v = Number(localStorage.getItem("janus:customers:drawerW"));
      return v >= DRAWER_MIN && v <= DRAWER_MAX ? v : 672;
    } catch {
      return 672;
    }
  });
  const dragging = useRef(false);
  const startDrawerDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startW = drawerWidth;
      const onMove = (ev: PointerEvent) => {
        const delta = startX - ev.clientX;
        const next = Math.min(DRAWER_MAX, Math.max(DRAWER_MIN, startW + delta));
        setDrawerWidth(next);
      };
      const onUp = () => {
        dragging.current = false;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        setDrawerWidth((w) => {
          try { localStorage.setItem("janus:customers:drawerW", String(w)); } catch {}
          return w;
        });
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [drawerWidth],
  );

  const tags = useApi<CrmTag[]>("/tags");
  const tagList = useMemo(() => tags.data ?? [], [tags.data]);

  const [perPage, setPerPage] = useState<10 | 25 | 50 | 100>(() => {
    try {
      const v = Number(localStorage.getItem("janus:customers:perPage"));
      return v === 10 || v === 50 || v === 100 ? v : 25;
    } catch {
      return 25;
    }
  });

  const [cursors, setCursors] = useState(["0"]);
  const afterId = cursors.at(-1)!;

  useEffect(() => {
    const timer = setTimeout(() => {
      setServerQuery(query.trim());
      setCursors(["0"]);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const changeFilter = useCallback((v: Filter) => {
    setFilter(v);
    setCursors(["0"]);
  }, []);

  const searchParam = serverQuery
    ? `&q=${encodeURIComponent(serverQuery)}`
    : "";
  const filterParam = filter !== "all" ? `&filter=${filter}` : "";
  const ownerParam = myOnly ? `&owner_id=${session.user.id}` : "";
  const archivedParam = showArchived ? "&include_archived=true" : "";
  const customers = useApi<CustomerRow[]>(
    `/customers?limit=${perPage}&after_id=${afterId}${searchParam}${filterParam}${crmParam}${ownerParam}${archivedParam}`,
  );

  const serverRows = useMemo(() => customers.data ?? [], [customers.data]);
  const loading = !customers.data && !customers.error;
  const loadError = customers.error;

  const reload = useCallback(() => {
    setRefreshing(true);
    customers.reload();
    setTimeout(() => setRefreshing(false), 600);
  }, [customers]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "lastActivity" ? "desc" : "asc");
    }
  }

  const sortIcon = (col: SortKey) => {
    if (sortKey !== col)
      return <ArrowUpDown className="size-3 text-muted-foreground/50" />;
    return sortDir === "asc" ? (
      <ArrowUp className="size-3" />
    ) : (
      <ArrowDown className="size-3" />
    );
  };

  const filtered = useMemo(() => {
    let rows = serverRows;
    if (typeFilter !== "all")
      rows = rows.filter((r) =>
        typeFilter === "has_deals" ? (r.dealCount ?? 0) > 0 : (r.dealCount ?? 0) === 0,
      );
    if (tagFilter !== "all")
      rows = rows.filter((r) => r.tags?.some((t) => t.id === tagFilter));
    return rows;
  }, [serverRows, typeFilter, tagFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name")
        cmp = displayName(a).localeCompare(displayName(b));
      else if (sortKey === "value")
        cmp = Number(a.dealValue) - Number(b.dealValue);
      else if (sortKey === "stage")
        cmp = stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage);
      else if (sortKey === "followUp")
        cmp = (a.nextFollowUpOn ?? "9999").localeCompare(b.nextFollowUpOn ?? "9999");
      else if (sortKey === "owner")
        cmp = (a.ownerName ?? "").localeCompare(b.ownerName ?? "");
      else
        cmp = (a.lastActivityAt ?? "").localeCompare(b.lastActivityAt ?? "");
      return cmp * dir;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const [todayStr] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  });
  const [threeDayCutoff] = useState(() =>
    new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  );
  const stats = useMemo(() => {
    const active = serverRows.filter(
      (r) => r.stage && !["won", "lost"].includes(r.stage),
    );
    return {
      total: serverRows.length,
      activeCount: active.length,
      overdueFollowUps: serverRows.filter(
        (r) => r.nextFollowUpOn && r.nextFollowUpOn < todayStr && !["won", "lost"].includes(r.stage),
      ).length,
      todayFollowUps: serverRows.filter(
        (r) => r.nextFollowUpOn === todayStr,
      ).length,
      totalRev: serverRows.reduce((s, r) => s + Number(r.dealValue), 0),
      totalDeals: serverRows.filter((r) => (r.dealCount ?? 0) > 0).length,
      unassigned: serverRows.filter(
        (r) => !r.ownerId && !["won", "lost"].includes(r.stage),
      ).length,
      needsAttCount: serverRows.filter(
        (r) =>
          r.lastActivityAt &&
          r.lastActivityAt < threeDayCutoff &&
          !["won", "lost"].includes(r.stage),
      ).length,
    };
  }, [serverRows, threeDayCutoff, todayStr]);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allSelected =
    sorted.length > 0 && sorted.every((r) => selectedIds.has(r.contactId));

  const filtersActive =
    query.trim() ||
    filter !== "all" ||
    crmFilter !== "all" ||
    typeFilter !== "all" ||
    tagFilter !== "all" ||
    myOnly ||
    showArchived;
  const clearFilters = () => {
    setQuery("");
    setFilter("all");
    setTypeFilter("all");
    setTagFilter("all");
    setCrmFilter("all");
    setMyOnly(false);
    setShowArchived(false);
  };

  async function deleteSelected() {
    if (!selectedIds.size) return;
    setBulkUpdating(true);
    let deleted = 0;
    let skipped = 0;
    for (const cid of selectedIds) {
      try {
        await api(`/contacts/${encodeURIComponent(cid)}`, { method: "DELETE" });
        deleted++;
      } catch {
        skipped++;
      }
    }
    if (deleted > 0 && skipped === 0) {
      toast.success(`${deleted} customer${deleted === 1 ? "" : "s"} deleted`);
    } else if (deleted > 0 && skipped > 0) {
      toast.success(
        `${deleted} deleted, ${skipped} skipped (have leads)`,
      );
    } else if (skipped > 0) {
      toast.error(
        `${skipped} customer${skipped === 1 ? "" : "s"} skipped — delete their leads first`,
      );
    }
    setDeleting(false);
    setSelectedIds(new Set());
    setBulkUpdating(false);
    customers.reload();
  }

  async function deleteSingleContact() {
    if (!deletingContact) return;
    setBulkUpdating(true);
    try {
      await api(`/contacts/${encodeURIComponent(deletingContact.id)}`, { method: "DELETE" });
      toast.success("Customer deleted");
      customers.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBulkUpdating(false);
      setDeletingContact(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col">
      <PageHeader
        title="Customers"
        description="Every customer across your pipeline."
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={reload}
            disabled={refreshing}
            aria-label="Refresh"
          >
            {refreshing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
        }
      />

      {loadError && (
        <p
          role="alert"
          className="mx-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger sm:mx-6"
        >
          Your customers could not be loaded: {loadError}. Refresh to try again;
          nothing is lost.
        </p>
      )}

      {/* ── Stat cards ── */}
      {customers.data && serverRows.length > 0 && (
        <section className="grid grid-cols-2 gap-2 px-4 pb-3 sm:gap-3 sm:px-6 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface px-3 py-2.5 sm:p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">Overdue follow-ups</p>
            <p className={cn("mt-0.5 text-xl font-semibold sm:mt-1 sm:text-2xl", stats.overdueFollowUps > 0 ? "text-danger" : "")}>
              {stats.overdueFollowUps}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground sm:text-xs">
              {stats.todayFollowUps > 0
                ? `${stats.todayFollowUps} due today`
                : "None due today"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface px-3 py-2.5 sm:p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">Pipeline value</p>
            <p className="mt-0.5 text-xl font-semibold sm:mt-1 sm:text-2xl">{formatCurrencyINR(stats.totalRev)}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground sm:text-xs">
              {stats.totalDeals} deal{stats.totalDeals !== 1 ? "s" : ""} open
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface px-3 py-2.5 sm:p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">Active customers</p>
            <p className="mt-0.5 text-xl font-semibold sm:mt-1 sm:text-2xl">{stats.activeCount}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground sm:text-xs">
              {stats.total} total
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface px-3 py-2.5 sm:p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">Needs action</p>
            <div className="mt-0.5 flex items-baseline gap-2 sm:mt-1">
              <p className={cn("text-xl font-semibold sm:text-2xl", stats.needsAttCount > 0 ? "text-warning" : "")}>
                {stats.needsAttCount}
              </p>
              {stats.unassigned > 0 && (
                <span className="text-[10px] font-medium text-danger sm:text-xs">
                  {stats.unassigned} unassigned
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground sm:text-xs">
              No activity 3+ days
            </p>
          </div>
        </section>
      )}

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-border px-4 pb-2.5 sm:px-6">
        <div className="relative mr-2 w-full sm:w-52">
          <Search className="pointer-events-none absolute left-0 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers..."
            className="h-7 w-full border-0 bg-transparent pl-5 pr-6 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* My customers toggle */}
        <button
          type="button"
          aria-pressed={myOnly}
          onClick={() => { setMyOnly((v) => !v); setCursors(["0"]); }}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors",
            myOnly ? "font-semibold text-accent" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <User className="size-3" />
          My customers
        </button>

        {/* Status filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors",
                filter !== "all"
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <SlidersHorizontal className="size-3" />
              {filter === "all"
                ? "Status"
                : FILTERS.find((f) => f.key === filter)?.label}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {FILTERS.map((f) => (
              <DropdownMenuItem
                key={f.key}
                onSelect={() => changeFilter(f.key)}
                className={filter === f.key ? "font-semibold" : ""}
              >
                {f.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Type filter: Lead / Deal */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors",
                typeFilter !== "all"
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {typeFilter === "all"
                ? "Type"
                : typeFilter === "has_deals"
                  ? "Deals"
                  : "Leads"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onSelect={() => setTypeFilter("all")}
              className={typeFilter === "all" ? "font-semibold" : ""}
            >
              All types
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setTypeFilter("leads_only")}
              className={typeFilter === "leads_only" ? "font-semibold" : ""}
            >
              Leads
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setTypeFilter("has_deals")}
              className={typeFilter === "has_deals" ? "font-semibold" : ""}
            >
              Deals
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Tag filter */}
        {tagList.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors",
                  tagFilter !== "all"
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Tag className="size-3" />
                {tagFilter === "all"
                  ? "Tag"
                  : tagList.find((t) => t.id === tagFilter)?.name ?? "Tag"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onSelect={() => setTagFilter("all")}
                className={tagFilter === "all" ? "font-semibold" : ""}
              >
                All tags
              </DropdownMenuItem>
              {tagList.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onSelect={() => setTagFilter(t.id)}
                  className={cn(
                    "gap-2",
                    tagFilter === t.id && "font-semibold",
                  )}
                >
                  <span
                    className="inline-block size-2 shrink-0"
                    style={{ background: t.color }}
                  />
                  {t.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* At risk shortcut */}
        <button
          type="button"
          aria-pressed={filter === "needs_attention"}
          onClick={() =>
            changeFilter(
              filter === "needs_attention" ? "all" : "needs_attention",
            )
          }
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors",
            filter === "needs_attention"
              ? "font-semibold text-warning"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <AlertTriangle className="size-3" />
          At risk
          {stats.needsAttCount > 0 && (
            <span className="ml-0.5 tabular-nums text-warning">
              ({stats.needsAttCount})
            </span>
          )}
        </button>

        {multiCrm && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors",
                  crmFilter !== "all"
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Building2 className="size-3" />
                {crmFilter === "all"
                  ? "CRM"
                  : (crms.find((c) => c.id === crmFilter)?.name ?? "CRM")}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onSelect={() => setCrmFilter("all")}
                className={crmFilter === "all" ? "font-semibold" : ""}
              >
                All CRMs
              </DropdownMenuItem>
              {crms.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onSelect={() => setCrmFilter(c.id)}
                  className={crmFilter === c.id ? "font-semibold" : ""}
                >
                  {c.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <button
          type="button"
          aria-pressed={showArchived}
          onClick={() => { setShowArchived((v) => !v); setCursors(["0"]); }}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors",
            showArchived ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Archive className="size-3" />
          Archived
        </button>

        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3 inline" /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-1">
          {customers.data && (
            <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:inline">
              {sorted.length} customers
            </span>
          )}
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div role="status" className="space-y-px px-4 pt-2 sm:px-6">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2.5">
              <div className="h-3.5 w-3.5 animate-pulse rounded bg-surface-2" />
              <div className="size-7 animate-pulse rounded-full bg-surface-2" />
              <div className="h-3.5 w-28 animate-pulse rounded bg-surface-2" />
              <div className="h-3.5 w-20 animate-pulse rounded bg-surface-2" />
              <div className="h-3.5 w-24 animate-pulse rounded bg-surface-2" />
              <div className="h-3.5 flex-1 animate-pulse rounded bg-surface-2" />
            </div>
          ))}
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !loadError && sorted.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
          <Users className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">
            {filtersActive
              ? "No customers match"
              : afterId === "0"
                ? "No customers yet"
                : "End of list"}
          </p>
          <p className="text-xs text-muted-foreground">
            {filtersActive
              ? "Adjust filters or clear them."
              : "Customers are created when leads are captured."}
          </p>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-1 text-xs font-medium text-accent hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Table ── */}
      {!loading && !loadError && sorted.length > 0 && (
        <div className="flex-1 overflow-x-auto px-4 py-3 sm:px-6">
          <table className="w-full min-w-[500px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/50 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <th className="w-8 pb-2 pr-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(c) =>
                      setSelectedIds(
                        c
                          ? new Set(sorted.map((r) => r.contactId))
                          : new Set(),
                      )
                    }
                  />
                </th>
                <th
                  className="cursor-pointer select-none pb-2 pr-3"
                  onClick={() => toggleSort("name")}
                >
                  <span className="inline-flex items-center gap-1">
                    Customer {sortIcon("name")}
                  </span>
                </th>
                <th
                  className="cursor-pointer select-none pb-2 pr-3"
                  onClick={() => toggleSort("stage")}
                >
                  <span className="inline-flex items-center gap-1">
                    Stage {sortIcon("stage")}
                  </span>
                </th>
                <th
                  className="hidden cursor-pointer select-none pb-2 pr-3 text-right sm:table-cell"
                  onClick={() => toggleSort("value")}
                >
                  <span className="inline-flex items-center gap-1">
                    Value {sortIcon("value")}
                  </span>
                </th>
                <th
                  className="hidden cursor-pointer select-none pb-2 pr-3 md:table-cell"
                  onClick={() => toggleSort("owner")}
                >
                  <span className="inline-flex items-center gap-1">
                    Owner {sortIcon("owner")}
                  </span>
                </th>
                <th
                  className="hidden cursor-pointer select-none pb-2 pr-3 lg:table-cell"
                  onClick={() => toggleSort("followUp")}
                >
                  <span className="inline-flex items-center gap-1">
                    Follow-up {sortIcon("followUp")}
                  </span>
                </th>
                <th
                  className="cursor-pointer select-none pb-2 pr-3"
                  onClick={() => toggleSort("lastActivity")}
                >
                  <span className="inline-flex items-center gap-1">
                    Activity {sortIcon("lastActivity")}
                  </span>
                </th>
                <th className="w-20 pb-2 sm:w-24" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const name = displayName(row);
                const selected = selectedIds.has(row.contactId);
                const fu = followUpStatus(row.nextFollowUpOn);
                const val = Number(row.dealValue);
                const hasDeals = (row.dealCount ?? 0) > 0;
                return (
                  <tr
                    key={row.contactId}
                    className={cn(
                      "group border-b border-border/30 transition-colors hover:bg-surface-2/40 cursor-pointer",
                      selected && "bg-accent/5",
                    )}
                    onClick={() => setSelectedContactId(row.contactId)}
                  >
                    <td
                      className="py-2.5 pr-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleSelect(row.contactId)}
                      />
                    </td>
                    {/* Customer: name, company, source badge, tag dots */}
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <CustomerAvatar
                          name={name}
                          color="#4169e1"
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium text-foreground">
                              {name}
                            </span>
                            {row.source && (
                              <span className="hidden shrink-0 rounded bg-surface-2 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground sm:inline">
                                {row.source}
                              </span>
                            )}
                            {row.tags?.length > 0 && (
                              <span className="hidden shrink-0 items-center gap-0.5 sm:inline-flex">
                                {row.tags.slice(0, 3).map((t) => (
                                  <span
                                    key={t.id}
                                    className="inline-block size-1.5 rounded-full"
                                    style={{ background: t.color }}
                                    title={t.name}
                                  />
                                ))}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {[row.company, row.phone || row.email].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    {/* Stage + deal badge */}
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs capitalize text-muted-foreground">
                          {hasDeals && row.dealStage
                            ? row.dealStage.replaceAll("_", " ")
                            : row.stage.replaceAll("_", " ")}
                        </span>
                        {hasDeals && (
                          <span className="text-[10px] font-medium text-accent">
                            {row.dealCount} deal{row.dealCount > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Value */}
                    <td className="hidden py-2.5 pr-3 text-right sm:table-cell">
                      {val > 0 ? (
                        <span className="text-xs font-medium tabular-nums text-foreground">
                          {formatCurrencyINR(val)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>
                    {/* Owner */}
                    <td className="hidden py-2.5 pr-3 md:table-cell">
                      {row.ownerName ? (
                        <span
                          className="inline-flex size-6 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-muted-foreground"
                          title={row.ownerName}
                        >
                          {ownerInitials(row.ownerName)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-danger/60">Unassigned</span>
                      )}
                    </td>
                    {/* Follow-up */}
                    <td className="hidden py-2.5 pr-3 lg:table-cell">
                      <span className={cn("text-xs", fu.cls)}>
                        {fu.label}
                      </span>
                    </td>
                    {/* Last activity */}
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                      {row.lastActivityAt
                        ? formatRelativeTime(row.lastActivityAt)
                        : "—"}
                    </td>
                    {/* Quick actions */}
                    <td
                      className="py-2.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                        <button
                          className="inline-flex size-7 items-center justify-center text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                          title="Chat"
                          onClick={() => router.push("/inbox")}
                        >
                          <MessageCircle className="size-3.5" />
                        </button>
                        <button
                          className="inline-flex size-7 items-center justify-center text-muted-foreground transition-colors hover:bg-surface-2 hover:text-danger"
                          title="Delete"
                          onClick={() => {
                            setDeletingContact({ id: row.contactId, name: row.name });
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Floating bulk bar (leads-style) ── */}
      {canWrite && selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 shadow-xl">
          <span className="flex items-center gap-1.5 pr-2 text-xs">
            <span className="inline-flex size-5 items-center justify-center rounded bg-accent text-[10px] font-bold text-accent-foreground">
              {selectedIds.size}
            </span>
            <span className="text-muted-foreground">selected</span>
          </span>
          <div className="h-5 w-px bg-border" />
          <button
            type="button"
            disabled={bulkUpdating}
            onClick={() => setDeleting(true)}
            className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
          >
            <Trash2 className="size-3" />
            Delete
          </button>
          <div className="h-5 w-px bg-border" />
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* ── Pagination ── */}
      {customers.data && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Per page</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-surface-2"
                >
                  {perPage}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-0">
                {([10, 25, 50, 100] as const).map((n) => (
                  <DropdownMenuItem
                    key={n}
                    onSelect={() => {
                      setPerPage(n);
                      try {
                        localStorage.setItem(
                          "janus:customers:perPage",
                          String(n),
                        );
                      } catch {}
                      setCursors(["0"]);
                    }}
                    className={cn(
                      "text-xs",
                      perPage === n && "font-semibold",
                    )}
                  >
                    {n}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {!loadError && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                Showing {sorted.length} customer
                {sorted.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">
              Page {cursors.length}
            </span>
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
              disabled={serverRows.length < perPage}
              onClick={() =>
                setCursors([...cursors, serverRows.at(-1)!.contactId])
              }
              className="rounded-md p-1 transition-colors hover:bg-surface-2 disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Delete confirmation dialog ── */}
      <Dialog open={deleting} onOpenChange={(open) => !open && setDeleting(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.size} customer{selectedIds.size === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const withLeads = sorted.filter(
              (r) => selectedIds.has(r.contactId) && r.leadCount > 0,
            );
            if (withLeads.length > 0)
              return (
                <div className="rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                  <p className="font-medium">
                    {withLeads.length} customer{withLeads.length === 1 ? " has" : "s have"} leads and will be skipped:
                  </p>
                  <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                    {withLeads.slice(0, 5).map((r) => (
                      <li key={r.contactId}>
                        {displayName(r)} ({r.leadCount} lead{r.leadCount === 1 ? "" : "s"})
                      </li>
                    ))}
                    {withLeads.length > 5 && (
                      <li>…and {withLeads.length - 5} more</li>
                    )}
                  </ul>
                </div>
              );
            return null;
          })()}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleting(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={bulkUpdating}
              onClick={() => void deleteSelected()}
            >
              {bulkUpdating ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingContact} onOpenChange={(open) => !open && setDeletingContact(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-danger">Delete {deletingContact?.name}?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. All associated data will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingContact(null)} disabled={bulkUpdating}>Cancel</Button>
            <Button variant="destructive" onClick={deleteSingleContact} disabled={bulkUpdating}>
              {bulkUpdating ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail drawer (resizable) ── */}
      <Sheet open={!!selectedContactId} onOpenChange={(open) => !open && setSelectedContactId(null)}>
        <SheetContent
          side="right"
          className="overflow-y-auto p-0"
          style={{ width: `min(${drawerWidth}px, 100vw)`, maxWidth: "100vw" }}
        >
          <div
            onPointerDown={startDrawerDrag}
            className="absolute inset-y-0 left-0 z-10 flex w-3 cursor-col-resize items-center justify-center hover:bg-accent/10 active:bg-accent/20 transition-colors"
            title="Drag to resize"
          >
            <GripVertical className="size-3.5 text-muted-foreground/50" />
          </div>
          {selectedContactId && (
            <CustomerDetailPanel
              contactId={selectedContactId}
              onBack={() => setSelectedContactId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
