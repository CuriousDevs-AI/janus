/**
 * India payroll deductions for one month, from the rules in force for FY 2025-26.
 * Provident fund, ESI, professional tax and income tax (new regime). It is a calculation, not tax advice:
 * a company with special cases (older regime, other states, exemptions) should have an accountant confirm the figures.
 */
export const PF_RATE = 0.12;
/** Provident fund is worked out on basic pay up to this monthly ceiling. */
export const PF_WAGE_CEILING = 15000;
export const ESI_EMPLOYEE_RATE = 0.0075;
/** ESI applies while monthly gross is at or below this. */
export const ESI_GROSS_LIMIT = 21000;
const STANDARD_DEDUCTION = 75000;
const REBATE_LIMIT = 1200000;
const CESS = 0.04;
/** New-regime slabs: tax on each band between the previous limit and this one. */
const SLABS: [number, number][] = [[400000, 0], [800000, 0.05], [1200000, 0.1], [1600000, 0.15], [2000000, 0.2], [2400000, 0.25], [Infinity, 0.3]];

export const providentFund = (basic: number) => Math.round(Math.min(basic, PF_WAGE_CEILING) * PF_RATE);
export const employeeStateInsurance = (gross: number) => gross > 0 && gross <= ESI_GROSS_LIMIT ? Math.ceil(gross * ESI_EMPLOYEE_RATE) : 0;

/** Professional tax is charged by the state, so it follows the branch. Branches without one pay nothing. */
export function professionalTax(branch: string, gross: number, month: string) {
  const place = branch.toLowerCase();
  if (/bengaluru|bangalore|mysuru|mangaluru|hubballi/.test(place)) return gross >= 25000 ? 200 : 0;
  if (/pune|mumbai|nagpur/.test(place)) return gross > 10000 ? (month.endsWith("-02") ? 300 : 200) : gross > 7500 ? 175 : 0;
  return 0;
}

/** Yearly income tax under the new regime, after the standard deduction, the 87A rebate and 4% cess. */
export function annualIncomeTax(annualGross: number) {
  const taxable = Math.max(0, annualGross - STANDARD_DEDUCTION);
  let tax = 0;
  let from = 0;
  for (const [limit, rate] of SLABS) {
    if (taxable > from) tax += (Math.min(taxable, limit) - from) * rate;
    from = limit;
  }
  // Up to ₹12 lakh there is no tax; just above it the tax cannot exceed the income over the limit.
  if (taxable <= REBATE_LIMIT) tax = 0;
  else tax = Math.min(tax, taxable - REBATE_LIMIT);
  return Math.round(tax * (1 + CESS));
}

/** Tax deducted at source this month: a twelfth of the year's tax on the pay in force. */
export const monthlyIncomeTax = (annualGross: number) => Math.round(annualIncomeTax(annualGross) / 12);
