"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, RefreshCcw, UploadCloud, ArrowUpRight, ArrowLeft } from "lucide-react";
import { getLeadSourceById, getEventsForSource, getCustomerById } from "@/lib/mock-data";
import { leadSourceMeta } from "@/lib/status-meta";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/shared/metric-card";
import { IngestionPipeline } from "@/components/lead-sources/ingestion-pipeline";
import { SourceStatusBadge, connectionKindMeta, IngestionResultBadge } from "@/components/lead-sources/source-meta";
import { formatDateTime, formatNumber } from "@/lib/utils";

function copy(value: string, label: string) {
  navigator.clipboard?.writeText(value).catch(() => {});
  toast.success(`${label} copied to clipboard`);
}

export default function LeadSourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const source = getLeadSourceById(id);

  if (!source) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-2 px-6 py-16 text-center">
        <p className="text-[14px] font-medium text-foreground">Lead source not found</p>
        <Button size="sm" variant="secondary" asChild>
          <Link href="/lead-sources">Back to lead sources</Link>
        </Button>
      </div>
    );
  }

  const meta = leadSourceMeta[source.source];
  const Icon = meta.icon;
  const kindMeta = connectionKindMeta[source.connectionKind];
  const events = getEventsForSource(source.id);
  const merged = events.filter((e) => e.result === "merged").length;
  const failed = events.filter((e) => e.result === "failed").length;

  return (
    <div className="mx-auto flex max-w-[1300px] flex-col gap-5 px-6 py-6">
      <Link href="/lead-sources" className="flex w-fit items-center gap-1.5 text-[12px] text-muted-foreground hover:text-accent">
        <ArrowLeft className="size-3.5" />
        Lead Sources
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center border border-border bg-surface-2">
            <Icon className="size-5 text-muted-foreground" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[20px] font-semibold tracking-tight text-foreground">{source.name}</h1>
              <SourceStatusBadge status={source.status} />
            </div>
            <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <kindMeta.icon className="size-3.5" />
              {kindMeta.label}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {source.connectionKind === "oauth" && (
            <>
              <Button size="sm" variant="secondary" onClick={() => toast.success("Connection refreshed")}>
                <RefreshCcw className="size-3.5" />
                Reconnect
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toast("Disconnecting isn't wired up in this demo")}>
                Disconnect
              </Button>
            </>
          )}
          {source.connectionKind === "csv" && (
            <Button size="sm" onClick={() => toast.success("Processing leads.csv", { description: "412 rows — matching against existing profiles." })}>
              <UploadCloud className="size-3.5" />
              Upload CSV
            </Button>
          )}
        </div>
      </div>

      <p className="max-w-2xl text-[13px] text-muted-foreground">{source.description}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Leads (30d)" value={formatNumber(source.leadsCaptured30d)} />
        <MetricCard label="Events logged" value={String(events.length)} />
        <MetricCard label="Merged / deduped" value={String(merged)} />
        <MetricCard label="Failed" value={String(failed)} trend={failed > 0 ? "down" : "flat"} />
      </div>

      <div className="border border-border bg-surface p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ingestion pipeline</p>
        <IngestionPipeline />
      </div>

      {/* Connection configuration, varies by kind */}
      <div className="border border-border bg-surface p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Connection</p>

        {source.connectionKind === "embed" && source.embedSnippet && (
          <div className="flex flex-col gap-2">
            <p className="text-[12.5px] text-muted-foreground">Paste this before the closing <code className="text-mono">&lt;/body&gt;</code> tag on every page you want the widget to appear on.</p>
            <div className="flex items-center justify-between gap-2 border border-border bg-surface-2 px-3 py-2.5">
              <code className="text-mono truncate text-[12px] text-foreground">{source.embedSnippet}</code>
              <Button size="sm" variant="secondary" onClick={() => copy(source.embedSnippet!, "Embed snippet")}>
                <Copy className="size-3" />
                Copy
              </Button>
            </div>
          </div>
        )}

        {(source.connectionKind === "webhook" || (source.connectionKind === "oauth" && source.webhookUrl)) && (
          <div className="flex flex-col gap-2">
            <Row label="Webhook URL">
              <div className="flex items-center gap-2">
                <code className="text-mono truncate text-[12px] text-foreground">{source.webhookUrl}</code>
                <button onClick={() => copy(source.webhookUrl!, "Webhook URL")} className="text-muted-foreground hover:text-foreground">
                  <Copy className="size-3.5" />
                </button>
              </div>
            </Row>
            {source.signingSecret && <Row label="Signing secret">{source.signingSecret}</Row>}
            {source.connectedAccount && <Row label="Connected account">{source.connectedAccount}</Row>}
          </div>
        )}

        {source.connectionKind === "oauth" && !source.webhookUrl && source.connectedAccount && (
          <Row label="Connected account">{source.connectedAccount}</Row>
        )}

        {source.connectionKind === "api_key" && source.apiKeyMasked && (
          <div className="flex flex-col gap-2">
            <Row label="API key">
              <div className="flex items-center gap-2">
                <code className="text-mono text-[12px] text-foreground">{source.apiKeyMasked}</code>
                <button onClick={() => copy(source.apiKeyMasked!, "API key")} className="text-muted-foreground hover:text-foreground">
                  <Copy className="size-3.5" />
                </button>
                <Button size="sm" variant="ghost" onClick={() => toast.success("New API key generated", { description: "The previous key stops working in 24 hours." })}>
                  <RefreshCcw className="size-3" />
                  Regenerate
                </Button>
              </div>
            </Row>
          </div>
        )}

        {source.connectionKind === "manual" && (
          <p className="text-[12.5px] text-muted-foreground">
            No technical connection needed — log a referral from any lead or customer profile, or share a referral link.
          </p>
        )}

        {source.connectionKind === "csv" && (
          <p className="text-[12.5px] text-muted-foreground">
            Uploads are matched against existing profiles by email before creating new leads, same as every other source.
          </p>
        )}

        {source.fieldMapping && source.fieldMapping.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Field mapping</p>
            <div className="flex flex-col gap-1">
              {source.fieldMapping.map((f) => (
                <div key={f.rawField} className="flex items-center gap-2 border border-border bg-surface-2 px-3 py-1.5 text-[12px]">
                  <code className="text-mono text-muted-foreground">{f.rawField}</code>
                  <ArrowUpRight className="size-3 shrink-0 text-muted-foreground/60" />
                  <span className="text-foreground">{f.mapsTo}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent ingestion events */}
      <div className="border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent events</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Received</th>
                <th className="px-4 py-2 font-medium">Raw event</th>
                <th className="px-4 py-2 font-medium">Result</th>
                <th className="px-4 py-2 font-medium">Profile</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const customer = e.customerId ? getCustomerById(e.customerId) : undefined;
                return (
                  <tr key={e.id} className="border-b border-border/60 align-top last:border-0">
                    <td className="text-mono whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatDateTime(e.receivedAt)}</td>
                    <td className="max-w-[360px] px-4 py-2.5">
                      <code className="text-mono block truncate text-[11px] text-foreground">{e.rawPreview}</code>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{e.reason}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <IngestionResultBadge result={e.result} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {customer ? (
                        <Link href={`/customers/${customer.id}`} className="text-foreground hover:text-accent">
                          {customer.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {events.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No events logged yet for this source.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-2 text-[12.5px] last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{children}</span>
    </div>
  );
}
