"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useCrmStats } from "@/lib/use-crm-stats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  HEALTH_CATEGORY_COLORS,
} from "./chart-theme";

export function CustomerSection() {
  const { customerHealthDistribution } = useCrmStats();
  const total = customerHealthDistribution.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer health distribution</CardTitle>
        <CardDescription>{total} customers across health categories</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-center">
          <div className="relative h-56 w-56 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={customerHealthDistribution}
                  dataKey="count"
                  nameKey="category"
                  innerRadius={62}
                  outerRadius={94}
                  paddingAngle={2}
                  stroke="#ffffff"
                  strokeWidth={2}
                >
                  {customerHealthDistribution.map((entry) => (
                    <Cell key={entry.category} fill={HEALTH_CATEGORY_COLORS[entry.category] ?? "#647085"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                  formatter={(value) => `${value} customers`}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-mono text-[26px] font-semibold leading-none text-foreground">{total}</span>
              <span className="text-[11px] text-muted-foreground">customers</span>
            </div>
          </div>
          <div className="flex w-full flex-1 flex-col gap-2">
            {customerHealthDistribution.map((d) => (
              <div
                key={d.category}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2"
              >
                <span className="flex items-center gap-2 text-[13px] text-foreground">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: HEALTH_CATEGORY_COLORS[d.category] ?? "#647085" }}
                  />
                  {d.category}
                </span>
                <span className="text-mono text-[12px] text-muted-foreground">
                  {d.count} · {Math.round((d.count / total) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
