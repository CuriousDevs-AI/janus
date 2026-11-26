"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { Import, IngestEvent, Preset, Source } from "@/lib/api/types";
import { ConnectionForm } from "@/components/lead-sources/connection-form";
import { SourceTools, EventList } from "@/components/lead-sources/source-tools";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, Loader2,
  Pause, Play, Upload, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";
import { sourceKindLabel } from "@/lib/lead-source-options";
import { sourceMeta } from "@/lib/lead-sources";

function HealthBadge({ status }: { status: Source["healthStatus"] }) {
  const map: Record<string, { icon: typeof CheckCircle2; label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
    healthy: { icon: CheckCircle2, label: "Healthy", variant: "success" },
    warning: { icon: AlertTriangle, label: "Warning", variant: "warning" },
    error: { icon: XCircle, label: "Errors", variant: "danger" },
    paused: { icon: Pause, label: "Paused", variant: "neutral" },
    needs_setup: { icon: AlertTriangle, label: "Needs CRM", variant: "warning" },
  };
  const h = map[status || "healthy"] || map.healthy;
  const Icon = h.icon;
  return (
    <Badge variant={h.variant}>
      <Icon className="size-3" /> {h.label}
    </Badge>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Detail key={id} id={id} />;
}

function Detail({ id }: { id: string }) {
  const source = useApi<Source>(`/sources/${encodeURIComponent(id)}`);
  const s = source.data;

  if (!s) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-6">
        <Link href="/lead-sources" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> Lead Sources
        </Link>
        {source.error ? (
          <p role="alert" className="text-sm text-danger">
            {source.error}{" "}
            <button className="text-accent" onClick={source.reload}>Retry</button>
          </p>
        ) : (
          <div className="animate-pulse">
            <div className="flex flex-col gap-4 border border-border p-4">
              <div className="h-4 w-28 bg-surface-2" />
              <div className="h-8 bg-surface-2" />
              <div className="h-8 bg-surface-2" />
              <div className="h-8 w-40 bg-surface-2" />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (s.connectionKind === "csv") return <CsvDetail id={id} source={s} onReload={source.reload} />;
  return <ConnectionDetail id={id} source={s} onReload={source.reload} />;
}

/* ════════════════════════════════════════════════════════════════════════
   CSV Import — dedicated layout
   ════════════════════════════════════════════════════════════════════════ */

function CsvDetail({ id, source: s, onReload }: { id: string; source: Source; onReload: () => void }) {
  const presets = useApi<Preset[]>("/sources/presets");
  const imports = useApi<Import[]>(`/sources/${id}/imports`);
  const [upload, setUpload] = useState<{ file: File; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!imports.data?.some((i) => i.pendingRows > 0)) return;
    const timer = setInterval(imports.reload, 5000);
    return () => clearInterval(timer);
  }, [imports.data, imports.reload]);

  const handleFile = (file: File | undefined) => {
    if (!file) { setUpload(null); return; }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large — 5 MB maximum.");
      setUpload(null);
      return;
    }
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      toast.error("Only CSV files are supported.");
      setUpload(null);
      return;
    }
    setUpload({ file, key: crypto.randomUUID() });
  };

  const doUpload = async () => {
    if (!upload) return;
    setBusy(true);
    try {
      const result = await api<Import>(
        `/sources/${id}/imports?fileName=${encodeURIComponent(upload.file.name)}`,
        { method: "POST", body: upload.file, headers: { "Content-Type": "text/csv", "Idempotency-Key": upload.key } },
      );
      toast.success(result.duplicate ? "This file was already imported." : `${result.totalRows} rows accepted for processing.`);
      setUpload(null);
      imports.reload();
      onReload();
    } catch (error) {
      toast.error(message(error));
    } finally {
      setBusy(false);
    }
  };

  const totalFailed = imports.data?.reduce((sum, i) => sum + i.failedRows, 0) ?? 0;

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5 p-6">
      <Link href="/lead-sources" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Lead Sources
      </Link>

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center bg-surface-2 text-muted-foreground">
          <FileSpreadsheet className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold">CSV Import</h1>
          <p className="text-xs text-muted-foreground">Import leads from spreadsheets with automatic contact matching</p>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
        <div>
          <span className="text-lg font-semibold tabular-nums">{(s.capturedLeads ?? 0).toLocaleString("en-IN")}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">leads imported</span>
        </div>
        <div>
          <span className="text-lg font-semibold tabular-nums">{imports.data?.length ?? 0}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">imports</span>
        </div>
        {totalFailed > 0 && (
          <div>
            <span className="text-lg font-semibold tabular-nums text-danger">{totalFailed}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">failed rows</span>
          </div>
        )}
        <div>
          <span className="text-xs text-muted-foreground">CRM:</span>
          <span className={cn("ml-1 text-xs", s.crmName ? "" : "text-warning")}>{s.crmName || "Not assigned"}</span>
        </div>
      </div>

      {/* ── Upload zone ── */}
      <section
        className={cn(
          "flex flex-col items-center gap-4 border-2 border-dashed p-8 transition-colors",
          dragOver ? "border-accent bg-accent/5" : "border-border/60 bg-surface-2/20",
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
      >
        {upload ? (
          <>
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="size-8 text-accent" />
              <div>
                <p className="text-sm font-medium">{upload.file.name}</p>
                <p className="text-xs text-muted-foreground">{(upload.file.size / 1024).toFixed(0)} KB</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={doUpload} disabled={busy}>
                <Upload className="size-3.5" /> {busy ? "Uploading…" : "Import this file"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setUpload(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <Upload className="size-8 text-muted-foreground/40" />
            <div className="text-center">
              <p className="text-sm font-medium">Drop a CSV file here, or click to browse</p>
              <p className="mt-1 text-xs text-muted-foreground">UTF-8 CSV, up to 5 MB and 1,000 rows. Include a phone or email column.</p>
            </div>
            <label className="cursor-pointer">
              <Input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
              />
              <span className="inline-flex h-8 items-center gap-1.5 border border-border bg-surface px-3 text-xs font-medium hover:bg-surface-2">
                Browse files
              </span>
            </label>
          </>
        )}
      </section>

      {/* ── CRM warning ── */}
      {!s.crmId && (
        <div className="flex items-start gap-3 border border-warning/40 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-medium">CRM destination not set</p>
            <p className="text-xs text-muted-foreground">Imported leads go to the default workspace. Set a destination in settings below.</p>
          </div>
        </div>
      )}

      {/* ── Import history ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">Import history</h2>
        {imports.loading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {imports.error && <p className="text-xs text-danger">{imports.error}</p>}
        {imports.data && imports.data.length === 0 && (
          <p className="border border-dashed border-border/50 p-6 text-center text-xs text-muted-foreground">
            No imports yet. Upload a CSV file above to get started.
          </p>
        )}
        {imports.data && imports.data.length > 0 && (
          <div className="border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-surface-2">
                <tr>
                  <th className="p-2.5 font-medium text-muted-foreground">File</th>
                  <th className="p-2.5 font-medium text-muted-foreground text-right">Rows</th>
                  <th className="p-2.5 font-medium text-muted-foreground text-right">Processed</th>
                  <th className="p-2.5 font-medium text-muted-foreground text-right">Failed</th>
                  <th className="p-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="p-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="p-2.5 font-medium text-muted-foreground" />
                </tr>
              </thead>
              <tbody>
                {imports.data.map((row) => (
                  <ImportRow key={row.id} sourceId={id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Field mapping & settings ── */}
      <section className="border border-border">
        <button
          type="button"
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="flex w-full items-center justify-between p-4 text-left hover:bg-surface-2/30"
        >
          <h2 className="text-sm font-semibold">Column mapping & settings</h2>
          <span className="text-xs text-muted-foreground">{settingsOpen ? "Close" : "Open"}</span>
        </button>
        {settingsOpen && (
          <div className="border-t border-border p-4">
            {presets.data ? (
              <ConnectionForm
                key={JSON.stringify(s)}
                kind="csv"
                presets={presets.data}
                initial={s}
                onSaved={() => { onReload(); toast.success("Settings saved"); }}
              />
            ) : (
              <p role="status">{presets.error || <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Loading…</span>}</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ImportRow({ sourceId, row }: { sourceId: string; row: Import }) {
  const [expanded, setExpanded] = useState(false);
  const [after, setAfter] = useState("0");
  const rows = useApi<IngestEvent[]>(
    expanded ? `/sources/${sourceId}/imports/${row.id}/rows?limit=50&after_id=${after}` : null,
  );

  useEffect(() => {
    if (!expanded || row.pendingRows <= 0) return;
    const timer = setInterval(rows.reload, 5000);
    return () => clearInterval(timer);
  }, [expanded, row.pendingRows, rows.reload]);

  const statusColor = row.status === "completed" ? "text-success" : row.failedRows > 0 ? "text-warning" : "text-muted-foreground";

  return (
    <>
      <tr className="border-t border-border/40">
        <td className="p-2.5 font-medium">{row.fileName}</td>
        <td className="p-2.5 text-right tabular-nums">{row.totalRows}</td>
        <td className="p-2.5 text-right tabular-nums">{row.processedRows}</td>
        <td className={cn("p-2.5 text-right tabular-nums", row.failedRows > 0 && "text-danger")}>{row.failedRows}</td>
        <td className="p-2.5">
          <span className={cn("inline-flex items-center gap-1.5", statusColor)}>
            <span className={cn("size-1.5 shrink-0 rounded-full",
              row.status === "completed" ? "bg-success" : row.pendingRows > 0 ? "bg-warning" : "bg-danger",
            )} />
            {row.status === "completed" ? "Done" : row.pendingRows > 0 ? `${row.pendingRows} pending` : "Errors"}
          </span>
        </td>
        <td className="p-2.5 text-muted-foreground">{formatDateTime(row.createdAt)}</td>
        <td className="p-2.5">
          <button type="button" onClick={() => setExpanded(!expanded)} className="text-accent hover:underline">
            {expanded ? "Hide" : "View rows"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-surface-2/20 p-0">
            <div className="max-h-72 overflow-auto">
              {rows.loading && <p className="p-3 text-xs text-muted-foreground">Loading rows…</p>}
              {rows.error && <p className="p-3 text-xs text-danger">{rows.error}</p>}
              {rows.data && (
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Result</th>
                      <th className="px-3 py-2 font-medium">Lead</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.data.map((event) => (
                      <tr key={event.id} className="border-t border-border/30">
                        <td className="px-3 py-1.5 text-muted-foreground">{event.rowNumber ?? "—"}</td>
                        <td className="px-3 py-1.5">
                          <span className={cn(
                            "inline-flex items-center gap-1",
                            event.status === "failed" ? "text-danger" : event.status === "pending" ? "text-muted-foreground" : "",
                          )}>
                            <span className={cn("size-1.5 shrink-0 rounded-full",
                              event.status === "processed" ? "bg-success" : event.status === "failed" ? "bg-danger" : "bg-warning",
                            )} />
                            {event.status}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          {event.status === "failed"
                            ? <span className="text-danger">{event.reason?.replaceAll("_", " ") || "Error"}</span>
                            : event.result?.replaceAll("_", " ") || "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          {event.leadId ? <Link href={`/leads/${event.leadId}`} className="text-accent">Open lead</Link> : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {rows.data && rows.data.length === 0 && (
                <p className="p-3 text-xs text-muted-foreground">No rows on this page.</p>
              )}
            </div>
            <div className="flex gap-2 border-t border-border/30 p-2">
              <Button size="sm" variant="ghost" onClick={() => { setAfter("0"); rows.reload(); }}>
                First page
              </Button>
              <Button size="sm" variant="ghost" disabled={rows.data?.length !== 50} onClick={() => setAfter(rows.data!.at(-1)!.id)}>
                Next 50
              </Button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Connection Detail — webhooks, forms, API keys, oauth
   ════════════════════════════════════════════════════════════════════════ */

function ConnectionDetail({ id, source: s, onReload }: { id: string; source: Source; onReload: () => void }) {
  const presets = useApi<Preset[]>("/sources/presets");
  const [after, setAfter] = useState("0");
  const [tab, setTab] = useState<"overview" | "events" | "settings">("overview");
  const events = useApi<IngestEvent[]>(
    `/sources/${id}/events?limit=50&after_id=${after}`,
  );
  useEffect(() => {
    if (!events.data?.some((event) => event.status === "pending")) return;
    const timer = setInterval(events.reload, 5000);
    return () => clearInterval(timer);
  }, [events.data, events.reload]);

  const failedEvents = events.data?.filter((e) => e.status === "failed") ?? [];

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-6">
      <Link href="/lead-sources" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Lead Sources
      </Link>

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {(() => {
            const sm = sourceMeta(s.source);
            const Icon = sm.icon;
            return (
              <span className={cn("flex size-10 items-center justify-center", sm.bg, sm.color)}>
                <Icon className="size-5" />
              </span>
            );
          })()}
          <div>
            <h1 className="text-xl font-semibold">{s.name}</h1>
            <p className="text-xs text-muted-foreground">{sourceKindLabel(s)}{s.description ? ` · ${s.description}` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <HealthBadge status={s.healthStatus} />
          <Badge variant={s.status === "connected" ? "success" : "neutral"}>
            {s.status === "connected" ? <><Play className="size-3" /> Active</> : <><Pause className="size-3" /> Paused</>}
          </Badge>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border/50 pb-4 text-sm">
        <div>
          <span className="text-lg font-semibold tabular-nums">{(s.capturedLeads ?? 0).toLocaleString("en-IN")}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">leads captured</span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Last received:</span>
          <span className="ml-1 text-xs">{s.lastEventAt ? formatDateTime(s.lastEventAt) : "Never"}</span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">CRM:</span>
          <span className={cn("ml-1 text-xs", s.crmName ? "" : "text-warning")}>
            {s.crmName || "Not assigned"}
          </span>
        </div>
        {(s.errorCount ?? 0) > 0 && (
          <div>
            <span className="text-xs text-danger">{s.errorCount} failed events</span>
          </div>
        )}
      </div>

      {/* ── Needs CRM warning ── */}
      {!s.crmId && (
        <div className="flex items-start gap-3 border border-warning/40 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-medium">CRM destination required</p>
            <p className="text-xs text-muted-foreground">
              This source does not have an assigned CRM workspace. Leads will be routed to the default workspace until you configure one. Update the settings below to assign a destination.
            </p>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-0 border-b border-border">
        {(["overview", "events", "settings"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 px-4 py-2 text-xs font-medium transition-colors",
              tab === t
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "overview" ? "Overview" : t === "events" ? `Events${events.data ? ` (${events.data.length})` : ""}` : "Settings"}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {tab === "overview" && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <SourceTools source={s} onChanged={events.reload} />
          <div className="flex flex-col gap-4">
            <section className="border border-border p-4">
              <h2 className="mb-3 text-sm font-semibold">Recent activity</h2>
              {events.loading && <p className="text-xs text-muted-foreground">Loading…</p>}
              {events.data && events.data.length === 0 && (
                <p className="text-xs text-muted-foreground">No events yet. Send an enquiry to begin.</p>
              )}
              {events.data && events.data.slice(0, 5).map((event) => (
                <div key={event.id} className="flex items-center gap-2 border-t border-border/40 py-2 text-xs first:border-0">
                  <span className={cn("size-1.5 shrink-0 rounded-full",
                    event.status === "processed" ? "bg-success" : event.status === "failed" ? "bg-danger" : "bg-warning",
                  )} />
                  <span className="text-muted-foreground">{formatDateTime(event.receivedAt)}</span>
                  <span className={event.status === "failed" ? "text-danger" : ""}>{event.status}</span>
                  {event.leadId && (
                    <Link href={`/leads/${event.leadId}`} className="text-accent">Open lead</Link>
                  )}
                </div>
              ))}
              {events.data && events.data.length > 5 && (
                <button type="button" onClick={() => setTab("events")} className="mt-2 text-xs text-accent hover:underline">
                  View all events →
                </button>
              )}
            </section>

            {failedEvents.length > 0 && (
              <section className="border border-danger/30 bg-danger/5 p-4">
                <h2 className="mb-2 text-sm font-semibold text-danger">Failed events ({failedEvents.length})</h2>
                <p className="text-xs text-muted-foreground">These events could not be processed. Check field mappings and CRM configuration.</p>
                {failedEvents.slice(0, 3).map((event) => (
                  <div key={event.id} className="mt-2 flex items-center gap-2 text-xs">
                    <XCircle className="size-3 text-danger" />
                    <span>{formatDateTime(event.receivedAt)}</span>
                    <span className="text-danger">{event.reason?.replaceAll("_", " ") || "Unknown error"}</span>
                  </div>
                ))}
              </section>
            )}
          </div>
        </div>
      )}

      {tab === "events" && (
        <section className="border border-border">
          <div className="flex items-center justify-between gap-3 p-4">
            <div>
              <h2 className="text-sm font-semibold">Ingestion events</h2>
              <p className="text-xs text-muted-foreground">
                Up to 50 events per page. Pending events refresh automatically.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={events.reload}>
              Refresh
            </Button>
          </div>
          {events.error && (
            <p role="alert" className="p-4 text-sm text-danger">{events.error}</p>
          )}
          {events.loading && <p className="p-4 text-sm">Loading events…</p>}
          {events.data && <EventList events={events.data} sourceId={id} onRetried={events.reload} />}
          <div className="flex gap-2 border-t border-border p-3">
            <Button size="sm" variant="ghost" onClick={() => { setAfter("0"); events.reload(); }}>
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
      )}

      {tab === "settings" && (
        <section className="flex flex-col gap-4 border border-border p-4">
          <h2 className="text-sm font-semibold">Connection settings</h2>
          {s.connectionKind === "oauth" ? (
            <Link href="/lead-sources/whatsapp" className="text-sm text-accent">
              Manage WhatsApp connection →
            </Link>
          ) : presets.data ? (
            <ConnectionForm
              key={JSON.stringify(s)}
              kind={s.connectionKind}
              presets={presets.data}
              initial={s}
              onSaved={() => {
                onReload();
                toast.success("Connection saved");
              }}
            />
          ) : (
            <p role="status">{presets.error || <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Loading settings…</span>}</p>
          )}
        </section>
      )}
    </div>
  );
}
