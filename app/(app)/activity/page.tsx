"use client";

import * as React from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFinanceStore } from "@/lib/stores/finance-store";
import { useOperationsStore } from "@/lib/stores/operations-store";
import { useProjectsStore } from "@/lib/stores/projects-store";
import { useITStore } from "@/lib/stores/it-store";
import { useAppStore } from "@/lib/stores/app-store";

/**
 * Activity (Phase 4): one feed of what changed across the workspaces, read from their audit trails and logs.
 * Entries are shown in the order each workspace recorded them, newest first, and can be filtered by workspace and person.
 */

type Source = "Finance" | "Operations" | "Projects" | "IT" | "CRM & Support";
interface Row { id: string; source: Source; at: string; ts: string; by: string; text: string }

export default function ActivityPage() {
  const financeTrail = useFinanceStore((s) => s.trail);
  const operationsTrail = useOperationsStore((s) => s.trail);
  const projectsTrail = useProjectsStore((s) => s.trail);
  const itLog = useITStore((s) => s.log);
  const crmActivities = useAppStore((s) => s.activities);
  const [source, setSource] = React.useState<"all" | Source>("all");
  const [person, setPerson] = React.useState("all");

  const rows: Row[] = [
    ...financeTrail.map((e) => ({ id: e.id, source: "Finance" as const, at: e.at, ts: e.ts ?? `${e.at}T00:00:00.000Z`, by: e.by, text: e.text })),
    ...operationsTrail.map((e) => ({ id: e.id, source: "Operations" as const, at: e.at, ts: e.ts ?? `${e.at}T00:00:00.000Z`, by: e.by, text: e.text })),
    ...projectsTrail.map((e) => ({ id: e.id, source: "Projects" as const, at: e.at, ts: e.ts ?? `${e.at}T00:00:00.000Z`, by: e.by, text: e.text })),
    ...itLog.map((e) => ({ id: e.id, source: "IT" as const, at: e.at, ts: e.ts ?? `${e.at}T00:00:00.000Z`, by: e.by, text: e.text })),
    ...crmActivities.map((a) => ({ id: a.id, source: "CRM & Support" as const, at: a.createdAt.slice(0, 10), ts: a.createdAt, by: a.actor.type === "human" ? a.actor.userName : a.actor.type === "ai" ? a.actor.agentName : "System", text: a.title })),
  ].sort((a, b) => b.ts.localeCompare(a.ts));

  const people = [...new Set(rows.map((r) => r.by))].sort();
  const visible = rows.filter((r) => (source === "all" || r.source === source) && (person === "all" || r.by === person));

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col">
      <PageHeader title="Activity" description="What changed across the workspaces, with who did it and when." />
      <div className="flex flex-col gap-4 px-6 pb-10">
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">Workspace
            <select aria-label="Workspace filter" className="h-8 rounded-md border border-input bg-surface px-2 text-xs" value={source} onChange={(e) => setSource(e.target.value as "all" | Source)}>
              <option value="all">All</option>
              <option value="Finance">Finance</option>
              <option value="Operations">Operations</option>
              <option value="Projects">Projects</option>
              <option value="IT">IT</option>
              <option value="CRM & Support">CRM &amp; Support</option>
            </select>
          </label>
          <label className="flex items-center gap-2">Person
            <select aria-label="Person filter" className="h-8 rounded-md border border-input bg-surface px-2 text-xs" value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="all">Everyone</option>
              {people.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <Card>
          <CardContent className="grid gap-2 p-4 text-sm">
            {visible.length === 0 ? <p className="text-muted-foreground">Nothing matches these filters.</p> : null}
            {visible.map((r) => (
              <p key={r.id} className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">{r.source}</Badge>
                <span className="text-muted-foreground">{r.ts.slice(0, 16).replace("T", " ")} · {r.by} ·</span>
                <span>{r.text}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
