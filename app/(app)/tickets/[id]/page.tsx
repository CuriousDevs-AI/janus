"use client";

import * as React from "react";
import { useCrmAccess } from "@/lib/use-crm-access";
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  UserRoundCog,
  CheckCircle2,
  ArrowUpCircle,
  XCircle,
  UserRound,
  Sparkles,
  Send,
  Edit3,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import { useAppStore, useCompany } from "@/lib/stores/app-store";
import { users } from "@/lib/mock-data";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { TicketStatusBadge, TicketPriorityBadge } from "@/components/shared/status-badge";
import { AIConfidence } from "@/components/shared/ai-indicator";
import { ConversationPanel } from "@/components/inbox/conversation-panel";
import { formatRelativeTime, formatDateTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const access = useCrmAccess();
  const found = useAppStore((s) => s.tickets.find((t) => t.id === id));
  const ticket = found && access.ticketVisible(found) ? found : undefined;
  const customer = useAppStore((s) => s.customers.find((c) => c.id === ticket?.customerId));
  const ticketsStore = useAppStore((s) => s.tickets);
  const otherTickets = ticketsStore.filter((t) => t.customerId === ticket?.customerId && t.id !== ticket?.id);
  const updateTicketStatus = useAppStore((s) => s.updateTicketStatus);
  const assignTicket = useAppStore((s) => s.assignTicket);
  const takeOverConversation = useAppStore((s) => s.takeOverConversation);
  const resolveTicket = useAppStore((s) => s.resolveTicket);
  const company = useCompany(customer?.companyId);

  if (!ticket || !customer) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-2 px-6 py-16 text-center">
        <p className="text-[14px] font-medium text-foreground">Ticket not found</p>
        <Button size="sm" variant="secondary" asChild>
          <Link href="/tickets">Back to tickets</Link>
        </Button>
      </div>
    );
  }

  const assignee = users.find((u) => u.id === ticket.assigneeId);
  const showHandoff = !!ticket.handoff && !["resolved", "closed"].includes(ticket.status);
  const showAiSupport = !showHandoff && ["open", "ai_handling", "waiting_customer"].includes(ticket.status) && ticket.aiConfidence !== undefined;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
              Ticket {ticket.number}
            </h1>
            <TicketStatusBadge status={ticket.status} />
          </div>
          <p className="text-[13px] text-muted-foreground">{ticket.subject}</p>
          <Link href={`/customers/${customer.id}`} className="text-[12px] text-muted-foreground hover:text-accent">
            {customer.name} · {company?.name}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <TicketPriorityBadge priority={ticket.priority} />
          {ticket.slaMinutesRemaining !== null && (
            <span className={cn("flex items-center gap-1 text-[12px]", ticket.slaMinutesRemaining < 60 ? "text-danger" : "text-muted-foreground")}>
              <Clock className="size-3.5" />
              {ticket.slaMinutesRemaining < 60 ? `${ticket.slaMinutesRemaining}m` : `${Math.round(ticket.slaMinutesRemaining / 60)}h`} remaining
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={ticket.status === "resolved" || ticket.status === "closed"}
          onClick={() => {
            resolveTicket(ticket.id);
            toast.success("Ticket resolved");
          }}
        >
          <CheckCircle2 className="size-3.5" />
          Resolve
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={ticket.status === "escalated"}
          onClick={() => {
            updateTicketStatus(ticket.id, "escalated");
            toast("Ticket escalated to a human agent");
          }}
        >
          <ArrowUpCircle className="size-3.5" />
          Escalate
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary">
              <UserRoundCog className="size-3.5" />
              Assign
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {users.filter((u) => u.role.includes("support") || u.role === "owner").map((u) => (
              <DropdownMenuItem key={u.id} onSelect={() => { assignTicket(ticket.id, u.id); toast.success(`Assigned to ${u.name}`); }}>
                {u.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          variant="ghost"
          disabled={ticket.status === "closed"}
          onClick={() => {
            updateTicketStatus(ticket.id, "closed");
            toast.success("Ticket closed");
          }}
        >
          <XCircle className="size-3.5" />
          Close
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          {showHandoff && ticket.handoff && (
            <div className="rounded-lg border border-warning/40 bg-warning-muted p-4">
              <div className="mb-2 flex items-center gap-1.5">
                <UserRound className="size-4 text-warning" />
                <span className="text-[13px] font-semibold text-foreground">Human assistance requested</span>
              </div>
              <p className="mb-3 text-[12.5px] text-muted-foreground">
                Reason: <span className="text-foreground">{ticket.handoff.reason}</span>
              </p>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">AI summary</p>
              <p className="mb-3 text-[13px] text-foreground">{ticket.handoff.summary}</p>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Previous actions</p>
              <ol className="mb-3 flex flex-col gap-1">
                {ticket.handoff.previousActions.map((a, i) => (
                  <li key={i} className="text-[12.5px] text-muted-foreground">
                    {i + 1}. {a}
                  </li>
                ))}
              </ol>
              <p className="mb-3 text-[12.5px]">
                <span className="font-semibold text-foreground">Suggested next action: </span>
                <span className="text-muted-foreground">{ticket.handoff.suggestedNextAction}</span>
              </p>
              {ticket.handoff.takenOverBy ? (
                <Badge variant="info">
                  Taken over by {users.find((u) => u.id === ticket.handoff!.takenOverBy)?.name} · {formatRelativeTime(ticket.handoff.takenOverAt!)}
                </Badge>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    takeOverConversation(ticket.id);
                    toast.success("You're now handling this conversation", { description: "AI has stopped sending automated messages." });
                  }}
                >
                  <UserRound className="size-3.5" />
                  Take Over Conversation
                </Button>
              )}
            </div>
          )}

          {showAiSupport && (
            <div className="rounded-lg border border-accent-border bg-accent-muted p-4">
              <div className="mb-2 flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-accent" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">AI Support</span>
              </div>
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">Current understanding</p>
              <p className="mb-3 text-[13px] text-foreground">{ticket.description}</p>
              {ticket.knowledgeUsed.length > 0 && (
                <>
                  <p className="mb-1 text-[11px] font-medium text-muted-foreground">Knowledge retrieved</p>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {ticket.knowledgeUsed.map((k) => (
                      <Badge key={k} variant="neutral">
                        {k}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-muted-foreground">Confidence</p>
                {ticket.aiConfidence !== undefined && <AIConfidence value={ticket.aiConfidence} />}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => toast.success("Response sent")}>
                  <Send className="size-3.5" />
                  Send
                </Button>
                <Button size="sm" variant="secondary" onClick={() => toast("Editing isn't available yet")}>
                  <Edit3 className="size-3.5" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    updateTicketStatus(ticket.id, "escalated");
                    toast("Escalated to a human agent");
                  }}
                >
                  <ArrowUpCircle className="size-3.5" />
                  Escalate
                </Button>
              </div>
            </div>
          )}

          <div className="h-[560px] overflow-hidden rounded-lg border border-border">
            <ConversationPanel conversationId={ticket.conversationId} />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customer</p>
            <div className="flex items-center gap-2">
              <CustomerAvatar name={customer.name} color={customer.avatarColor} />
              <div>
                <Link href={`/customers/${customer.id}`} className="text-[13px] font-medium text-foreground hover:text-accent">
                  {customer.name}
                </Link>
                <p className="text-[11px] text-muted-foreground">{company?.name}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-1.5 text-[12px]">
              <div className="flex justify-between"><span className="text-muted-foreground">Assignee</span><span className="text-foreground">{assignee?.name ?? "Unassigned"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="text-foreground">{formatDateTime(ticket.createdAt)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Updated</span><span className="text-foreground">{formatRelativeTime(ticket.updatedAt)}</span></div>
              {ticket.resolvedAt && <div className="flex justify-between"><span className="text-muted-foreground">Resolved</span><span className="text-foreground">{formatDateTime(ticket.resolvedAt)}</span></div>}
            </div>
          </div>

          {ticket.actions.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Actions taken</p>
              <div className="flex flex-col gap-2">
                {ticket.actions.map((a) => (
                  <div key={a.id} className="text-[12px]">
                    <p className="text-foreground">{a.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {a.actor.type === "ai" ? a.actor.agentName : a.actor.type === "human" ? a.actor.userName : "Customer"} · {formatRelativeTime(a.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {otherTickets.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Previous tickets</p>
              <div className="flex flex-col gap-1.5">
                {otherTickets.map((t) => (
                  <Link key={t.id} href={`/tickets/${t.id}`} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2">
                    <span className="truncate text-[12px] text-foreground">{t.number} {t.subject}</span>
                    <ArrowUpRight className="size-3 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
