"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Upload, MoreHorizontal } from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { getCompanyById, users } from "@/lib/mock-data";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { LeadStageBadge } from "@/components/shared/status-badge";
import { leadSourceMeta } from "@/lib/status-meta";
import { formatRelativeTime, formatDate, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { UserRoundPlus } from "lucide-react";
import type { LeadSource, LeadStage } from "@/lib/types";

const leadSchema = z.object({
  name: z.string().min(2, "Enter a name"),
  email: z.string().email("Enter a valid email"),
  companyName: z.string().min(2, "Enter a company"),
  source: z.string(),
  ownerId: z.string(),
  requirement: z.string().min(4, "Describe what they're looking for"),
});
type LeadFormValues = z.infer<typeof leadSchema>;

export default function LeadsPage() {
  return (
    <React.Suspense fallback={null}>
      <LeadsPageInner />
    </React.Suspense>
  );
}

function LeadsPageInner() {
  const leads = useAppStore((s) => s.leads);
  const customers = useAppStore((s) => s.customers);
  const createLead = useAppStore((s) => s.createLead);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = React.useState("");
  const [stageFilter, setStageFilter] = React.useState<string>("all");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [createOpen, setCreateOpen] = React.useState(searchParams.get("new") === "1");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: { source: "website", ownerId: "u-2" },
  });

  const rows = leads
    .map((lead) => ({ lead, customer: customers.find((c) => c.id === lead.customerId) }))
    .filter((r) => r.customer)
    .filter((r) => stageFilter === "all" || r.lead.stage === stageFilter)
    .filter((r) => {
      if (!query) return true;
      const q = query.toLowerCase();
      const company = getCompanyById(r.customer!.companyId)?.name ?? "";
      return r.customer!.name.toLowerCase().includes(q) || company.toLowerCase().includes(q);
    })
    .sort((a, b) => (a.lead.lastActivityAt < b.lead.lastActivityAt ? 1 : -1));

  function onCreate(values: LeadFormValues) {
    const id = createLead({
      name: values.name,
      email: values.email,
      companyName: values.companyName,
      source: values.source as LeadSource,
      requirement: values.requirement,
      ownerId: values.ownerId,
    });
    toast.success("Lead created", { description: `${values.name} was added to the pipeline.` });
    setCreateOpen(false);
    reset();
    router.push(`/leads/${id}`);
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <PageHeader
        title="Leads"
        description={`${rows.length} of ${leads.length} leads`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => toast.success("Import started", { description: "leads.csv is processing — 0 of 0 rows so far." })}>
              <Upload className="size-3.5" />
              Import
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" />
              New Lead
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 pb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search leads or companies…" className="w-64" />
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {(["new", "contacted", "qualified", "demo", "proposal", "negotiation", "approval", "won", "lost"] as LeadStage[]).map((s) => (
              <SelectItem key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground">{selected.length} selected</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                toast.success(`${selected.length} leads reassigned to Aman Verma`);
                setSelected([]);
              }}
            >
              Bulk assign
            </Button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-6">
          <EmptyState
            icon={UserRoundPlus}
            title={leads.length === 0 ? "No leads yet" : "No leads match"}
            description={
              leads.length === 0
                ? "Connect a lead source or create your first lead manually."
                : "Try a different search term or stage filter."
            }
            action={
              leads.length === 0 ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-3.5" />
                  New Lead
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-9">
                <Checkbox
                  checked={selected.length > 0 && selected.length === rows.length}
                  onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.lead.id) : [])}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Last Activity</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-9" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ lead, customer }) => {
              const company = getCompanyById(customer!.companyId);
              const owner = users.find((u) => u.id === lead.ownerId);
              const SourceIcon = leadSourceMeta[lead.source].icon;
              const checked = selected.includes(lead.id);
              return (
                <TableRow
                  key={lead.id}
                  className="cursor-pointer"
                  data-state={checked ? "selected" : undefined}
                  onClick={() => router.push(`/leads/${lead.id}`)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={checked} onCheckedChange={() => setSelected((s) => (checked ? s.filter((id) => id !== lead.id) : [...s, lead.id]))} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CustomerAvatar name={customer!.name} color={customer!.avatarColor} size="sm" />
                      <span className="font-medium text-foreground">{customer!.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{company?.name}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <SourceIcon className="size-3.5" />
                      {leadSourceMeta[lead.source].label}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={cn("text-mono font-medium", lead.score >= 75 ? "text-success" : lead.score >= 50 ? "text-warning" : "text-muted-foreground")}>
                      {lead.score}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{owner?.name}</TableCell>
                  <TableCell>
                    <LeadStageBadge stage={lead.stage} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatRelativeTime(lead.lastActivityAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(lead.createdAt)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/leads/${lead.id}`}>View lead</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toast.success(`Reassigned ${customer!.name}`)}>Assign</DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/deals?fromLead=${lead.id}`}>Convert to deal</Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New lead</DialogTitle>
            <DialogDescription>Manually add a lead to the pipeline.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lead-name">Name</Label>
                <Input id="lead-name" placeholder="Full name" {...register("name")} />
                {errors.name && <p className="text-[11px] text-danger">{errors.name.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lead-email">Email</Label>
                <Input id="lead-email" placeholder="name@company.com" {...register("email")} />
                {errors.email && <p className="text-[11px] text-danger">{errors.email.message}</p>}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-company">Company</Label>
              <Input id="lead-company" placeholder="Company name" {...register("companyName")} />
              {errors.companyName && <p className="text-[11px] text-danger">{errors.companyName.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Source</Label>
                <Select value={watch("source")} onValueChange={(v) => setValue("source", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(leadSourceMeta).map(([key, meta]) => (
                      <SelectItem key={key} value={key}>
                        {meta.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Owner</Label>
                <Select value={watch("ownerId")} onValueChange={(v) => setValue("ownerId", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {users
                      .filter((u) => u.role.includes("sales") || u.role === "owner")
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-requirement">Requirement</Label>
              <Textarea id="lead-requirement" placeholder="What are they looking for?" {...register("requirement")} />
              {errors.requirement && <p className="text-[11px] text-danger">{errors.requirement.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                Create lead
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
