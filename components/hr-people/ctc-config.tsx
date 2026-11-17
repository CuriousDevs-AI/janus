"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { canManageHr } from "@/lib/hr-people-access";
import { HrEmpty, HrField, HrPanel, HrStats, HrTable, hrCell, hrInputClass, hrMoney } from "@/components/hr-people/operations-ui";
import type { HrDemoRole } from "@/lib/types";

interface CtcComponent { label: string; pctOfCtc?: number; pctOfBasic?: number; fixed?: number; employer?: boolean; capped?: number }

interface Template { id: string; name: string; basicPct: number; hraPct: number; metro: boolean; components: CtcComponent[] }

function makeTemplate(id: string, name: string, basicPct: number, metro: boolean): Template {
  const hraPct = metro ? 50 : 40;
  return { id, name, basicPct, hraPct, metro, components: [
    { label: "Basic", pctOfCtc: basicPct },
    { label: "HRA", pctOfBasic: hraPct },
    { label: "Special Allowance" },
    { label: "Employer PF", pctOfBasic: 12, employer: true, capped: 1800 },
    { label: "Employer ESI (if eligible)", pctOfCtc: 3.25, employer: true },
    { label: "Gratuity", pctOfBasic: 4.81, employer: true },
    { label: "Professional Tax", fixed: 200 },
  ] };
}

const defaultTemplates: Template[] = [
  makeTemplate("standard", "Standard (40% Basic, Metro)", 40, true),
  makeTemplate("aggressive", "Aggressive (50% Basic, Metro)", 50, true),
  makeTemplate("non-metro", "Standard (40% Basic, Non-Metro)", 40, false),
];

function breakup(annualCtc: number, tpl: Template) {
  const monthly = annualCtc / 12;
  const basic = Math.round(monthly * tpl.basicPct / 100);
  const hra = Math.round(basic * tpl.hraPct / 100);
  const pf = Math.min(Math.round(basic * 12 / 100), 1800);
  const esiEligible = monthly < 21000;
  const esi = esiEligible ? Math.round(monthly * 3.25 / 100) : 0;
  const gratuity = Math.round(basic * 4.81 / 100);
  const pt = 200;
  const employerCost = pf + esi + gratuity;
  const special = Math.max(0, Math.round(monthly - basic - hra - employerCost - pt));
  const gross = basic + hra + special;
  const employeePf = pf;
  const employeeEsi = esiEligible ? Math.round(monthly * 0.75 / 100) : 0;
  const totalDeductions = employeePf + employeeEsi + pt;
  const net = gross - totalDeductions;
  const taxableAnnual = Math.max(0, (basic + hra + special) * 12 - 50000);
  const tds = estimateTds(taxableAnnual);
  const netAfterTds = Math.round(net - tds / 12);

  const rows = [
    { label: "Basic", monthly: basic, annual: basic * 12, type: "earning" as const },
    { label: "HRA", monthly: hra, annual: hra * 12, type: "earning" as const },
    { label: "Special Allowance", monthly: special, annual: special * 12, type: "earning" as const },
    { label: "Gross Salary", monthly: gross, annual: gross * 12, type: "subtotal" as const },
    { label: "Employee PF", monthly: employeePf, annual: employeePf * 12, type: "deduction" as const },
    { label: "Employee ESI", monthly: employeeEsi, annual: employeeEsi * 12, type: "deduction" as const },
    { label: "Professional Tax", monthly: pt, annual: pt * 12, type: "deduction" as const },
    { label: "Est. TDS (New Regime)", monthly: Math.round(tds / 12), annual: tds, type: "deduction" as const },
    { label: "Net Take-Home (est.)", monthly: netAfterTds, annual: netAfterTds * 12, type: "net" as const },
    { label: "Employer PF", monthly: pf, annual: pf * 12, type: "employer" as const },
    { label: "Employer ESI", monthly: esi, annual: esi * 12, type: "employer" as const },
    { label: "Gratuity", monthly: gratuity, annual: gratuity * 12, type: "employer" as const },
    { label: "Total CTC", monthly: Math.round(monthly), annual: annualCtc, type: "total" as const },
  ];
  return { rows, net, netAfterTds, gross, employerCost };
}

