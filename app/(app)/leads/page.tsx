"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { can } from "@/lib/permissions";
import { canSeeOwner } from "@/lib/crm-scope";
import Link from "next/link";
import {
  BarChart3,
  Eye,
  GripVertical,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Settings2,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import type { Lead } from "@/lib/api/types";
import { useSession } from "@/components/auth/session-provider";
import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
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
import { followUpWords, isDue } from "@/components/crm/follow-up";
import { useApi } from "@/lib/api/use-api";
import { LostReasonFields } from "@/components/crm/lost-reason-fields";
import type { LostCategory } from "@/lib/lost-reasons";
import { LeadDetailDrawer } from "@/components/crm/lead-detail";
import { ImportDialog } from "@/components/crm/import-dialog";
import { LeadsBoard } from "@/components/crm/leads-board";

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

type OptionalColumn = "followUp" | "email" | "company" | "source" | "owner" | "created" | "score";

const optionalColumns: { key: OptionalColumn; label: string }[] = [
  { key: "followUp", label: "Next follow-up" },
  { key: "email", label: "Email" },
  { key: "company", label: "Company" },
  { key: "source", label: "Source" },
  { key: "owner", label: "Owner" },
  { key: "score", label: "Score" },
  { key: "created", label: "Created" },
];

const stages = [
  "new",
  "contacted",
  "qualified",
  "demo",
  "proposal",
  "negotiation",
  "approval",
  "won",
  "lost",
] as const;

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

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
  const canWrite = can(session, "leads:write");
  const [after, setAfter] = useState("0");
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [view, setView] = useState<"table" | "board" | "quality">("table");
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
  const [visibleColumns, setVisibleColumns] = useState<Record<OptionalColumn, boolean>>({
    followUp: true,
    email: false,
    company: false,
    source: false,
    owner: true,
    score: false,
    created: false,
  });
  const [columnOrder, setColumnOrder] = useState<OptionalColumn[]>(optionalColumns.map(({ key }) => key));
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
      const leads = await api<Lead[]>(`/leads?limit=50&after_id=${after}${searchParam}${stageParam}${sourceParam}${ownerParam}`, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted)
        setResult({
          after,
          rows: leads.map((lead) => ({ lead })),
        });
    };
    load().catch((error) => {
      if (!controller.signal.aborted)
        setResult({ after, rows: [], error: message(error) });
    });
    return () => controller.abort();
  }, [after, version, serverQuery, stageFilter, sourceFilter, ownerFilter, session.user.id]);

  const loaded = result?.after === after ? result : null;
  const canEditRows = canWrite;
  // Owners and managers can hand a lead to someone they manage.
  const canAssign = session.permissions.includes("*") || can(session, "leads:assign");
  const members = useApi<{ user_id: string | number; name: string; status: string }[]>(canAssign ? "/members/directory" : null);
  const people = (members.data ?? []).filter((item) => item.status === "active").map((item) => ({ id: String(item.user_id), label: item.name }));
  const [assigning, setAssigning] = useState(false);
  const [assignTo, setAssignTo] = useState("none");
  const filterOpts = useApi<{ stages: string[]; sources: string[]; owners: { id: string; name: string }[] }>("/leads/filter-options");
  const sources = filterOpts.data?.sources ?? [...new Set(loaded?.rows.map(({ lead }) => lead.source) || [])];
  const rows = useMemo(() => {
    return (
      loaded?.rows.filter(({ lead }) => {
        return (
          (stageFilter === "all" || lead.stage === stageFilter) &&
          (sourceFilter === "all" || lead.source === sourceFilter) &&
          (!dueOnly || isDue(lead.nextFollowUpOn)) &&
          (ownerFilter === "all" || (ownerFilter === "mine" ? lead.ownerId === session.user.id : !lead.ownerId))
        );
      }) || []
    );
  }, [loaded, sourceFilter, stageFilter, dueOnly, ownerFilter, session.user.id]);
  const allVisibleSelected = rows.length > 0 && rows.every(({ lead }) => selectedIds.includes(lead.id));
  const visibleColumnCount = 4 + optionalColumns.filter(({ key }) => visibleColumns[key]).length;
  const orderedOptionalColumns = columnOrder
    .map((key) => optionalColumns.find((column) => column.key === key))
    .filter((column): column is { key: OptionalColumn; label: string } => Boolean(column));
  const resetColumns = () => {
    setVisibleColumns({ followUp: true, email: false, company: false, source: false, owner: false, score: false, created: false });
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

  const filtersActive = query.trim() || stageFilter !== "all" || sourceFilter !== "all" || dueOnly || ownerFilter !== "all";
  const dueCount = (loaded?.rows ?? []).filter(({ lead }) => isDue(lead.nextFollowUpOn) && !["won", "lost"].includes(lead.stage)).length;

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col">
      <PageHeader
        title="Leads"
        description="Every enquiry in one searchable pipeline."
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => setVersion((value) => value + 1)}>
              <RotateCw className="size-3.5" />
              Refresh
            </Button>
            {can(session, "leads:write") && (
              <>
                <Button size="sm" onClick={() => setAdding(true)}>
                  <Plus className="size-3.5" />
                  Add lead
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setImporting(true)}>
                  Import CSV
                </Button>
              </>
            )}
            {can(session, "sources:manage") && (
              <Button size="sm" variant="secondary" asChild>
                <Link href="/lead-sources/new">Add lead source</Link>
              </Button>
            )}
          </>
        }
      />
      {loaded?.error && <p role="alert" className="mx-6 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">Your leads could not be read: {loaded.error}. Refresh to try again; nothing is lost.</p>}

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 pb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, mobile, email, company or notes..." className="w-full sm:w-[25rem]" />
        <Select value={ownerFilter} onValueChange={(value) => setOwnerFilter(value as "all" | "mine" | "none")}><SelectTrigger className="h-9 w-[150px]" aria-label="Whose leads"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Everyone&apos;s leads</SelectItem><SelectItem value="mine">My leads</SelectItem><SelectItem value="none">Unassigned</SelectItem></SelectContent></Select>
        <Button size="sm" variant={dueOnly ? "default" : "secondary"} aria-pressed={dueOnly} onClick={() => setDueOnly((value) => !value)}>Follow-ups due{dueCount ? ` (${dueCount})` : ""}</Button>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-36"><SlidersHorizontal className="size-3.5 text-muted-foreground" /><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All stages</SelectItem>{stages.map((stage) => <SelectItem key={stage} value={stage}>{label(stage)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All sources</SelectItem>{sources.map((source) => <SelectItem key={source} value={source}>{label(source)}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex rounded-lg border border-border p-0.5 bg-surface-2/50">
          <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors", view === "table" ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}><List className="size-3.5" /> Table</button>
          <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors", view === "board" ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}><LayoutGrid className="size-3.5" /> Board</button>
          <button type="button" aria-pressed={view === "quality"} onClick={() => setView("quality")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors", view === "quality" ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}><BarChart3 className="size-3.5" /> Quality</button>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" title="Choose and reorder visible columns">
              <Settings2 className="size-3.5" />
              Columns
              <span className="text-[10px] text-muted-foreground">{visibleColumnCount}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 bg-surface p-0 shadow-2xl">
            <div className="border-b border-border px-3 py-2.5">
              <p className="text-sm font-medium">Table columns</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Choose what is visible and drag to reorder.</p>
            </div>
            <div className="space-y-1 p-2">
              <div className="flex items-center justify-between px-2 pb-1">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Optional columns</p>
                <span className="text-[10px] text-muted-foreground">Drag to reorder</span>
              </div>
              {orderedOptionalColumns.map(({ key, label: columnLabel }) => (
                <div
                  key={key}
                  draggable
                  onDragStart={() => setDraggingColumn(key)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggingColumn) moveColumn(draggingColumn, key);
                    setDraggingColumn(null);
                  }}
                  onDragEnd={() => setDraggingColumn(null)}
                  className={cn(
                    "flex cursor-grab items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-[13px] transition-colors hover:border-border hover:bg-surface-2 active:cursor-grabbing",
                    draggingColumn === key && "border-accent/30 bg-accent/5 opacity-60",
                  )}
                >
                  <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
                  <Checkbox
                    checked={visibleColumns[key]}
                    aria-label={`Show ${columnLabel}`}
                    onCheckedChange={(checked) => setVisibleColumns((current) => ({ ...current, [key]: checked }))}
                  />
                  <span>{columnLabel}</span>
                </div>
              ))}
              <div className="mt-2 border-t border-border pt-2">
                <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Actions stay pinned while the rest of the table scrolls.</p>
                <Button size="sm" variant="ghost" className="mt-1 w-full justify-start" onClick={resetColumns}>
                  <RotateCcw className="size-3.5" />
                  Reset columns
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        {canEditRows && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={!selectedIds.length}>
                Actions{selectedIds.length ? ` (${selectedIds.length})` : ""}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {canAssign && <DropdownMenuItem disabled={bulkUpdating || !selectedIds.length} onSelect={() => setAssigning(true)}>
                Assign selected to…
              </DropdownMenuItem>}
              <DropdownMenuItem disabled={bulkUpdating} onSelect={() => void bulkUpdateStage("qualified")}>
                Mark selected as Qualified
              </DropdownMenuItem>
              <DropdownMenuItem disabled={bulkUpdating} onSelect={() => void bulkUpdateStage("won")}>
                Mark selected as Won
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeletingSelected(rows.filter(({ lead }) => selectedIds.includes(lead.id)))}
              >
                <Trash2 className="size-3.5" />
                Delete selected
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {filtersActive && <Button size="sm" variant="ghost" onClick={() => { setQuery(""); setStageFilter("all"); setSourceFilter("all"); setDueOnly(false); setOwnerFilter("all"); }}><X className="size-3.5" />Clear filters</Button>}
        {loaded && !loaded.error && <span className="ml-auto text-xs text-muted-foreground">Showing {rows.length} of {loaded.rows.length} loaded leads</span>}
        
      </div>
      {loaded && !loaded.error && rows.length > 0 && view !== "quality" && (
        <LeadQualityBar rows={rows} />
      )}
      {view === "table" && (
        <div className="flex items-center gap-2 px-6 pt-3 text-[11px] text-muted-foreground">
          <Pencil className="size-3" />
          <span>Click a value with the pencil affordance to edit name, mobile, email, company, stage or requirement.</span>
        </div>
      )}
      {view === "board" && <p className="px-6 pt-3 text-xs text-muted-foreground">Drag leads between stages. Scroll sideways to see every stage.</p>}

      {!loaded ? (
        <p role="status" className="p-6 text-sm">Loading leads…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col gap-2 p-6">
          <h2 className="text-sm font-medium">{filtersActive ? "No leads match these filters" : after === "0" ? "No leads yet" : "No more leads"}</h2>
          <p className="text-sm text-muted-foreground">{filtersActive ? "Try another search, stage or source." : "Connect a website form, call provider or API, or upload a CSV."}</p>
        </div>
      ) : view === "quality" ? (
        <LeadQualityAnalysis rows={rows} />
      ) : view === "board" ? (
        <LeadsBoard leads={rows.map(({ lead }) => lead)} onStageChanged={() => { setAfter("0"); setVersion((v) => v + 1); }} onLeadClick={(lead) => setDrawerLead(lead)} />
      ) : (
        <>
        <p className="mx-4 mt-3 text-xs text-muted-foreground md:hidden">Swipe the table sideways to see more columns.</p>
        <div className="isolate mx-4 mt-2 mb-2 overflow-x-auto rounded-xl border border-border bg-surface shadow-sm md:mx-6 md:mt-4">
          <table className="table-fixed min-w-full w-max text-left text-[13px]">
            <thead className="bg-surface-2 text-muted-foreground">
              <tr>
                <th className="w-12 min-w-12 px-3 py-3.5">
                  <Checkbox
                    aria-label="Select all visible leads"
                    checked={allVisibleSelected ? true : selectedIds.length > 0 ? "indeterminate" : false}
                    onCheckedChange={(checked) => setSelectedIds(checked ? rows.map(({ lead }) => lead.id) : [])}
                  />
                </th>
                <th className="w-16 min-w-16 px-2 py-3.5 font-medium"># / ID</th>
                <th className="w-40 min-w-40 px-3 py-3.5 font-medium">Name</th>
                <th className="w-28 min-w-28 whitespace-nowrap px-3 py-3.5 font-medium">Country code</th>
                <th className="w-32 min-w-32 px-3 py-3.5 font-medium">Mobile</th>
                <th className="w-28 min-w-28 whitespace-nowrap px-3 py-3.5 font-medium">Stage</th>
                {orderedOptionalColumns.map(({ key, label: columnLabel }) => visibleColumns[key] && <th key={key} className={cn("whitespace-nowrap px-5 py-3.5 font-medium", key === "email" && "w-56 min-w-56", key === "company" && "w-44 min-w-44")}>{columnLabel}</th>)}
                <th className="sticky right-0 z-40 w-14 min-w-14 border-l border-border bg-surface-2 px-3 py-3.5 text-right font-medium shadow-[-2px_0_0_rgba(15,23,42,0.06)]"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const { lead } = row;
                const phone = phoneParts(lead.phone);
                const displayName = lead.contactName?.trim() || phone.mobile || lead.email || `Lead #${lead.id}`;
                const selected = selectedIds.includes(lead.id);
                return (
                  <tr key={lead.id} className={`group border-b border-border transition-colors hover:bg-surface-2/60 ${selected ? "bg-accent/5" : ""}`}>
                    <td className="w-12 min-w-12 px-3 py-4"><Checkbox checked={selected} aria-label={`Select ${displayName}`} onCheckedChange={(checked) => setSelectedIds((current) => checked ? [...new Set([...current, lead.id])] : current.filter((id) => id !== lead.id))} /></td>
                    <td className="w-16 min-w-16 whitespace-nowrap px-2 py-4"><span className="font-mono text-xs font-semibold text-foreground">#{String(index + 1).padStart(2, "0")}</span><span className="mt-1 block text-[10px] text-muted-foreground">ID {lead.id}</span></td>
                    <td className="w-40 min-w-40 px-3 py-4"><div className="flex items-center gap-2"><Link href={`/leads/${lead.id}`} className="block truncate font-semibold text-foreground hover:text-accent">{displayName}</Link>{canEditRows && <button type="button" title="Edit name" onClick={() => openEdit(row)} className="shrink-0 text-muted-foreground hover:text-accent"><Pencil className="size-3" /></button>}</div>{lead.contactName ? null : <span className="mt-1 block text-[11px] text-muted-foreground">Using mobile as name</span>}</td>
                    <td className="w-28 min-w-28 whitespace-nowrap px-3 py-4"><span className="inline-flex whitespace-nowrap rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-foreground">{phone.countryCode}</span></td>
                    <td className="w-32 min-w-32 whitespace-nowrap px-3 py-4 font-medium text-foreground">{canEditRows ? <EditableValue onClick={() => openEdit(row)}>{phone.mobile}</EditableValue> : phone.mobile}</td>
                    <td className="w-28 min-w-28 px-3 py-4">{canEditRows ? <EditableValue onClick={() => openEdit(row)}><Badge variant="neutral">{label(lead.stage)}</Badge></EditableValue> : <Badge variant="neutral">{label(lead.stage)}</Badge>}</td>
                    {orderedOptionalColumns.map(({ key }) => {
                      if (!visibleColumns[key]) return null;
                      if (key === "followUp") return <td key={key} className={`whitespace-nowrap px-5 py-4 ${isDue(lead.nextFollowUpOn) ? "font-medium text-warning" : "text-muted-foreground"}`}>{lead.nextFollowUpOn ? followUpWords(lead.nextFollowUpOn) : "—"}</td>;
                      if (key === "email") return <td key={key} className="max-w-[220px] px-5 py-4 text-muted-foreground">{canEditRows ? <EditableValue onClick={() => openEdit(row)}>{lead.email || "—"}</EditableValue> : <span className="block truncate">{lead.email || "—"}</span>}</td>;
                      if (key === "company") return <td key={key} className="max-w-[180px] px-5 py-4 text-muted-foreground">{canEditRows ? <EditableValue onClick={() => openEdit(row)}>{lead.company || "—"}</EditableValue> : <span className="block truncate">{lead.company || "—"}</span>}</td>;
                      if (key === "source") return <td key={key} className="whitespace-nowrap px-5 py-4 text-muted-foreground">{label(lead.source)}</td>;
                      if (key === "owner") return <td key={key} className="max-w-[160px] truncate px-5 py-4 text-muted-foreground">{lead.ownerId === session.user.id ? session.user.name : lead.ownerName || (lead.ownerId ? `Member #${lead.ownerId}` : "Unassigned")}</td>;
                      if (key === "score") return <td key={key} className="whitespace-nowrap px-5 py-4"><LeadScoreBadge leadId={lead.id} /></td>;
                      return <td key={key} className="whitespace-nowrap px-5 py-4 text-muted-foreground">{formatDateTime(lead.createdAt)}</td>;
                    })}
                    <td className="sticky right-0 z-30 w-14 min-w-14 border-l border-border bg-surface px-3 py-4 text-right shadow-[-2px_0_0_rgba(15,23,42,0.06)] group-hover:bg-surface-2/60" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${displayName}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDrawerLead(lead)}><Eye className="size-3.5" />Quick view</DropdownMenuItem>
                          <DropdownMenuItem asChild><Link href={`/leads/${lead.id}`}><Eye className="size-3.5" />Full page</Link></DropdownMenuItem>
                          {canEditRows && <DropdownMenuItem onSelect={() => openEdit(row)}><Pencil className="size-3.5" />Edit and update</DropdownMenuItem>}
                          {canEditRows && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => { setActionError(""); setDeleting(row); }}><Trash2 className="size-3.5" />Delete lead</DropdownMenuItem></>}
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

      <div className="flex gap-2 p-6"><Button size="sm" variant="ghost" onClick={() => { setAfter("0"); setVersion((value) => value + 1); }}>First page</Button><Button size="sm" variant="secondary" disabled={!loaded || loaded.rows.length !== 50} onClick={() => setAfter(loaded!.rows.at(-1)!.lead.id)}>Next 50</Button></div>

      <AddLeadDialog open={adding} onOpenChange={setAdding} onAdded={() => { setAfter("0"); setVersion((value) => value + 1); }} />
      <ImportDialog open={importing} onOpenChange={setImporting} onDone={() => { setAfter("0"); setVersion((value) => value + 1); }} />
      <LeadDetailDrawer lead={drawerLead} open={Boolean(drawerLead)} onOpenChange={(open) => { if (!open) setDrawerLead(null); }} onUpdated={() => setVersion((value) => value + 1)} />

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit lead</DialogTitle><DialogDescription>Update contact details, requirement or pipeline stage.</DialogDescription></DialogHeader>
          {editForm && <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
            <div className="grid grid-cols-2 gap-3"><div className="flex flex-col gap-1.5"><Label htmlFor="lead-edit-name">Name</Label><Input id="lead-edit-name" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></div><div className="flex flex-col gap-1.5"><Label htmlFor="lead-edit-phone">Mobile</Label><Input id="lead-edit-phone" placeholder="+91 99999 99999" value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></div></div>
            <div className="grid grid-cols-2 gap-3"><div className="flex flex-col gap-1.5"><Label htmlFor="lead-edit-email">Email</Label><Input id="lead-edit-email" type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} /></div><div className="flex flex-col gap-1.5"><Label htmlFor="lead-edit-company">Company</Label><Input id="lead-edit-company" value={editForm.company} onChange={(event) => setEditForm({ ...editForm, company: event.target.value })} /></div></div>
            <div className="flex flex-col gap-1.5"><Label>Stage</Label><Select value={editForm.stage} onValueChange={(stage) => setEditForm({ ...editForm, stage })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{stages.map((stage) => <SelectItem key={stage} value={stage}>{label(stage)}</SelectItem>)}</SelectContent></Select></div>
            {editForm.stage === "lost" && <LostReasonFields id="lead-lost" category={editForm.lostCategory} note={editForm.lostReason} onChange={(lostCategory, lostReason) => setEditForm({ ...editForm, lostCategory, lostReason })} />}
            {canAssign && people.length > 0 && <div className="flex flex-col gap-1.5"><Label>Owner</Label><Select value={editForm.ownerId || "none"} onValueChange={(ownerId) => setEditForm({ ...editForm, ownerId })}><SelectTrigger aria-label="Owner"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Nobody yet</SelectItem>{people.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div>}
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
    </div>
  );
}

function LeadQualityBar({ rows }: { rows: Row[] }) {
  const leads = rows.map(({ lead }) => lead);
  const total = leads.length;
  const won = leads.filter((l) => l.stage === "won").length;
  const lost = leads.filter((l) => l.stage === "lost").length;
  const conversion = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;
  const withFollowUp = leads.filter((l) => l.nextFollowUpOn).length;
  const overdue = leads.filter((l) => isDue(l.nextFollowUpOn) && !["won", "lost"].includes(l.stage)).length;
  const sourceCounts = leads.reduce<Record<string, number>>((acc, l) => { acc[l.source] = (acc[l.source] || 0) + 1; return acc; }, {});
  const bestSource = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0];
  const stageNew = leads.filter((l) => l.stage === "new").length;
  const qualified = leads.filter((l) => ["qualified", "demo", "proposal", "negotiation", "approval", "won"].includes(l.stage)).length;
  const qualifyRate = total > 0 ? Math.round((qualified / total) * 100) : 0;
  return (
    <div className="mx-6 mt-3 flex flex-wrap items-center gap-4 rounded-lg bg-surface-2/50 px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-xs"><span className="size-1.5 rounded-full bg-accent" /><span className="text-muted-foreground">New:</span><span className="font-semibold">{stageNew}</span></div>
      <div className="flex items-center gap-1.5 text-xs"><span className="size-1.5 rounded-full bg-success" /><span className="text-muted-foreground">Qualified+:</span><span className="font-semibold">{qualified}</span><span className="text-muted-foreground">({qualifyRate}%)</span></div>
      <span className="hidden sm:inline text-border">|</span>
      {bestSource && <div className="flex items-center gap-1.5 text-xs"><span className="text-muted-foreground">Top source:</span><span className="font-semibold">{label(bestSource[0])}</span><span className="text-muted-foreground">{Math.round((bestSource[1] / total) * 100)}%</span></div>}
      <span className="hidden sm:inline text-border">|</span>
      <div className="flex items-center gap-1.5 text-xs"><span className="text-muted-foreground">Follow-ups set:</span><span className="font-semibold">{withFollowUp}</span>{overdue > 0 && <span className="font-medium text-warning">({overdue} overdue)</span>}</div>
      <span className="hidden sm:inline text-border">|</span>
      <div className="flex items-center gap-1.5 text-xs"><span className="text-muted-foreground">Conversion:</span><span className={cn("font-semibold", conversion >= 25 ? "text-success" : "text-warning")}>{conversion}%</span></div>
    </div>
  );
}

