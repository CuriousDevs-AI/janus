"use client";
import * as React from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { canManageHr } from "@/lib/hr-people-access";
import { HrEmpty, HrField, HrModal, HrPanel, HrStats, HrStatus, HrTable, hrCell, hrDate, hrInputClass, hrMoney, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole } from "@/lib/types";

interface LoanRequest {
  id: string; employeeId: string; employeeName: string;
  type: "salary_advance" | "festival_advance" | "emergency_loan" | "personal_loan";
  amount: number; reason: string; repaymentMonths: number;
  status: "pending" | "approved" | "disbursed" | "repaying" | "closed" | "rejected";
  approvedBy: string | null; approvedAt: string | null;
  monthlyEmi: number; totalRepaid: number;
  requestedAt: string;
  rejectedReason?: string;
}

const typeLabels: Record<LoanRequest["type"], string> = { salary_advance: "Salary Advance", festival_advance: "Festival Advance", emergency_loan: "Emergency Loan", personal_loan: "Personal Loan" };
const loanTypes = Object.keys(typeLabels) as LoanRequest["type"][];

function seedLoans(): LoanRequest[] {
  return [
    { id: "loan-001", employeeId: "emp-004", employeeName: "Riya Kapoor", type: "salary_advance", amount: 52000, reason: "Urgent family medical expense", repaymentMonths: 2, status: "repaying", approvedBy: "emp-002", approvedAt: "2026-09-20", monthlyEmi: 26000, totalRepaid: 26000, requestedAt: "2026-09-18" },
    { id: "loan-002", employeeId: "emp-005", employeeName: "Neha Verma", type: "festival_advance", amount: 20000, reason: "Diwali expenses", repaymentMonths: 4, status: "disbursed", approvedBy: "emp-002", approvedAt: "2026-10-10", monthlyEmi: 5000, totalRepaid: 0, requestedAt: "2026-10-08" },
    { id: "loan-003", employeeId: "emp-003", employeeName: "Arjun Mehta", type: "personal_loan", amount: 200000, reason: "Home renovation", repaymentMonths: 12, status: "pending", approvedBy: null, approvedAt: null, monthlyEmi: 16667, totalRepaid: 0, requestedAt: "2026-11-15" },
  ];
}

function nextEmiDate(): string {
  const today = hrToday();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return next;
}

