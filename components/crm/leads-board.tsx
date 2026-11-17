"use client";

import { useState } from "react";
import Link from "next/link";
import { GripVertical, Phone, Mail, CalendarClock, Building2, User } from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import type { Lead } from "@/lib/api/types";
import { leadStageMeta } from "@/lib/status-meta";
import type { LeadStage } from "@/lib/types";
import { useSession } from "@/components/auth/session-provider";
import { can } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { cn, formatRelativeTime } from "@/lib/utils";
import { followUpWords, isDue } from "@/components/crm/follow-up";

const BOARD_STAGES: LeadStage[] = ["new", "contacted", "qualified", "demo", "proposal", "negotiation", "approval", "won", "lost"];

const STAGE_COLOR: Record<string, string> = {
  new: "bg-slate-500",
  contacted: "bg-blue-500",
  qualified: "bg-cyan-500",
  demo: "bg-indigo-500",
  proposal: "bg-amber-500",
  negotiation: "bg-orange-500",
  approval: "bg-purple-500",
  won: "bg-emerald-500",
  lost: "bg-red-500",
};

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
    <div className="flex-1 overflow-auto px-6 py-4">
      <div className="flex h-full min-h-[32rem] gap-3" style={{ minWidth: BOARD_STAGES.length * 272 }}>
        {BOARD_STAGES.map((stage) => {
          const meta = leadStageMeta[stage] ?? { label: stage, tone: "neutral" as const };
          const items = leads.filter((l) => l.stage === stage);
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
                "flex w-64 shrink-0 flex-col rounded-xl border transition-colors",
                dragOverStage === stage
                  ? "border-accent bg-accent-muted/30 shadow-md"
                  : "border-border bg-surface-2/30",
              )}
            >
              <div className="flex items-center gap-2 px-3 py-3 border-b border-border bg-surface/50">
                <span className={cn("size-2.5 rounded-full shrink-0", STAGE_COLOR[stage])} />
                <h2 className="text-xs font-semibold flex-1 uppercase tracking-wide">{meta.label}</h2>
                <Badge variant="neutral" className="text-[10px] px-1.5 py-0">{items.length}</Badge>
              </div>

              <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground">
                {items.length === 0 ? "Empty" : `${items.length} lead${items.length !== 1 ? "s" : ""}`}
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {items.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    canDrag={canWrite && !busy}
                    onClick={() => onLeadClick?.(lead)}
                    sessionUserId={session.user.id}
                    sessionUserName={session.user.name}
                  />
                ))}
                {items.length === 0 && (
                  <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground">
                    Drop leads here
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
  onClick,
  sessionUserId,
  sessionUserName,
}: {
  lead: Lead;
  canDrag: boolean;
  onClick?: () => void;
  sessionUserId: string;
  sessionUserName: string;
}) {
  const name = lead.contactName?.trim() || lead.phone || lead.email || `Lead #${lead.id}`;
  const due = isDue(lead.nextFollowUpOn);

  return (
    <article
      draggable={canDrag}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", lead.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3 shadow-sm transition-all hover:shadow-md hover:border-border-strong cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-semibold leading-tight line-clamp-2">{name}</span>
        {canDrag && <GripVertical className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />}
      </div>

      {lead.company && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Building2 className="size-3 shrink-0" />
          <span className="truncate">{lead.company}</span>
        </div>
      )}

      {lead.requirement && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{lead.requirement}</p>
      )}

      <div className="flex flex-wrap gap-1.5 mt-0.5">
        {lead.phone && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <Phone className="size-2.5" /> {lead.phone.slice(-10)}
          </span>
        )}
        {lead.email && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <Mail className="size-2.5" /> {lead.email.split("@")[0]}
          </span>
        )}
      </div>

      {lead.nextFollowUpOn && (
        <div className={cn("flex items-center gap-1 text-[10px] mt-0.5", due ? "text-warning font-medium" : "text-muted-foreground")}>
          <CalendarClock className="size-3" />
          {followUpWords(lead.nextFollowUpOn)}
        </div>
      )}

      <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-border/50">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <User className="size-2.5" />
          <span className="truncate max-w-[100px]">
            {lead.ownerId === sessionUserId ? sessionUserName : lead.ownerName || "Unassigned"}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">{formatRelativeTime(lead.lastActivityAt)}</span>
      </div>
    </article>
  );
}