function estimateTds(taxable: number): number {
  const slabs = [[300000, 0], [300000, 5], [300000, 10], [300000, 15], [300000, 20], [Infinity, 30]] as const;
  let remaining = taxable, tax = 0;
  for (const [width, rate] of slabs) {
    const chunk = Math.min(remaining, width);
    tax += chunk * rate / 100;
    remaining -= chunk;
    if (remaining <= 0) break;
  }
  return Math.round(tax);
}

export function HrCtcConfigView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees } = useHrPeopleStore();
  const hr = canManageHr(role);
  const active = employees.filter((e) => e.status !== "archived" && e.salaryMonthly > 0);
  const ctcs = active.map((e) => e.salaryMonthly * 12);
  const avg = ctcs.length ? Math.round(ctcs.reduce((a, b) => a + b, 0) / ctcs.length) : 0;
  const sorted = [...ctcs].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const totalPayroll = ctcs.reduce((a, b) => a + b, 0);

  const [tplId, setTplId] = React.useState("standard");
  const [ctcInput, setCtcInput] = React.useState("1200000");
  const [hikeEmpId, setHikeEmpId] = React.useState(active[0]?.id ?? "");
  const [hikePct, setHikePct] = React.useState("15");

  const tpl = defaultTemplates.find((t) => t.id === tplId) ?? defaultTemplates[0];
  const annualCtc = Number(ctcInput) || 0;
  const result = breakup(annualCtc, tpl);

  const hikeEmp = employees.find((e) => e.id === hikeEmpId);
  const oldCtc = hikeEmp ? hikeEmp.salaryMonthly * 12 : 0;
  const newCtc = Math.round(oldCtc * (1 + (Number(hikePct) || 0) / 100));
  const oldBreak = breakup(oldCtc, tpl);
  const newBreak = breakup(newCtc, tpl);

  return <div className="space-y-5">
    <HrStats items={[
      { label: "Average CTC", value: hrMoney(avg), hint: `${active.length} employees` },
      { label: "Median CTC", value: hrMoney(median), hint: "Annual" },
      { label: "CTC Range", value: sorted.length ? `${hrMoney(sorted[0])} – ${hrMoney(sorted[sorted.length - 1])}` : "—", hint: "Min to max" },
      { label: "Total Annual Payroll", value: hrMoney(totalPayroll), hint: "CTC sum" },
    ]} />

    <HrPanel title="CTC Calculator" description="Enter an annual CTC to see the monthly breakup under a salary template." actions={<div className="flex flex-wrap items-center gap-2">
      <select className={`${hrInputClass} w-auto`} value={tplId} onChange={(e) => setTplId(e.target.value)}>{defaultTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <Input type="number" min={100000} step={50000} value={ctcInput} onChange={(e) => setCtcInput(e.target.value)} className="h-9 w-40 rounded-none text-right" placeholder="Annual CTC" />
    </div>}>
      {annualCtc > 0 ? <HrTable headings={["Component", "Monthly", "Annual", ""]}>
        {result.rows.map((row) => <tr key={row.label} className={row.type === "subtotal" || row.type === "total" || row.type === "net" ? "bg-surface-2 font-semibold" : ""}>
          <td className={hrCell}>
            <span className={row.type === "employer" ? "text-muted-foreground" : ""}>{row.label}</span>
            {row.type === "employer" && <Badge variant="neutral" className="ml-2 text-[10px]">Employer</Badge>}
            {row.type === "deduction" && <Badge variant="warning" className="ml-2 text-[10px]">Deduction</Badge>}
          </td>
          <td className={`${hrCell} text-right tabular-nums`}>{hrMoney(row.monthly)}</td>
          <td className={`${hrCell} text-right tabular-nums`}>{hrMoney(row.annual)}</td>
          <td className={hrCell}>{row.type === "net" ? <Badge variant="success">Take-home</Badge> : row.type === "total" ? <Badge variant="accent">CTC</Badge> : null}</td>
        </tr>)}
      </HrTable> : <HrEmpty>Enter an annual CTC above to see the breakup.</HrEmpty>}
    </HrPanel>

    <HrPanel title="Salary Structure Templates" description="Predefined structures that determine how CTC splits into components. Employer PF is capped at ₹1,800/month. ESI applies if gross is under ₹21,000/month.">
      <div className="grid gap-4 p-5 md:grid-cols-3">{defaultTemplates.map((t) => <div key={t.id} className={`border p-4 ${t.id === tplId ? "border-accent bg-accent-muted" : "border-border"}`}>
        <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{t.name}</p>{t.id === tplId && <Badge variant="accent">Active</Badge>}</div>
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          <li>Basic: {t.basicPct}% of CTC</li>
          <li>HRA: {t.hraPct}% of Basic ({t.metro ? "Metro" : "Non-metro"})</li>
          <li>Employer PF: 12% of Basic (cap ₹1,800)</li>
          <li>Gratuity: 4.81% of Basic</li>
          <li>PT: ₹200/month</li>
        </ul>
        <Button size="sm" variant={t.id === tplId ? "default" : "outline"} className="mt-3" onClick={() => setTplId(t.id)}>{t.id === tplId ? "Selected" : "Use this"}</Button>
      </div>)}</div>
    </HrPanel>

    {hr && active.length > 0 && <HrPanel title="Increment Simulator" description="Compare old and new CTC side by side. Select an employee and enter a hike percentage." actions={<div className="flex flex-wrap items-center gap-2">
      <select className={`${hrInputClass} w-auto`} value={hikeEmpId} onChange={(e) => setHikeEmpId(e.target.value)}>{active.map((e) => <option key={e.id} value={e.id}>{e.name} — {hrMoney(e.salaryMonthly * 12)}</option>)}</select>
      <div className="flex items-center gap-1"><Input type="number" min={0} max={100} value={hikePct} onChange={(e) => setHikePct(e.target.value)} className="h-9 w-20 rounded-none text-right" /><span className="text-sm text-muted-foreground">% hike</span></div>
    </div>}>
      {hikeEmp ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-border bg-surface-2"><tr><th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Component</th><th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Old (Monthly)</th><th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">New (Monthly)</th><th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Diff</th></tr></thead>
        <tbody className="divide-y divide-border">{oldBreak.rows.map((old, i) => {
          const nw = newBreak.rows[i];
          const diff = nw.monthly - old.monthly;
          const bold = old.type === "subtotal" || old.type === "total" || old.type === "net";
          return <tr key={old.label} className={bold ? "bg-surface-2 font-semibold" : ""}>
            <td className={hrCell}>{old.label}</td>
            <td className={`${hrCell} text-right tabular-nums`}>{hrMoney(old.monthly)}</td>
            <td className={`${hrCell} text-right tabular-nums`}>{hrMoney(nw.monthly)}</td>
            <td className={`${hrCell} text-right tabular-nums ${diff > 0 ? "text-success" : diff < 0 ? "text-danger" : "text-muted-foreground"}`}>{diff > 0 ? "+" : ""}{hrMoney(diff)}</td>
          </tr>;
        })}</tbody></table></div> : <HrEmpty>Select an employee to simulate.</HrEmpty>}
      {hikeEmp && <div className="flex flex-wrap items-center gap-6 border-t border-border px-5 py-3 text-sm">
        <div><span className="text-muted-foreground">Old CTC:</span> <span className="font-semibold">{hrMoney(oldCtc)}</span></div>
        <div><span className="text-muted-foreground">New CTC:</span> <span className="font-semibold text-accent">{hrMoney(newCtc)}</span></div>
        <div><span className="text-muted-foreground">Increment:</span> <span className="font-semibold text-success">+{hrMoney(newCtc - oldCtc)} ({hikePct}%)</span></div>
        <div><span className="text-muted-foreground">New take-home (est.):</span> <span className="font-semibold">{hrMoney(newBreak.netAfterTds)}/mo</span></div>
      </div>}
    </HrPanel>}
  </div>;
}
