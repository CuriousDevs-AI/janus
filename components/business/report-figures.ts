/**
 * What a Business Report shows. The figures come from the API (GET /business/reports/figures),
 * which reads them from the company's own records for the page and for scheduled emails alike, so
 * the two never disagree. A report the records cannot fill has no figures, never made-up ones.
 */

/** One line of a Business Report: the figure now, and for the period before where there is one. */
export type ReportRow = { label: string; value: string; before?: string | null; change?: string | null; href?: string | null; warn?: boolean };
/** What a report shows: its lines, what they cover, and a note on what they leave out. */
export type ReportFigures = { rows: ReportRow[]; covers: "period" | "now" | "month"; note?: string | null };
/** GET /business/reports/figures: every report the records fill, for one period. */
export type ReportFiguresOut = { readable: boolean; period: { label: string } | null; figures: Record<string, ReportFigures> };

/** Reports the company's records can fill; the others need work the API does not do yet. */
export const reportsFromRecords = new Set(["sales-summary", "sales-pipeline", "lead-sources", "profit-loss", "cash-flow", "receivables-aging", "expenses", "gst-summary", "headcount", "attendance-leave", "payroll-cost", "tickets-sla", "stock-levels", "project-status"]);

export const periodWords = { month: "This month", quarter: "This quarter", fy: "This financial year" } as const;
export type ReportPeriod = keyof typeof periodWords;
