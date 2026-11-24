"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { can } from "@/lib/permissions";
import type React from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  GripVertical,
  Inbox,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  SlidersHorizontal,
  Settings2,
  Trash2,
  TrendingUp,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import type { Lead } from "@/lib/api/types";
import { useSession } from "@/components/auth/session-provider";
import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatDateTime } from "@/lib/utils";
import { LEAD_STAGES as stages, stageLabel as label, stageBadgeVariant } from "@/lib/lead-stages";
import { sourceMeta } from "@/lib/lead-sources";
import { SourceBadge } from "@/components/shared/source-badge";
import { followUpWords, isDue } from "@/components/crm/follow-up";
import { useApi } from "@/lib/api/use-api";
import { LostReasonFields } from "@/components/crm/lost-reason-fields";
import type { LostCategory } from "@/lib/lost-reasons";
import { LeadDetailDrawer } from "@/components/crm/lead-detail";
import { ImportDialog } from "@/components/crm/import-dialog";
import { LeadsBoard } from "@/components/crm/leads-board";
import { DealForm } from "@/components/deals/deal-form";
import { useCrmContext } from "@/lib/hooks/use-crm-context";

type Row = { lead: Lead };
type EditForm = {
  name: string;
  phone: string;
  email: string;
  company: string;
  requirement: string;
  stage: string;
  ownerId: string;
  lostCategory: LostCategory | "";
  lostReason: string;
};

type OptionalColumn = "followUp" | "email" | "company" | "source" | "owner" | "created" | "score" | "crm";

const optionalColumns: { key: OptionalColumn; label: string }[] = [
  { key: "crm", label: "CRM" },
  { key: "followUp", label: "Next follow-up" },
  { key: "email", label: "Email" },
  { key: "company", label: "Company" },
  { key: "source", label: "Source" },
  { key: "owner", label: "Assigned to" },
  { key: "score", label: "Score" },
  { key: "created", label: "Created" },
];

function phoneParts(phone: string | null) {
  if (!phone) return { countryCode: "—", mobile: "—" };
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return { countryCode: "+91", mobile: `${digits.slice(0, 5)} ${digits.slice(5)}` };
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    const mobile = digits.slice(2);
    return { countryCode: "+91", mobile: `${mobile.slice(0, 5)} ${mobile.slice(5)}` };
  }
  if (phone.trim().startsWith("+") && digits.length > 10) {
    const mobile = digits.slice(-10);
    return {
      countryCode: `+${digits.slice(0, -10)}`,
      mobile: `${mobile.slice(0, 5)} ${mobile.slice(5)}`,
    };
  }
  return { countryCode: "—", mobile: phone.trim() };
}

function blankEditForm(row: Row): EditForm {
  return {
    name: row.lead.contactName,
    phone: row.lead.phone || "",
    email: row.lead.email || "",
    company: row.lead.company,
    requirement: row.lead.requirement,
    stage: row.lead.stage,
    ownerId: row.lead.ownerId ?? "",
    lostCategory: row.lead.lostCategory ?? (row.lead.stage === "lost" ? "other" : ""),
    lostReason: row.lead.lostReason ?? "",
  };
}

/** What the server takes for a lead edit: no owner (assigned apart), and a reason only when lost. */
function leadBody(form: EditForm) {
  const { ownerId: _owner, lostCategory, lostReason, ...rest } = form;
  void _owner;
  return {
    ...rest,
    phone: form.phone.trim() || null,
    email: form.email.trim() || null,
    lostCategory: form.stage === "lost" ? lostCategory || null : null,
    lostReason: form.stage === "lost" ? lostReason : "",
  };
}

function EditableValue({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title="Click to edit"
      onClick={onClick}
      className={`group/edit inline-flex max-w-full items-center gap-1.5 text-left ${className}`}
    >
      <span className="truncate">{children}</span>
      <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/edit:opacity-100" />
    </button>
  );
}

