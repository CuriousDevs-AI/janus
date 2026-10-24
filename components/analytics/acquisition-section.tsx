"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCrmStats } from "@/lib/use-crm-stats";
import { formatNumber } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

export function AcquisitionSection() {
  const { leadsBySource } = useCrmStats();
  const sorted = [...leadsBySource].sort((a, b) => b.leads - a.leads);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Leads by source</CardTitle>
          <CardDescription>Volume across the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 20, left: 0, bottom: 4 }} barCategoryGap="26%">
              <CartesianGrid stroke={CHART_GRID_STROKE} horizontal={false} />
              <XAxis
                type="number"
                tick={CHART_AXIS_TICK}
                axisLine={CHART_AXIS_LINE}
                tickLine={false}
                tickFormatter={(v) => formatNumber(Number(v))}
              />
              <YAxis type="category" dataKey="source" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={96} />
              <Tooltip
                cursor={{ fill: CHART_CURSOR_FILL }}
                contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                formatter={(value) => formatNumber(Number(value))}
              />
              <Bar dataKey="leads" name="Leads" fill={CHART_ACCENT} radius={[0, 4, 4, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Conversion by source</CardTitle>
          <CardDescription>Lead → won, same window</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Conv.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow key={row.source}>
                  <TableCell className="text-foreground">{row.source}</TableCell>
                  <TableCell className="text-right text-mono text-muted-foreground">{formatNumber(row.leads)}</TableCell>
                  <TableCell className="text-right text-mono text-foreground">{row.conversion}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
