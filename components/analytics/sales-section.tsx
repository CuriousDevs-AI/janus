"use client";

import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pipelineFunnel, revenueTrend, salesCycleDays, salesLeaderboard } from "@/lib/mock-data";
import { cn, formatCurrencyINR } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CHART_ACCENT,
  CHART_AXIS_LINE,
  CHART_AXIS_TICK,
  CHART_GRID_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
} from "./chart-theme";

function PipelineFunnel() {
  const baseline = pipelineFunnel[0]?.count || 1;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="w-24 shrink-0">Stage</span>
        <span className="flex-1">Volume</span>
        <span className="w-12 shrink-0 text-right">Count</span>
        <span className="w-20 shrink-0 text-right">Value</span>
        <span className="w-14 shrink-0 text-right">Conv.</span>
      </div>
      {pipelineFunnel.map((stage) => {
        const pct = Math.max(4, Math.round((stage.count / baseline) * 100));
        return (
          <div key={stage.stage} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-[12.5px] text-foreground">{stage.stage}</span>
            <div className="h-6 flex-1 overflow-hidden rounded-md bg-surface-2">
              <div
                className={cn("h-full rounded-md", stage.stage === "Won" ? "bg-success/70" : "bg-accent/70")}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-mono text-[12px] text-foreground">{stage.count}</span>
            <span className="w-20 shrink-0 text-right text-mono text-[12px] text-muted-foreground">
              {formatCurrencyINR(stage.value ?? 0)}
            </span>
            <span className="w-14 shrink-0 text-right text-mono text-[12px] text-muted-foreground">{stage.conversion}%</span>
          </div>
        );
      })}
    </div>
  );
}

export function SalesSection() {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Pipeline funnel</CardTitle>
          <CardDescription>New → Won, count and value by stage</CardDescription>
        </CardHeader>
        <CardContent>
          <PipelineFunnel />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Revenue trend</CardTitle>
            <CardDescription>Closed-won revenue, last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={revenueTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_ACCENT} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={CHART_ACCENT} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
                <XAxis dataKey="date" tick={CHART_AXIS_TICK} axisLine={CHART_AXIS_LINE} tickLine={false} />
                <YAxis
                  tick={CHART_AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(v) => formatCurrencyINR(Number(v))}
                />
                <Tooltip
                  cursor={{ stroke: CHART_GRID_STROKE, strokeWidth: 1 }}
                  contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                  formatter={(value) => formatCurrencyINR(Number(value))}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Revenue"
                  stroke={CHART_ACCENT}
                  strokeWidth={2}
                  fill="url(#revenueFill)"
                  dot={{ r: 3, fill: CHART_ACCENT, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: CHART_ACCENT, stroke: "#ffffff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales cycle</CardTitle>
            <CardDescription>Avg. days to close</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={salesCycleDays} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
                <XAxis dataKey="date" tick={CHART_AXIS_TICK} axisLine={CHART_AXIS_LINE} tickLine={false} />
                <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  cursor={{ stroke: CHART_GRID_STROKE, strokeWidth: 1 }}
                  contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                  formatter={(value) => `${value} days`}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Cycle time"
                  stroke={CHART_ACCENT}
                  strokeWidth={2}
                  dot={{ r: 3, fill: CHART_ACCENT, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: CHART_ACCENT, stroke: "#ffffff", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sales leaderboard</CardTitle>
          <CardDescription>By rep, last 30 days</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rep</TableHead>
                <TableHead className="text-right">Deals</TableHead>
                <TableHead className="text-right">Won</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Conversion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesLeaderboard.map((rep) => (
                <TableRow key={rep.name}>
                  <TableCell className="font-medium text-foreground">{rep.name}</TableCell>
                  <TableCell className="text-right text-mono text-muted-foreground">{rep.deals}</TableCell>
                  <TableCell className="text-right text-mono text-muted-foreground">{rep.won}</TableCell>
                  <TableCell className="text-right text-mono text-foreground">{formatCurrencyINR(rep.value)}</TableCell>
                  <TableCell className="text-right text-mono text-foreground">{rep.conversion}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
