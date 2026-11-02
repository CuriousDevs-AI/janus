/** The two ways the Portfolio shows a number: a tile, and bars side by side for each company. */

export const Kpi = ({ label, value, detail }: { label: string; value: string; detail: string }) => <div className="rounded-xl border border-border bg-surface p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;

/** Categorical colours in a fixed order, checked for colour-blind separation. A company keeps its
 * colour by its place in the Portfolio, never by its rank in a chart. Past eight, colours repeat
 * and the legend and table carry the names. */
export const palette = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

export function Bars({ rows, format }: { rows: { id: string; label: string; value: number; color: string }[]; format: (value: number) => string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return <ul className="flex flex-col gap-3">{rows.map((row) => <li key={row.id}><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="font-medium">{row.label}</span><span className="tabular-nums text-muted-foreground">{format(row.value)}</span></div><div className="h-2.5 bg-surface-2"><div className="h-2.5" style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, background: row.color }} /></div></li>)}</ul>;
}

/** Says where a figure comes from: recorded in the books, or worked out with an assumption. */
export function Basis({ estimate = false, title }: { estimate?: boolean; title?: string }) {
  return <span title={title ?? (estimate ? "Worked out with an assumption, stated beside it" : "Counted from records in Janus")} className={`ml-1.5 inline-flex items-center rounded border px-1 py-px align-middle text-[10px] font-medium ${estimate ? "border-warning/40 text-warning" : "border-success/40 text-success"}`}>{estimate ? "Estimate" : "Recorded"}</span>;
}
