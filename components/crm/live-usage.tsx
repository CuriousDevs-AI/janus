"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { StatTile } from "@/components/shared/stat-tile";
import { useApi } from "@/lib/api/use-api";
import { useSession } from "@/components/auth/session-provider";

type Usage = { id: string; date: string; provider: string; model: string; feature: string; status: "pending" | "succeeded" | "failed"; inputTokens: number | null; outputTokens: number | null; costUsd: string | null; costEstimated: boolean; errorCode: string | null };
type Group = [string, { calls: number; cost: number }];
const usd = (value: number) => `$${value < 1 ? value.toFixed(4) : value.toFixed(2)}`;
const words = (feature: string) => (feature.charAt(0).toUpperCase() + feature.slice(1)).replaceAll("_", " ");
const thisMonthIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);

function grouped(rows: Usage[], key: (row: Usage) => string): Group[] {
  const all: Record<string, { calls: number; cost: number }> = {};
  for (const row of rows) {
    const name = key(row);
    all[name] ??= { calls: 0, cost: 0 };
    all[name].calls += 1;
    all[name].cost += Number(row.costUsd ?? 0);
  }
  return Object.entries(all).sort((a, b) => b[1].cost - a[1].cost);
}

/**
 * What the AI model this company set up has cost, from Janus's own record of each call. Janus rules
 * answers are free and are not here. Costs are in US dollars, as the providers bill them.
 */
export function LiveUsage() {
  const company = useSession().tenant.name;
  const usage = useApi<Usage[]>("/ai/usage?limit=100");
  const rows = usage.data ?? [];
  const month = thisMonthIst();
  const thisMonth = rows.filter((row) => row.date.slice(0, 7) === month);
  const cost = thisMonth.reduce((sum, row) => sum + Number(row.costUsd ?? 0), 0);
  const tokens = thisMonth.reduce((sum, row) => sum + (row.inputTokens ?? 0) + (row.outputTokens ?? 0), 0);
  const failed = thisMonth.filter((row) => row.status === "failed").length;
  const sections: [string, Group[]][] = [["By model", grouped(thisMonth, (row) => `${row.model} · ${row.provider}`)], ["By what it was used for", grouped(thisMonth, (row) => words(row.feature))]];
  return <div className="mx-auto flex max-w-[1200px] flex-col pb-10">
    <PageHeader title="Usage & Cost" description={`What the AI model ${company} set up has cost this month, call by call. Answers with Janus rules are free and are not counted here.`} />
    <div className="flex flex-col gap-5 px-6">
      {usage.loading ? <p className="text-sm text-muted-foreground">Reading usage…</p>
        : usage.error ? <p role="alert" className="text-sm text-danger">{usage.error}</p>
        : !rows.length ? <p className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-muted-foreground">No AI model has been used yet. Janus answers with its own rules for free; set up a model in <Link href="/ai?workspace=business" className="text-accent hover:underline">Janus Intelligence</Link> and each answer it gives is counted here.</p>
        : <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Cost this month" value={usd(cost)} detail={thisMonth.some((row) => row.costEstimated) ? "Some calls are estimated from token counts" : "As the provider bills it"} />
            <StatTile label="AI answers this month" value={String(thisMonth.length)} detail={failed ? `${failed} failed` : "None failed"} />
            <StatTile label="Tokens this month" value={tokens.toLocaleString("en-IN")} detail="Read and written together" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">{sections.map(([title, list]) => <section key={title} className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold">{title}</h2>
            {list.length ? <ul className="mt-2 divide-y divide-border">{list.map(([name, figure]) => <li key={name} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0 truncate">{name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{figure.calls} · {usd(figure.cost)}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Nothing this month.</p>}
          </section>)}</div>
          {rows.length === 100 && <p className="text-xs text-muted-foreground">Showing the latest 100 calls.</p>}
        </>}
    </div>
  </div>;
}
