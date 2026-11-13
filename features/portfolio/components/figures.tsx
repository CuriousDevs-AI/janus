import type * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/** The two ways the Portfolio shows a number: a tile, and bars side by side for each company. */

const tile = "rounded-xl border border-border bg-surface p-4";
const live = "group block text-left transition-[background-color,border-color,box-shadow] hover:border-accent-border hover:bg-surface-2 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** A figure in a tile. With `href` it opens the page behind the figure; with `onSelect` it filters
 * the page it is on, and `active` says that filter is on. */
export function Kpi({ label, value, detail, delta, href, onSelect, active = false, tone }: { label: string; value: string; detail?: string; delta?: React.ReactNode; href?: string; onSelect?: () => void; active?: boolean; tone?: "danger" }) {
  const body = <>
    <p className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}{(href || onSelect) && <ArrowUpRight aria-hidden className={`size-3.5 shrink-0 transition-opacity ${href ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" : "hidden"}`} />}</p>
    <p className={`mt-2 flex flex-wrap items-baseline gap-2 text-2xl font-semibold tabular-nums ${tone === "danger" && value !== "0" ? "text-danger" : ""}`}>{value}{delta}</p>
    {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
  </>;
  if (href) return <Link href={href} className={`${tile} ${live}`}>{body}</Link>;
  if (onSelect) return <button type="button" aria-pressed={active} onClick={onSelect} className={`${tile} ${live} ${active ? "border-accent bg-accent-muted ring-1 ring-accent" : ""}`}>{body}</button>;
  return <div className={tile}>{body}</div>;
}

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