export function HrLoansView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees } = useHrPeopleStore();
  const [loans, setLoans] = React.useState<LoanRequest[]>(seedLoans);
  const [requesting, setRequesting] = React.useState(false);
  const [rejecting, setRejecting] = React.useState<LoanRequest | null>(null);
  const [schedule, setSchedule] = React.useState<LoanRequest | null>(null);
  const isHr = canManageHr(role);
  const actor = employees.find((item) => item.id === actorId);

  function approve(loan: LoanRequest) {
    setLoans((prev) => prev.map((item) => item.id === loan.id ? { ...item, status: "disbursed", approvedBy: actorId, approvedAt: hrToday() } : item));
    toast.success(`${typeLabels[loan.type]} for ${loan.employeeName} approved and marked for disbursement.`);
  }
  function reject(loan: LoanRequest, reason: string) {
    setLoans((prev) => prev.map((item) => item.id === loan.id ? { ...item, status: "rejected", rejectedReason: reason } : item));
    toast.success(`Request rejected.`);
    setRejecting(null);
  }
  function addLoan(loan: LoanRequest) {
    setLoans((prev) => [loan, ...prev]);
    setRequesting(false);
    toast.success("Loan request submitted. HR will review it.");
  }

  /* ---------- Employee view ---------- */
  if (!isHr) {
    const my = loans.filter((item) => item.employeeId === actorId);
    const active = my.filter((item) => !["closed", "rejected"].includes(item.status));
    return <div className="space-y-5">
      <HrPanel title="My Loans & Advances" description="Interest-free loans deducted as EMIs from your payslip." actions={actor ? <Button size="sm" onClick={() => setRequesting(true)}><Plus className="mr-1 size-3.5" />Request loan</Button> : undefined}>
        {active.length ? <HrTable headings={["Type", "Amount", "Outstanding", "Monthly EMI", "Next deduction", "Status"]}>{active.map((loan) => <tr key={loan.id}>
          <td className={`${hrCell} font-medium`}>{typeLabels[loan.type]}</td>
          <td className={hrCell}>{hrMoney(loan.amount)}</td>
          <td className={hrCell}>{hrMoney(loan.amount - loan.totalRepaid)}</td>
          <td className={hrCell}>{hrMoney(loan.monthlyEmi)}</td>
          <td className={hrCell}>{["repaying", "disbursed"].includes(loan.status) ? hrDate(nextEmiDate()) : "—"}</td>
          <td className={hrCell}><div className="flex items-center gap-2"><HrStatus status={loan.status} />{["repaying", "disbursed"].includes(loan.status) && <Button size="sm" variant="ghost" onClick={() => setSchedule(loan)}>Schedule</Button>}</div></td>
        </tr>)}</HrTable> : <HrEmpty>{actor ? "No active loans. Use Request loan to apply for one." : "This account is not linked to an employee record."}</HrEmpty>}
      </HrPanel>
      <p className="text-xs text-muted-foreground">EMIs appear as a deduction in the next payslip.</p>
      {requesting && actor && <RequestDialog actor={actor} loans={loans} onClose={() => setRequesting(false)} onSubmit={addLoan} />}
      {schedule && <ScheduleDialog loan={schedule} onClose={() => setSchedule(null)} />}
    </div>;
  }

  /* ---------- HR / Manager view ---------- */
  const pending = loans.filter((item) => item.status === "pending");
  const activeLoansList = loans.filter((item) => ["approved", "disbursed", "repaying"].includes(item.status));
  const totalDisbursed = loans.filter((item) => item.status !== "pending" && item.status !== "rejected").reduce((sum, item) => sum + item.amount, 0);
  const totalOutstanding = activeLoansList.reduce((sum, item) => sum + (item.amount - item.totalRepaid), 0);

  return <div className="space-y-5">
    <HrStats items={[{ label: "Total disbursed", value: hrMoney(totalDisbursed), hint: "All time" }, { label: "Outstanding", value: hrMoney(totalOutstanding), hint: "Active loans" }, { label: "Active loans", value: activeLoansList.length, hint: "Approved / disbursed / repaying" }, { label: "Pending requests", value: pending.length, hint: "Awaiting approval" }]} />

    {pending.length > 0 && <HrPanel title="Approval queue" description="Pending loan and advance requests.">
      <HrTable headings={["Employee", "Type", "Amount", "Repayment", "Reason", "Actions"]}>{pending.map((loan) => <tr key={loan.id}>
        <td className={`${hrCell} font-medium`}>{loan.employeeName}</td>
        <td className={hrCell}>{typeLabels[loan.type]}</td>
        <td className={hrCell}>{hrMoney(loan.amount)}</td>
        <td className={hrCell}>{loan.repaymentMonths} months ({hrMoney(loan.monthlyEmi)}/mo)</td>
        <td className={`${hrCell} max-w-[200px] truncate`}>{loan.reason}</td>
        <td className={hrCell}><div className="flex gap-1"><Button size="sm" onClick={() => approve(loan)}>Approve</Button><Button size="sm" variant="outline" onClick={() => setRejecting(loan)}>Reject</Button></div></td>
      </tr>)}</HrTable>
    </HrPanel>}

    <HrPanel title="All loans" description="Every loan and salary advance across the organisation.">
      {loans.length ? <HrTable headings={["Employee", "Type", "Principal", "Outstanding", "EMI", "Status", "Requested"]}>{loans.map((loan) => <tr key={loan.id}>
        <td className={`${hrCell} font-medium`}>{loan.employeeName}</td>
        <td className={hrCell}>{typeLabels[loan.type]}</td>
        <td className={hrCell}>{hrMoney(loan.amount)}</td>
        <td className={hrCell}>{hrMoney(loan.amount - loan.totalRepaid)}</td>
        <td className={hrCell}>{hrMoney(loan.monthlyEmi)}</td>
        <td className={hrCell}><HrStatus status={loan.status} /></td>
        <td className={hrCell}>{hrDate(loan.requestedAt)}</td>
      </tr>)}</HrTable> : <HrEmpty>No loan records yet.</HrEmpty>}
    </HrPanel>
    <p className="text-xs text-muted-foreground">EMIs appear as a deduction in the next payslip.</p>

    {rejecting && <RejectDialog loan={rejecting} onClose={() => setRejecting(null)} onSubmit={reject} />}
    {schedule && <ScheduleDialog loan={schedule} onClose={() => setSchedule(null)} />}
  </div>;
}

