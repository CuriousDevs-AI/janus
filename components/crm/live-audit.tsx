"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { FilterChips } from "@/components/shared/stat-tile";
import { useApi } from "@/lib/api/use-api";

type Area = "sign-in" | "sales" | "money" | "people" | "workflows" | "settings" | "support" | "other";
type AuditEvent = { id: string; at: string; area: Area; what: string; action: string; who: string | null; ip: string | null };

const areas: { value: Area | "all"; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "sign-in", label: "Sign-ins" },
  { value: "sales", label: "Sales" },
  { value: "money", label: "Money" },
  { value: "people", label: "People & access" },
  { value: "workflows", label: "Workflows" },
  { value: "support", label: "Support" },
  { value: "settings", label: "Settings" },
];
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Who changed what in this company, from its own audit trail, newest first. */
export function LiveAuditLog() {
  const [area, setArea] = React.useState<Area | "all">("all");
  const [before, setBefore] = React.useState<string[]>([]);
  const cursor = before.at(-1);
  const events = useApi<AuditEvent[]>(`/audit/events?limit=50${area === "all" ? "" : `&area=${area}`}${cursor ? `&before=${cursor}` : ""}`);
  const rows = events.data ?? [];
  const failed = rows.filter((row) => row.action === "auth.login_failed").length;
  const last = rows.at(-1);
  return <div className="mx-auto flex max-w-[1200px] flex-col pb-10">
    <PageHeader title="Audit Logs" description="Who changed what in this company, newest first: sign-ins, sales, money, people and access, workflows and settings. Page views and session refreshes are left out." />
    <div className="flex flex-col gap-4 px-6">
      <FilterChips<Area | "all"> label="Area" value={area} options={areas} onChange={(value) => { setArea(value); setBefore([]); }} />
      {failed > 0 && <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">{failed} failed sign-in{failed === 1 ? "" : "s"} on this page. If you do not recognise them, change your password and sign out other devices in My account.</p>}
      {events.loading ? <p className="text-sm text-muted-foreground">Reading the audit trail…</p>
        : events.error ? <p role="alert" className="text-sm text-danger">{events.error}</p>
        : !rows.length ? <p className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-muted-foreground">Nothing recorded {area === "all" ? "yet" : "in this area yet"}.</p>
        : <><div className="hidden rounded-lg border border-border sm:block"><table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-surface-2 text-left text-[10px] uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2.5">When</th><th className="px-3 py-2.5">Who</th><th className="px-3 py-2.5">What</th><th className="px-3 py-2.5">Area</th><th className="px-3 py-2.5">From</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className="border-b border-border last:border-0">
            <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{when(row.at)}</td>
            <td className="px-3 py-2.5">{row.who ?? <span className="text-muted-foreground">Janus</span>}</td>
            <td className={`px-3 py-2.5 ${row.action === "auth.login_failed" ? "text-warning" : ""}`}>{row.what}</td>
            <td className="px-3 py-2.5 text-xs text-muted-foreground">{areas.find((item) => item.value === row.area)?.label ?? "Other"}</td>
            <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.ip ?? "—"}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="flex flex-col gap-2 sm:hidden">{rows.map((row) => <div key={row.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><span className="font-medium">{row.who ?? "Janus"}</span><span className="text-xs text-muted-foreground">{when(row.at)}</span></div>
          <p className={`mt-1 ${row.action === "auth.login_failed" ? "text-warning" : "text-foreground"}`}>{row.what}</p>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground"><span>{areas.find((item) => item.value === row.area)?.label ?? "Other"}</span>{row.ip && <span>From {row.ip}</span>}</div>
        </div>)}</div></>}
      <div className="flex gap-2">
        {before.length > 0 && <Button size="sm" variant="secondary" onClick={() => setBefore((list) => list.slice(0, -1))}>Newer</Button>}
        {rows.length === 50 && last && <Button size="sm" variant="secondary" onClick={() => setBefore((list) => [...list, last.id])}>Older</Button>}
      </div>
    </div>
  </div>;
}
