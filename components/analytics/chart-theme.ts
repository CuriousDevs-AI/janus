// Shared Recharts styling tokens for the Analytics dashboard.
// Colors map to the product's brand tokens (see app/globals.css) rather than
// Recharts' default rainbow palette. Categorical hues are assigned in a fixed
// order and only used when a chart truly has multiple series/identities;
// single-series charts (the majority here) use the accent alone.

import type { CSSProperties } from "react";

export const CHART_ACCENT = "#2563EB";

// Fixed-order categorical palette — accent, info, warning, success, danger, slate.
export const CHART_CATEGORICAL = ["#2563EB", "#7C3AED", "#D97706", "#16A34A", "#DC2626", "#647085"];

export const CHART_GRID_STROKE = "rgba(10, 20, 36, 0.08)";
export const CHART_AXIS_TICK = { fill: "#647085", fontSize: 11 };
export const CHART_AXIS_LINE = { stroke: "rgba(10, 20, 36, 0.08)" };

export const CHART_TOOLTIP_CONTENT_STYLE: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #E8E1D8",
  borderRadius: 2,
  fontSize: 12,
  padding: "8px 10px",
  boxShadow: "0 18px 48px rgba(10,20,36,0.12)",
};

export const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: "#647085",
  marginBottom: 4,
  fontSize: 11,
};

export const CHART_TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: "#0A1424",
  fontWeight: 500,
};

export const CHART_CURSOR_FILL = "rgba(10, 20, 36, 0.04)";

// Health category → semantic status color, matching lib/status-meta.tsx's
// healthCategoryMeta tones (success / accent / warning / danger / neutral).
export const HEALTH_CATEGORY_COLORS: Record<string, string> = {
  Healthy: "#16A34A",
  Expansion: "#2563EB",
  "At Risk": "#D97706",
  "High Risk": "#DC2626",
  Inactive: "#647085",
};
