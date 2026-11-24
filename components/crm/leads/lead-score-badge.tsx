"use client";

import { useApi } from "@/lib/api/use-api";

export function LeadScoreBadge({ leadId }: { leadId: string }) {
  const { data } = useApi<{ score: number }>(`/leads/${leadId}/score`);
  if (!data) return <span className="text-xs text-muted-foreground">—</span>;
  const s = data.score;
  const color = s >= 80 ? "text-success" : s >= 50 ? "text-warning" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${color}`}>
      <span className={`size-1.5 rounded-full ${s >= 80 ? "bg-success" : s >= 50 ? "bg-warning" : "bg-muted-foreground"}`} />
      {s}
    </span>
  );
}
