"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { buildPayslip, downloadHrFile, payslipText, type HrPayslip } from "@/lib/hr-payroll";
import { HrExpensesView } from "@/components/hr-people/expenses";
import { PayslipDialog, type Line } from "@/components/hr-people/payroll";
import { canManageHr } from "@/lib/hr-people-access";
import { HrEmpty, HrField, HrPanel, HrStats, HrStatus, HrTable, downloadHrCsv, hrCell, hrInputClass, hrMoney, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole, HrEmployee } from "@/lib/types";

const monthLabel = (key: string) => new Date(`${key}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const keyOf = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
/** Indian financial year: April to March. */
const fyOf = (date: string) => { const year = Number(date.slice(0, 4)); return Number(date.slice(5, 7)) >= 4 ? year : year - 1; };
const fyMonths = (fy: number) => [...Array.from({ length: 9 }, (_, index) => keyOf(fy, index + 4)), ...Array.from({ length: 3 }, (_, index) => keyOf(fy + 1, index + 1))];
const fyLabel = (fy: number) => `Apr ${fy} – Mar ${fy + 1}`;

interface Row { key: string; slip: HrPayslip; published: boolean }

export function HrSalaryView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees, payrollRuns } = useHrPeopleStore();
  const params = useSearchParams();
  const [tab, setTab] = React.useState<"payslips" | "ytd" | "reimbursements" | "tax">(params.get("tab") === "reimbursements" ? "reimbursements" : params.get("tab") === "tax" ? "tax" : "payslips");
  const employee = employees.find((item) => item.id === actorId);
  const latest = payrollRuns[0] ? payrollRuns[0].id.replace(/^pay-/, "") : hrToday().slice(0, 7);
  const first = payrollRuns[payrollRuns.length - 1] ? payrollRuns[payrollRuns.length - 1].id.replace(/^pay-/, "") : latest;
  const years = [...new Set([fyOf(`${latest}-01`), fyOf(`${first}-01`), fyOf(hrToday())])].sort((a, b) => b - a);
  const [fy, setFy] = React.useState(years[0]);
  const [open, setOpen] = React.useState<Line | null>(null);
  if (!employee) return <HrPanel title="Salary"><HrEmpty>This account is not linked to an employee record. Ask HR to link your account.</HrEmpty></HrPanel>;

  const rows: Row[] = fyMonths(fy).filter((key) => key <= latest).flatMap((key) => {
    const slip = buildPayslip(employee, key);
    if (!slip) return [];
    const run = payrollRuns.find((item) => item.id === `pay-${key}`);
    return [{ key, slip, published: run ? run.status === "locked" : key < first }];
  }).reverse();
  const published = rows.filter((item) => item.published);
  const total = (pick: (slip: HrPayslip) => number) => published.reduce((sum, item) => sum + pick(item.slip), 0);
  const components = (kind: "earnings" | "deductions") => { const map = new Map<string, number>(); published.forEach((item) => item.slip[kind].forEach((part) => map.set(part.label, (map.get(part.label) ?? 0) + part.amount))); return [...map]; };
  const view = (row: Row) => setOpen({ employee: employee as HrEmployee, slip: row.slip, previous: null, delta: 0, pct: null, flags: [] });

  function exportYtd() {
    downloadHrCsv(`ytd-statement-${fy}-${fy + 1}.csv`, [["Month", "Paid days", "Gross", "Deductions", "Net"], ...published.map((item) => [monthLabel(item.key), `${item.slip.paidDays}/${item.slip.totalDays}`, item.slip.gross, item.slip.totalDeductions, item.slip.net]), ["Total", "", total((slip) => slip.gross), total((slip) => slip.totalDeductions), total((slip) => slip.net)]]);
  }

  return <div className="space-y-5">
    <div role="tablist" aria-label="Salary" className="flex w-fit flex-wrap gap-1 border border-border bg-surface-2 p-1">{([["payslips", "Payslips"], ["ytd", "Year to date"], ["reimbursements", "Reimbursements"], ["tax", "Tax declaration"]] as const).map(([key, label]) => <button key={key} id={`sal-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="sal-panel" onClick={() => setTab(key)} className={`px-5 py-2 text-sm ${tab === key ? "bg-accent text-white" : "text-muted-foreground"}`}>{label}</button>)}</div>
    <div id="sal-panel" role="tabpanel" aria-labelledby={`sal-tab-${tab}`} className="space-y-5">
      {tab !== "reimbursements" && <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm text-muted-foreground">Financial year<select className={`${hrInputClass} w-auto`} value={fy} onChange={(event) => setFy(Number(event.target.value))}>{years.map((item) => <option key={item} value={item}>{fyLabel(item)}</option>)}</select></label>{tab === "ytd" && <Button size="sm" variant="outline" disabled={!published.length} onClick={exportYtd}><Download className="mr-1 size-3.5" />Download statement</Button>}</div>}
      {tab === "payslips" && <HrPanel title="Payslips" description="A payslip appears here after payroll for that month is locked.">
        {rows.length ? <HrTable headings={["Month", "Paid days", "Net pay", "Status", ""]}>{rows.map((row) => <tr key={row.key}><td className={`${hrCell} font-medium`}>{monthLabel(row.key)}</td><td className={hrCell}>{row.slip.paidDays}/{row.slip.totalDays}</td><td className={hrCell}>{row.published ? hrMoney(row.slip.net) : "—"}</td><td className={hrCell}>{row.published ? <HrStatus status="published" /> : <><HrStatus status="review" /><p className="mt-1 text-[11px] text-muted-foreground">Payroll is under review</p></>}</td><td className={hrCell}><div className="flex gap-2">{row.published && <><Button size="sm" variant="outline" onClick={() => view(row)}>View</Button><Button size="sm" variant="ghost" aria-label={`Download payslip for ${monthLabel(row.key)}`} onClick={() => downloadHrFile(`payslip-${employee.id}-${row.key}.txt`, payslipText({ ...row.slip, status: "published" }, employee))}><Download className="size-3.5" /></Button></>}</div></td></tr>)}</HrTable> : <HrEmpty>No payslips in this financial year. They start from your joining month.</HrEmpty>}
      </HrPanel>}
      {tab === "ytd" && <>
        <HrStats items={[{ label: "Gross earned", value: hrMoney(total((slip) => slip.gross)), hint: `${published.length} ${published.length === 1 ? "month" : "months"} published` }, { label: "Deductions", value: hrMoney(total((slip) => slip.totalDeductions)), hint: fyLabel(fy) }, { label: "Net pay", value: hrMoney(total((slip) => slip.net)), hint: "Year to date" }, { label: "Average net a month", value: published.length ? hrMoney(Math.round(total((slip) => slip.net) / published.length)) : "—", hint: "Published months" }]} />
        {published.length ? <div className="grid gap-5 lg:grid-cols-2">
          <HrPanel title="Earnings"><HrTable headings={["Component", "Year to date"]}>{components("earnings").map(([label, amount]) => <tr key={label}><td className={hrCell}>{label}</td><td className={hrCell}>{hrMoney(amount)}</td></tr>)}</HrTable></HrPanel>
          <HrPanel title="Deductions"><HrTable headings={["Component", "Year to date"]}>{components("deductions").map(([label, amount]) => <tr key={label}><td className={hrCell}>{label}</td><td className={hrCell}>{hrMoney(amount)}</td></tr>)}</HrTable></HrPanel>
        </div> : <HrPanel title="Year to date"><HrEmpty>Your statement is ready once a month&apos;s payroll is published.</HrEmpty></HrPanel>}
        <p className="text-xs text-muted-foreground">Figures from payroll. PF, ESI, professional tax and TDS follow the current India rules; this isn&apos;t a Form 16.</p>
      </>}
      {tab === "reimbursements" && <HrExpensesView role={role} actorId={actorId} personal />}
      {tab === "tax" && <TaxDeclarationTab employee={employee} slip={rows[0]?.slip} role={role} actorId={actorId} fy={fy} />}
    </div>
    {open && <PayslipDialog line={open} published onClose={() => setOpen(null)} />}
  </div>;
}

