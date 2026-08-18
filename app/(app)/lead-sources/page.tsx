"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Radio, Plus } from "lucide-react";
import { leadSourceConnections, availableLeadSources } from "@/lib/mock-data";
import { leadSourceMeta } from "@/lib/status-meta";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, formatNumber } from "@/lib/utils";
import { IngestionPipeline } from "@/components/lead-sources/ingestion-pipeline";
import { SourceStatusBadge, connectionKindMeta } from "@/components/lead-sources/source-meta";

export default function LeadSourcesPage() {
  const router = useRouter();
  const [connectedExtras, setConnectedExtras] = React.useState<string[]>([]);
  const totalCaptured = leadSourceConnections.reduce((sum, s) => sum + s.leadsCaptured30d, 0);

  function connectExtra(id: string, name: string) {
    setConnectedExtras((prev) => [...prev, id]);
    toast.success(`Connected ${name}`, { description: "New leads from this source will start appearing shortly." });
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <PageHeader
        title="Lead Sources"
        description={`${leadSourceConnections.length} connected · ${formatNumber(totalCaptured)} leads captured in the last 30 days`}
        actions={
          <Button size="sm" onClick={() => toast("Point any system at a webhook or the REST API to add a custom source.")}>
            <Plus className="size-3.5" />
            Add source
          </Button>
        }
      />

      <div className="flex flex-col gap-6 px-6 pb-6">
        <div className="flex flex-col gap-2 border border-border bg-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">How ingestion works</p>
          <p className="max-w-2xl text-[12.5px] text-muted-foreground">
            Every lead source normalizes into one internal event format, then Janus resolves identity — the same
            person arriving through different channels becomes one profile instead of duplicates.
          </p>
          <IngestionPipeline className="mt-1" />
        </div>

        <section className="flex flex-col gap-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Connected ({leadSourceConnections.length})
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {leadSourceConnections.map((source) => {
              const meta = leadSourceMeta[source.source];
              const Icon = meta.icon;
              const kindMeta = connectionKindMeta[source.connectionKind];
              return (
                <div
                  key={source.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/lead-sources/${source.id}`)}
                  onKeyDown={(e) => e.key === "Enter" && router.push(`/lead-sources/${source.id}`)}
                  className="group flex cursor-pointer flex-col gap-3 border border-border bg-surface p-4 transition-colors hover:border-border-strong"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center border border-border bg-surface-2">
                        <Icon className="size-4 text-muted-foreground" />
                      </span>
                      <div>
                        <p className="text-[13.5px] font-semibold text-foreground group-hover:text-accent">{source.name}</p>
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <kindMeta.icon className="size-3" />
                          {kindMeta.label}
                        </p>
                      </div>
                    </div>
                    <SourceStatusBadge status={source.status} />
                  </div>
                  <p className="line-clamp-2 text-[12px] text-muted-foreground">{source.description}</p>
                  <div className="mt-auto grid grid-cols-2 gap-2 border border-border bg-surface-2 px-3 py-2 text-[11.5px]">
                    <div>
                      <p className="text-muted-foreground">Leads (30d)</p>
                      <p className="text-mono font-medium text-foreground">{formatNumber(source.leadsCaptured30d)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Last event</p>
                      <p className="text-foreground">{source.lastEventAt ? formatRelativeTime(source.lastEventAt) : "—"}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">More sources</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {availableLeadSources.map((source) => {
              const isConnected = connectedExtras.includes(source.id);
              const kindMeta = connectionKindMeta[source.connectionKind];
              return (
                <div key={source.id} className="flex flex-col gap-3 border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center border border-border bg-surface-2">
                        <Radio className="size-4 text-muted-foreground" />
                      </span>
                      <div>
                        <p className="text-[13.5px] font-semibold text-foreground">{source.name}</p>
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <kindMeta.icon className="size-3" />
                          {kindMeta.label}
                        </p>
                      </div>
                    </div>
                    <SourceStatusBadge status={isConnected ? "connected" : "available"} />
                  </div>
                  <p className="text-[12px] text-muted-foreground">{source.description}</p>
                  <Button
                    size="sm"
                    variant={isConnected ? "secondary" : "default"}
                    disabled={isConnected}
                    className="mt-auto"
                    onClick={() => connectExtra(source.id, source.name)}
                  >
                    {isConnected ? "Connected" : "Connect"}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
