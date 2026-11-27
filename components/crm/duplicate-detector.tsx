"use client";

import { useState } from "react";
import { GitMerge, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { DuplicateGroup } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ENTITY_TYPES = ["contact", "lead"] as const;

export function DuplicateDetector() {
  const [entityType, setEntityType] = useState<"contact" | "lead">("contact");
  const groups = useApi<DuplicateGroup[]>(`/duplicates/${entityType}`);
  const [busy, setBusy] = useState<string | null>(null);

  const pending = (groups.data ?? []).filter((g) => g.status === "pending");

  async function merge(groupId: string, winnerId: string) {
    setBusy(groupId);
    try {
      await api(`/duplicates/${groupId}/merge`, {
        method: "POST",
        body: JSON.stringify({ winnerId }),
      });
      toast.success("Records merged");
      groups.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(null);
    }
  }

  async function dismiss(groupId: string) {
    setBusy(groupId);
    try {
      await api(`/duplicates/${groupId}/dismiss`, { method: "POST" });
      toast.success("Duplicate dismissed");
      groups.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {ENTITY_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setEntityType(t)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                entityType === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-2 text-muted-foreground hover:bg-surface-3",
              )}
            >
              {t === "contact" ? "customers" : `${t}s`}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => groups.reload()}>
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      {groups.error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {groups.error}
        </p>
      )}

      {pending.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No duplicate {entityType}s detected.
        </p>
      ) : (
        <div className="space-y-3">
          {pending.map((g) => (
            <div key={g.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Match: {g.matchField}
                  </span>
                  <p className="mt-0.5 text-sm font-semibold">{g.matchValue}</p>
                </div>
                <Badge variant="neutral">{g.entityIds.length} records</Badge>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {(g.entities?.length ? g.entities : g.entityIds.map((id) => ({ id, name: `#${id}`, phone: null, email: null, company: null, leadCount: 0 }))).map((entity) => (
                  <div
                    key={entity.id}
                    className="flex items-center gap-3 rounded border border-border bg-surface-2 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium">{entity.name}</span>
                      <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                        {entity.phone && <span>{entity.phone}</span>}
                        {entity.email && <span>{entity.email}</span>}
                        {entity.company && <span>{entity.company}</span>}
                        {entity.leadCount > 0 && (
                          <span>{entity.leadCount} lead{entity.leadCount === 1 ? "" : "s"}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 shrink-0 px-2 text-[10px]"
                      disabled={busy === g.id}
                      onClick={() => merge(g.id, entity.id)}
                    >
                      <GitMerge className="size-3 mr-0.5" /> Keep this
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  disabled={busy === g.id}
                  onClick={() => dismiss(g.id)}
                >
                  <XCircle className="size-3.5" /> Not duplicates
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
