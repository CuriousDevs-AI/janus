"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { canManageHr } from "@/lib/hr-people-access";
import { HrEmpty, HrField, HrModal, HrPanel, HrStats, HrStatus, HrTable, hrCell, hrDate, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole } from "@/lib/types";

type ReqCategory = "laptop" | "phone" | "monitor" | "headset" | "id_card" | "access_card" | "other";
type ReqUrgency = "normal" | "urgent";
type ReqStatus = "requested" | "manager_approved" | "it_processing" | "issued" | "rejected";

interface AssetRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  category: ReqCategory;
  reason: string;
  urgency: ReqUrgency;
  status: ReqStatus;
  requestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
}

interface MyAsset {
  id: string;
  name: string;
  category: string;
  serial: string;
  assignedAt: string;
}

const categoryLabel: Record<ReqCategory, string> = { laptop: "Laptop", phone: "Phone", monitor: "Monitor", headset: "Headset", id_card: "ID Card", access_card: "Access Card", other: "Other" };

const statusLabel: Record<ReqStatus, string> = { requested: "Pending approval", manager_approved: "Approved — awaiting IT", it_processing: "IT processing", issued: "Issued", rejected: "Rejected" };

function seedMyAssets(actorId: string): MyAsset[] {
  return [
    { id: "my-ast-1", name: "ThinkPad T14s #3", category: "Laptop", serial: "SN-LAP-1002", assignedAt: "2026-05-20" },
    { id: "my-ast-2", name: "Employee ID Card", category: "ID Card", serial: "ID-2002", assignedAt: "2026-05-16" },
  ];
}

function seedRequests(): AssetRequest[] {
  return [
    { id: "areq-1", employeeId: "emp-004", employeeName: "Riya Kapoor", category: "monitor", reason: "Need dual monitor setup for design work", urgency: "normal", status: "manager_approved", requestedAt: "2026-11-10", approvedBy: "emp-002", approvedAt: "2026-11-11" },
    { id: "areq-2", employeeId: "emp-005", employeeName: "Neha Verma", category: "headset", reason: "Current headset mic not working in calls", urgency: "urgent", status: "requested", requestedAt: "2026-11-15", approvedBy: null, approvedAt: null },
    { id: "areq-3", employeeId: "emp-003", employeeName: "Arjun Mehta", category: "laptop", reason: "Laptop performance issues, need upgrade for development", urgency: "normal", status: "issued", requestedAt: "2026-11-01", approvedBy: "emp-002", approvedAt: "2026-11-02" },
    { id: "areq-4", employeeId: "emp-006", employeeName: "Vikram Singh", category: "laptop", reason: "New joiner — need laptop and peripherals", urgency: "urgent", status: "it_processing", requestedAt: "2026-11-12", approvedBy: "emp-001", approvedAt: "2026-11-13" },
  ];
}

