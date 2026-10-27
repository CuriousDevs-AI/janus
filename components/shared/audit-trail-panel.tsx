"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrailEntry } from "@/lib/stores/audit-trail";

/** The latest changes in one workspace, with who made them and when. */
export function TrailPanel({ entries }: { entries: TrailEntry[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Audit trail</CardTitle></CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {entries.length === 0 ? <p className="text-muted-foreground">No changes yet. Money, stock and approval changes appear here.</p> : null}
        {entries.slice(0, 15).map((entry) => (
          <p key={entry.id}><span className="text-muted-foreground">{entry.at} · {entry.by} · </span>{entry.text}</p>
        ))}
      </CardContent>
    </Card>
  );
}
