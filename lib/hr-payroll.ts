import type { HrEmployee } from "@/lib/types";
import { activeCompany } from "@/lib/company";
import { employeeStateInsurance, monthlyIncomeTax, professionalTax, providentFund } from "@/lib/hr-statutory";

export const payrollMonths = ["2026-10", "2026-09", "2026-08", "2026-07"];
export interface HrPayslip {
  id: string; employeeId: string; employeeName: string; month: string; label: string;
  status: "published" | "review"; paidDays: number; totalDays: number;
  earnings: { label: string; amount: number }[]; deductions: { label: string; amount: number }[];
  gross: number; totalDeductions: number; net: number; paidAt: string | null;
  bankLast4: string; paymentReference: string | null;
}

/** The monthly pay in force for a month, using the revision history when there is one. */
export function salaryFor(employee: HrEmployee, month: string) {
  const history = [...(employee.salaryHistory ?? [])].sort((a, b) => a.from.localeCompare(b.from));
  if (!history.length) return employee.salaryMonthly;
  const applicable = history.filter((item) => item.from <= `${month}-01`);
  return applicable.length ? applicable[applicable.length - 1].salaryMonthly : history[0].salaryMonthly;
}

/** A month's payslip. Earnings follow a fixed split of pay; deductions follow India's rules in lib/hr-statutory.ts. */
export function buildPayslip(employee: HrEmployee, month: string): HrPayslip | null {
  const date = /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T12:00:00`) : new Date(`1 ${month}`);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear(), index = date.getMonth();
  const key = `${year}-${String(index + 1).padStart(2, "0")}`;
  const totalDays = new Date(year, index + 1, 0).getDate();
  const salary = salaryFor(employee, key);
  if (employee.joiningDate > `${key}-${totalDays}` || salary <= 0) return null;
  const paidDays = employee.joiningDate.startsWith(key) ? totalDays - Number(employee.joiningDate.slice(8)) + 1 : totalDays;
  const fixed = Math.round(salary * paidDays / totalDays);
  const basic = Math.round(fixed * 0.5), housing = Math.round(fixed * 0.2);
  const variable = employee.id === "emp-004" ? (key === "2026-10" ? 6500 : 3000) : 0;
  const earnings = [{ label: "Basic salary", amount: basic }, { label: "House rent allowance", amount: housing }, { label: "Special allowance", amount: fixed - basic - housing }, ...(variable ? [{ label: "Approved sales incentive", amount: variable }] : [])];
  const gross0 = earnings.reduce((sum, item) => sum + item.amount, 0);
  const deductions = [
    { label: "Provident fund (12% of basic, up to ₹15,000)", amount: providentFund(basic) },
    { label: "Employee state insurance (0.75%)", amount: employeeStateInsurance(gross0) },
    { label: "Professional tax", amount: professionalTax(employee.branch, gross0, key) },
    { label: "Income tax (TDS, new regime)", amount: monthlyIncomeTax(salary * 12 + variable * 12) },
  ].filter((item) => item.amount > 0);
  const gross = earnings.reduce((s, i) => s + i.amount, 0), totalDeductions = deductions.reduce((s, i) => s + i.amount, 0);
  const published = key < "2026-10";
  return { id: `slip-${employee.id}-${key}`, employeeId: employee.id, employeeName: employee.name, month: key, label: date.toLocaleDateString("en-IN", { month: "long", year: "numeric" }), status: published ? "published" : "review", paidDays, totalDays, earnings, deductions, gross, totalDeductions, net: gross - totalDeductions, paidAt: published ? `${key}-${totalDays}` : null, bankLast4: employee.id === "emp-006" ? "Pending" : "4821", paymentReference: published ? `DEMO-${key.replace("-", "")}-${employee.id}` : null };
}

export function payslipText(slip: HrPayslip, employee: HrEmployee) {
  return [`JANUS · ${activeCompany().name.toUpperCase()} · PAYSLIP`, "Deductions follow the current India rules. Confirm special cases with your accountant.", "", slip.label, `${employee.name} · ${employee.id.toUpperCase()}`, `${employee.title} · ${employee.department} · ${employee.branch}`, `Paid days: ${slip.paidDays}/${slip.totalDays}`, "", "EARNINGS", ...slip.earnings.map(i => `${i.label}: INR ${i.amount.toLocaleString("en-IN")}`), "", "DEDUCTIONS", ...slip.deductions.map(i => `${i.label}: INR ${i.amount.toLocaleString("en-IN")}`), "", `Gross: INR ${slip.gross}`, `Deductions: INR ${slip.totalDeductions}`, `Net pay: INR ${slip.net}`, `Status: ${slip.status}`, `Payment reference: ${slip.paymentReference ?? "Not released"}`].join("\n");
}

export function downloadHrFile(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
