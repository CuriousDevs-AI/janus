"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  TrendingUp,
} from "lucide-react";
import type { Lead } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatDateTime } from "@/lib/utils";
import { LEAD_STAGES as stages, stageLabel as label, stageBadgeVariant } from "@/lib/lead-stages";
import { SourceBadge } from "@/components/shared/source-badge";
import { followUpWords, isDue } from "@/components/crm/follow-up";
import { LeadScoreBadge } from "./lead-score-badge";
import { phoneParts } from "./lead-helpers";
import type { Row, OptionalColumn, SortKey } from "./types";

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

function SortTh({ children, active, asc, desc, onSort, className }: { children: ReactNode; active: SortKey; asc: SortKey; desc: SortKey; onSort: (k: SortKey) => void; className?: string }) {
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

export interface LeadsTableProps {
  rows: Row[];
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  allVisibleSelected: boolean;
  canEditRows: boolean;
  userId: string;
  userName: string;
  visibleColumns: Record<OptionalColumn, boolean>;
  orderedOptionalColumns: { key: OptionalColumn; label: string }[];
  sortBy: SortKey;
  setSortBy: (k: SortKey) => void;
  crms: { id: string; name: string }[];
  openEdit: (row: Row) => void;
  quickStageChange: (row: Row, stage: string) => void;
  setDrawerLead: (lead: Lead) => void;
  setConvertingLead: (lead: Lead | null) => void;
  setDeleting: (row: Row | null) => void;
  setActionError: (msg: string) => void;
}

export function LeadsTable({
  rows,
  selectedIds,
  setSelectedIds,
  allVisibleSelected,
  canEditRows,
  userId,
  userName,
  visibleColumns,
  orderedOptionalColumns,
  sortBy,
  setSortBy,
  crms,
  openEdit,
  quickStageChange,
  setDrawerLead,
  setConvertingLead,
  setDeleting,
  setActionError,
}: LeadsTableProps) {
  return (
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
                  if (key === "owner") return <td key={key} className="max-w-[140px] truncate px-3 py-2 text-muted-foreground">{lead.ownerId === userId ? userName : lead.ownerName || (lead.ownerId ? `#${lead.ownerId}` : "—")}</td>;
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
  );
}
