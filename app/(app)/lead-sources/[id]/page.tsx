"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useApi } from "@/lib/api/use-api";
import type { IngestEvent, Preset, Source } from "@/lib/api/types";
import { ConnectionForm } from "@/components/lead-sources/connection-form";
import { SourceTools, EventList } from "@/components/lead-sources/source-tools";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Detail key={id} id={id} />;
}
function Detail({ id }: { id: string }) {
  const source = useApi<Source>(`/sources/${encodeURIComponent(id)}`);
  const presets = useApi<Preset[]>("/sources/presets");
  const [after, setAfter] = useState("0");
  const events = useApi<IngestEvent[]>(
    source.data ? `/sources/${id}/events?limit=50&after_id=${after}` : null,
  );
  useEffect(() => {
    if (!events.data?.some((event) => event.status === "pending")) return;
    const timer = setInterval(events.reload, 5000);
    return () => clearInterval(timer);
  }, [events.data, events.reload]);
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-6">
      <Link href="/lead-sources" className="text-xs text-muted-foreground">
        ← Lead Sources
      </Link>
      {!source.data ? (
        <p role="status">
          {source.error || "Loading connection…"}{" "}
          {source.error && (
            <button className="text-accent" onClick={source.reload}>
              Retry
            </button>
          )}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold">{source.data.name}</h1>
            <Badge
              variant={
                source.data.status === "connected" ? "success" : "neutral"
              }
            >
              {source.data.status === "connected" ? "Enabled" : "Paused"}
            </Badge>
          </div>
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <SourceTools source={source.data} onChanged={events.reload} />
            <section className="flex flex-col gap-4 border border-border p-4">
              <h2 className="text-sm font-semibold">Connection settings</h2>
              {source.data.connectionKind === "oauth" ? (
                <Link
                  href="/lead-sources/whatsapp"
                  className="text-sm text-accent"
                >
                  Manage WhatsApp connection →
                </Link>
              ) : presets.data ? (
                <ConnectionForm
                  key={JSON.stringify(source.data)}
                  kind={source.data.connectionKind}
                  presets={presets.data}
                  initial={source.data}
                  onSaved={() => {
                    source.reload();
                    toast.success("Connection saved");
                  }}
                />
              ) : (
                <p role="status">{presets.error || "Loading settings…"}</p>
              )}
            </section>
          </div>
          <section className="border border-border">
            <div className="flex items-center justify-between gap-3 p-4">
              <div>
                <h2 className="text-sm font-semibold">Ingestion events</h2>
                <p className="text-xs text-muted-foreground">
                  Up to 50 events per page. Pending events refresh
                  automatically.
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={events.reload}>
                Refresh
              </Button>
            </div>
            {events.error && (
              <p role="alert" className="p-4 text-sm text-danger">
                {events.error}
              </p>
            )}
            {events.loading && <p className="p-4 text-sm">Loading events…</p>}
            {events.data && <EventList events={events.data} />}
            <div className="flex gap-2 border-t border-border p-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAfter("0");
                  events.reload();
                }}
              >
                First page
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={events.data?.length !== 50}
                onClick={() => setAfter(events.data!.at(-1)!.id)}
              >
                Next page
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
