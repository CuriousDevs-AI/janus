import Link from "next/link";
import {
  CalendarClock, Clock, MoreHorizontal, Phone, User,
} from "lucide-react";
import { cn, formatCurrencyINR, formatRelativeTime } from "@/lib/utils";
import type { Deal } from "@/lib/api/types";
import type { PipelineStage } from "@/lib/hooks/use-pipeline-config";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function DealCard({ deal, writable, busy, today, sessionUserId, sessionUserName, stageColor, stages, onMove, onDragStart, onDragEnd }: {
  deal: Deal; writable: boolean; busy: boolean; today: string;
  sessionUserId: string; sessionUserName: string; stageColor: string;
  stages: PipelineStage[];
  onMove: (stage: string) => void;
  onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void;
}) {
  const overdue = deal.expectedCloseAt && deal.expectedCloseAt < today && !["won", "lost"].includes(deal.stage);
  const ownerDisplay = deal.ownerId === sessionUserId ? sessionUserName : deal.ownerName || "Unassigned";
  const customerDisplay = deal.company || deal.customerName || "";

  return (
    <Link
      href={`/deals/${deal.id}`}
      draggable={writable && !busy}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group flex flex-col gap-1.5 border border-border bg-surface p-3 shadow-sm transition-shadow hover:shadow-md cursor-pointer"
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">{deal.name}</p>
          {customerDisplay && <p className="truncate text-[11px] text-muted-foreground">{customerDisplay}</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" onClick={(e) => e.preventDefault()} className="shrink-0 p-0.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground">
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.preventDefault()}>
            {writable && (
              <>
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
          <User className="size-3.5 shrink-0 text-muted-foreground" />
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
    </Link>
  );
}
