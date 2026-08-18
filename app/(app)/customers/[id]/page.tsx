"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  MessageSquare,
  ListPlus,
  LifeBuoy,
  MoreHorizontal,
  Sparkles,
  ArrowRight,
  Mail,
  Phone,
  Building2,
  Calendar,
} from "lucide-react";
import { useAppStore, useCompany } from "@/lib/stores/app-store";
import { getUserById, getAuditForCustomer, leadSourceConnections } from "@/lib/mock-data";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { HealthBadge, DealStageBadge, TicketStatusBadge, TicketPriorityBadge } from "@/components/shared/status-badge";
import { ChannelBadge } from "@/components/shared/channel-badge";
import { ActivityTimeline } from "@/components/shared/activity-timeline";
import { CustomerAIPanel } from "@/components/customers/customer-ai-panel";
import { CustomerMemoryPanel } from "@/components/customers/customer-memory-panel";
import { formatCurrencyINR, formatRelativeTime, formatDate, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import type { TicketPriority } from "@/lib/types";

const ticketSchema = z.object({
  subject: z.string().min(3, "Enter a subject"),
  description: z.string().min(4, "Describe the issue"),
  priority: z.string(),
});
type TicketFormValues = z.infer<typeof ticketSchema>;

export default function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const customer = useAppStore((s) => s.customers.find((c) => c.id === id));
  const allLeads = useAppStore((s) => s.leads);
  const allDeals = useAppStore((s) => s.deals);
  const allTickets = useAppStore((s) => s.tickets);
  const allConversations = useAppStore((s) => s.conversations);
  const allActivities = useAppStore((s) => s.activities);
  const createTicket = useAppStore((s) => s.createTicket);
  const leads = allLeads.filter((l) => l.customerId === id);
  const deals = allDeals.filter((d) => d.customerId === id);
  const tickets = allTickets.filter((t) => t.customerId === id);
  const conversations = allConversations.filter((c) => c.customerId === id);
  const activities = allActivities.filter((a) => a.customerId === id);
  const company = useCompany(customer?.companyId);
  const [ticketOpen, setTicketOpen] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TicketFormValues>({ resolver: zodResolver(ticketSchema), defaultValues: { priority: "medium" } });

  if (!customer) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-2 px-6 py-16 text-center">
        <p className="text-[14px] font-medium text-foreground">Customer not found</p>
        <Button size="sm" variant="secondary" asChild>
          <Link href="/customers">Back to customers</Link>
        </Button>
      </div>
    );
  }

  const owner = getUserById(customer.ownerId);
  const sortedActivities = [...activities].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const openDeal = deals.find((d) => !["won", "lost"].includes(d.stage));
  const wonDeals = deals.filter((d) => d.stage === "won");
  const openTickets = tickets.filter((t) => t.status !== "closed" && t.status !== "resolved");
  const lastActivity = sortedActivities[0];
  const auditForCustomer = getAuditForCustomer(id);

  function onCreateTicket(values: TicketFormValues) {
    const ticketId = createTicket({
      customerId: id,
      subject: values.subject,
      description: values.description,
      priority: values.priority as TicketPriority,
    });
    toast.success("Ticket created", { description: values.subject });
    setTicketOpen(false);
    reset();
    router.push(`/tickets/${ticketId}`);
  }

  return (
    <div className="mx-auto flex max-w-[1300px] flex-col gap-5 px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <CustomerAvatar name={customer.name} color={customer.avatarColor} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{customer.name}</h1>
              <Badge variant="neutral" className="capitalize">{customer.stage}</Badge>
              <HealthBadge category={customer.health.category} score={customer.health.score} />
            </div>
            <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Building2 className="size-3.5" />
              {company?.name}
              <span className="text-muted-foreground/50">·</span>
              Owner {owner?.name}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" asChild>
            <Link href={conversations[0] ? `/inbox?c=${conversations[0].id}` : "/inbox"}>
              <MessageSquare className="size-3.5" />
              Message
            </Link>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => toast.success("Task created", { description: `Follow up with ${customer.name}` })}>
            <ListPlus className="size-3.5" />
            Create Task
          </Button>
          <Button size="sm" onClick={() => setTicketOpen(true)}>
            <LifeBuoy className="size-3.5" />
            Create Ticket
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => toast.success("Customer details updated")}>Edit customer</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toast("Archived (demo only)")} variant="destructive">
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="conversations">Conversations {conversations.length > 0 && <Badge className="ml-1">{conversations.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="deals">Deals {deals.length > 0 && <Badge className="ml-1">{deals.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="tickets">Tickets {openTickets.length > 0 && <Badge variant="warning" className="ml-1">{openTickets.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="grid grid-cols-1 gap-4 pt-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <div className="rounded-lg border border-accent-border bg-accent-muted p-4">
              <div className="mb-2 flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-accent" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">AI Summary</span>
              </div>
              <p className="text-[13.5px] leading-relaxed text-foreground">
                {customer.name.split(" ")[0]} is {openDeal ? `evaluating ${openDeal.name}` : wonDeals.length > 0 ? "an active customer with no open expansion deals" : "a new customer"}.
                {openTickets.length > 0 ? ` There ${openTickets.length === 1 ? "is" : "are"} ${openTickets.length} open support issue${openTickets.length === 1 ? "" : "s"}.` : " No open support issues."}
                {lastActivity ? ` Last activity: ${lastActivity.title.toLowerCase()} (${formatRelativeTime(lastActivity.createdAt)}).` : ""}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customer details</p>
              <div className="grid grid-cols-2 gap-y-2.5 text-[12.5px]">
                <span className="flex items-center gap-1.5 text-muted-foreground"><Mail className="size-3.5" /> Email</span>
                <span className="text-foreground">{customer.email}</span>
                <span className="flex items-center gap-1.5 text-muted-foreground"><Phone className="size-3.5" /> Phone</span>
                <span className="text-foreground">{customer.phone}</span>
                <span className="flex items-center gap-1.5 text-muted-foreground"><Building2 className="size-3.5" /> Company</span>
                <span className="text-foreground">{company?.name} · {company?.industry}</span>
                <span className="flex items-center gap-1.5 text-muted-foreground"><Calendar className="size-3.5" /> Customer since</span>
                <span className="text-foreground">{formatDate(customer.firstTouchAt)}</span>
                <span className="text-muted-foreground">Lead source</span>
                {(() => {
                  const sourceConnection = leadSourceConnections.find((s) => s.source === customer.source);
                  return sourceConnection ? (
                    <Link href={`/lead-sources/${sourceConnection.id}`} className="w-fit capitalize text-accent hover:underline">
                      {customer.source.replace("_", " ")}
                    </Link>
                  ) : (
                    <span className="capitalize text-foreground">{customer.source.replace("_", " ")}</span>
                  );
                })()}
                <span className="text-muted-foreground">Preferred channel</span>
                <span className="text-foreground"><ChannelBadge channel={customer.consent.preferredChannel} /></span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Health breakdown</p>
              <div className="flex flex-col gap-1.5 text-[12px]">
                <HealthRow label="Engagement" value={customer.health.engagement} />
                <HealthRow label="Usage" value={customer.health.usage} />
                <HealthRow label="Payment health" value={customer.health.paymentHealth} />
                <HealthRow label="Support load" value={100 - customer.health.supportLoad} />
              </div>
            </div>
            {openDeal && (
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Open deal</p>
                <Link href={`/deals/${openDeal.id}`} className="text-[13px] font-medium text-foreground hover:text-accent">
                  {openDeal.name}
                </Link>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-mono text-[15px] font-semibold text-foreground">{formatCurrencyINR(openDeal.amount)}</span>
                  <DealStageBadge stage={openDeal.stage} />
                </div>
              </div>
            )}
            <div className="rounded-lg border border-accent-border bg-accent-muted p-4">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-accent">Next best action</p>
              <p className="text-[13px] text-foreground">{openDeal?.nextAction ?? (openTickets.length > 0 ? `Resolve ${openTickets[0].number}.` : `Check in with ${customer.name.split(" ")[0]}.`)}</p>
              <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => toast.success("Follow-up created")}>
                Create Follow-up
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* TIMELINE */}
        <TabsContent value="timeline" className="pt-4">
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <ActivityTimeline activities={sortedActivities} groupByDay />
          </div>
        </TabsContent>

        {/* CONVERSATIONS */}
        <TabsContent value="conversations" className="flex flex-col gap-2 pt-4">
          {conversations.length === 0 && <EmptyState icon={MessageSquare} title="No conversations yet" />}
          {conversations.map((c) => (
            <Link key={c.id} href={`/inbox?c=${c.id}`} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 hover:border-border-strong">
              <ChannelBadge channel={c.channel} iconOnly className="text-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-foreground">{c.subject}</p>
                <p className="truncate text-[12px] text-muted-foreground">{c.lastMessagePreview}</p>
              </div>
              {c.aiActive && <Badge variant="accent">AI</Badge>}
              <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelativeTime(c.lastMessageAt)}</span>
            </Link>
          ))}
        </TabsContent>

        {/* DEALS */}
        <TabsContent value="deals" className="flex flex-col gap-2 pt-4">
          {deals.length === 0 && <EmptyState icon={Building2} title="No deals yet" />}
          {deals.map((d) => (
            <Link key={d.id} href={`/deals/${d.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 hover:border-border-strong">
              <div>
                <p className="text-[13px] font-medium text-foreground">{d.name}</p>
                <p className="text-[11px] text-muted-foreground">Updated {formatRelativeTime(d.lastActivityAt)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-mono text-[13px] text-foreground">{formatCurrencyINR(d.amount)}</span>
                <DealStageBadge stage={d.stage} />
              </div>
            </Link>
          ))}
        </TabsContent>

        {/* TICKETS */}
        <TabsContent value="tickets" className="flex flex-col gap-2 pt-4">
          {tickets.length === 0 && <EmptyState icon={LifeBuoy} title="No tickets yet" description="Support issues will appear here." />}
          {tickets.map((t) => (
            <Link key={t.id} href={`/tickets/${t.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 hover:border-border-strong">
              <div>
                <p className="text-[13px] font-medium text-foreground">{t.number} — {t.subject}</p>
                <p className="text-[11px] text-muted-foreground">Updated {formatRelativeTime(t.updatedAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <TicketPriorityBadge priority={t.priority} />
                <TicketStatusBadge status={t.status} />
              </div>
            </Link>
          ))}
        </TabsContent>

        {/* MEMORY */}
        <TabsContent value="memory" className="pt-4">
          <CustomerMemoryPanel customerId={id} />
        </TabsContent>

        {/* AI */}
        <TabsContent value="ai" className="pt-4">
          <CustomerAIPanel customerId={id} />
        </TabsContent>

        {/* ACTIVITY (audit-style) */}
        <TabsContent value="activity" className="pt-4">
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Actor</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Object</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {auditForCustomer.map((a) => (
                  <tr key={a.id} className="border-b border-border/60 bg-surface last:border-0">
                    <td className="text-mono px-3 py-2 text-muted-foreground">{formatDateTime(a.at)}</td>
                    <td className="px-3 py-2 text-foreground">{a.actor.type === "ai" ? a.actor.agentName : a.actor.type === "human" ? a.actor.userName : "System"}</td>
                    <td className="text-mono px-3 py-2 text-foreground">{a.action}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.objectLabel}</td>
                    <td className="px-3 py-2">
                      <Badge variant={a.result === "success" ? "success" : a.result === "failed" ? "danger" : "warning"}>{a.result}</Badge>
                    </td>
                  </tr>
                ))}
                {auditForCustomer.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      No audited actions for this customer yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create ticket</DialogTitle>
            <DialogDescription>Open a new support ticket for {customer.name}.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onCreateTicket)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ticket-subject">Subject</Label>
              <Input id="ticket-subject" placeholder="What's the issue?" {...register("subject")} />
              {errors.subject && <p className="text-[11px] text-danger">{errors.subject.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ticket-description">Description</Label>
              <Textarea id="ticket-description" placeholder="Describe the issue in detail" {...register("description")} />
              {errors.description && <p className="text-[11px] text-danger">{errors.description.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <Select value={watch("priority")} onValueChange={(v) => setValue("priority", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["low", "medium", "high", "urgent"].map((p) => (
                    <SelectItem key={p} value={p}>
                      {p[0].toUpperCase() + p.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setTicketOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                Create ticket
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HealthRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <div className="h-1 flex-1 bg-surface-3">
        <div className={`h-1 ${value >= 70 ? "bg-success" : value >= 40 ? "bg-warning" : "bg-danger"}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-mono w-7 text-right text-foreground">{value}</span>
    </div>
  );
}
