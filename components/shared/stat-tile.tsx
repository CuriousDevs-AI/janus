import type * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const tile = "rounded-md border border-border bg-surface p-4";
const live = "group block text-left transition-[background-color,border-color,box-shadow] hover:border-accent-border hover:bg-surface-2 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** A figure on a workspace overview. With `href` it opens the list behind the figure, already
 * filtered to it; with `onSelect` it filters the page it is on, and `active` says that filter is on. */
export function StatTile({ label, value, detail, href, onSelect, active = false, tone }: { label: string; value: string; detail?: string; href?: string; onSelect?: () => void; active?: boolean; tone?: "warning" }) {
  const body = <>
    <p className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}{href && <ArrowUpRight aria-hidden className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />}</p>
    <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === "warning" ? "text-amber-700 dark:text-amber-400" : ""}`}>{value}</p>
    {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
  </>;
  if (href) return <Link href={href} className={`${tile} ${live}`}>{body}</Link>;
  if (onSelect) return <button type="button" aria-pressed={active} onClick={onSelect} className={`${tile} ${live} ${active ? "border-accent bg-accent-muted ring-1 ring-accent" : ""}`}>{body}</button>;
  return <div className={tile}>{body}</div>;
}

/** A row of chips that narrow a list, each with how many it would show. */
export function FilterChips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; count?: number; tone?: "warning" }[]; onChange: (value: T) => void }) {
  return <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">{options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}
    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${value === option.value ? "border-accent bg-accent-muted text-accent" : "border-border hover:bg-surface-2"}`}>
    {option.label}{option.count !== undefined && <span className={`ml-1 tabular-nums ${option.tone === "warning" && option.count > 0 && value !== option.value ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>{option.count}</span>}
  </button>)}</div>;
}

/** The address of a view inside a workspace, with the workspace kept so the sidebar stays on it. */
export const workspaceHref = (workspace: string, view: string, extra: Record<string, string> = {}) =>
  `/workspace/${workspace}?${new URLSearchParams({ view, workspace, ...extra }).toString()}`;

/** Ignore a row click that landed on something the row holds that does its own thing. */
export const rowClick = (event: React.MouseEvent, open: () => void) => {
  if ((event.target as HTMLElement).closest("a,button,input,select,textarea,label")) return;
  open();
};