type TaxRegime = "old" | "new";
type DeclStatus = "draft" | "submitted" | "verified" | "rejected";
interface TaxSection { id: string; label: string; section: string; limit: number | null; note: string; oldOnly: boolean }
interface DeclEntry { sectionId: string; declared: number; proofUploaded: boolean; proofStatus: DeclStatus }

const taxSections: TaxSection[] = [
  { id: "80c", label: "Section 80C investments", section: "80C", limit: 150000, note: "PPF, ELSS, LIC, NSC, home loan principal, tuition fees, Sukanya Samriddhi", oldOnly: true },
  { id: "80d", label: "Medical insurance", section: "80D", limit: 25000, note: "Health insurance premium for self, spouse and children. ₹50,000 for senior citizens", oldOnly: true },
  { id: "80ccd", label: "NPS (additional)", section: "80CCD(1B)", limit: 50000, note: "National Pension System contribution, over and above 80C", oldOnly: true },
  { id: "hra", label: "HRA exemption", section: "HRA", limit: null, note: "Monthly rent paid, landlord details. Computed as min(actual HRA, 50%/40% of basic, rent − 10% basic)", oldOnly: true },
  { id: "24b", label: "Home loan interest", section: "24(b)", limit: 200000, note: "Interest on housing loan under Section 24(b)", oldOnly: true },
  { id: "lta", label: "Leave Travel Allowance", section: "LTA", limit: null, note: "Domestic travel, twice in a block of 4 years, as per company policy", oldOnly: true },
  { id: "std", label: "Standard deduction", section: "Std", limit: 50000, note: "Available to all salaried employees under both tax regimes", oldOnly: false },
];

