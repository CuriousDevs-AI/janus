"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, LifeBuoy, Radio, ArrowRight } from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { getUserById, getCompanyById } from "@/lib/mock-data";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { TicketStatusBadge, TicketPriorityBadge } from "@/components/shared/status-badge";
import { formatRelativeTime, cn } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { TicketPriority, TicketStatus } from "@/lib/types";

const STATUS_FILTERS: { key: "all" | TicketStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "ai_handling", label: "AI Handling" },
  { key: "waiting_customer", label: "Waiting" },
  { key: "escalated", label: "Escalated" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
];

const ticketSchema = z.object({
  customerId: z.string().min(1, "Select a customer"),
  subject: z.string().min(3, "Enter a subject"),
  description: z.string().min(4, "Describe the issue"),
  priority: z.string(),
});
type TicketFormValues = z.infer<typeof ticketSchema>;

export default function TicketsPage() {
  const tickets = useAppStore((s) => s.tickets);
  const customers = useAppStore((s) => s.customers);
  const createTicket = useAppStore((s) => s.createTicket);
  const router = useRouter();

  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<"all" | TicketStatus>("all");
  const [createOpen, setCreateOpen] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TicketFormValues>({ resolver: zodResolver(ticketSchema), defaultValues: { priority: "medium", customerId: customers[0]?.id } });

  const rows = tickets
    .map((t) => ({ ticket: t, customer: customers.find((c) => c.id === t.customerId) }))
    .filter((r) => r.customer)
    .filter((r) => status === "all" || r.ticket.status === status)
    .filter((r) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return r.ticket.subject.toLowerCase().includes(q) || r.customer!.name.toLowerCase().includes(q) || r.ticket.number.includes(q);
    })
    .sort((a, b) => (a.ticket.updatedAt < b.ticket.updatedAt ? 1 : -1));

  function onCreate(values: TicketFormValues) {
    const id = createTicket({
      customerId: values.customerId,
      subject: values.subject,
      description: values.description,
      priority: values.priority as TicketPriority,
    });
    toast.success("Ticket created", { description: values.subject });
    setCreateOpen(false);
    reset();
    router.push(`/tickets/${id}`);
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <PageHeader
        title="Tickets"
        description={`${rows.length} of ${tickets.length} tickets`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="neutral">Demo data</Badge>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" />
              New Ticket
            </Button>
          </div>
        }
      />

      <div className="px-6 pb-4">
        <Link
          href="/integrations"
          className="group flex items-center justify-between gap-3 border border-accent-border bg-accent-muted px-4 py-3 transition-colors hover:border-accent"
        >
          <div className="flex items-center gap-3">
            <Radio className="size-4 shrink-0 text-accent" />
            <p className="text-[12.5px] text-foreground">
              New tickets arrive automatically from the same channels as leads — Website Chat, Email, WhatsApp and
              other <span className="font-medium">Lead Sources</span>. Migrating from Zendesk, Freshdesk, Intercom or
              Jira Service Desk? Connect it under <span className="font-medium">Integrations</span>.
            </p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-accent transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 pb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search tickets, customers…" className="w-64" />
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.key} value={f.key}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-6">
          <EmptyState
            icon={LifeBuoy}
            title={tickets.length === 0 ? "No tickets" : "No tickets match"}
            description={tickets.length === 0 ? "Support issues will appear here as customers reach out." : "Try a different search term or status filter."}
          />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Issue</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>Last Update</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ ticket, customer }) => {
              const assignee = getUserById(ticket.assigneeId);
              const company = getCompanyById(customer!.companyId);
              return (
                <TableRow key={ticket.id} className="cursor-pointer" onClick={() => router.push(`/tickets/${ticket.id}`)}>
                  <TableCell className="text-mono text-foreground">{ticket.number}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CustomerAvatar name={customer!.name} color={customer!.avatarColor} size="sm" />
                      <div>
                        <p className="font-medium text-foreground leading-tight">{customer!.name}</p>
                        <p className="text-[11px] leading-tight text-muted-foreground">{company?.name}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate text-muted-foreground">{ticket.subject}</TableCell>
                  <TableCell>
                    <TicketPriorityBadge priority={ticket.priority} />
                  </TableCell>
                  <TableCell>
                    <TicketStatusBadge status={ticket.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{assignee?.name ?? "Unassigned"}</TableCell>
                  <TableCell>
                    {ticket.slaMinutesRemaining === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={cn("text-mono", ticket.slaMinutesRemaining < 60 ? "text-danger" : ticket.slaMinutesRemaining < 240 ? "text-warning" : "text-muted-foreground")}>
                        {ticket.slaMinutesRemaining < 60 ? `${ticket.slaMinutesRemaining}m` : `${Math.round(ticket.slaMinutesRemaining / 60)}h`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatRelativeTime(ticket.updatedAt)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New ticket</DialogTitle>
            <DialogDescription>Open a support ticket for a customer.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Customer</Label>
              <Select value={watch("customerId")} onValueChange={(v) => setValue("customerId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {getCompanyById(c.companyId)?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
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