/* ---------- Request dialog ---------- */
function RequestDialog({ actor, loans, onClose, onSubmit }: { actor: { id: string; name: string; salaryMonthly: number }; loans: LoanRequest[]; onClose: () => void; onSubmit: (loan: LoanRequest) => void }) {
  const [type, setType] = React.useState<LoanRequest["type"]>("salary_advance");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [months, setMonths] = React.useState("3");
  const value = Number(amount);
  const repay = Math.max(1, Math.min(24, Math.round(Number(months))));
  const salary = actor.salaryMonthly;
  const maxMap: Record<LoanRequest["type"], number> = { salary_advance: salary, festival_advance: 25000, emergency_loan: salary * 3, personal_loan: salary * 6 };
  const max = maxMap[type];
  const hasActive = loans.some((item) => item.employeeId === actor.id && item.type === type && !["closed", "rejected"].includes(item.status));
  const error = hasActive ? `You already have an active ${typeLabels[type]}.` : !amount || !Number.isFinite(value) || value <= 0 ? "Enter a valid amount." : value > max ? `Maximum for ${typeLabels[type]} is ${hrMoney(max)}.` : reason.trim().length < 5 ? "Provide a reason (at least 5 characters)." : "";
  const showError = Boolean(error) && (amount !== "" || reason !== "");
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (error) return;
    const emi = Math.ceil(value / repay);
    onSubmit({ id: `loan-${crypto.randomUUID().slice(0, 8)}`, employeeId: actor.id, employeeName: actor.name, type, amount: value, reason: reason.trim(), repaymentMonths: repay, status: "pending", approvedBy: null, approvedAt: null, monthlyEmi: emi, totalRepaid: 0, requestedAt: hrToday() });
  }
  return <HrModal open onOpenChange={(open) => !open && onClose()} title="Request a loan or advance" description={`Maximum depends on your salary and loan type. Interest-free.`}>
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <HrField label="Loan type"><select className={hrInputClass} value={type} onChange={(event) => setType(event.target.value as LoanRequest["type"])}>{loanTypes.map((item) => <option key={item} value={item}>{typeLabels[item]}</option>)}</select></HrField>
        <HrField label={`Amount (max ${hrMoney(max)})`}><Input type="number" min={1} max={max} step={1} value={amount} onChange={(event) => setAmount(event.target.value)} className="rounded-none" /></HrField>
      </div>
      <HrField label="Repayment months (1-24)"><Input type="number" min={1} max={24} step={1} value={months} onChange={(event) => setMonths(event.target.value)} className="rounded-none" /></HrField>
      <HrField label="Reason"><Textarea required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-none" placeholder="e.g. Medical emergency for a family member" /></HrField>
      {showError && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>Submit</Button></div>
    </form>
  </HrModal>;
}

/* ---------- Reject dialog ---------- */
function RejectDialog({ loan, onClose, onSubmit }: { loan: LoanRequest; onClose: () => void; onSubmit: (loan: LoanRequest, reason: string) => void }) {
  const [reason, setReason] = React.useState("");
  return <HrModal open onOpenChange={(open) => !open && onClose()} title={`Reject ${loan.employeeName}'s request`} description={`${typeLabels[loan.type]} · ${hrMoney(loan.amount)}`}>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length >= 5) onSubmit(loan, reason.trim()); }}>
      <Textarea aria-label="Reason for rejection" required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-none" placeholder="Reason visible to the employee" />
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={reason.trim().length < 5}>Reject</Button></div>
    </form>
  </HrModal>;
}

/* ---------- Repayment schedule dialog ---------- */
function ScheduleDialog({ loan, onClose }: { loan: LoanRequest; onClose: () => void }) {
  const outstanding = loan.amount - loan.totalRepaid;
  const monthsPaid = loan.monthlyEmi > 0 ? Math.round(loan.totalRepaid / loan.monthlyEmi) : 0;
  const rows: { month: number; emi: number; paid: number; balance: number }[] = [];
  let balance = loan.amount;
  for (let i = 1; i <= loan.repaymentMonths; i++) {
    const emi = i === loan.repaymentMonths ? balance : loan.monthlyEmi;
    const paid = balance - Math.max(0, balance - emi);
    balance = Math.max(0, balance - emi);
    rows.push({ month: i, emi, paid, balance });
  }
  return <HrModal open onOpenChange={(open) => !open && onClose()} title="Repayment schedule" description={`${typeLabels[loan.type]} · ${hrMoney(loan.amount)} over ${loan.repaymentMonths} months`}>
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm"><span>Outstanding: <strong>{hrMoney(outstanding)}</strong></span><span>Months paid: <strong>{monthsPaid}</strong></span></div>
      <HrTable headings={["Month", "EMI", "Cumulative paid", "Balance"]}>{rows.map((row) => <tr key={row.month} className={row.month <= monthsPaid ? "bg-surface-2" : undefined}>
        <td className={hrCell}>{row.month}{row.month <= monthsPaid ? " (paid)" : ""}</td>
        <td className={hrCell}>{hrMoney(row.emi)}</td>
        <td className={hrCell}>{hrMoney(loan.amount - row.balance)}</td>
        <td className={hrCell}>{hrMoney(row.balance)}</td>
      </tr>)}</HrTable>
      <p className="text-xs text-muted-foreground">Interest-free. EMIs are deducted from monthly payslips.</p>
    </div>
  </HrModal>;
}