export function HrAssetsView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees } = useHrPeopleStore();
  const hr = canManageHr(role);
  const [myAssets] = React.useState(() => seedMyAssets(actorId));
  const [requests, setRequests] = React.useState(seedRequests);
  const [adding, setAdding] = React.useState(false);
  const nameOf = (id: string | null) => id ? employees.find((e) => e.id === id)?.name ?? id : "—";

  const myRequests = requests.filter((r) => r.employeeId === actorId);
  const pendingApproval = requests.filter((r) => r.status === "requested");
  const totalPending = pendingApproval.length;
  const totalApproved = requests.filter((r) => r.status === "manager_approved" || r.status === "it_processing").length;

  function approveRequest(id: string) {
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "manager_approved", approvedBy: actorId, approvedAt: hrToday() } : r));
    toast.success("Request approved — forwarded to IT");
  }

  function rejectRequest(id: string) {
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "rejected" } : r));
    toast.success("Request rejected");
  }

  return <div className="space-y-5">
    <div className="border border-info/30 bg-info-muted px-4 py-2.5 text-xs text-info">
      Asset inventory and issuance is managed by the IT team. <a href="/workspace/it-infrastructure?view=assets" className="font-medium underline underline-offset-2">Go to IT Assets →</a>
    </div>

    <HrStats items={[
      { label: "My assets", value: myAssets.length, hint: "Assigned to you" },
      { label: "My requests", value: myRequests.length, hint: myRequests.filter((r) => r.status === "requested" || r.status === "manager_approved").length ? "Pending" : "All resolved" },
      ...(hr ? [
        { label: "Pending approval", value: totalPending, hint: totalPending ? "Need your review" : "None pending" },
        { label: "Awaiting IT", value: totalApproved, hint: "Approved, IT to issue" },
      ] : []),
    ]} />

    <HrPanel title="My assets" description="Company assets currently assigned to you">
      {myAssets.length ? <HrTable headings={["Asset", "Category", "Serial", "Assigned on"]}>
        {myAssets.map((a) => <tr key={a.id}>
          <td className={`${hrCell} font-medium`}>{a.name}</td>
          <td className={hrCell}>{a.category}</td>
          <td className={hrCell}><span className="font-mono text-xs">{a.serial}</span></td>
          <td className={hrCell}>{hrDate(a.assignedAt)}</td>
        </tr>)}
      </HrTable> : <HrEmpty>No assets assigned to you.</HrEmpty>}
    </HrPanel>

    <HrPanel title="Request an asset" description="Submit a request — your manager or HR will approve, then IT issues the asset." actions={<Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 size-3.5" />New request</Button>}>
      {myRequests.length ? <HrTable headings={["Category", "Reason", "Urgency", "Status", "Requested"]}>
        {myRequests.map((r) => <tr key={r.id}>
          <td className={hrCell}><Badge variant="neutral">{categoryLabel[r.category]}</Badge></td>
          <td className={`${hrCell} max-w-xs text-muted-foreground`}>{r.reason}</td>
          <td className={hrCell}><Badge variant={r.urgency === "urgent" ? "warning" : "neutral"}>{r.urgency}</Badge></td>
          <td className={hrCell}><HrStatus status={r.status === "issued" ? "approved" : r.status === "rejected" ? "rejected" : r.status === "requested" ? "pending" : "review"} /><p className="mt-0.5 text-[10px] text-muted-foreground">{statusLabel[r.status]}</p></td>
          <td className={hrCell}>{hrDate(r.requestedAt)}</td>
        </tr>)}
      </HrTable> : <HrEmpty>You haven't requested any assets. Click "New request" to submit one.</HrEmpty>}
    </HrPanel>

    {hr && <HrPanel title="Approval queue" description="Asset requests pending manager or HR approval. Approved requests are forwarded to IT for issuance.">
      {pendingApproval.length ? <HrTable headings={["Employee", "Category", "Reason", "Urgency", "Requested", ""]}>
        {pendingApproval.map((r) => <tr key={r.id}>
          <td className={`${hrCell} font-medium`}>{r.employeeName}</td>
          <td className={hrCell}><Badge variant="neutral">{categoryLabel[r.category]}</Badge></td>
          <td className={`${hrCell} max-w-xs text-muted-foreground`}>{r.reason}</td>
          <td className={hrCell}><Badge variant={r.urgency === "urgent" ? "warning" : "neutral"}>{r.urgency}</Badge></td>
          <td className={hrCell}>{hrDate(r.requestedAt)}</td>
          <td className={hrCell}><div className="flex gap-1"><Button size="sm" onClick={() => approveRequest(r.id)}>Approve</Button><Button size="sm" variant="outline" onClick={() => rejectRequest(r.id)}>Reject</Button></div></td>
        </tr>)}
      </HrTable> : <HrEmpty>No requests pending approval.</HrEmpty>}
    </HrPanel>}

    {hr && <HrPanel title="All requests" description="Complete log of asset requests and their approval status.">
      {requests.length ? <HrTable headings={["Employee", "Category", "Urgency", "Status", "Requested", "Approved by"]}>
        {requests.map((r) => <tr key={r.id}>
          <td className={`${hrCell} font-medium`}>{r.employeeName}</td>
          <td className={hrCell}><Badge variant="neutral">{categoryLabel[r.category]}</Badge></td>
          <td className={hrCell}><Badge variant={r.urgency === "urgent" ? "warning" : "neutral"}>{r.urgency}</Badge></td>
          <td className={hrCell}><HrStatus status={r.status === "issued" ? "approved" : r.status === "rejected" ? "rejected" : r.status === "requested" ? "pending" : "review"} /><p className="mt-0.5 text-[10px] text-muted-foreground">{statusLabel[r.status]}</p></td>
          <td className={hrCell}>{hrDate(r.requestedAt)}</td>
          <td className={hrCell}>{r.approvedBy ? <span>{nameOf(r.approvedBy)} · {r.approvedAt ? hrDate(r.approvedAt) : ""}</span> : <span className="text-muted-foreground">—</span>}</td>
        </tr>)}
      </HrTable> : <HrEmpty>No requests yet.</HrEmpty>}
    </HrPanel>}

    {adding && <RequestAssetDialog onClose={() => setAdding(false)} onSubmit={(req) => {
      setRequests((prev) => [{ ...req, id: `areq-${crypto.randomUUID().slice(0, 6)}`, employeeId: actorId, employeeName: employees.find((e) => e.id === actorId)?.name ?? "You", status: "requested" as const, requestedAt: hrToday(), approvedBy: null, approvedAt: null }, ...prev]);
      toast.success("Asset request submitted — pending approval");
      setAdding(false);
    }} />}
  </div>;
}

function RequestAssetDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (r: Pick<AssetRequest, "category" | "reason" | "urgency">) => void }) {
  const [category, setCategory] = React.useState<ReqCategory>("laptop");
  const [reason, setReason] = React.useState("");
  const [urgency, setUrgency] = React.useState<ReqUrgency>("normal");
  const error = reason.trim().length < 5 ? "Explain why you need this asset." : "";

  return <HrModal open onOpenChange={(v) => !v && onClose()} title="Request an asset" description="Your request will be sent to your manager or HR for approval. Once approved, IT will issue the asset.">
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!error) onSubmit({ category, reason: reason.trim(), urgency }); }}>
      <HrField label="Asset category"><select className={hrInputClass} value={category} onChange={(e) => setCategory(e.target.value as ReqCategory)}>{(Object.keys(categoryLabel) as ReqCategory[]).map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}</select></HrField>
      <HrField label="Why do you need this?"><Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className="rounded-none" placeholder="e.g. Current laptop is 4 years old and slow" /></HrField>
      <HrField label="Urgency"><select className={hrInputClass} value={urgency} onChange={(e) => setUrgency(e.target.value as ReqUrgency)}><option value="normal">Normal</option><option value="urgent">Urgent</option></select></HrField>
      {error && reason.length > 0 && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>Submit request</Button></div>
    </form>
  </HrModal>;
}
