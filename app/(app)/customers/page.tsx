"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  Heart,
  Loader2,
  Phone,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
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
import { formatCurrencyINR, formatRelativeTime, cn } from "@/lib/utils";
import { useCrmContext } from "@/lib/hooks/use-crm-context";
import { CustomerDetailPanel } from "@/components/crm/customer-detail";

type Filter = "all" | "active" | "won" | "needs_attention";
type TypeFilter = "all" | "leads_only" | "has_deals";
type SortKey = "name" | "dealValue" | "stage" | "lastActivity" | "company";
type SortDir = "asc" | "desc";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "won", label: "Won" },
  { key: "needs_attention", label: "Needs attention" },
];

const stageOrder = ["lost", "new", "contacted", "qualified", "converted", "won"];

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
  tags: CrmTag[];
}

function displayName(row: CustomerRow) {
  return row.name || row.phone || row.email || `Contact #${row.contactId}`;
}

function contactType(row: CustomerRow): "Deal" | "Lead" {
  return row.dealCount > 0 ? "Deal" : "Lead";
}

function healthOf(row: CustomerRow) {
  const daysIdle = row.lastActivityAt
    ? Math.floor((Date.now() - new Date(row.lastActivityAt).getTime()) / 86400000)
    : 999;
  if (row.stage === "won") return "healthy" as const;
  if (row.stage === "lost") return "cold" as const;
  if (daysIdle > 7) return "cold" as const;
  if (daysIdle > 3) return "warm" as const;
  return "healthy" as const;
}

const healthMeta = {
  healthy: { label: "Healthy", color: "text-success" },
  warm: { label: "Needs attention", color: "text-warning" },
  cold: { label: "At risk", color: "text-danger" },
} as const;

