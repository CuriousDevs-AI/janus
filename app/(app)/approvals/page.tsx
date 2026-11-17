"use client";
import { LiveApprovals } from "@/components/crm/live-pages";
import { demoMode } from "@/lib/demo-mode";

import * as React from "react";
import { useCrmAccess } from "@/lib/use-crm-access";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, GitBranch, ShieldCheck, Timer, TrendingUp, XCircle } from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { getCustomerById } from "@/lib/mock-data";
import { PageHeader } from "@/components/shared/page-header";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { ApprovalRiskBadge } from "@/components/shared/status-badge";
import { ActionKindBadge } from "@/components/approvals/action-kind-badge";
import { RequestedBy } from "@/components/approvals/requested-by";
import { formatRelativeTime, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { Approval } from "@/lib/types";

type FilterValue = "pending" | "approved" | "rejected" | "all";
type ViewMode = "queue" | "analytics";

const statusToneMap: Record<Approval["status"], "warning" | "success" | "danger"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

function ApprovalAnalytics({ approvals }: { approvals: Approval[] }) {
  const total = approvals.length;
  const approved = approvals.filter((a) => a.status === "approved").length;
  const rejected = approvals.filter((a) => a.status === "rejected").length;
  const pending = approvals.filter((a) => a.status === "pending").length;
  const approvalRate = total > 0 ? Math.round((approved / Math.max(approved + rejected, 1)) * 100) : 0;
  const highRisk = approvals.filter((a) => a.risk === "high").length;
  const highRiskPending = approvals.filter((a) => a.risk === "high" && a.status === "pending").length;

  type AK = Approval["actionKind"];
  const byKind = approvals.reduce<Record<AK, { total: number; approved: number; rejected: number; pending: number }>>((acc, a) => {
    const k = a.actionKind;
    if (!acc[k]) acc[k] = { total: 0, approved: 0, rejected: 0, pending: 0 };
    acc[k].total++;
    acc[k][a.status]++;
    return acc;
  }, {} as Record<AK, { total: number; approved: number; rejected: number; pending: number }>);

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" />Total</div>
          <p className="text-2xl font-bold">{total}</p>
          <p className="text-[11px] text-muted-foreground">all time</p>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="size-3.5" />Pending</div>
          <p className="text-2xl font-bold text-warning">{pending}</p>
          <p className="text-[11px] text-muted-foreground">awaiting review</p>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="size-3.5" />Approval Rate</div>
          <p className="text-2xl font-bold text-success">{approvalRate}%</p>
          <p className="text-[11px] text-muted-foreground">{approved} of {approved + rejected} decided</p>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Timer className="size-3.5" />Avg Decision Time</div>
          <p className="text-2xl font-bold">2.4h</p>
          <p className="text-[11px] text-success">within SLA</p>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="size-3.5" />High Risk</div>
          <p className="text-2xl font-bold text-danger">{highRisk}</p>
          <p className="text-[11px] text-muted-foreground">{highRiskPending} pending</p>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">By action type</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(Object.entries(byKind) as [AK, { total: number; approved: number; rejected: number; pending: number }][]).map(([kind, stats]) => {
            const rate = stats.total > 0 ? Math.round((stats.approved / Math.max(stats.approved + stats.rejected, 1)) * 100) : 0;
            return (
              <div key={kind} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <ActionKindBadge kind={kind} />
                  <span className="text-xs text-muted-foreground">{stats.total} total</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1 text-success"><CheckCircle2 className="size-3" />{stats.approved}</span>
                  <span className="flex items-center gap-1 text-danger"><XCircle className="size-3" />{stats.rejected}</span>
                  <span className="flex items-center gap-1 text-warning"><Clock className="size-3" />{stats.pending}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div className="h-full rounded-full bg-success transition-all" style={{ width: `${rate}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground">{rate}% approval rate</p>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approval chain</h2>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-4">
          {["Requester", "Manager", "Finance Head", "Final Approver"].map((step, i) => (
            <React.Fragment key={step}>
              <div className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium", i === 0 ? "border-accent bg-accent-muted text-accent" : "border-border bg-surface-2 text-muted-foreground")}>
                <GitBranch className="size-3" />
                {step}
              </div>
              {i < 3 && <ArrowRight className="size-3.5 text-muted-foreground/40" />}
            </React.Fragment>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">High-risk actions require all 4 levels. Standard actions skip to Finance Head.</p>
      </section>
    </div>
  );
}

function DemoApprovals() {
  const allApprovals = useAppStore((s) => s.approvals);
  const access = useCrmAccess();
  const approvals = React.useMemo(() => access.approvals(allApprovals), [access, allApprovals]);
  const decideApproval = useAppStore((s) => s.decideApproval);
  const router = useRouter();
  const [filter, setFilter] = React.useState<FilterValue>("pending");
  const [viewMode, setViewMode] = React.useState<ViewMode>("queue");

  const pendingCount = approvals.filter((a) => a.status === "pending").length;
  const approvedCount = approvals.filter((a) => a.status === "approved").length;
  const rejectedCount = approvals.filter((a) => a.status === "rejected").length;

  const rows = approvals
    .filter((a) => filter === "all" || a.status === filter)
    .sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));

  function handleDecision(approval: Approval, decision: "approved" | "rejected") {
    decideApproval(approval.id, decision);
    toast.success(decision === "approved" ? "Approval granted" : "Approval rejected", {
      description: approval.actionLabel,
    });
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <PageHeader
        title="Approvals"
        description={`${pendingCount} pending approval${pendingCount === 1 ? "" : "s"}`}
      />

      <div className="border-b border-border px-6">
        <div className="flex items-center justify-between">
          <Tabs value={viewMode === "analytics" ? "analytics" : filter} onValueChange={(v) => {
            if (v === "analytics") { setViewMode("analytics"); }
            else { setViewMode("queue"); setFilter(v as FilterValue); }
          }}>
            <TabsList>
              <TabsTrigger value="pending">
                Pending
                {pendingCount > 0 && <Badge variant="warning" className="ml-1.5">{pendingCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="approved">
                Approved
                {approvedCount > 0 && <Badge variant="success" className="ml-1.5">{approvedCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="rejected">
                Rejected
                {rejectedCount > 0 && <Badge variant="danger" className="ml-1.5">{rejectedCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="all">
                All
                {approvals.length > 0 && <Badge variant="neutral" className="ml-1.5">{approvals.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {viewMode === "analytics" ? (
        <ApprovalAnalytics approvals={approvals} />
      ) : rows.length === 0 ? (
        <div className="px-6 py-6">
          <EmptyState
            icon={ShieldCheck}
            title="No approvals here"
            description="Nothing to review in this view right now."
          />
        </div>
      ) : (
        <>
          {pendingCount > 0 && filter === "pending" && (
            <div className="flex items-center gap-3 border-b border-border/50 bg-warning/5 px-6 py-2">
              <Timer className="size-3.5 text-warning" />
              <span className="text-xs text-muted-foreground">
                {pendingCount === 1 ? "1 approval" : `${pendingCount} approvals`} waiting — oldest is {formatRelativeTime(rows[rows.length - 1]?.requestedAt ?? "")}
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground">SLA: 4h for standard, 1h for high-risk</span>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-44" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((approval) => {
                const customer = getCustomerById(approval.customerId);
                return (
                  <TableRow
                    key={approval.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/approvals/${approval.id}`)}
                  >
                    <TableCell>
                      <div className="flex max-w-xs flex-col items-start gap-1 whitespace-normal py-0.5">
                        <span className="font-medium text-foreground">{approval.actionLabel}</span>
                        <ActionKindBadge kind={approval.actionKind} />
                      </div>
                    </TableCell>
                    <TableCell>
                      {customer ? (
                        <Link
                          href={`/customers/${customer.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-2 hover:text-accent"
                        >
                          <CustomerAvatar name={customer.name} color={customer.avatarColor} size="sm" />
                          <span className="text-foreground">{customer.name}</span>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ApprovalRiskBadge risk={approval.risk} />
                    </TableCell>
                    <TableCell>
                      <RequestedBy approval={approval} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatRelativeTime(approval.requestedAt)}</TableCell>
                    <TableCell>
                      <Badge variant={statusToneMap[approval.status]} className="capitalize">
                        {approval.status}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {approval.status === "pending" ? (
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => handleDecision(approval, "approved")}>
                            Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDecision(approval, "rejected")}>
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return demoMode ? <DemoApprovals /> : <LiveApprovals />;
}
