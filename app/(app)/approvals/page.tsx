"use client";

import * as React from "react";
import { useCrmAccess } from "@/lib/use-crm-access";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { getCustomerById } from "@/lib/mock-data";
import { PageHeader } from "@/components/shared/page-header";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { ApprovalRiskBadge } from "@/components/shared/status-badge";
import { ActionKindBadge } from "@/components/approvals/action-kind-badge";
import { RequestedBy } from "@/components/approvals/requested-by";
import { formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { Approval } from "@/lib/types";

type FilterValue = "pending" | "approved" | "rejected" | "all";

const statusToneMap: Record<Approval["status"], "warning" | "success" | "danger"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

export default function ApprovalsPage() {
  const allApprovals = useAppStore((s) => s.approvals);
  const access = useCrmAccess();
  const approvals = React.useMemo(() => access.approvals(allApprovals), [access, allApprovals]);
  const decideApproval = useAppStore((s) => s.decideApproval);
  const router = useRouter();
  const [filter, setFilter] = React.useState<FilterValue>("pending");

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
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
          <TabsList>
            <TabsTrigger value="pending">
              Pending
              {pendingCount > 0 && (
                <Badge variant="warning" className="ml-1.5">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved">
              Approved
              {approvedCount > 0 && (
                <Badge variant="success" className="ml-1.5">
                  {approvedCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="rejected">
              Rejected
              {rejectedCount > 0 && (
                <Badge variant="danger" className="ml-1.5">
                  {rejectedCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">
              All
              {approvals.length > 0 && (
                <Badge variant="neutral" className="ml-1.5">
                  {approvals.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-6">
          <EmptyState
            icon={ShieldCheck}
            title="No approvals here"
            description="Nothing to review in this view right now."
          />
        </div>
      ) : (
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
      )}
    </div>
  );
}
