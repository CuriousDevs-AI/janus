"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { canManageHr } from "@/lib/hr-people-access";
import { HrEmpty, HrPanel, HrStats, HrStatus, HrTable, hrCell, hrMoney, hrDate, hrToday, downloadHrCsv } from "@/components/hr-people/operations-ui";
import type { HrDemoRole } from "@/lib/types";

const tabs = ["pf", "esi", "pt", "tds"] as const;
type Tab = (typeof tabs)[number];
const tabLabels: Record<Tab, string> = { pf: "Provident Fund", esi: "ESI", pt: "Professional Tax", tds: "TDS" };
const monthLabel = (key: string) => new Date(`${key}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const round = (v: number) => Math.round(v);

const PF_EMPLOYEE = 0.12;
const PF_EMPLOYER_SHARE = 0.0367;
const EPS_SHARE = 0.0833;
const EDLI_RATE = 0.005;
const ADMIN_RATE = 0.005;
const ESI_EMPLOYEE = 0.0075;
const ESI_EMPLOYER = 0.0325;
const ESI_CEILING = 21000;
const PT_SLAB_MH = 10000;
const PT_AMOUNT_MH = 200;

interface FilingEntry { id: string; label: string; type: Tab | "pt"; dueDate: string; status: "filed" | "due" | "overdue" }

function filingCalendar(today: string): FilingEntry[] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const curr = today.slice(0, 7);
  const pf15 = `${curr}-15`;
  const esi15 = `${curr}-15`;
  const tds7 = `${curr}-07`;
  const qEnd = m <= 3 ? `${y}-04-30` : m <= 6 ? `${y}-07-31` : m <= 9 ? `${y}-10-31` : `${y + 1}-01-31`;
  return [
    { id: "pf", label: `PF – ${monthLabel(prev)}`, type: "pf", dueDate: pf15, status: pf15 < today ? "filed" : pf15 === today ? "due" : "due" },
    { id: "esi", label: `ESI – ${monthLabel(prev)}`, type: "esi", dueDate: esi15, status: esi15 < today ? "filed" : "due" },
    { id: "tds", label: `TDS – ${monthLabel(prev)}`, type: "tds", dueDate: tds7, status: tds7 < today ? "filed" : "due" },
    { id: "pt", label: `PT – Q${Math.ceil(m / 3)}`, type: "pt", dueDate: qEnd, status: qEnd < today ? "filed" : "due" },
  ];
}

function seedUan(index: number) { return `1012${String(34567890 + index).padStart(8, "0")}`; }
function seedIp(index: number) { return `MH/${String(2700000 + index)}`; }

export function HrStatutoryView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees } = useHrPeopleStore();
  const [tab, setTab] = React.useState<Tab>("pf");
  const today = hrToday();
  const month = today.slice(0, 7);
  const manager = canManageHr(role);
  const active = employees.filter((e) => e.status !== "archived" && e.status !== "onboarding" && e.salaryMonthly > 0);

  const pfRows = active.map((e, i) => {
    const basic = round(e.salaryMonthly * 0.4);
    const empPf = round(basic * PF_EMPLOYEE);
    const emplrPf = round(basic * PF_EMPLOYER_SHARE);
    const eps = round(basic * EPS_SHARE);
    const edli = round(basic * EDLI_RATE);
    const admin = round(basic * ADMIN_RATE);
    return { id: e.id, name: e.name, basic, empPf, emplrPf, eps, edli, admin, total: empPf + emplrPf + eps + edli + admin, uan: seedUan(i) };
  });
  const pfTotal = pfRows.reduce((s, r) => ({ empPf: s.empPf + r.empPf, emplrPf: s.emplrPf + r.emplrPf, eps: s.eps + r.eps, edli: s.edli + r.edli, admin: s.admin + r.admin, total: s.total + r.total }), { empPf: 0, emplrPf: 0, eps: 0, edli: 0, admin: 0, total: 0 });

  const esiRows = active.filter((e) => e.salaryMonthly <= ESI_CEILING).map((e, i) => {
    const empEsi = round(e.salaryMonthly * ESI_EMPLOYEE);
    const emplrEsi = round(e.salaryMonthly * ESI_EMPLOYER);
    return { id: e.id, name: e.name, gross: e.salaryMonthly, empEsi, emplrEsi, total: empEsi + emplrEsi, ip: seedIp(i) };
  });
  const esiTotal = esiRows.reduce((s, r) => ({ empEsi: s.empEsi + r.empEsi, emplrEsi: s.emplrEsi + r.emplrEsi, total: s.total + r.total }), { empEsi: 0, emplrEsi: 0, total: 0 });

  const ptRows = active.map((e) => {
    const pt = e.salaryMonthly > PT_SLAB_MH ? PT_AMOUNT_MH : 0;
    return { id: e.id, name: e.name, gross: e.salaryMonthly, pt, state: "Maharashtra" };
  });
  const ptTotal = ptRows.reduce((s, r) => s + r.pt, 0);
  const ptQuarterly = ptTotal * 3;

  const tdsRows = active.map((e) => {
    const annual = e.salaryMonthly * 12;
    const stdDeduction = 50000;
    const taxable = Math.max(0, annual - stdDeduction);
    let tax = 0;
    const slabs = [[300000, 0], [300000, 0.05], [300000, 0.10], [300000, 0.15], [300000, 0.20], [Infinity, 0.30]];
    let remaining = taxable;
    for (const [width, rate] of slabs) { const chunk = Math.min(remaining, width); tax += chunk * rate; remaining -= chunk; if (remaining <= 0) break; }
    if (annual <= 700000) tax = 0;
    const cess = round(tax * 0.04);
    const monthlyTds = round((tax + cess) / 12);
    return { id: e.id, name: e.name, annual, taxable, annualTax: round(tax + cess), monthlyTds };
  });
  const tdsMonthly = tdsRows.reduce((s, r) => s + r.monthlyTds, 0);
  const tdsAnnual = tdsRows.reduce((s, r) => s + r.annualTax, 0);

  const filings = filingCalendar(today);
  const complianceScore = Math.round((filings.filter((f) => f.status === "filed").length / filings.length) * 100);

  function exportEcr() {
    downloadHrCsv(`ecr-${month}.csv`, [["UAN", "Member Name", "Gross Wages", "EPF Wages", "EPS Wages", "EDLI Wages", "EPF Contribution (EE)", "EPS Contribution (ER)", "EPF Contribution (ER)", "NCP Days", "Refund"], ...pfRows.map((r) => [r.uan, r.name, r.basic, r.basic, r.basic, r.basic, r.empPf, r.eps, r.emplrPf, 0, 0])]);
  }
  function exportEsi() {
    downloadHrCsv(`esi-return-${month}.csv`, [["IP Number", "Name", "No of Days", "Total Wages", "IP Contribution", "Reason"], ...esiRows.map((r) => [r.ip, r.name, 30, r.gross, r.empEsi, ""])]);
  }

  return <div className="space-y-5">
    <HrStats items={[
      { label: "PF liability", value: hrMoney(pfTotal.total), hint: `${pfRows.length} employees · ${monthLabel(month)}` },
      { label: "ESI liability", value: hrMoney(esiTotal.total), hint: `${esiRows.length} eligible (gross ≤ ${hrMoney(ESI_CEILING)})` },
      { label: "TDS this month", value: hrMoney(tdsMonthly), hint: `Annual est. ${hrMoney(tdsAnnual)}` },
      { label: "Compliance", value: `${complianceScore}%`, hint: `${filings.filter((f) => f.status === "filed").length}/${filings.length} filings on time` },
    ]} />

    <HrPanel title="Filing calendar" description="Statutory due dates for the current period. Mark filings as done after submitting to the government portal.">
      <div className="divide-y divide-border">{filings.map((f) => <div key={f.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
        <div><p className="font-medium">{f.label}</p><p className="text-xs text-muted-foreground">Due {hrDate(f.dueDate)}</p></div>
        <HrStatus status={f.status} />
      </div>)}</div>
    </HrPanel>

    <div className="flex gap-1 border-b border-border">{tabs.map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium ${tab === t ? "border-b-2 border-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{tabLabels[t]}</button>)}</div>

    {tab === "pf" && <HrPanel title="Provident Fund" description="Employee PF 12% of Basic. Employer: PF 3.67%, EPS 8.33%, EDLI 0.5%, Admin 0.5% of Basic. Basic assumed at 40% of CTC." actions={manager ? <Button size="sm" variant="outline" onClick={exportEcr}><Download className="mr-1 size-3.5" />ECR file</Button> : undefined}>
      {pfRows.length ? <HrTable headings={["Employee", "UAN", "Basic/DA", "EE PF (12%)", "ER PF (3.67%)", "EPS (8.33%)", "EDLI", "Admin", "Total"]}>
        {pfRows.map((r) => <tr key={r.id}><td className={hrCell}>{r.name}</td><td className={`${hrCell} font-mono text-xs`}>{r.uan}</td><td className={hrCell}>{hrMoney(r.basic)}</td><td className={hrCell}>{hrMoney(r.empPf)}</td><td className={hrCell}>{hrMoney(r.emplrPf)}</td><td className={hrCell}>{hrMoney(r.eps)}</td><td className={hrCell}>{hrMoney(r.edli)}</td><td className={hrCell}>{hrMoney(r.admin)}</td><td className={`${hrCell} font-medium`}>{hrMoney(r.total)}</td></tr>)}
        <tr className="bg-surface-2 font-medium"><td className={hrCell}>Total ({pfRows.length})</td><td className={hrCell} /><td className={hrCell} /><td className={hrCell}>{hrMoney(pfTotal.empPf)}</td><td className={hrCell}>{hrMoney(pfTotal.emplrPf)}</td><td className={hrCell}>{hrMoney(pfTotal.eps)}</td><td className={hrCell}>{hrMoney(pfTotal.edli)}</td><td className={hrCell}>{hrMoney(pfTotal.admin)}</td><td className={hrCell}>{hrMoney(pfTotal.total)}</td></tr>
      </HrTable> : <HrEmpty>No active employees with salary records.</HrEmpty>}
      <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Challan amount for {monthLabel(month)}: <strong className="text-foreground">{hrMoney(pfTotal.total)}</strong>. Upload the ECR file to the EPFO Unified Portal.</div>
    </HrPanel>}

    {tab === "esi" && <HrPanel title="ESI Contributions" description="ESI applies to employees earning ≤ ₹21,000/month. Employee 0.75%, Employer 3.25%." actions={manager ? <Button size="sm" variant="outline" onClick={exportEsi}><Download className="mr-1 size-3.5" />ESI return</Button> : undefined}>
      {esiRows.length ? <HrTable headings={["Employee", "IP Number", "Gross", "EE ESI (0.75%)", "ER ESI (3.25%)", "Total"]}>
        {esiRows.map((r) => <tr key={r.id}><td className={hrCell}>{r.name}</td><td className={`${hrCell} font-mono text-xs`}>{r.ip}</td><td className={hrCell}>{hrMoney(r.gross)}</td><td className={hrCell}>{hrMoney(r.empEsi)}</td><td className={hrCell}>{hrMoney(r.emplrEsi)}</td><td className={`${hrCell} font-medium`}>{hrMoney(r.total)}</td></tr>)}
        <tr className="bg-surface-2 font-medium"><td className={hrCell}>Total ({esiRows.length})</td><td className={hrCell} /><td className={hrCell} /><td className={hrCell}>{hrMoney(esiTotal.empEsi)}</td><td className={hrCell}>{hrMoney(esiTotal.emplrEsi)}</td><td className={hrCell}>{hrMoney(esiTotal.total)}</td></tr>
      </HrTable> : <HrEmpty>No employees eligible for ESI (all earn above ₹21,000/month).</HrEmpty>}
      <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Challan amount: <strong className="text-foreground">{hrMoney(esiTotal.total)}</strong>. File on the ESIC portal by the 15th of next month.</div>
    </HrPanel>}

    {tab === "pt" && <HrPanel title="Professional Tax" description="Maharashtra slab: ₹200/month for salary above ₹10,000. PT is filed quarterly.">
      {ptRows.length ? <HrTable headings={["Employee", "Gross Salary", "State", "Monthly PT"]}>
        {ptRows.map((r) => <tr key={r.id}><td className={hrCell}>{r.name}</td><td className={hrCell}>{hrMoney(r.gross)}</td><td className={hrCell}>{r.state}</td><td className={`${hrCell} font-medium`}>{r.pt ? hrMoney(r.pt) : "—"}</td></tr>)}
        <tr className="bg-surface-2 font-medium"><td className={hrCell}>Total ({ptRows.filter((r) => r.pt > 0).length} liable)</td><td className={hrCell} /><td className={hrCell} /><td className={hrCell}>{hrMoney(ptTotal)}</td></tr>
      </HrTable> : <HrEmpty>No active employees.</HrEmpty>}
      <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Monthly PT: <strong className="text-foreground">{hrMoney(ptTotal)}</strong> · Quarterly return: <strong className="text-foreground">{hrMoney(ptQuarterly)}</strong>. File with the state tax authority.</div>
    </HrPanel>}

    {tab === "tds" && <HrPanel title="TDS (Tax Deducted at Source)" description="New tax regime FY 2025-26. Standard deduction ₹50,000. Rebate u/s 87A up to ₹7L. 4% health & education cess.">
      {tdsRows.length ? <HrTable headings={["Employee", "Annual CTC", "Taxable Income", "Annual Tax + Cess", "Monthly TDS"]}>
        {tdsRows.map((r) => <tr key={r.id}><td className={hrCell}>{r.name}</td><td className={hrCell}>{hrMoney(r.annual)}</td><td className={hrCell}>{hrMoney(r.taxable)}</td><td className={hrCell}>{hrMoney(r.annualTax)}</td><td className={`${hrCell} font-medium`}>{r.monthlyTds ? hrMoney(r.monthlyTds) : "Nil"}</td></tr>)}
        <tr className="bg-surface-2 font-medium"><td className={hrCell}>Total</td><td className={hrCell} /><td className={hrCell} /><td className={hrCell}>{hrMoney(tdsAnnual)}</td><td className={hrCell}>{hrMoney(tdsMonthly)}</td></tr>
      </HrTable> : <HrEmpty>No active employees.</HrEmpty>}
      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">Monthly TDS deposit: <strong className="text-foreground">{hrMoney(tdsMonthly)}</strong>. Due by 7th of next month.</p>
        <div className="mt-3"><p className="mb-2 text-xs font-semibold">Form 24Q quarterly summary</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Q1 (Apr–Jun)", round(tdsMonthly * 3)], ["Q2 (Jul–Sep)", round(tdsMonthly * 3)], ["Q3 (Oct–Dec)", round(tdsMonthly * 3)], ["Q4 (Jan–Mar)", round(tdsMonthly * 3)]].map(([q, amt]) => <div key={String(q)} className="border border-border p-3"><p className="text-xs text-muted-foreground">{String(q)}</p><p className="mt-1 text-sm font-semibold">{hrMoney(Number(amt))}</p></div>)}</div>
        </div>
      </div>
    </HrPanel>}
  </div>;
}
