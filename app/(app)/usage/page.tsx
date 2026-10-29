"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Area,
  AreaChart,
} from "recharts";
import {
  costSummary,
  usageRecords,
  costByCategory,
  costByDay,
  getAgentById,
  tenant,
} from "@/lib/mock-data";
import type { UsageRecord } from "@/lib/types";
import { automationTriggerMeta } from "@/lib/status-meta";
import { demoMode } from "@/lib/demo-mode";
import { useAppStore } from "@/lib/stores/app-store";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrencyINR, formatNumber } from "@/lib/utils";

const CATEGORY_ORDER: UsageRecord["category"][] = ["llm", "embedding", "voice", "whatsapp", "email"];

const CATEGORY_META: Record<UsageRecord["category"], { label: string; color: string }> = {
  llm: { label: "LLM", color: "#2563EB" },
  embedding: { label: "Embeddings", color: "#D97706" },
  voice: { label: "Voice", color: "#DC2626" },
  whatsapp: { label: "WhatsApp", color: "#7C3AED" },
  email: { label: "Email", color: "#16A34A" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

interface Grouped {
  key: string;
  label: string;
  cost: number;
}

function groupByCost(records: UsageRecord[], keyFn: (r: UsageRecord) => string, labelFn: (key: string) => string): Grouped[] {
  const map = new Map<string, number>();
  for (const r of records) {
    const k = keyFn(r);
    map.set(k, (map.get(k) ?? 0) + r.cost);
  }
  return Array.from(map.entries())
    .map(([key, cost]) => ({ key, label: labelFn(key), cost }))
    .sort((a, b) => b.cost - a.cost);
}

const PER_RUN_COST = 9; // illustrative ₹ / automation run — not separately metered elsewhere on this page

export default function UsagePage() {
  const automations = useAppStore((s) => s.automations);
  const rawCategoryData = costByCategory();
  const categoryData = CATEGORY_ORDER.map((cat) => {
    const found = rawCategoryData.find((r) => r.category === cat);
    return { category: cat, label: CATEGORY_META[cat].label, color: CATEGORY_META[cat].color, cost: found?.cost ?? 0 };
  });
  const categoryTotal = categoryData.reduce((sum, c) => sum + c.cost, 0);

  const dayData = costByDay().map((d) => ({ ...d, label: shortDate(d.date) }));

  const byAgent = groupByCost(
    usageRecords,
    (r) => r.agentId ?? "unattributed",
    (key) => (key === "unattributed" ? "Platform (unattributed)" : getAgentById(key)?.name ?? key)
  );
  const byModel = groupByCost(
    usageRecords,
    (r) => r.model,
    (key) => key
  );

  const workflowRows = automations
    .map((a) => ({ id: a.id, name: a.name, trigger: a.trigger, runs30d: a.runs30d, cost: a.runs30d * PER_RUN_COST }))
    .sort((a, b) => b.cost - a.cost);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <PageHeader
        title="Usage & Cost"
        description={demoMode ? `${tenant.name} · ${tenant.plan} plan — this workspace only` : `${tenant.name} · no AI usage recorded yet`}
      />

      <div className="flex flex-col gap-6 px-6 pb-8">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Total this month" value={formatCurrencyINR(costSummary.totalThisMonth)} />
          <MetricCard label="Cost per lead" value={formatCurrencyINR(costSummary.costPerLead)} />
          <MetricCard label="Cost per conversation" value={formatCurrencyINR(costSummary.costPerConversation)} />
          <MetricCard label="Cost per resolved ticket" value={formatCurrencyINR(costSummary.costPerResolvedTicket)} />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="rounded-lg border border-border bg-surface p-4 lg:col-span-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cost by category · last 7 days</p>
              <span className="text-mono text-[12px] text-muted-foreground">{formatCurrencyINR(categoryTotal)} total</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(10,20,36,0.08)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#647085", fontSize: 11 }} axisLine={{ stroke: "rgba(10,20,36,0.08)" }} tickLine={false} />
                <YAxis
                  tick={{ fill: "#647085", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(v: number) => formatCurrencyINR(v)}
                />
                <Tooltip
                  cursor={{ fill: "rgba(10,20,36,0.04)" }}
                  contentStyle={{ background: "#ffffff", border: "1px solid rgba(10,20,36,0.14)", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#0A1424", marginBottom: 4 }}
                  itemStyle={{ color: "#0A1424" }}
                  formatter={(value) => [formatCurrencyINR(Number(value)), "Cost"]}
                />
                <Bar dataKey="cost" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {categoryData.map((d) => (
                    <Cell key={d.category} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4 lg:col-span-2">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Breakdown</p>
            <div className="flex flex-col gap-2.5">
              {categoryData.map((d) => (
                <div key={d.category} className="flex items-center gap-2.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="flex-1 text-[12.5px] text-foreground">{d.label}</span>
                  <span className="text-mono text-[12px] text-muted-foreground">
                    {categoryTotal > 0 ? Math.round((d.cost / categoryTotal) * 100) : 0}%
                  </span>
                  <span className="text-mono w-16 shrink-0 text-right text-[12.5px] font-medium text-foreground">
                    {formatCurrencyINR(d.cost)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cost trend · last 7 days</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dayData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="usageTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(10,20,36,0.08)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#647085", fontSize: 11 }} axisLine={{ stroke: "rgba(10,20,36,0.08)" }} tickLine={false} />
              <YAxis
                tick={{ fill: "#647085", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={52}
                tickFormatter={(v: number) => formatCurrencyINR(v)}
              />
              <Tooltip
                cursor={{ stroke: "rgba(10,20,36,0.14)" }}
                contentStyle={{ background: "#ffffff", border: "1px solid rgba(10,20,36,0.14)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#0A1424", marginBottom: 4 }}
                itemStyle={{ color: "#0A1424" }}
                formatter={(value) => [formatCurrencyINR(Number(value)), "Cost"]}
              />
              <Area type="monotone" dataKey="cost" stroke="#2563EB" strokeWidth={2} fill="url(#usageTrendFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface">
            <p className="border-b border-border px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cost by agent · last 7 days
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byAgent.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="text-foreground">{row.label}</TableCell>
                    <TableCell className="text-mono text-right font-medium text-foreground">{formatCurrencyINR(row.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-lg border border-border bg-surface">
            <p className="border-b border-border px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cost by model · last 7 days
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byModel.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="text-mono text-foreground">{row.label}</TableCell>
                    <TableCell className="text-mono text-right font-medium text-foreground">{formatCurrencyINR(row.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cost by workflow (illustrative)</p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              Approximate — {formatCurrencyINR(PER_RUN_COST)} per automation run, an illustrative proxy only. Not separately metered from the
              LLM/channel costs above.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Automation</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead className="text-right">Runs (30d)</TableHead>
                <TableHead className="text-right">Est. cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflowRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-foreground">{row.name}</TableCell>
                  <TableCell className="text-muted-foreground">{automationTriggerMeta[row.trigger]}</TableCell>
                  <TableCell className="text-mono text-right text-muted-foreground">{formatNumber(row.runs30d)}</TableCell>
                  <TableCell className="text-mono text-right font-medium text-foreground">{formatCurrencyINR(row.cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  );
}