export default function CustomersPage() {
  const session = useSession();
  const canWrite =
    session.permissions.includes("*") || can(session, "leads:write");
  const { crms, multiCrm } = useCrmContext();
  const [crmFilter, setCrmFilter] = useState<string>("all");
  const crmParam =
    multiCrm && crmFilter !== "all" ? `&crm_id=${crmFilter}` : "";

  const [query, setQuery] = useState("");
  const [serverQuery, setServerQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("lastActivity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
  const customers = useApi<CustomerRow[]>(
    `/customers?limit=${perPage}&after_id=${afterId}${searchParam}${filterParam}${crmParam}`,
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
      setSortDir(key === "dealValue" ? "desc" : "asc");
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
        typeFilter === "has_deals" ? r.dealCount > 0 : r.dealCount === 0,
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
      else if (sortKey === "company")
        cmp = (a.company || "").localeCompare(b.company || "");
      else if (sortKey === "dealValue")
        cmp = Number(a.dealValue) - Number(b.dealValue);
      else if (sortKey === "stage")
        cmp = stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage);
      else
        cmp = (a.lastActivityAt ?? "").localeCompare(b.lastActivityAt ?? "");
      return cmp * dir;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const [threeDayCutoff] = useState(() =>
    new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  );
  const stats = useMemo(() => {
    const leadOnly = serverRows.filter((r) => r.dealCount === 0).length;
    const withDeals = serverRows.filter((r) => r.dealCount > 0).length;
    return {
      activeCount: serverRows.filter(
        (r) => r.stage && !["won", "lost"].includes(r.stage),
      ).length,
      totalRev: serverRows.reduce((s, r) => s + Number(r.dealValue), 0),
      needsAttCount: serverRows.filter(
        (r) =>
          r.lastActivityAt &&
          r.lastActivityAt < threeDayCutoff &&
          !["won", "lost"].includes(r.stage),
      ).length,
      leadOnly,
      withDeals,
    };
  }, [serverRows, threeDayCutoff]);

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
    tagFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setFilter("all");
    setTypeFilter("all");
    setTagFilter("all");
    setCrmFilter("all");
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
      toast.success(`${deleted} contact${deleted === 1 ? "" : "s"} deleted`);
    } else if (deleted > 0 && skipped > 0) {
      toast.success(
        `${deleted} deleted, ${skipped} skipped (have leads)`,
      );
    } else if (skipped > 0) {
      toast.error(
        `${skipped} contact${skipped === 1 ? "" : "s"} skipped — delete their leads first`,
      );
    }
    setDeleting(false);
    setSelectedIds(new Set());
    setBulkUpdating(false);
    customers.reload();
  }

  if (selectedContactId) {
    return (
      <div className="mx-auto flex max-w-[1400px] flex-col h-full">
        <CustomerDetailPanel
          contactId={selectedContactId}
          onBack={() => setSelectedContactId(null)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col">
      <PageHeader
        title="Contacts"
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
          className="mx-6 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger"
        >
          Your contacts could not be loaded: {loadError}. Refresh to try again;
          nothing is lost.
        </p>
      )}

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-border px-6 pb-2.5">
        <div className="relative mr-2 w-full sm:w-52">
          <Search className="pointer-events-none absolute left-0 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts..."
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
          <Heart className="size-3" />
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
              {sorted.length} contacts
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowUpDown className="size-3" />
                {sortKey === "lastActivity"
                  ? "Last activity"
                  : sortKey === "dealValue"
                    ? "Deal value"
                    : sortKey === "name"
                      ? "Name"
                      : sortKey === "company"
                        ? "Company"
                        : "Stage"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(
                [
                  ["lastActivity", "Last activity"],
                  ["dealValue", "Deal value"],
                  ["name", "Name"],
                  ["company", "Company"],
                  ["stage", "Stage"],
                ] as const
              ).map(([k, l]) => (
                <DropdownMenuItem
                  key={k}
                  onSelect={() => toggleSort(k)}
                  className={sortKey === k ? "font-semibold" : ""}
                >
                  {l}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Stats strip ── */}
      {customers.data && serverRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-1.5 text-[11px] tabular-nums text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">
              {serverRows.length}
            </span>{" "}
            contacts
          </span>
          <span>
            <span className="font-semibold text-foreground">
              {stats.leadOnly}
            </span>{" "}
            leads
          </span>
          <span>
            <span className="font-semibold text-foreground">
              {stats.withDeals}
            </span>{" "}
            deals
          </span>
          <span>
            <span className="font-semibold text-foreground">
              {formatCurrencyINR(stats.totalRev)}
            </span>{" "}
            pipeline
          </span>
          {stats.needsAttCount > 0 && (
            <span className="text-warning">
              <span className="font-semibold">{stats.needsAttCount}</span> need
              attention
            </span>
          )}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div role="status" className="space-y-px px-6 pt-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2.5">
              <div className="h-3.5 w-3.5 animate-pulse rounded bg-surface-2" />
              <div className="size-7 animate-pulse rounded-full bg-surface-2" />
              <div className="h-3.5 w-28 animate-pulse rounded bg-surface-2" />
              <div className="h-3.5 w-14 animate-pulse rounded bg-surface-2" />
              <div className="h-3.5 w-24 animate-pulse rounded bg-surface-2" />
              <div className="h-3.5 flex-1 animate-pulse rounded bg-surface-2" />
              <div className="h-3.5 w-16 animate-pulse rounded bg-surface-2" />
            </div>
          ))}
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !loadError && sorted.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
          <Building2 className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">
            {filtersActive
              ? "No contacts match"
              : afterId === "0"
                ? "No contacts yet"
                : "End of list"}
          </p>
          <p className="text-xs text-muted-foreground">
            {filtersActive
              ? "Adjust filters or clear them."
              : "Contacts are created when leads are captured."}
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
        <div className="flex-1 overflow-auto px-6 py-3">
          <p className="pb-2 text-xs text-muted-foreground md:hidden">
            Swipe the table sideways to see more columns.
          </p>
          <table className="w-full text-left text-sm">
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
                    Name {sortIcon("name")}
                  </span>
                </th>
                <th className="pb-2 pr-3">Type</th>
                <th className="pb-2 pr-3">Tags</th>
                <th className="pb-2 pr-3">Phone</th>
                <th
                  className="cursor-pointer select-none pb-2 pr-3"
                  onClick={() => toggleSort("company")}
                >
                  <span className="inline-flex items-center gap-1">
                    Company {sortIcon("company")}
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
                <th className="pb-2 pr-3">Health</th>
                <th
                  className="cursor-pointer select-none pb-2 pr-3 text-right"
                  onClick={() => toggleSort("dealValue")}
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    Deal value {sortIcon("dealValue")}
                  </span>
                </th>
                <th className="pb-2 pr-3">Assignment</th>
                <th
                  className="cursor-pointer select-none pb-2 pr-3"
                  onClick={() => toggleSort("lastActivity")}
                >
                  <span className="inline-flex items-center gap-1">
                    Last activity {sortIcon("lastActivity")}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const dealValue = Number(row.dealValue);
                const name = displayName(row);
                const type = contactType(row);
                const h = healthOf(row);
                const hm = healthMeta[h];
                const selected = selectedIds.has(row.contactId);
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
                      className="py-2 pr-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleSelect(row.contactId)}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <CustomerAvatar
                          name={name}
                          color="#4169e1"
                          size="sm"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-foreground">
                            {name}
                          </span>
                          {row.email && (
                            <p className="truncate text-[10px] text-muted-foreground">
                              {row.email}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      {type === "Deal" ? (
                        <span className="inline-flex w-fit items-center bg-success-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-success">
                          Deal
                        </span>
                      ) : (
                        <span className="inline-flex w-fit items-center bg-accent-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                          Lead
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {(row.tags ?? []).map((t) => (
                          <span
                            key={t.id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-foreground bg-surface-2"
                          >
                            <span
                              className="inline-block size-1.5 shrink-0"
                              style={{ background: t.color }}
                            />
                            {t.name}
                          </span>
                        ))}
                        {(!row.tags || row.tags.length === 0) && (
                          <span className="text-[10px] text-muted-foreground/40">—</span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground">
                      {row.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3" />
                          {row.phone}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {row.company || "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-xs capitalize text-muted-foreground">
                        {row.stage.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1.5">
                        <Heart className={cn("size-3", hm.color)} />
                        <span className={cn("text-xs", hm.color)}>
                          {hm.label}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right text-xs font-semibold tabular-nums text-foreground">
                      {dealValue > 0 ? formatCurrencyINR(dealValue) : "—"}
                    </td>
                    <td className="max-w-[100px] truncate py-2 pr-3 text-xs text-muted-foreground">
                      {row.ownerName ||
                        (row.ownerId
                          ? `Member #${row.ownerId}`
                          : "Unassigned")}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {row.lastActivityAt
                        ? formatRelativeTime(row.lastActivityAt)
                        : "—"}
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
        <div className="flex items-center justify-between border-t border-border px-6 py-2">
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
                Showing {sorted.length} contact
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
              Delete {selectedIds.size} contact{selectedIds.size === 1 ? "" : "s"}?
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
                    {withLeads.length} contact{withLeads.length === 1 ? " has" : "s have"} leads and will be skipped:
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
    </div>
  );
}