function LeadQualityAnalysis({ rows }: { rows: Row[] }) {
  const leads = rows.map(({ lead }) => lead);
  const total = leads.length;
  const won = leads.filter((l) => l.stage === "won").length;
  const lost = leads.filter((l) => l.stage === "lost").length;
  const active = leads.filter((l) => !["won", "lost"].includes(l.stage)).length;

  const stageCounts = stages.map((s) => ({ stage: s, count: leads.filter((l) => l.stage === s).length }));
  const maxStage = Math.max(...stageCounts.map((s) => s.count), 1);

  const sourceCounts = leads.reduce<Record<string, { total: number; won: number; lost: number }>>((acc, l) => {
    if (!acc[l.source]) acc[l.source] = { total: 0, won: 0, lost: 0 };
    acc[l.source].total++;
    if (l.stage === "won") acc[l.source].won++;
    if (l.stage === "lost") acc[l.source].lost++;
    return acc;
  }, {});
  const sourceRows = Object.entries(sourceCounts).sort((a, b) => b[1].total - a[1].total);

  const withFollowUp = leads.filter((l) => l.nextFollowUpOn && !["won", "lost"].includes(l.stage)).length;
  const overdue = leads.filter((l) => isDue(l.nextFollowUpOn) && !["won", "lost"].includes(l.stage)).length;
  const noFollowUp = leads.filter((l) => !l.nextFollowUpOn && !["won", "lost"].includes(l.stage)).length;
  const withEmail = leads.filter((l) => l.email).length;
  const withCompany = leads.filter((l) => l.company).length;
  const unassigned = leads.filter((l) => !l.ownerId).length;
  const conversion = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;
  const qualifiedCount = leads.filter((l) => ["qualified", "demo", "proposal", "negotiation", "approval", "won"].includes(l.stage)).length;
  const qualifyRate = total > 0 ? Math.round((qualifiedCount / total) * 100) : 0;
  const dataScore = Math.round(((withEmail / Math.max(total, 1)) * 40 + (withCompany / Math.max(total, 1)) * 30 + (withFollowUp / Math.max(active, 1)) * 30));

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ["Pipeline Health", `${active} active`, `${won} won · ${lost} lost`, conversion >= 25 ? "bg-success" : "bg-warning"],
          ["Conversion Rate", `${conversion}%`, `${won} of ${won + lost} closed`, conversion >= 30 ? "bg-success" : conversion >= 15 ? "bg-warning" : "bg-danger"],
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
                  <div className={cn("h-full rounded transition-all", s === "won" ? "bg-success" : s === "lost" ? "bg-danger" : s === "new" ? "bg-accent" : "bg-accent/60")} style={{ width: `${(count / maxStage) * 100}%` }} />
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
                const srcConv = data.won + data.lost > 0 ? Math.round((data.won / (data.won + data.lost)) * 100) : null;
                return (
                  <div key={src} className="flex items-center gap-3">
                    <span className="w-28 text-xs font-medium truncate">{label(src)}</span>
                    <div className="flex-1 h-5 rounded bg-surface-2 overflow-hidden">
                      <div className="h-full rounded bg-accent/70" style={{ width: `${(data.total / Math.max(sourceRows[0][1].total, 1)) * 100}%` }} />
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
              ["Assigned owner", total - unassigned, total],
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
                <div className="text-lg font-bold text-success tabular-nums">{won}</div>
                <div className="text-[10px] text-muted-foreground">Won</div>
              </div>
              <div className="rounded-lg bg-surface-2 p-2.5">
                <div className="text-lg font-bold text-danger tabular-nums">{lost}</div>
                <div className="text-[10px] text-muted-foreground">Lost</div>
              </div>
            </div>
            {unassigned > 0 && <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning font-medium">{unassigned} lead{unassigned !== 1 ? "s" : ""} unassigned — assign an owner to improve response time</div>}
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
