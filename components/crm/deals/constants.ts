export const BG_MAP: Record<string, string> = {
  "bg-slate-500": "bg-slate-50 dark:bg-slate-950/30", "bg-blue-500": "bg-blue-50 dark:bg-blue-950/30",
  "bg-cyan-500": "bg-cyan-50 dark:bg-cyan-950/30", "bg-indigo-500": "bg-indigo-50 dark:bg-indigo-950/30",
  "bg-amber-500": "bg-amber-50 dark:bg-amber-950/30", "bg-orange-500": "bg-orange-50 dark:bg-orange-950/30",
  "bg-purple-500": "bg-purple-50 dark:bg-purple-950/30", "bg-pink-500": "bg-pink-50 dark:bg-pink-950/30",
  "bg-teal-500": "bg-teal-50 dark:bg-teal-950/30", "bg-lime-500": "bg-lime-50 dark:bg-lime-950/30",
  "bg-fuchsia-500": "bg-fuchsia-50 dark:bg-fuchsia-950/30", "bg-sky-500": "bg-sky-50 dark:bg-sky-950/30",
  "bg-emerald-500": "bg-emerald-50 dark:bg-emerald-950/30", "bg-red-500": "bg-red-50 dark:bg-red-950/30",
};
export const BORDER_MAP: Record<string, string> = {
  "bg-slate-500": "border-slate-200 dark:border-slate-800", "bg-blue-500": "border-blue-200 dark:border-blue-800",
  "bg-cyan-500": "border-cyan-200 dark:border-cyan-800", "bg-indigo-500": "border-indigo-200 dark:border-indigo-800",
  "bg-amber-500": "border-amber-200 dark:border-amber-800", "bg-orange-500": "border-orange-200 dark:border-orange-800",
  "bg-purple-500": "border-purple-200 dark:border-purple-800", "bg-pink-500": "border-pink-200 dark:border-pink-800",
  "bg-teal-500": "border-teal-200 dark:border-teal-800", "bg-lime-500": "border-lime-200 dark:border-lime-800",
  "bg-fuchsia-500": "border-fuchsia-200 dark:border-fuchsia-800", "bg-sky-500": "border-sky-200 dark:border-sky-800",
  "bg-emerald-500": "border-emerald-200 dark:border-emerald-800", "bg-red-500": "border-red-200 dark:border-red-800",
};
export function columnBg(color: string) { return BG_MAP[color] ?? "bg-muted/30"; }
export function columnBorder(color: string) { return BORDER_MAP[color] ?? "border-border"; }