function seedDeclarations(regime: TaxRegime): DeclEntry[] {
  return taxSections.filter((s) => !s.oldOnly || regime === "old").map((s) => ({
    sectionId: s.id,
    declared: s.id === "80c" ? 120000 : s.id === "80d" ? 18000 : s.id === "std" ? 50000 : 0,
    proofUploaded: false,
    proofStatus: "draft" as DeclStatus,
  }));
}

function TaxDeclarationTab({ employee, slip, role, actorId, fy }: { employee: HrEmployee | undefined; slip: HrPayslip | undefined; role: HrDemoRole; actorId: string; fy: number }) {
  const { employees } = useHrPeopleStore();
  const hr = canManageHr(role);
  const [regime, setRegime] = React.useState<TaxRegime>("new");
  const [entries, setEntries] = React.useState<DeclEntry[]>(() => seedDeclarations("new"));
  const [status, setStatus] = React.useState<DeclStatus>("draft");
  const [hrQueue, setHrQueue] = React.useState<{ empId: string; empName: string; regime: TaxRegime; total: number; status: DeclStatus }[]>(() => {
    const active = employees.filter((e) => e.status !== "archived").slice(0, 5);
    return active.map((e, i) => ({ empId: e.id, empName: e.name, regime: i % 3 === 0 ? "old" : "new", total: [130000, 50000, 85000, 50000, 168000][i] ?? 50000, status: (["submitted", "submitted", "verified", "draft", "submitted"] as DeclStatus[])[i] ?? "draft" }));
  });

  function changeRegime(next: TaxRegime) {
    setRegime(next);
    setEntries(seedDeclarations(next));
    setStatus("draft");
  }

  function updateEntry(sectionId: string, declared: number) {
    setEntries((prev) => prev.map((e) => e.sectionId === sectionId ? { ...e, declared: Math.max(0, declared) } : e));
  }

  function submitDeclaration() {
    setStatus("submitted");
    toast.success("Tax declaration submitted to HR for verification");
  }

  const totalDeclared = entries.reduce((s, e) => s + e.declared, 0);
  const sections = taxSections.filter((s) => !s.oldOnly || regime === "old");

  return <>
    {employee && slip && <HrPanel title="My salary structure" description="Current monthly breakdown from the latest payslip">
      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Earnings</h3><div className="divide-y divide-border border border-border">{slip.earnings.map((e) => <div key={e.label} className="flex items-center justify-between px-4 py-2 text-sm"><span>{e.label}</span><span className="font-medium">{hrMoney(e.amount)}</span></div>)}<div className="flex items-center justify-between bg-surface-2 px-4 py-2 text-sm font-semibold"><span>Gross</span><span>{hrMoney(slip.gross)}</span></div></div></div>
        <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deductions</h3><div className="divide-y divide-border border border-border">{slip.deductions.map((d) => <div key={d.label} className="flex items-center justify-between px-4 py-2 text-sm"><span>{d.label}</span><span className="font-medium">{hrMoney(d.amount)}</span></div>)}<div className="flex items-center justify-between bg-surface-2 px-4 py-2 text-sm font-semibold"><span>Total deductions</span><span>{hrMoney(slip.totalDeductions)}</span></div></div></div>
      </div>
      <div className="border-t border-border px-5 py-3"><div className="flex items-center justify-between text-sm"><span className="font-medium">Net take-home</span><span className="text-lg font-bold">{hrMoney(slip.net)}</span></div></div>
    </HrPanel>}

    <HrPanel title="Tax Declaration (Form 12BB)" description={`FY ${fy}–${fy + 1} · Declare investments to optimize TDS. ${status === "draft" ? "Save and submit when ready." : status === "submitted" ? "Submitted to HR for verification." : status === "verified" ? "Verified by HR." : "Rejected — please revise."}`} actions={<div className="flex items-center gap-2"><HrStatus status={status} /><select className={`${hrInputClass} w-auto`} value={regime} onChange={(e) => changeRegime(e.target.value as TaxRegime)}><option value="new">New Tax Regime</option><option value="old">Old Tax Regime</option></select></div>}>
      {regime === "new" && <div className="border-b border-border bg-surface-2 px-5 py-3 text-xs text-muted-foreground">Under the New Tax Regime, most deductions (80C, 80D, HRA, LTA, 24b) are not available. Only the standard deduction of ₹50,000 applies. If you have significant investments, consider the Old Regime.</div>}
      <div className="divide-y divide-border">{sections.map((sec) => {
        const entry = entries.find((e) => e.sectionId === sec.id);
        const val = entry?.declared ?? 0;
        const over = sec.limit && val > sec.limit;
        return <div key={sec.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">{sec.label} <span className="text-xs text-muted-foreground">({sec.section})</span></p><p className="mt-0.5 text-xs text-muted-foreground">{sec.note}</p></div>
          <div className="flex items-center gap-2">
            {sec.limit && <span className="text-xs text-muted-foreground">Limit {hrMoney(sec.limit)}</span>}
            <Input type="number" min={0} max={sec.limit ?? 10000000} disabled={status !== "draft"} value={val || ""} onChange={(e) => updateEntry(sec.id, Number(e.target.value))} className="h-8 w-32 rounded-none text-right" placeholder="₹0" />
            {entry && <HrStatus status={entry.proofStatus} />}
          </div>
          {over && <p className="w-full text-xs text-danger">Exceeds the limit of {hrMoney(sec.limit!)}. The excess won&apos;t reduce your TDS.</p>}
        </div>;
      })}</div>
      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <div><p className="text-sm font-semibold">Total declared: {hrMoney(totalDeclared)}</p><p className="text-xs text-muted-foreground">{regime === "new" ? "Limited benefit under new regime" : "These reduce your taxable income under the old regime"}</p></div>
        {status === "draft" && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => toast.success("Declaration saved as draft")}>Save draft</Button><Button size="sm" onClick={submitDeclaration}>Submit declaration</Button></div>}
        {status === "rejected" && <Button size="sm" onClick={() => setStatus("draft")}>Revise and resubmit</Button>}
      </div>
    </HrPanel>

    <HrPanel title="Investment proof submission" description="Upload proof documents for each declared section. Required during January–February for final TDS computation.">
      <div className="divide-y divide-border">{sections.filter((s) => (entries.find((e) => e.sectionId === s.id)?.declared ?? 0) > 0).map((sec) => {
        const entry = entries.find((e) => e.sectionId === sec.id)!;
        return <div key={sec.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">{sec.label}</p><p className="text-xs text-muted-foreground">Declared: {hrMoney(entry.declared)}</p></div>
          <div className="flex items-center gap-2">
            <Input type="file" accept="image/*,.pdf" disabled={status === "verified"} className="h-8 w-48 rounded-none text-xs" onChange={() => { setEntries((prev) => prev.map((e) => e.sectionId === sec.id ? { ...e, proofUploaded: true, proofStatus: "submitted" } : e)); toast.success(`Proof uploaded for ${sec.label}`); }} />
            <HrStatus status={entry.proofUploaded ? entry.proofStatus : "draft"} />
          </div>
        </div>;
      })}</div>
      {sections.every((s) => (entries.find((e) => e.sectionId === s.id)?.declared ?? 0) === 0) && <div className="p-5"><HrEmpty>No sections have declared amounts. Add amounts above first.</HrEmpty></div>}
    </HrPanel>

    {hr && <HrPanel title="Team declarations" description="Verification queue for all employees' tax declarations this financial year.">
      <HrTable headings={["Employee", "Regime", "Total declared", "Status", "Actions"]}>{hrQueue.map((q) => <tr key={q.empId}>
        <td className={`${hrCell} font-medium`}>{q.empName}</td>
        <td className={hrCell}>{q.regime === "old" ? "Old" : "New"}</td>
        <td className={hrCell}>{hrMoney(q.total)}</td>
        <td className={hrCell}><HrStatus status={q.status} /></td>
        <td className={hrCell}>{q.status === "submitted" && <div className="flex gap-1">
          <Button size="sm" onClick={() => { setHrQueue((prev) => prev.map((item) => item.empId === q.empId ? { ...item, status: "verified" } : item)); toast.success(`${q.empName}'s declaration verified`); }}>Verify</Button>
          <Button size="sm" variant="outline" onClick={() => { setHrQueue((prev) => prev.map((item) => item.empId === q.empId ? { ...item, status: "rejected" } : item)); toast.success(`${q.empName}'s declaration sent back for revision`); }}>Reject</Button>
        </div>}</td>
      </tr>)}</HrTable>
    </HrPanel>}

    <HrPanel title="Tax declaration reference" description="Standard deductions under the Indian Income Tax Act.">
      <div className="divide-y divide-border">{([
        { section: "Standard Deduction", limit: "₹50,000", note: "Available under both tax regimes" },
        { section: "Section 80C", limit: "₹1,50,000", note: "PPF, ELSS, LIC, NSC, home loan principal, tuition fees, Sukanya Samriddhi" },
        { section: "Section 80D", limit: "₹25,000", note: "Medical insurance premium. ₹50,000 for senior citizens. Additional ₹25,000 for parents" },
        { section: "Section 80CCD(1B)", limit: "₹50,000", note: "NPS additional deduction over and above 80C" },
        { section: "HRA Exemption", limit: "As per rules", note: "Min of: actual HRA, 50%/40% of basic, rent paid minus 10% of basic" },
        { section: "LTA", limit: "As per policy", note: "Leave Travel Allowance for domestic travel, twice in a block of 4 years" },
        { section: "Home Loan Interest (24b)", limit: "₹2,00,000", note: "Interest on housing loan under Section 24(b)" },
      ] as const).map((item) => <div key={item.section} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.section}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p></div>
        <span className="whitespace-nowrap text-sm font-semibold">{item.limit}</span>
      </div>)}</div>
      <div className="border-t border-border px-5 py-3"><p className="text-xs text-muted-foreground">Old vs New Tax Regime: Under the New Tax Regime (default from FY 2023-24), most deductions under 80C, 80D, HRA etc. are not available, but tax slabs are lower. Standard deduction of ₹50,000 is available under both regimes.</p></div>
    </HrPanel>
  </>;
}
