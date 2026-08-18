"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supportMetrics, ticketVolumeTrend } from "@/lib/mock-data";
import { formatNumber } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CHART_ACCENT,
  CHART_AXIS_LINE,
  CHART_AXIS_TICK,
  CHART_CURSOR_FILL,
  CHART_GRID_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
} from "./chart-theme";

export function SupportSection() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="First Response" value={`${supportMetrics.firstResponseMinutes}m`} />
        <MetricCard label="Resolution Time" value={`${supportMetrics.resolutionHours}h`} />
        <MetricCard label="SLA Breaches (30d)" value={String(supportMetrics.slaBreaches30d)} />
        <MetricCard label="AI Resolution" value={`${supportMetrics.aiResolutionRate}%`} />
        <MetricCard label="Human Resolution" value={`${supportMetrics.humanResolutionRate}%`} />
        <MetricCard label="CSAT" value={`${supportMetrics.csat}/5`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ticket volume</CardTitle>
          <CardDescription>By day, last 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ticketVolumeTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="32%">
              <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
              <XAxis dataKey="date" tick={CHART_AXIS_TICK} axisLine={CHART_AXIS_LINE} tickLine={false} />
              <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: CHART_CURSOR_FILL }}
                contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                formatter={(value) => `${formatNumber(Number(value))} tickets`}
              />
              <Bar dataKey="value" name="Tickets" fill={CHART_ACCENT} radius={[4, 4, 0, 0]} barSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
