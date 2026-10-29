"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { can } from "@/lib/permissions";
import { demoMode } from "@/lib/demo-mode";
import { demoAccounts } from "@/lib/demo-accounts";
import { canSeeOwner } from "@/lib/crm-scope";
import { useDemoAccount } from "@/lib/demo-persona";
import Link from "next/link";
import {
  Eye,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Settings2,
  Trash2,
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
import { demoLeadRows } from "@/lib/api/demo-data";

type Row = { lead: Lead };
type EditForm = {
  name: string;
  phone: string;
  email: string;
  company: string;
  requirement: string;
  stage: string;
  ownerId: string;
};

type OptionalColumn = "email" | "company" | "source" | "owner" | "created";

const optionalColumns: { key: OptionalColumn; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "company", label: "Company" },
  { key: "source", label: "Source" },
  { key: "owner", label: "Owner" },
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
  const viewer = useDemoAccount();
  const canWrite = can(session, "leads:write");
  const [after, setAfter] = useState("0");
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
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
    email: false,
    company: false,
    source: false,
    owner: false,
    created: false,
  });
  const [columnOrder, setColumnOrder] = useState<OptionalColumn[]>(optionalColumns.map(({ key }) => key));
  const [draggingColumn, setDraggingColumn] = useState<OptionalColumn | null>(null);
  const [result, setResult] = useState<{
    after: string;
    rows: Row[];
    error?: string;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const leads = await api<Lead[]>(`/leads?limit=50&after_id=${after}`, {
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
        setResult({ after, rows: demoLeadRows.map((lead) => ({ lead })), error: message(error) });
    });
    return () => controller.abort();
  }, [after, version]);

  const loaded = result?.after === after ? result : null;
  const usingDemo = Boolean(loaded?.error);
  const canEditRows = canWrite && !usingDemo;
  // Owners and managers can hand a lead to someone they manage.
  const assignees = demoMode && (session.permissions.includes("*") || can(session, "leads:assign")) ? demoAccounts.filter((item) => (item.crm === "own" || item.crm === "team" || item.id === "owner") && canSeeOwner(viewer, item.crmUserId)) : [];
  const sources = useMemo(
    () => [...new Set(loaded?.rows.map(({ lead }) => lead.source) || [])],
    [loaded],
  );
  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (
      loaded?.rows.filter(({ lead }) => {
        const searchable = [
          lead.contactName,
          lead.email,
          lead.phone,
          lead.company,
          lead.requirement,
          lead.source,
          lead.stage,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return (
          (!normalizedQuery || searchable.includes(normalizedQuery)) &&
          (stageFilter === "all" || lead.stage === stageFilter) &&
          (sourceFilter === "all" || lead.source === sourceFilter)
        );
      }) || []
    );
  }, [loaded, query, sourceFilter, stageFilter]);
  const allVisibleSelected = rows.length > 0 && rows.every(({ lead }) => selectedIds.includes(lead.id));
  const visibleColumnCount = 4 + optionalColumns.filter(({ key }) => visibleColumns[key]).length;
  const orderedOptionalColumns = columnOrder
    .map((key) => optionalColumns.find((column) => column.key === key))
    .filter((column): column is { key: OptionalColumn; label: string } => Boolean(column));
  const resetColumns = () => {
    setVisibleColumns({ email: false, company: false, source: false, owner: false, created: false });
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
        body: JSON.stringify({
          ...(demoMode ? editForm : { ...editForm, ownerId: undefined }),
          phone: editForm.phone.trim() || null,
          email: editForm.email.trim() || null,
        }),
      });
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

  async function bulkUpdateStage(stage: string) {
    const selected = loaded?.rows.filter(({ lead }) => selectedIds.includes(lead.id)) || [];
    if (!selected.length) return;
    setBulkUpdating(true);
    try {
      await Promise.all(
        selected.map((row) =>
          api<Lead>(`/leads/${row.lead.id}`, {
            method: "PATCH",
            body: JSON.stringify({ ...blankEditForm(row), stage }),
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

  const filtersActive = query.trim() || stageFilter !== "all" || sourceFilter !== "all";

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
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus className="size-3.5" />
                Add lead
              </Button>
            )}
            {can(session, "sources:manage") && (
              <Button size="sm" variant="secondary" asChild>
                <Link href="/lead-sources/new">Add lead source</Link>
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 pb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, mobile, email or company…" className="w-full sm:w-[25rem]" />
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-36"><SlidersHorizontal className="size-3.5 text-muted-foreground" /><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All stages</SelectItem>{stages.map((stage) => <SelectItem key={stage} value={stage}>{label(stage)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All sources</SelectItem>{sources.map((source) => <SelectItem key={source} value={source}>{label(source)}</SelectItem>)}</SelectContent>
        </Select>
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
        {filtersActive && <Button size="sm" variant="ghost" onClick={() => { setQuery(""); setStageFilter("all"); setSourceFilter("all"); }}><X className="size-3.5" />Clear filters</Button>}
        {loaded && !loaded.error && <span className="ml-auto text-xs text-muted-foreground">Showing {rows.length} of {loaded.rows.length} loaded leads</span>}
        
      </div>
      <div className="flex items-center gap-2 px-6 pt-3 text-[11px] text-muted-foreground">
        <Pencil className="size-3" />
        <span>Click a value with the pencil affordance to edit name, mobile, email, company, stage or requirement.</span>
      </div>

      {!loaded ? (
        <p role="status" className="p-6 text-sm">Loading leads…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col gap-2 p-6">
          <h2 className="text-sm font-medium">{filtersActive ? "No leads match these filters" : after === "0" ? "No leads yet" : "No more leads"}</h2>
          <p className="text-sm text-muted-foreground">{filtersActive ? "Try another search, stage or source." : "Connect a website form, call provider or API, or upload a CSV."}</p>
        </div>
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
                    <td className="w-40 min-w-40 px-3 py-4"><div className="flex items-center gap-2">{usingDemo ? <span className="block truncate font-semibold text-foreground">{displayName}</span> : <Link href={`/leads/${lead.id}`} className="block truncate font-semibold text-foreground hover:text-accent">{displayName}</Link>}{canEditRows && <button type="button" title="Edit name" onClick={() => openEdit(row)} className="shrink-0 text-muted-foreground hover:text-accent"><Pencil className="size-3" /></button>}</div>{lead.contactName ? null : <span className="mt-1 block text-[11px] text-muted-foreground">Using mobile as name</span>}</td>
                    <td className="w-28 min-w-28 whitespace-nowrap px-3 py-4"><span className="inline-flex whitespace-nowrap rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-foreground">{phone.countryCode}</span></td>
                    <td className="w-32 min-w-32 whitespace-nowrap px-3 py-4 font-medium text-foreground">{canEditRows ? <EditableValue onClick={() => openEdit(row)}>{phone.mobile}</EditableValue> : phone.mobile}</td>
                    <td className="w-28 min-w-28 px-3 py-4">{canEditRows ? <EditableValue onClick={() => openEdit(row)}><Badge variant="neutral">{label(lead.stage)}</Badge></EditableValue> : <Badge variant="neutral">{label(lead.stage)}</Badge>}</td>
                    {orderedOptionalColumns.map(({ key }) => {
                      if (!visibleColumns[key]) return null;
                      if (key === "email") return <td key={key} className="max-w-[220px] px-5 py-4 text-muted-foreground">{canEditRows ? <EditableValue onClick={() => openEdit(row)}>{lead.email || "—"}</EditableValue> : <span className="block truncate">{lead.email || "—"}</span>}</td>;
                      if (key === "company") return <td key={key} className="max-w-[180px] px-5 py-4 text-muted-foreground">{canEditRows ? <EditableValue onClick={() => openEdit(row)}>{lead.company || "—"}</EditableValue> : <span className="block truncate">{lead.company || "—"}</span>}</td>;
                      if (key === "source") return <td key={key} className="whitespace-nowrap px-5 py-4 text-muted-foreground">{label(lead.source)}</td>;
                      if (key === "owner") return <td key={key} className="max-w-[160px] truncate px-5 py-4 text-muted-foreground">{lead.ownerId === session.user.id ? session.user.name : lead.ownerName || (lead.ownerId ? `Member #${lead.ownerId}` : "Unassigned")}</td>;
                      return <td key={key} className="whitespace-nowrap px-5 py-4 text-muted-foreground">{formatDateTime(lead.createdAt)}</td>;
                    })}
                    <td className="sticky right-0 z-30 w-14 min-w-14 border-l border-border bg-surface px-3 py-4 text-right shadow-[-2px_0_0_rgba(15,23,42,0.06)] group-hover:bg-surface-2/60" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${displayName}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!usingDemo && <DropdownMenuItem asChild><Link href={`/leads/${lead.id}`}><Eye className="size-3.5" />View lead</Link></DropdownMenuItem>}
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

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit lead</DialogTitle><DialogDescription>Update contact details, requirement or pipeline stage.</DialogDescription></DialogHeader>
          {editForm && <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
            <div className="grid grid-cols-2 gap-3"><div className="flex flex-col gap-1.5"><Label htmlFor="lead-edit-name">Name</Label><Input id="lead-edit-name" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></div><div className="flex flex-col gap-1.5"><Label htmlFor="lead-edit-phone">Mobile</Label><Input id="lead-edit-phone" placeholder="+91 99999 99999" value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></div></div>
            <div className="grid grid-cols-2 gap-3"><div className="flex flex-col gap-1.5"><Label htmlFor="lead-edit-email">Email</Label><Input id="lead-edit-email" type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} /></div><div className="flex flex-col gap-1.5"><Label htmlFor="lead-edit-company">Company</Label><Input id="lead-edit-company" value={editForm.company} onChange={(event) => setEditForm({ ...editForm, company: event.target.value })} /></div></div>
            <div className="flex flex-col gap-1.5"><Label>Stage</Label><Select value={editForm.stage} onValueChange={(stage) => setEditForm({ ...editForm, stage })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{stages.map((stage) => <SelectItem key={stage} value={stage}>{label(stage)}</SelectItem>)}</SelectContent></Select></div>
            {assignees.length > 1 && <div className="flex flex-col gap-1.5"><Label>Owner</Label><Select value={editForm.ownerId} onValueChange={(ownerId) => setEditForm({ ...editForm, ownerId })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{assignees.map((item) => <SelectItem key={item.crmUserId} value={item.crmUserId}>{item.name} · {item.title}</SelectItem>)}</SelectContent></Select></div>}
            <div className="flex flex-col gap-1.5"><Label htmlFor="lead-edit-requirement">Requirement</Label><Textarea id="lead-edit-requirement" value={editForm.requirement} onChange={(event) => setEditForm({ ...editForm, requirement: event.target.value })} /></div>
            {actionError && <p role="alert" className="text-xs text-danger">{actionError}</p>}
            <DialogFooter><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button></DialogFooter>
          </form>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent><DialogHeader><DialogTitle>Delete this lead?</DialogTitle><DialogDescription>This removes the lead from the pipeline. The contact record stays available for future enquiries.</DialogDescription></DialogHeader>{actionError && <p role="alert" className="text-xs text-danger">{actionError}</p>}<DialogFooter><Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" onClick={() => void deleteLead()} disabled={deletingLead}>{deletingLead ? "Deleting…" : "Delete lead"}</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletingSelected)} onOpenChange={(open) => !open && setDeletingSelected(null)}>
        <DialogContent><DialogHeader><DialogTitle>Delete selected leads?</DialogTitle><DialogDescription>{deletingSelected?.length || 0} selected leads will be removed from the pipeline. Their contact records stay available.</DialogDescription></DialogHeader>{actionError && <p role="alert" className="text-xs text-danger">{actionError}</p>}<DialogFooter><Button variant="secondary" onClick={() => setDeletingSelected(null)}>Cancel</Button><Button variant="destructive" onClick={() => void deleteSelectedLeads()} disabled={deletingLead}>{deletingLead ? "Deleting…" : "Delete selected"}</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
