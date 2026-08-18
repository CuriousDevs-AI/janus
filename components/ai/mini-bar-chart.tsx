"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Single-series magnitude chart — one accent hue per the design system's
// bar spec (thin bars, rounded top, hairline recessive gridlines, no
// legend needed since there's only one series).
const BAR_COLOR = "#2563EB";
const GRID_COLOR = "rgba(10, 20, 36, 0.08)";
const AXIS_TEXT_COLOR = "#647085";

export function MiniBarChart({ data }: { data: { label: string; value: number }[] }) {
  return (
    <div className="h-[150px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis
            dataKey="label"
            tick={{ fill: AXIS_TEXT_COLOR, fontSize: 10 }}
            axisLine={{ stroke: GRID_COLOR }}
            tickLine={false}
            interval={0}
          />
          <YAxis tick={{ fill: AXIS_TEXT_COLOR, fontSize: 10 }} axisLine={false} tickLine={false} width={34} />
          <Tooltip
            cursor={{ fill: "rgba(10, 20, 36, 0.04)" }}
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #E8E1D8",
              borderRadius: 2,
              fontSize: 12,
              padding: "6px 10px",
              boxShadow: "0 18px 48px rgba(10,20,36,0.12)",
            }}
            labelStyle={{ color: AXIS_TEXT_COLOR, marginBottom: 2 }}
            itemStyle={{ color: "#0A1424" }}
          />
          <Bar dataKey="value" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