export default function LeadsPage() {
  const session = useSession();
  const { crms, multiCrm } = useCrmContext();
  const [crmFilter, setCrmFilter] = useState<string>("all");
  const crmParam = multiCrm && crmFilter !== "all" ? `&crm_id=${crmFilter}` : "";
  const canWrite = can(session, "leads:write");
  const [after, setAfter] = useState("0");
  const [version, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [perPage, setPerPage] = useState<25 | 50 | 100>(() => {
    try { const v = Number(localStorage.getItem("janus:leads:perPage")); return v === 50 || v === 100 ? v : 25; } catch { return 25; }
  });
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
  const [view, setViewRaw] = useState<"table" | "board" | "quality">(() => {
    try { return (localStorage.getItem("janus:leads:view") as "table" | "board" | "quality") || "table"; } catch { return "table"; }
  });
  const setView = (v: "table" | "board" | "quality") => { setViewRaw(v); try { localStorage.setItem("janus:leads:view", v); } catch {} };
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  // Leads whose follow-up falls today or has passed: the list a salesperson works through first.
  const [dueOnly, setDueOnly] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine" | "none">("all");
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingLead, setDeletingLead] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deletingSelected, setDeletingSelected] = useState<Row[] | null>(null);
  const [visibleColumns, setVisibleColumnsRaw] = useState<Record<OptionalColumn, boolean>>(() => {
    try {
      const saved = localStorage.getItem("janus:leads:columns");
      if (saved) { const parsed = JSON.parse(saved); return { ...parsed, crm: multiCrm }; }
    } catch {}
    return { crm: multiCrm, followUp: true, email: false, company: false, source: false, owner: true, score: false, created: false };
  });
  const setVisibleColumns = (cols: Record<OptionalColumn, boolean>) => {
    setVisibleColumnsRaw(cols);
    try { localStorage.setItem("janus:leads:columns", JSON.stringify(cols)); } catch {}
  };
  const [columnOrder, setColumnOrder] = useState<OptionalColumn[]>(optionalColumns.map(({ key }) => key));
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [followUpFilter, setFollowUpFilter] = useState<"all" | "has" | "overdue" | "none">("all");
  const [draggingColumn, setDraggingColumn] = useState<OptionalColumn | null>(null);
  const [serverQuery, setServerQuery] = useState("");
  const [result, setResult] = useState<{
    after: string;
    rows: Row[];
    error?: string;
  } | null>(null);

  // Debounce server search so the API is only called after the user pauses typing.
  useEffect(() => {
    const timer = setTimeout(() => {
      setServerQuery(query.trim());
      setAfter("0");
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const searchParam = serverQuery ? `&q=${encodeURIComponent(serverQuery)}` : "";
      const stageParam = stageFilter !== "all" ? `&stage=${encodeURIComponent(stageFilter)}` : "";
      const sourceParam = sourceFilter !== "all" ? `&source=${encodeURIComponent(sourceFilter)}` : "";
      const ownerParam = ownerFilter === "mine" ? `&owner_id=${session.user.id}` : "";
      const leads = await api<Lead[]>(`/leads?limit=${perPage}&after_id=${after}${searchParam}${stageParam}${sourceParam}${ownerParam}${crmParam}`, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setResult({
          after,
          rows: leads.map((lead) => ({ lead })),
        });
        setRefreshing(false);
      }
    };
    load().catch((error) => {
      if (!controller.signal.aborted) {
        setResult({ after, rows: [], error: message(error) });
        setRefreshing(false);
      }
    });
    return () => controller.abort();
  }, [after, version, serverQuery, stageFilter, sourceFilter, ownerFilter, session.user.id, crmParam, crmFilter, perPage]);

  const loaded = result?.after === after ? result : null;
  const canEditRows = canWrite;
  // Owners and managers can hand a lead to someone they manage.
  const canAssign = session.permissions.includes("*") || can(session, "leads:assign");
  const members = useApi<{ user_id: string | number; name: string; status: string }[]>(canAssign ? "/members/directory" : null);
  const people = (members.data ?? []).filter((item) => item.status === "active").map((item) => ({ id: String(item.user_id), label: item.name }));
  const [assigning, setAssigning] = useState(false);
  const [assignTo, setAssignTo] = useState("none");
  const filterOpts = useApi<{ stages: string[]; sources: string[]; owners: { id: string; name: string }[] }>(`/leads/filter-options?_=1${crmParam}`);
  const sources = filterOpts.data?.sources ?? [...new Set(loaded?.rows.map(({ lead }) => lead.source) || [])];
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const { lead } of loaded?.rows ?? []) counts[lead.source] = (counts[lead.source] || 0) + 1;
    return counts;
  }, [loaded]);
  const rows = useMemo(() => {
    const filtered = loaded?.rows.filter(({ lead }) => {
      if (stageFilter !== "all" && lead.stage !== stageFilter) return false;
      if (sourceFilter !== "all" && lead.source !== sourceFilter) return false;
      if (dueOnly && !isDue(lead.nextFollowUpOn)) return false;
      if (ownerFilter === "mine" && lead.ownerId !== session.user.id) return false;
      if (ownerFilter === "none" && lead.ownerId) return false;
      if (followUpFilter === "has" && !lead.nextFollowUpOn) return false;
      if (followUpFilter === "overdue" && !isDue(lead.nextFollowUpOn)) return false;
      if (followUpFilter === "none" && lead.nextFollowUpOn) return false;
      return true;
    }) || [];
    const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
    if (sortBy === "oldest") return [...filtered].reverse();
    if (sortBy === "follow_up") return [...filtered].sort((a, b) => {
      const af = a.lead.nextFollowUpOn ?? "";
      const bf = b.lead.nextFollowUpOn ?? "";
      if (!af && !bf) return 0;
      if (!af) return 1;
      if (!bf) return -1;
      return af.localeCompare(bf);
    });
    if (sortBy === "last_activity") return [...filtered].sort((a, b) => (b.lead.lastActivityAt ?? "").localeCompare(a.lead.lastActivityAt ?? ""));
    if (sortBy === "name_asc") return [...filtered].sort((a, b) => cmp(a.lead.contactName, b.lead.contactName));
    if (sortBy === "name_desc") return [...filtered].sort((a, b) => cmp(b.lead.contactName, a.lead.contactName));
    if (sortBy === "stage_asc") return [...filtered].sort((a, b) => cmp(a.lead.stage, b.lead.stage));
    if (sortBy === "stage_desc") return [...filtered].sort((a, b) => cmp(b.lead.stage, a.lead.stage));
    if (sortBy === "owner_asc") return [...filtered].sort((a, b) => cmp(a.lead.ownerName ?? "", b.lead.ownerName ?? ""));
    if (sortBy === "owner_desc") return [...filtered].sort((a, b) => cmp(b.lead.ownerName ?? "", a.lead.ownerName ?? ""));
    if (sortBy === "email_asc") return [...filtered].sort((a, b) => cmp(a.lead.email ?? "", b.lead.email ?? ""));
    if (sortBy === "email_desc") return [...filtered].sort((a, b) => cmp(b.lead.email ?? "", a.lead.email ?? ""));
    if (sortBy === "company_asc") return [...filtered].sort((a, b) => cmp(a.lead.company ?? "", b.lead.company ?? ""));
    if (sortBy === "company_desc") return [...filtered].sort((a, b) => cmp(b.lead.company ?? "", a.lead.company ?? ""));
    return filtered;
  }, [loaded, sourceFilter, stageFilter, dueOnly, ownerFilter, followUpFilter, session.user.id, sortBy]);
  const allVisibleSelected = rows.length > 0 && rows.every(({ lead }) => selectedIds.includes(lead.id));
  const orderedOptionalColumns = columnOrder
    .map((key) => optionalColumns.find((column) => column.key === key))
    .filter((column): column is { key: OptionalColumn; label: string } => Boolean(column));
  const resetColumns = () => {
    setVisibleColumns({ crm: multiCrm, followUp: true, email: false, company: false, source: false, owner: false, score: false, created: false });
    setColumnOrder(optionalColumns.map(({ key }) => key));
  };

  const moveColumn = (source: OptionalColumn, target: OptionalColumn) => {
    if (source === target) return;
    setColumnOrder((current) => {
      const next = [...current];
      const sourceIndex = next.indexOf(source);
      const targetIndex = next.indexOf(target);
      if (sourceIndex === -1 || targetIndex === -1) return current;
      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      return next;
    });
  };

  function openEdit(row: Row) {
    setActionError("");
    setEditForm(blankEditForm(row));
    setEditing(row);
  }

  async function saveEdit() {
    if (!editing || !editForm) return;
    setSaving(true);
    setActionError("");
    try {
      await api<Lead>(`/leads/${editing.lead.id}`, {
        method: "PATCH",
        body: JSON.stringify(leadBody(editForm)),
      });
      const owner = editForm.ownerId && editForm.ownerId !== "none" ? editForm.ownerId : null;
      if (canAssign && owner !== (editing.lead.ownerId ?? null)) {
        await api("/leads/assign", { method: "POST", body: JSON.stringify({ leadIds: [editing.lead.id], ownerId: owner }) });
      }
      setEditing(null);
      setEditForm(null);
      setVersion((value) => value + 1);
    } catch (error) {
      setActionError(message(error));
    } finally {
      setSaving(false);
    }
  }

  async function deleteLead() {
    if (!deleting) return;
    setDeletingLead(true);
    setActionError("");
    try {
      await api<void>(`/leads/${deleting.lead.id}`, { method: "DELETE" });
      setDeleting(null);
      setVersion((value) => value + 1);
    } catch (error) {
      setActionError(message(error));
    } finally {
      setDeletingLead(false);
    }
  }

  async function assignSelected() {
    if (!selectedIds.length) return;
    setBulkUpdating(true);
    try {
      const done = await api<{ assigned: number; ownerName: string | null }>("/leads/assign", { method: "POST", body: JSON.stringify({ leadIds: selectedIds, ownerId: assignTo === "none" ? null : assignTo }) });
      toast.success(done.ownerName ? `${done.assigned} lead${done.assigned === 1 ? "" : "s"} assigned to ${done.ownerName}` : `${done.assigned} lead${done.assigned === 1 ? "" : "s"} left without an owner`);
      setAssigning(false);
      setSelectedIds([]);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(message(error));
    } finally {
      setBulkUpdating(false);
    }
  }

  async function quickStageChange(row: Row, newStage: string) {
    try {
      await api<Lead>(`/leads/${row.lead.id}`, { method: "PATCH", body: JSON.stringify(leadBody({ ...blankEditForm(row), stage: newStage })) });
      toast.success(`Stage updated to ${label(newStage)}`);
      setVersion((v) => v + 1);
    } catch (error) {
      toast.error(message(error));
    }
  }

  async function bulkUpdateStage(stage: string) {
    const selected = loaded?.rows.filter(({ lead }) => selectedIds.includes(lead.id)) || [];
    if (!selected.length) return;
    setBulkUpdating(true);
    try {
      await Promise.all(
        selected.map((row) =>
          api<Lead>(`/leads/${row.lead.id}`, {
            method: "PATCH",
            body: JSON.stringify(leadBody({ ...blankEditForm(row), stage })),
          }),
        ),
      );
      toast.success(`${selected.length} lead${selected.length === 1 ? "" : "s"} updated`, {
        description: `Stage changed to ${label(stage)}.`,
      });
      setSelectedIds([]);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(message(error));
    } finally {
      setBulkUpdating(false);
    }
  }

  async function deleteSelectedLeads() {
    if (!deletingSelected?.length) return;
    setDeletingLead(true);
    setActionError("");
    try {
      await Promise.all(
        deletingSelected.map((row) =>
          api<void>(`/leads/${row.lead.id}`, { method: "DELETE" }),
        ),
      );
      toast.success(`${deletingSelected.length} lead${deletingSelected.length === 1 ? "" : "s"} deleted`);
      setDeletingSelected(null);
      setSelectedIds([]);
      setVersion((value) => value + 1);
    } catch (error) {
      setActionError(message(error));
    } finally {
      setDeletingLead(false);
    }
  }

  const filtersActive = query.trim() || stageFilter !== "all" || sourceFilter !== "all" || dueOnly || ownerFilter !== "all" || crmFilter !== "all" || followUpFilter !== "all";
  const dueCount = (loaded?.rows ?? []).filter(({ lead }) => isDue(lead.nextFollowUpOn) && !["won", "lost"].includes(lead.stage)).length;

  return (
    <div className={cn("mx-auto flex flex-col", view === "board" ? "h-full" : "max-w-[1500px]")}>
      <PageHeader
        title="Leads"
        description="Every enquiry in one searchable pipeline."
        actions={
          <>
            <Button size="sm" variant="ghost" disabled={refreshing} onClick={() => { setRefreshing(true); setVersion((value) => value + 1); }} className="gap-1.5 text-muted-foreground hover:text-foreground">
              {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
            {can(session, "leads:write") && (
              <>
                <Button size="sm" onClick={() => setAdding(true)}>
                  <Plus className="size-3.5" />
                  Add lead
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setImporting(true)}>
                  <FileSpreadsheet className="size-3.5" />
                  Import CSV
                </Button>
              </>
            )}
          </>
        }
      />
      {loaded?.error && <p role="alert" className="mx-6 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">Your leads could not be read: {loaded.error}. Refresh to try again; nothing is lost.</p>}

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-border px-6 pb-2.5">
        {/* Search — lighter, no box */}
        <div className="relative mr-2 w-full sm:w-52">
          <Search className="pointer-events-none absolute left-0 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads..." className="h-7 w-full border-0 bg-transparent pl-5 pr-6 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none" />
          {query && <button type="button" onClick={() => setQuery("")} className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="size-3" /></button>}
        </div>

        {/* Filters — plain text buttons with dropdowns, no boxes */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn("inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors", stageFilter !== "all" ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
              <SlidersHorizontal className="size-3" />{stageFilter === "all" ? "Stage" : label(stageFilter)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setStageFilter("all")} className={stageFilter === "all" ? "font-semibold" : ""}>All stages</DropdownMenuItem>
            {stages.map((s) => <DropdownMenuItem key={s} onSelect={() => setStageFilter(s)} className={stageFilter === s ? "font-semibold" : ""}>{label(s)}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn("inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors", sourceFilter !== "all" ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {sourceFilter !== "all" ? <SourceBadge source={sourceFilter} /> : "Source"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setSourceFilter("all")} className={sourceFilter === "all" ? "font-semibold" : ""}>All sources</DropdownMenuItem>
            {sources.map((s) => {
              const m = sourceMeta(s);
              const Icon = m.icon;
              return <DropdownMenuItem key={s} onSelect={() => setSourceFilter(s)} className={sourceFilter === s ? "font-semibold" : ""}><Icon className={cn("size-3", m.color)} />{m.label}{sourceCounts[s] ? <span className="ml-auto text-[10px] text-muted-foreground">{sourceCounts[s]}</span> : null}</DropdownMenuItem>;
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn("inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors", ownerFilter !== "all" ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {ownerFilter === "all" ? "Assignment" : ownerFilter === "mine" ? "My leads" : "Unassigned"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setOwnerFilter("all")} className={ownerFilter === "all" ? "font-semibold" : ""}>Everyone&apos;s</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOwnerFilter("mine")} className={ownerFilter === "mine" ? "font-semibold" : ""}>My leads</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOwnerFilter("none")} className={ownerFilter === "none" ? "font-semibold" : ""}>Unassigned</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn("inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors", followUpFilter !== "all" ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
              <CalendarClock className="size-3" />{followUpFilter === "all" ? "Follow-up" : followUpFilter === "has" ? "Has follow-up" : followUpFilter === "overdue" ? "Overdue" : "No follow-up"}
              {followUpFilter === "all" && dueCount > 0 && <span className="ml-0.5 tabular-nums text-warning">({dueCount})</span>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setFollowUpFilter("all")} className={followUpFilter === "all" ? "font-semibold" : ""}>All</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setFollowUpFilter("has")} className={followUpFilter === "has" ? "font-semibold" : ""}>Has follow-up</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setFollowUpFilter("overdue")} className={cn(followUpFilter === "overdue" ? "font-semibold" : "", "text-warning")}>Overdue{dueCount > 0 && <span className="ml-auto text-[10px] tabular-nums">{dueCount}</span>}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setFollowUpFilter("none")} className={followUpFilter === "none" ? "font-semibold" : ""}>No follow-up</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {multiCrm && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn("inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors", crmFilter !== "all" ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <Building2 className="size-3" />{crmFilter === "all" ? "CRM" : crms.find((c) => c.id === crmFilter)?.name ?? "CRM"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => setCrmFilter("all")} className={crmFilter === "all" ? "font-semibold" : ""}>All CRMs</DropdownMenuItem>
              {crms.map((c) => <DropdownMenuItem key={c.id} onSelect={() => setCrmFilter(c.id)} className={crmFilter === c.id ? "font-semibold" : ""}>{c.name}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <button type="button" aria-pressed={dueOnly} onClick={() => setDueOnly((v) => !v)} className={cn("inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors", dueOnly ? "font-semibold text-warning" : "text-muted-foreground hover:text-foreground")}>
          <Zap className="size-3" />Due{dueCount ? <span className="ml-0.5 tabular-nums text-warning">({dueCount})</span> : null}
        </button>
        {filtersActive && (
          <button type="button" onClick={() => { setQuery(""); setStageFilter("all"); setSourceFilter("all"); setDueOnly(false); setOwnerFilter("all"); setCrmFilter("all"); setFollowUpFilter("all"); }} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="size-3 inline" /> Clear
          </button>
        )}

        {/* Right: count + sort + view + columns */}
        <div className="ml-auto flex items-center gap-1">
          {loaded && !loaded.error && <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:inline">{rows.length} leads</span>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowUpDown className="size-3" />{sortBy === "newest" ? "Newest" : sortBy === "oldest" ? "Oldest" : sortBy === "last_activity" ? "Activity" : "Follow-up"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {([["newest", "Newest first"], ["oldest", "Oldest first"], ["last_activity", "Last activity"], ["follow_up", "Next follow-up"]] as const).map(([k, l]) => (
                <DropdownMenuItem key={k} onSelect={() => setSortBy(k)} className={sortBy === k ? "font-semibold" : ""}>{l}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="hidden h-4 w-px bg-border sm:block" />
          {([["table", List], ["board", LayoutGrid], ["quality", BarChart3]] as const).map(([v, Icon]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("p-1 transition-colors", view === v ? "text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground")}><Icon className="size-3.5" /></button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="p-1 text-muted-foreground/50 hover:text-muted-foreground" title="Columns">
                <Settings2 className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 bg-surface p-0 shadow-2xl">
              <div className="border-b border-border px-3 py-2">
                <p className="text-xs font-semibold">Visible columns</p>
              </div>
              <div className="space-y-0.5 p-1.5">
                {orderedOptionalColumns.map(({ key, label: columnLabel }) => (
                  <div
                    key={key}
                    draggable
                    onDragStart={() => setDraggingColumn(key)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => { if (draggingColumn) moveColumn(draggingColumn, key); setDraggingColumn(null); }}
                    onDragEnd={() => setDraggingColumn(null)}
                    className={cn("flex cursor-grab items-center gap-2 rounded px-2 py-1 text-xs transition-colors hover:bg-surface-2 active:cursor-grabbing", draggingColumn === key && "bg-accent/5 opacity-60")}
                  >
                    <GripVertical className="size-3 shrink-0 text-muted-foreground/50" />
                    <Checkbox checked={visibleColumns[key]} aria-label={`Show ${columnLabel}`} onCheckedChange={(checked) => setVisibleColumns({ ...visibleColumns, [key]: !!checked })} />
                    <span>{columnLabel}</span>
                  </div>
                ))}
                <button type="button" onClick={resetColumns} className="mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                  <RotateCcw className="size-3" /> Reset
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* ── Stats strip ── */}
      {loaded && !loaded.error && rows.length > 0 && view !== "quality" && <LeadQualityBar rows={rows} />}

      {!loaded ? (
        <div role="status" className="space-y-px px-6 pt-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2.5">
              <div className="h-3.5 w-3.5 animate-pulse rounded bg-surface-2" />
              <div className="h-3.5 w-28 animate-pulse rounded bg-surface-2" />
              <div className="h-3.5 w-24 animate-pulse rounded bg-surface-2" />
              <div className="h-3.5 w-16 animate-pulse rounded bg-surface-2" />
              <div className="h-3.5 flex-1 animate-pulse rounded bg-surface-2" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
          <Inbox className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">{filtersActive ? "No leads match" : after === "0" ? "No leads yet" : "End of list"}</p>
          <p className="text-xs text-muted-foreground">{filtersActive ? "Adjust filters or clear them." : "Add one above, or connect a lead source."}</p>
          {filtersActive && (
            <button type="button" onClick={() => { setQuery(""); setStageFilter("all"); setSourceFilter("all"); setDueOnly(false); setOwnerFilter("all"); setCrmFilter("all"); setFollowUpFilter("all"); }} className="mt-1 text-xs font-medium text-accent hover:underline">Clear filters</button>
          )}
        </div>
      ) : view === "quality" ? (
        <LeadQualityAnalysis rows={rows} />
      ) : view === "board" ? (
        <LeadsBoard leads={rows.map(({ lead }) => lead)} onStageChanged={() => { setAfter("0"); setVersion((v) => v + 1); }} onLeadClick={(lead) => setDrawerLead(lead)} />
      ) : (
        <>
        <div className="isolate overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className="sticky top-0 z-20 border-b border-border bg-surface text-[11px] text-muted-foreground">
              <tr>
                <th className="w-10 pl-6 pr-2 py-2">
                  <Checkbox
                    aria-label="Select all visible leads"
                    checked={allVisibleSelected ? true : selectedIds.length > 0 ? "indeterminate" : false}
                    onCheckedChange={(checked) => setSelectedIds(checked ? rows.map(({ lead }) => lead.id) : [])}
                  />
                </th>
                <SortTh active={sortBy} asc="name_asc" desc="name_desc" onSort={setSortBy} className="w-[180px] min-w-[180px]">Name</SortTh>
                <th className="w-[140px] min-w-[120px] px-3 py-2 font-medium">Phone</th>
                <SortTh active={sortBy} asc="stage_asc" desc="stage_desc" onSort={setSortBy} className="w-24 min-w-24">Stage</SortTh>
                {orderedOptionalColumns.map(({ key, label: columnLabel }) => {
                  if (!visibleColumns[key]) return null;
                  const sortable: Record<string, { asc: SortKey; desc: SortKey } | undefined> = {
                    followUp: { asc: "follow_up", desc: "newest" },
                    email: { asc: "email_asc", desc: "email_desc" },
                    company: { asc: "company_asc", desc: "company_desc" },
                    owner: { asc: "owner_asc", desc: "owner_desc" },
                    created: { asc: "oldest", desc: "newest" },
                  };
                  const s = sortable[key];
                  if (s) return <SortTh key={key} active={sortBy} asc={s.asc} desc={s.desc} onSort={setSortBy} className={cn(key === "email" && "min-w-[200px]", key === "company" && "min-w-[150px]")}>{columnLabel}</SortTh>;
                  return <th key={key} className={cn("whitespace-nowrap px-3 py-2 font-medium", key === "email" && "min-w-[200px]", key === "company" && "min-w-[150px]")}>{columnLabel}</th>;
                })}
                <th className="sticky right-0 z-40 w-9 border-l border-border bg-surface px-1 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((row) => {
                const { lead } = row;
                const phone = phoneParts(lead.phone);
                const displayName = lead.contactName?.trim() || phone.mobile || lead.email || `Lead #${lead.id}`;
                const fullPhone = phone.countryCode !== "—" ? `${phone.countryCode} ${phone.mobile}` : phone.mobile;
                const selected = selectedIds.includes(lead.id);
                return (
                  <tr key={lead.id} className={cn("group transition-colors hover:bg-surface-2/40", selected && "bg-accent/5")}>
                    <td className="pl-6 pr-2 py-2"><Checkbox checked={selected} aria-label={`Select ${displayName}`} onCheckedChange={(checked) => setSelectedIds((c) => checked ? [...new Set([...c, lead.id])] : c.filter((id) => id !== lead.id))} /></td>
                    <td className="px-3 py-2">
                      <Link href={`/leads/${lead.id}`} className="block truncate text-[13px] font-medium text-foreground hover:text-accent">{displayName}</Link>
                      {lead.company && <span className="block truncate text-[11px] text-muted-foreground">{lead.company}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">{canEditRows ? <EditableValue onClick={() => openEdit(row)}>{fullPhone}</EditableValue> : fullPhone}</td>
                    <td className="px-3 py-2">{(() => {
                      const sv = stageBadgeVariant(lead.stage);
                      const badge = <Badge variant={sv} className="text-[10px]">{label(lead.stage)}</Badge>;
                      if (!canEditRows || lead.stage === "converted") return badge;
                      return (
                        <Popover>
                          <PopoverTrigger asChild><button type="button" className="cursor-pointer">{badge}</button></PopoverTrigger>
                          <PopoverContent align="start" className="w-32 p-1">
                            {stages.filter((s) => s !== "converted").map((s) => (
                              <button key={s} type="button" onClick={() => void quickStageChange(row, s)} className={cn("flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-surface-2", lead.stage === s && "bg-accent/10 font-semibold")}>
                                <Badge variant={stageBadgeVariant(s)} className="text-[10px]">{label(s)}</Badge>
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>
                      );
                    })()}</td>
                    {orderedOptionalColumns.map(({ key }) => {
                      if (!visibleColumns[key]) return null;
                      if (key === "crm") return <td key={key} className="max-w-[140px] truncate whitespace-nowrap px-3 py-2 text-muted-foreground">{crms.find((c) => c.id === lead.crmId)?.name ?? "—"}</td>;
                      if (key === "followUp") return <td key={key} className={cn("whitespace-nowrap px-3 py-2", isDue(lead.nextFollowUpOn) ? "font-medium text-warning" : "text-muted-foreground")}>{lead.nextFollowUpOn ? followUpWords(lead.nextFollowUpOn) : "—"}</td>;
                      if (key === "email") return <td key={key} className="max-w-[200px] truncate px-3 py-2 text-muted-foreground">{canEditRows ? <EditableValue onClick={() => openEdit(row)}>{lead.email || "—"}</EditableValue> : (lead.email || "—")}</td>;
                      if (key === "company") return <td key={key} className="max-w-[150px] truncate px-3 py-2 text-muted-foreground">{canEditRows ? <EditableValue onClick={() => openEdit(row)}>{lead.company || "—"}</EditableValue> : (lead.company || "—")}</td>;
                      if (key === "source") return <td key={key} className="whitespace-nowrap px-3 py-2"><SourceBadge source={lead.source} /></td>;
                      if (key === "owner") return <td key={key} className="max-w-[140px] truncate px-3 py-2 text-muted-foreground">{lead.ownerId === session.user.id ? session.user.name : lead.ownerName || (lead.ownerId ? `#${lead.ownerId}` : "—")}</td>;
                      if (key === "score") return <td key={key} className="whitespace-nowrap px-3 py-2"><LeadScoreBadge leadId={lead.id} /></td>;
                      return <td key={key} className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDateTime(lead.createdAt)}</td>;
                    })}
                    <td className="sticky right-0 z-30 w-9 border-l border-border bg-surface px-0 py-2 text-center group-hover:bg-surface-2/40" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="mx-auto inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground/40 transition-colors hover:bg-surface-2 hover:text-foreground data-[state=open]:bg-surface-2 data-[state=open]:text-foreground">
                            <MoreHorizontal className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onSelect={() => setDrawerLead(lead)} className="gap-2"><Eye className="size-3.5 text-muted-foreground" />Quick view</DropdownMenuItem>
                          <DropdownMenuItem asChild className="gap-2"><Link href={`/leads/${lead.id}`}><Search className="size-3.5 text-muted-foreground" />Full page</Link></DropdownMenuItem>
                          {canEditRows && (
                            <DropdownMenuItem onSelect={() => openEdit(row)} className="gap-2"><Pencil className="size-3.5 text-muted-foreground" />Edit</DropdownMenuItem>
                          )}
                          {canEditRows && !lead.dealId && lead.stage !== "converted" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => setConvertingLead(lead)} className="gap-2"><TrendingUp className="size-3.5 text-success" />Convert to deal</DropdownMenuItem>
                            </>
                          )}
                          {lead.dealId && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild className="gap-2"><Link href={`/deals/${lead.dealId}`}><TrendingUp className="size-3.5 text-accent" />View deal</Link></DropdownMenuItem>
                            </>
                          )}
                          {canEditRows && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => { setActionError(""); setDeleting(row); }} className="gap-2"><Trash2 className="size-3.5" />Delete</DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      <div className="flex items-center justify-between border-t border-border px-6 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Per page</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-surface-2">
                {perPage}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-0">
              {([25, 50, 100] as const).map((n) => (
                <DropdownMenuItem key={n} onSelect={() => { setPerPage(n); try { localStorage.setItem("janus:leads:perPage", String(n)); } catch {} setAfter("0"); }} className={cn("text-xs", perPage === n && "font-semibold")}>{n}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {loaded && !loaded.error && <span className="text-[11px] tabular-nums text-muted-foreground">Showing {rows.length} lead{rows.length !== 1 ? "s" : ""}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" disabled={after === "0"} onClick={() => { setAfter("0"); setVersion((v) => v + 1); }} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-30">
            <ChevronLeft className="size-3" /> First
          </button>
          <button type="button" disabled={!loaded || loaded.rows.length < perPage} onClick={() => setAfter(loaded!.rows.at(-1)!.lead.id)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-30">
            Next <ChevronRight className="size-3" />
          </button>
        </div>
      </div>

      <AddLeadDialog open={adding} onOpenChange={setAdding} onAdded={() => { setAfter("0"); setVersion((value) => value + 1); }} />
      <ImportDialog open={importing} onOpenChange={setImporting} onDone={() => { setAfter("0"); setVersion((value) => value + 1); }} />
      <LeadDetailDrawer lead={drawerLead} open={Boolean(drawerLead)} onOpenChange={(open) => { if (!open) setDrawerLead(null); }} onUpdated={() => setVersion((value) => value + 1)} />

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit lead</DialogTitle><DialogDescription>Update contact details, requirement or pipeline stage.</DialogDescription></DialogHeader>
          {editForm && <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
            <div className="grid grid-cols-2 gap-3"><div className="flex flex-col gap-1.5"><Label htmlFor="lead-edit-name">Name</Label><Input id="lead-edit-name" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></div><div className="flex flex-col gap-1.5"><Label htmlFor="lead-edit-phone">Mobile</Label><Input id="lead-edit-phone" placeholder="+91 99999 99999" value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></div></div>
            <div className="grid grid-cols-2 gap-3"><div className="flex flex-col gap-1.5"><Label htmlFor="lead-edit-email">Email</Label><Input id="lead-edit-email" type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} /></div><div className="flex flex-col gap-1.5"><Label htmlFor="lead-edit-company">Company</Label><Input id="lead-edit-company" value={editForm.company} onChange={(event) => setEditForm({ ...editForm, company: event.target.value })} /></div></div>
            <div className="flex flex-col gap-1.5"><Label>Stage</Label>{editForm.stage === "converted" ? <p className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted-foreground">Converted to deal — stage is locked</p> : <Select value={editForm.stage} onValueChange={(stage) => setEditForm({ ...editForm, stage })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{stages.filter((s) => s !== "converted").map((stage) => <SelectItem key={stage} value={stage}>{label(stage)}</SelectItem>)}</SelectContent></Select>}</div>
            {editForm.stage === "lost" && <LostReasonFields id="lead-lost" category={editForm.lostCategory} note={editForm.lostReason} onChange={(lostCategory, lostReason) => setEditForm({ ...editForm, lostCategory, lostReason })} />}
            {canAssign && people.length > 0 && <div className="flex flex-col gap-1.5"><Label>Assigned to</Label><Select value={editForm.ownerId || "none"} onValueChange={(ownerId) => setEditForm({ ...editForm, ownerId })}><SelectTrigger aria-label="Assigned to"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Nobody yet</SelectItem>{people.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div>}
            <div className="flex flex-col gap-1.5"><Label htmlFor="lead-edit-requirement">Requirement</Label><Textarea id="lead-edit-requirement" value={editForm.requirement} onChange={(event) => setEditForm({ ...editForm, requirement: event.target.value })} /></div>
            {actionError && <p role="alert" className="text-xs text-danger">{actionError}</p>}
            <DialogFooter><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button></DialogFooter>
          </form>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent><DialogHeader><DialogTitle>Delete this lead?</DialogTitle><DialogDescription>This removes the lead from the pipeline. The contact record stays available for future enquiries.</DialogDescription></DialogHeader>{actionError && <p role="alert" className="text-xs text-danger">{actionError}</p>}<DialogFooter><Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" onClick={() => void deleteLead()} disabled={deletingLead}>{deletingLead ? "Deleting…" : "Delete lead"}</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={assigning} onOpenChange={(open) => !open && setAssigning(false)}>
        <DialogContent><DialogHeader><DialogTitle>Assign {selectedIds.length} lead{selectedIds.length === 1 ? "" : "s"}</DialogTitle><DialogDescription>The person you choose owns these leads: they see them in My leads and are answerable for following them up.</DialogDescription></DialogHeader>
          <Select value={assignTo} onValueChange={setAssignTo}><SelectTrigger aria-label="Assign to"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Nobody yet</SelectItem>{people.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select>
          <DialogFooter><Button type="button" variant="secondary" onClick={() => setAssigning(false)}>Cancel</Button><Button type="button" disabled={bulkUpdating} onClick={() => void assignSelected()}>{bulkUpdating ? "Assigning…" : "Assign"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(deletingSelected)} onOpenChange={(open) => !open && setDeletingSelected(null)}>
        <DialogContent><DialogHeader><DialogTitle>Delete selected leads?</DialogTitle><DialogDescription>{deletingSelected?.length || 0} selected leads will be removed from the pipeline. Their contact records stay available.</DialogDescription></DialogHeader>{actionError && <p role="alert" className="text-xs text-danger">{actionError}</p>}<DialogFooter><Button variant="secondary" onClick={() => setDeletingSelected(null)}>Cancel</Button><Button variant="destructive" onClick={() => void deleteSelectedLeads()} disabled={deletingLead}>{deletingLead ? "Deleting…" : "Delete selected"}</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(convertingLead)} onOpenChange={(open) => { if (!open) setConvertingLead(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to deal</DialogTitle>
            <DialogDescription>Create a pipeline deal for {convertingLead?.contactName || "this lead"}. Track it through stages until won or lost.</DialogDescription>
          </DialogHeader>
          {convertingLead && (
            <DealForm
              leadId={convertingLead.id}
              customerName={convertingLead.contactName || convertingLead.company || ""}
              onSaved={() => { setConvertingLead(null); toast.success("Deal created"); setVersion((v) => v + 1); }}
            />
          )}
        </DialogContent>
      </Dialog>

      {canEditRows && selectedIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 shadow-xl">
          <span className="flex items-center gap-1.5 pr-2 text-xs"><span className="inline-flex size-5 items-center justify-center rounded bg-accent text-[10px] font-bold text-accent-foreground">{selectedIds.length}</span><span className="text-muted-foreground">selected</span></span>
          <div className="h-5 w-px bg-border" />
          {canAssign && <button type="button" disabled={bulkUpdating} onClick={() => setAssigning(true)} className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"><UserPlus className="size-3" />Assign</button>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" disabled={bulkUpdating} className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"><ArrowUpDown className="size-3" />Move stage</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {stages.filter((s) => s !== "converted").map((s) => (
                <DropdownMenuItem key={s} onSelect={() => void bulkUpdateStage(s)} className="gap-2"><Badge variant={stageBadgeVariant(s)} className="text-[10px]">{label(s)}</Badge></DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" disabled={bulkUpdating} onClick={() => setDeletingSelected(rows.filter(({ lead }) => selectedIds.includes(lead.id)))} className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"><Trash2 className="size-3" />Delete</button>
          <div className="h-5 w-px bg-border" />
          <button type="button" onClick={() => setSelectedIds([])} className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"><X className="size-3.5" /></button>
        </div>
      )}
    </div>
  );
}

type SortKey = "newest" | "oldest" | "follow_up" | "last_activity" | "name_asc" | "name_desc" | "stage_asc" | "stage_desc" | "owner_asc" | "owner_desc" | "email_asc" | "email_desc" | "company_asc" | "company_desc";

function SortTh({ children, active, asc, desc, onSort, className }: { children: React.ReactNode; active: SortKey; asc: SortKey; desc: SortKey; onSort: (k: SortKey) => void; className?: string }) {
  const isAsc = active === asc;
  const isDesc = active === desc;
  return (
    <th className={cn("whitespace-nowrap px-3 py-2 font-medium", className)}>
      <button type="button" onClick={() => onSort(isAsc ? desc : asc)} className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
        {children}
        {isAsc ? <ArrowUp className="size-3 text-accent" /> : isDesc ? <ArrowDown className="size-3 text-accent" /> : <ArrowUpDown className="size-2.5 text-muted-foreground/40" />}
      </button>
    </th>
  );
}

function LeadQualityBar({ rows }: { rows: Row[] }) {
  const leads = rows.map(({ lead }) => lead);
  const total = leads.length;
  const converted = leads.filter((l) => l.stage === "converted").length;
  const conversion = total > 0 ? Math.round((converted / total) * 100) : 0;
  const overdue = leads.filter((l) => isDue(l.nextFollowUpOn) && !["converted", "lost"].includes(l.stage)).length;
  const stageNew = leads.filter((l) => l.stage === "new").length;
  const active = leads.filter((l) => !["converted", "lost"].includes(l.stage)).length;
  const qualified = leads.filter((l) => ["qualified", "converted"].includes(l.stage)).length;
  const qualifyRate = total > 0 ? Math.round((qualified / total) * 100) : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-2 text-[11px] text-muted-foreground">
      <span><span className="font-semibold tabular-nums text-foreground">{stageNew}</span> new</span>
      <span><span className="font-semibold tabular-nums text-foreground">{active}</span> active</span>
      <span><span className={cn("font-semibold tabular-nums", qualifyRate >= 30 ? "text-success" : "text-foreground")}>{qualifyRate}%</span> qualified</span>
      <span><span className={cn("font-semibold tabular-nums", conversion >= 25 ? "text-success" : conversion > 0 ? "text-warning" : "text-foreground")}>{conversion}%</span> conversion</span>
      {overdue > 0 && <span className="text-warning"><span className="font-semibold tabular-nums">{overdue}</span> overdue</span>}
    </div>
  );
}

function LeadQualityAnalysis({ rows }: { rows: Row[] }) {
  const leads = rows.map(({ lead }) => lead);
  const total = leads.length;
  const converted = leads.filter((l) => l.stage === "converted").length;
  const lost = leads.filter((l) => l.stage === "lost").length;
  const active = leads.filter((l) => !["converted", "lost"].includes(l.stage)).length;

  const stageCounts = stages.map((s) => ({ stage: s, count: leads.filter((l) => l.stage === s).length }));
  const maxStage = Math.max(...stageCounts.map((s) => s.count), 1);

  const sourceCounts = leads.reduce<Record<string, { total: number; converted: number; lost: number }>>((acc, l) => {
    if (!acc[l.source]) acc[l.source] = { total: 0, converted: 0, lost: 0 };
    acc[l.source].total++;
    if (l.stage === "converted") acc[l.source].converted++;
    if (l.stage === "lost") acc[l.source].lost++;
    return acc;
  }, {});
  const sourceRows = Object.entries(sourceCounts).sort((a, b) => b[1].total - a[1].total);

  const withFollowUp = leads.filter((l) => l.nextFollowUpOn && !["converted", "lost"].includes(l.stage)).length;
  const overdue = leads.filter((l) => isDue(l.nextFollowUpOn) && !["converted", "lost"].includes(l.stage)).length;
  const noFollowUp = leads.filter((l) => !l.nextFollowUpOn && !["converted", "lost"].includes(l.stage)).length;
  const withEmail = leads.filter((l) => l.email).length;
  const withCompany = leads.filter((l) => l.company).length;
  const unassigned = leads.filter((l) => !l.ownerId).length;
  const conversion = total > 0 ? Math.round((converted / total) * 100) : 0;
  const qualifiedCount = leads.filter((l) => ["qualified", "converted"].includes(l.stage)).length;
  const qualifyRate = total > 0 ? Math.round((qualifiedCount / total) * 100) : 0;
  const dataScore = Math.round(((withEmail / Math.max(total, 1)) * 40 + (withCompany / Math.max(total, 1)) * 30 + (withFollowUp / Math.max(active, 1)) * 30));

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ["Pipeline Health", `${active} active`, `${converted} converted · ${lost} lost`, conversion >= 25 ? "bg-success" : "bg-warning"],
          ["Conversion Rate", `${conversion}%`, `${converted} of ${converted + lost} closed`, conversion >= 30 ? "bg-success" : conversion >= 15 ? "bg-warning" : "bg-danger"],
          ["Qualification Rate", `${qualifyRate}%`, `${qualifiedCount} of ${total} leads`, qualifyRate >= 40 ? "bg-success" : qualifyRate >= 20 ? "bg-warning" : "bg-danger"],
          ["Data Quality Score", `${dataScore}/100`, `${withEmail} email · ${withCompany} company`, dataScore >= 70 ? "bg-success" : dataScore >= 40 ? "bg-warning" : "bg-danger"],
        ] as const).map(([title, value, detail, dot]) => (
          <div key={title} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-1.5"><span className={cn("size-2 rounded-full", dot)} /><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span></div>
            <div className="mt-1.5 text-2xl font-bold tabular-nums">{value}</div>
            <span className="text-[11px] text-muted-foreground">{detail}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold flex items-center gap-2"><TrendingUp className="size-4 text-accent" /> Stage Distribution</h3>
          <div className="space-y-2">
            {stageCounts.map(({ stage: s, count }) => (
              <div key={s} className="flex items-center gap-3">
                <span className="w-24 text-xs text-muted-foreground truncate">{label(s)}</span>
                <div className="flex-1 h-5 rounded bg-surface-2 overflow-hidden">
                  <div className={cn("h-full rounded transition-all", s === "converted" ? "bg-success" : s === "lost" ? "bg-danger" : s === "new" ? "bg-accent" : "bg-accent/60")} style={{ width: `${(count / maxStage) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-xs font-semibold tabular-nums">{count}</span>
                <span className="w-10 text-right text-[10px] text-muted-foreground">{total > 0 ? Math.round((count / total) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold flex items-center gap-2"><BarChart3 className="size-4 text-accent" /> Source Performance</h3>
          {sourceRows.length === 0 ? <p className="text-xs text-muted-foreground">No source data available.</p> : (
            <div className="space-y-2.5">
              {sourceRows.slice(0, 8).map(([src, data]) => {
                const srcConv = data.converted + data.lost > 0 ? Math.round((data.converted / (data.converted + data.lost)) * 100) : null;
                return (
                  <div key={src} className="flex items-center gap-3">
                    <SourceBadge source={src} className="w-28 shrink-0" />
                    <div className="flex-1 h-5 rounded bg-surface-2 overflow-hidden">
                      <div className={cn("h-full rounded", sourceMeta(src).bg.replace("/10", "/40"))} style={{ width: `${(data.total / Math.max(sourceRows[0][1].total, 1)) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right text-xs font-semibold tabular-nums">{data.total}</span>
                    {srcConv !== null && <Badge variant={srcConv >= 30 ? "success" : srcConv >= 15 ? "warning" : "neutral"} className="text-[10px]">{srcConv}%</Badge>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold">Follow-up Health</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Follow-ups scheduled</span><span className="text-sm font-semibold">{withFollowUp}<span className="ml-1 text-xs text-muted-foreground font-normal">/ {active} active</span></span></div>
            <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${active > 0 ? (withFollowUp / active) * 100 : 0}%` }} /></div>
            {overdue > 0 && <div className="flex items-center gap-1.5 text-xs text-warning font-medium"><span className="size-1.5 rounded-full bg-warning" />{overdue} overdue follow-up{overdue !== 1 ? "s" : ""}</div>}
            {noFollowUp > 0 && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-muted-foreground" />{noFollowUp} active lead{noFollowUp !== 1 ? "s" : ""} without follow-up</div>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold">Data Completeness</h3>
          <div className="space-y-2.5">
            {([
              ["Has email", withEmail, total],
              ["Has company", withCompany, total],
              ["Assigned", total - unassigned, total],
              ["Follow-up set", withFollowUp, active],
            ] as const).map(([label, count, of]) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">{label}</span><span className="text-xs font-semibold tabular-nums">{of > 0 ? Math.round((count / of) * 100) : 0}%</span></div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className={cn("h-full rounded-full", count / Math.max(of, 1) >= 0.7 ? "bg-success" : count / Math.max(of, 1) >= 0.4 ? "bg-warning" : "bg-danger")} style={{ width: `${of > 0 ? (count / of) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold">Pipeline Velocity</h3>
          <div className="space-y-3">
            <div className="text-center py-2">
              <div className="text-3xl font-bold tabular-nums">{active}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Active leads in pipeline</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-surface-2 p-2.5">
                <div className="text-lg font-bold text-success tabular-nums">{converted}</div>
                <div className="text-[10px] text-muted-foreground">Converted</div>
              </div>
              <div className="rounded-lg bg-surface-2 p-2.5">
                <div className="text-lg font-bold text-danger tabular-nums">{lost}</div>
                <div className="text-[10px] text-muted-foreground">Lost</div>
              </div>
            </div>
            {unassigned > 0 && <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning font-medium">{unassigned} lead{unassigned !== 1 ? "s" : ""} unassigned — assign someone to improve response time</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadScoreBadge({ leadId }: { leadId: string }) {
  const { data } = useApi<{ score: number }>(`/leads/${leadId}/score`);
  if (!data) return <span className="text-xs text-muted-foreground">—</span>;
  const s = data.score;
  const color = s >= 80 ? "text-success" : s >= 50 ? "text-warning" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${color}`}>
      <span className={`size-1.5 rounded-full ${s >= 80 ? "bg-success" : s >= 50 ? "bg-warning" : "bg-muted-foreground"}`} />
      {s}
    </span>
  );
}
