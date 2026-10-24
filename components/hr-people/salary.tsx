"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { buildPayslip, downloadHrFile, payslipText, type HrPayslip } from "@/lib/hr-payroll";
import { HrExpensesView } from "@/components/hr-people/expenses";
import { PayslipDialog, type Line } from "@/components/hr-people/payroll";
import { HrEmpty, HrPanel, HrStats, HrStatus, HrTable, downloadHrCsv, hrCell, hrInputClass, hrMoney, hrToday } from "@/components/hr-people/operations-ui";
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
  const [tab, setTab] = React.useState<"payslips" | "ytd" | "reimbursements">(params.get("tab") === "reimbursements" ? "reimbursements" : "payslips");
  const employee = employees.find((item) => item.id === actorId);
  const latest = payrollRuns[0] ? payrollRuns[0].id.replace(/^pay-/, "") : hrToday().slice(0, 7);
  const first = payrollRuns[payrollRuns.length - 1] ? payrollRuns[payrollRuns.length - 1].id.replace(/^pay-/, "") : latest;
  const years = [...new Set([fyOf(`${latest}-01`), fyOf(`${first}-01`), fyOf(hrToday())])].sort((a, b) => b - a);
  const [fy, setFy] = React.useState(years[0]);
  const [open, setOpen] = React.useState<Line | null>(null);
  if (!employee) return <HrPanel title="Salary"><HrEmpty>This account is not linked to an employee record.</HrEmpty></HrPanel>;

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
    <div role="tablist" aria-label="Salary" className="flex w-fit gap-1 border border-border bg-surface-2 p-1">{([["payslips", "Payslips"], ["ytd", "Year to date"], ["reimbursements", "Reimbursements"]] as const).map(([key, label]) => <button key={key} id={`sal-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="sal-panel" onClick={() => setTab(key)} className={`px-5 py-2 text-sm ${tab === key ? "bg-accent text-white" : "text-muted-foreground"}`}>{label}</button>)}</div>
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
        <p className="text-xs text-muted-foreground">Figures from payroll. Statutory PF, ESI and TDS aren&apos;t calculated, so this isn&apos;t a tax statement.</p>
      </>}
      {tab === "reimbursements" && <HrExpensesView role={role} actorId={actorId} personal />}
    </div>
    {open && <PayslipDialog line={open} published onClose={() => setOpen(null)} />}
  </div>;
}
