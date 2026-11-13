"use client";

import * as React from "react";
import { BellOff, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-ui";
import { day, severityName, severityTone } from "@/features/portfolio/lib/format";
import { workFor, workKinds, type WorkKind } from "@/features/portfolio/lib/work";
import { usePreferences } from "@/features/portfolio/lib/preferences";
import type { PortfolioCompany } from "@/features/portfolio/types";
import { fromWork, NotificationDetail, type NoticeItem } from "@/features/portfolio/components/notification-detail";

const DAY = 864e5;

/** Everything that needs someone to act, across the companies, with filters. Snoozing hides an item
 * for a day, on every device; the record in the company is unchanged. */
export function WorkInbox({ list }: { list: PortfolioCompany[] }) {
  const [opened, setOpened] = React.useState<NoticeItem | null>(null);
  const [company, setCompany] = React.useState("all");
  const [kind, setKind] = React.useState<WorkKind | "all">("all");
  const [urgentOnly, setUrgentOnly] = React.useState(false);
  const preferences = usePreferences();
  const snoozed = preferences.value.snoozed;
  // Snoozes that have ended are dropped when the next one is saved.
  const save = (next: Record<string, number>) => { const now = Date.now(); void preferences.save({ ...preferences.value, snoozed: Object.fromEntries(Object.entries(next).filter(([, until]) => until > now)) }); };
  // The moment the page opened: an item snoozed until after it stays hidden.
  const [openedAt] = React.useState(() => Date.now());
  const all = workFor(list);
  const live = all.filter((item) => !(snoozed[item.key] > openedAt));
  const shown = live.filter((item) => (company === "all" || item.company.id === company) && (kind === "all" || item.kind === kind) && (!urgentOnly || item.priority === "high"));
  const kinds = [...new Set(live.map((item) => item.kind))];
  const hidden = all.length - live.length;
  return <>
    <div className="grid grid-cols-3 gap-3">
      <Count label="To do" value={live.length} />
      <Count label="Urgent" value={live.filter((item) => item.priority === "high").length} tone="danger" />
      <Count label="With a due date" value={live.filter((item) => item.due).length} />
    </div>
    <SectionCard title={`${shown.length} ${shown.length === 1 ? "thing" : "things"} to do`} description="Most urgent first. Open one to do it in its company." action={hidden > 0 ? <Button size="sm" variant="ghost" onClick={() => save({})}><RotateCcw className="size-3.5" />Show {hidden} snoozed</Button> : undefined}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select aria-label="Company" className="h-8 rounded-md border border-input bg-surface-2 px-2 text-[13px]" value={company} onChange={(event) => setCompany(event.target.value)}><option value="all">All companies</option>{list.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select aria-label="Kind of work" className="h-8 rounded-md border border-input bg-surface-2 px-2 text-[13px]" value={kind} onChange={(event) => setKind(event.target.value as WorkKind | "all")}><option value="all">Every kind</option>{kinds.map((value) => <option key={value} value={value}>{workKinds[value]}</option>)}</select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={urgentOnly} onChange={() => setUrgentOnly(!urgentOnly)} />Urgent only</label>
      </div>
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">{live.length === 0 ? "Nothing needs doing in any company. Well done." : "Nothing matches these filters."}</p>
        : <ul className="flex flex-col divide-y divide-border">{shown.map((item) => {
          return <li key={item.key} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
            <Badge variant={severityTone[item.priority]}>{severityName[item.priority]}</Badge>
            <div className="min-w-0 flex-1">
              <p className="text-sm"><span className="font-medium">{item.title}</span> <span className="text-muted-foreground">· {item.company.name} · {workKinds[item.kind]}</span></p>
              <p className="text-xs text-muted-foreground">{item.detail}{item.due ? ` Due ${day(item.due)}.` : ""}</p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" aria-label={`Snooze ${item.title} for a day`} title="Hide for a day, in this browser" onClick={() => save({ ...snoozed, [item.key]: Date.now() + DAY })}><BellOff className="size-3.5" /></Button>
              <Button size="sm" variant="secondary" onClick={() => setOpened(fromWork(item))}>Open</Button>
            </div>
          </li>;
        })}</ul>}
    </SectionCard>
    {opened && <NotificationDetail item={opened} read={false} onClose={() => setOpened(null)} />}
  </>;
}

function Count({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return <div className="rounded-xl border border-border bg-surface p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-semibold tabular-nums ${tone === "danger" && value ? "text-danger" : ""}`}>{value}</p></div>;
}
