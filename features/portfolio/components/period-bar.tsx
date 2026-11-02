"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { day } from "@/features/portfolio/lib/format";
import type { PortfolioPeriod, PortfolioPeriodKey } from "@/features/portfolio/types";

const periodNames: [PortfolioPeriodKey, string][] = [["month", "This month"], ["quarter", "This quarter"], ["fy", "This financial year"]];

/** Chooses the period the figures cover, kept in the address so a link opens the same view. */
export function PeriodBar({ period }: { period: PortfolioPeriod }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const choose = (key: PortfolioPeriodKey) => { const next = new URLSearchParams(params.toString()); next.set("period", key); router.replace(`${pathname}?${next.toString()}`); };
  return <div className="flex flex-wrap items-center justify-between gap-3">
    <div role="group" aria-label="Period" className="flex flex-wrap gap-2">{periodNames.map(([key, label]) => <Button key={key} size="sm" variant={period.key === key ? "default" : "outline"} aria-pressed={period.key === key} onClick={() => choose(key)}>{label}</Button>)}</div>
    <p className="text-xs text-muted-foreground">{period.label}: {day(period.start)} to {day(period.end)}, compared with {day(period.previousStart)} to {day(period.previousEnd)}</p>
  </div>;
}
