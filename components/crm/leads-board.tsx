"use client";

import { useState } from "react";
import {
  CalendarClock,
  Clock,
  Mail,
  MoreVertical,
  Phone,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import type { Lead } from "@/lib/api/types";
import { leadStageMeta } from "@/lib/status-meta";
import type { LeadStage } from "@/lib/types";
import { useSession } from "@/components/auth/session-provider";
import { can } from "@/lib/permissions";
import { cn, formatRelativeTime } from "@/lib/utils";
import { followUpWords, isDue } from "@/components/crm/follow-up";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SourceBadge } from "@/components/shared/source-badge";

const BOARD_STAGES: LeadStage[] = ["new", "contacted", "qualified", "converted", "lost"];

const STAGE_STYLE: Record<string, { dot: string; bg: string; border: string; headerBg: string; countBg: string; countText: string }> = {
  new: { dot: "bg-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-900", headerBg: "bg-blue-50 dark:bg-blue-950/40", countBg: "bg-blue-500", countText: "text-white" },
  contacted: { dot: "bg-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-950/30", border: "border-indigo-200 dark:border-indigo-900", headerBg: "bg-indigo-50 dark:bg-indigo-950/40", countBg: "bg-indigo-500", countText: "text-white" },
  qualified: { dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-900", headerBg: "bg-emerald-50 dark:bg-emerald-950/40", countBg: "bg-emerald-500", countText: "text-white" },
  converted: { dot: "bg-green-600", bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-900", headerBg: "bg-green-50 dark:bg-green-950/40", countBg: "bg-green-600", countText: "text-white" },
  lost: { dot: "bg-red-500", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-900", headerBg: "bg-red-50 dark:bg-red-950/40", countBg: "bg-red-500", countText: "text-white" },
};

const EMPTY_MESSAGES: Record<string, { title: string; desc: string }> = {
  new: { title: "No new leads yet", desc: "Drop a lead here or add a new one." },
  contacted: { title: "No contacted leads", desc: "Move leads here after your first outreach." },
  qualified: { title: "No qualified leads", desc: "Leads that fit your criteria go here." },
  converted: { title: "No converted leads", desc: "Leads converted to deals appear here." },
  lost: { title: "No lost leads", desc: "Move unqualified or closed-lost leads here." },
};

const AVATAR_COLORS = ["bg-emerald-500", "bg-blue-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-cyan-500", "bg-orange-500", "bg-teal-500"];
const avatarColor = (name: string) => AVATAR_COLORS[Math.abs([...name].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)) % AVATAR_COLORS.length];

export function LeadsBoard({
  leads,
  onStageChanged,
  onLeadClick,
}: {
  leads: Lead[];
  onStageChanged: () => void;
  onLeadClick?: (lead: Lead) => void;
}) {
  const session = useSession();
  const canWrite = can(session, "leads:write");
  const [dragOverStage, setDragOverStage] = useState<LeadStage | null>(null);
  const [busy, setBusy] = useState(false);

  async function move(lead: Lead, stage: LeadStage) {
    if (!canWrite || busy || lead.stage === stage) return;
    setBusy(true);
    try {
      await api(`/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: lead.contactName,
          phone: lead.phone,
          email: lead.email,
          company: lead.company,
          requirement: lead.requirement,
          stage,
        }),
      });
      toast.success(`Moved to ${leadStageMeta[stage]?.label ?? stage}`);
      onStageChanged();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-x-auto px-6 py-3">
      <div className="flex min-h-0 flex-1 gap-3">
        {BOARD_STAGES.map((stage) => {
          const meta = leadStageMeta[stage] ?? { label: stage, tone: "neutral" as const };
          const style = STAGE_STYLE[stage] ?? STAGE_STYLE.new;
          const items = leads.filter((l) => l.stage === stage);
          const empty = EMPTY_MESSAGES[stage] ?? EMPTY_MESSAGES.new;
          return (
            <section
              key={stage}
              aria-label={`${meta.label} leads`}
              onDragOver={(e) => {
                if (canWrite && !busy) {
                  e.preventDefault();
                  setDragOverStage(stage);
                }
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStage(null);
                const lead = leads.find((l) => l.id === e.dataTransfer.getData("text/plain"));
                if (lead) void move(lead, stage);
              }}
              className={cn(
                "flex min-w-[260px] flex-1 flex-col border transition-colors",
                style.border,
                dragOverStage === stage ? "ring-2 ring-accent/40" : "",
              )}
            >
              <div className={cn("flex items-center gap-2 px-3 py-2.5 shrink-0", style.headerBg)}>
                <span className={cn("size-2.5 shrink-0 rounded-full", style.dot)} />
                <h2 className="flex-1 text-xs font-bold uppercase tracking-wider">{meta.label}</h2>
                <span className={cn("inline-flex size-5 items-center justify-center text-[10px] font-bold tabular-nums", style.countBg, style.countText)}>{items.length}</span>
              </div>

              <div className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2", style.bg)}>
                {items.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    canDrag={canWrite && !busy}
                    canWrite={canWrite}
                    stages={BOARD_STAGES}
                    onMove={(s) => move(lead, s)}
                    onClick={() => onLeadClick?.(lead)}
                    sessionUserId={session.user.id}
                    sessionUserName={session.user.name}
                  />
                ))}
                {items.length === 0 && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
                    <p className="text-xs font-medium text-muted-foreground">{empty.title}</p>
                    <p className="text-[11px] text-muted-foreground/70">{empty.desc}</p>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function LeadCard({
  lead,
  canDrag,
  canWrite,
  stages,
  onMove,
  onClick,
  sessionUserId,
  sessionUserName,
}: {
  lead: Lead;
  canDrag: boolean;
  canWrite: boolean;
  stages: LeadStage[];
  onMove: (stage: LeadStage) => void;
  onClick?: () => void;
  sessionUserId: string;
  sessionUserName: string;
}) {
  const name = lead.contactName?.trim() || lead.phone || lead.email || `Lead #${lead.id}`;
  const due = isDue(lead.nextFollowUpOn);
  const ownerName = lead.ownerId === sessionUserId ? sessionUserName : lead.ownerName || "Unassigned";

  return (
    <article
      draggable={canDrag}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", lead.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group flex shrink-0 flex-col gap-2 border border-border bg-surface p-3.5 shadow-sm transition-shadow hover:shadow-md cursor-pointer"
      onClick={onClick}
    >
      {/* Header: name + menu */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          {lead.company && <p className="truncate text-xs text-muted-foreground">{lead.company}</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 p-0.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {canWrite && (
              <>
                {stages.filter((s) => s !== lead.stage).map((s) => (
                  <DropdownMenuItem key={s} onSelect={() => onMove(s)}>
                    <span className={cn("size-2 rounded-full mr-2", STAGE_STYLE[s]?.dot ?? "bg-muted")} />
                    Move to {leadStageMeta[s]?.label ?? s}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Source badge */}
      <SourceBadge source={lead.source} />

      {/* Contact: phone + email */}
      {lead.phone && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="size-3 shrink-0" />
          <span className="tabular-nums">{lead.phone}</span>
        </div>
      )}
      {lead.email && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Mail className="size-3 shrink-0" />
          <span className="truncate">{lead.email}</span>
        </div>
      )}

      {/* Requirement preview */}
      {lead.requirement && (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{lead.requirement}</p>
      )}

      {/* Follow-up date — prominent */}
      {lead.nextFollowUpOn && (
        <div className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium", due ? "bg-warning/10 text-warning" : "bg-accent/10 text-accent")}>
          <CalendarClock className="size-3 shrink-0" />
          {followUpWords(lead.nextFollowUpOn)}
        </div>
      )}

      {/* Footer: owner + time */}
      <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
        <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-muted-foreground">
          <User className="size-3.5 shrink-0" />
          <span className="truncate">{ownerName}</span>
        </div>
        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
          <Clock className="size-2.5" />
          {formatRelativeTime(lead.lastActivityAt)}
        </span>
      </div>
    </article>
  );
}

