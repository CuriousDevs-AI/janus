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
import { demoLeadRows, demoSourceRows } from "@/lib/api/demo-data";
import { formatDateTime } from "@/lib/utils";
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Detail key={id} id={id} />;
}
function Detail({ id }: { id: string }) {
  const source = useApi<Source>(`/sources/${encodeURIComponent(id)}`);
  const presets = useApi<Preset[]>("/sources/presets");
  const demoSource = demoSourceRows.find((row) => row.id === id);
  const [after, setAfter] = useState("0");
  const events = useApi<IngestEvent[]>(
    source.data ? `/sources/${id}/events?limit=50&after_id=${after}` : null,
  );
  useEffect(() => {
    if (!events.data?.some((event) => event.status === "pending")) return;
    const timer = setInterval(events.reload, 5000);
    return () => clearInterval(timer);
  }, [events.data, events.reload]);
  if (demoSource) return <DemoSourceDetail source={demoSource} />;
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-6">
      <Link href="/lead-sources?workspace=crm-sales" className="text-xs text-muted-foreground">
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

function DemoSourceDetail({ source }: { source: Source }) {
  const leads = demoLeadRows.filter((lead) => {
    if (source.source === "website") return lead.source === "website";
    if (source.source === "whatsapp") return lead.source === "whatsapp";
    if (source.source === "phone_call") return lead.source === "phone_call";
    return false;
  });
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-6">
      <Link href="/lead-sources?workspace=crm-sales" className="text-xs text-muted-foreground">← Lead Sources</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{source.name}</h1>
            <Badge variant="neutral">Demo data</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{source.description}</p>
        </div>
        <Badge variant={source.status === "connected" ? "success" : "neutral"}>{source.status === "connected" ? "Enabled" : "Available"}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="border border-border bg-surface p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Leads captured</p><p className="mt-1 text-2xl font-semibold">{source.capturedLeads}</p></div>
        <div className="border border-border bg-surface p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Last received</p><p className="mt-1 text-sm font-medium">{source.lastEventAt ? formatDateTime(source.lastEventAt) : "No activity yet"}</p></div>
        <div className="border border-border bg-surface p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Connection</p><p className="mt-1 text-sm font-medium">{source.preset?.replaceAll("_", " ") || source.connectionKind}</p></div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="flex flex-col gap-3 border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Connection settings</h2>
          <div className="grid gap-2 text-sm"><div className="flex justify-between gap-3"><span className="text-muted-foreground">Type</span><span>{source.connectionKind}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Preset</span><span>{source.preset?.replaceAll("_", " ") || "Custom"}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Endpoint</span><span className="max-w-[280px] truncate text-right text-xs">{source.ingestUrl || "Created when connected"}</span></div></div>
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">This is a read-only preview. Connect the live API to edit credentials, rotate secrets or receive new events.</p>
          <Button size="sm" variant="secondary" className="w-fit" disabled>Configure source</Button>
        </section>
        <section className="border border-border bg-surface">
          <div className="border-b border-border p-4"><h2 className="text-sm font-semibold">Recent captured leads</h2><p className="mt-1 text-xs text-muted-foreground">Sample events from this connection.</p></div>
          {leads.length ? leads.map((lead) => <div key={lead.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0"><div><p className="text-sm font-medium">{lead.contactName}</p><p className="text-xs text-muted-foreground">{lead.company} · {lead.stage}</p></div><div className="text-right"><Badge variant="success">Captured</Badge><p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(lead.lastActivityAt)}</p></div></div>) : <p className="p-4 text-sm text-muted-foreground">No sample events for this source yet.</p>}
        </section>
      </div>
    </div>
  );
}
