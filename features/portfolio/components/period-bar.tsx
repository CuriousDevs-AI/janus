"use client";

import { Button } from "@/components/ui/button";
import { day } from "@/features/portfolio/lib/format";
import type { PortfolioPeriod, PortfolioPeriodKey } from "@/features/portfolio/types";

const periodNames: [PortfolioPeriodKey, string][] = [["month", "This month"], ["quarter", "This quarter"], ["fy", "This financial year"]];

/** Chooses the period the figures cover, kept in the address so a link opens the same view. */
export function PeriodBar({ period, chosen, updating = false }: { period: PortfolioPeriod; chosen: PortfolioPeriodKey; updating?: boolean }) {
  // The address changes in place (the browser's own history), so the button and the dimmed
  // figures follow the click at once instead of after a round trip to the server.
  const choose = (key: PortfolioPeriodKey) => { const next = new URLSearchParams(window.location.search); next.set("period", key); window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`); };
  return <div className="flex flex-wrap items-center justify-between gap-3">
    <div role="group" aria-label="Period" className="flex flex-wrap gap-2">{periodNames.map(([key, label]) => <Button key={key} size="sm" variant={chosen === key ? "default" : "outline"} aria-pressed={chosen === key} onClick={() => choose(key)}>{label}</Button>)}</div>
    <p className="text-xs text-muted-foreground" aria-live="polite">{updating ? "Updating the figures…" : `${period.label}: ${day(period.start)} to ${day(period.end)}, compared with ${day(period.previousStart)} to ${day(period.previousEnd)}`}</p>
  </div>;
}
