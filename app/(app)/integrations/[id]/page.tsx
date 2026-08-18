"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle, Loader2, Zap, ArrowUpRight, Copy, RefreshCcw } from "lucide-react";
import { getIntegrationById } from "@/lib/mock-data";
import type { Integration } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, formatDateTime, formatNumber, cn } from "@/lib/utils";
import {
  integrationCategoryMeta,
  IntegrationStatusBadge,
  integrationPermissions,
  accountLabelFor,
  syncDirectionMeta,
} from "@/components/integrations/integration-meta";

interface SyncEvent {
  label: string;
  at: string;
}

function buildSyncEvents(integration: Integration): SyncEvent[] {
  if (!integration.lastSyncAt) return [];
  const base = new Date(integration.lastSyncAt).getTime();
  const total = integration.eventsSynced ?? 0;
  return [
    { label: `Synced ${formatNumber(Math.max(1, Math.round(total * 0.02)))} new records`, at: new Date(base).toISOString() },
    { label: "Webhook subscription renewed", at: new Date(base - 3 * 3600_000).toISOString() },
    { label: `Synced ${formatNumber(Math.max(1, Math.round(total * 0.05)))} updated records`, at: new Date(base - 26 * 3600_000).toISOString() },
    { label: "Access token refreshed", at: new Date(base - 96 * 3600_000).toISOString() },
  ];
}

export default function IntegrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const seed = getIntegrationById(id);
  const [integration, setIntegration] = React.useState<Integration | undefined>(seed);
  const [testing, setTesting] = React.useState(false);

  if (!integration) {
    return (
      <div className="mx-auto flex max-w-[900px] flex-col items-center gap-2 px-6 py-16 text-center">
        <p className="text-[14px] font-medium text-foreground">Integration not found</p>
        <Button size="sm" variant="secondary" asChild>
          <Link href="/integrations">Back to integrations</Link>
        </Button>
      </div>
    );
  }

  const categoryMeta = integrationCategoryMeta[integration.category];
  const CategoryIcon = categoryMeta.icon;
  const permissions = integrationPermissions[integration.category];
  const events = buildSyncEvents(integration);
  const integrationName = integration.name;

  function handleConnect(e: React.MouseEvent) {
    e.preventDefault();
    setIntegration((prev) =>
      prev
        ? {
            ...prev,
            status: "connected",
            connectedAccount: accountLabelFor(prev),
            lastSyncAt: new Date().toISOString(),
            eventsSynced: prev.eventsSynced ?? 0,
            errorMessage: undefined,
          }
        : prev
    );
    toast.success(`Connected to ${integrationName}`, { description: "Initial sync will start shortly." });
  }

  function handleReconnect() {
    setIntegration((prev) =>
      prev ? { ...prev, status: "connected", errorMessage: undefined, lastSyncAt: new Date().toISOString() } : prev
    );
    toast.success(`Reconnected to ${integrationName}`, { description: "The connection issue has been resolved." });
  }

  function handleDisconnect() {
    setIntegration((prev) =>
      prev
        ? { ...prev, status: "available", connectedAccount: undefined, lastSyncAt: undefined, eventsSynced: undefined, errorMessage: undefined }
        : prev
    );
    toast.success(`Disconnected from ${integrationName}`);
  }

  function handleTestConnection() {
    setTesting(true);
    window.setTimeout(() => {
      setTesting(false);
      toast.success("Connection healthy — 42ms response time");
    }, 900);
  }

  function copyApiKey() {
    if (!integration?.apiKeyMasked) return;
    navigator.clipboard?.writeText(integration.apiKeyMasked).catch(() => {});
    toast.success("API key copied to clipboard");
  }

  function handleRegenerateKey() {
    setIntegration((prev) =>
      prev ? { ...prev, apiKeyMasked: `jns_live_••••••••••••${Math.random().toString(16).slice(2, 6)}` } : prev
    );
    toast.success("New API key generated", { description: "The previous key stops working in 24 hours." });
  }

  const isConnected = integration.status === "connected";
  const isError = integration.status === "error";

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5 px-6 py-6">
      <button
        onClick={() => router.push("/integrations")}
        className="flex w-fit items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Integrations
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2">
            <CategoryIcon className="size-5 text-muted-foreground" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[20px] font-semibold tracking-tight text-foreground">{integration.name}</h1>
              <IntegrationStatusBadge status={integration.status} />
            </div>
            <p className="text-[12.5px] text-muted-foreground">{categoryMeta.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <Button size="sm" variant="secondary" onClick={handleTestConnection} disabled={testing}>
              {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
              {testing ? "Testing…" : "Test Connection"}
            </Button>
          )}
          {(isError || !isConnected) && (
            <Button size="sm" onClick={isError ? handleReconnect : handleConnect}>
              {isError ? "Reconnect" : "Connect"}
            </Button>
          )}
          {(isConnected || isError) && (
            <Button size="sm" variant="ghost" onClick={handleDisconnect}>
              Disconnect
            </Button>
          )}
        </div>
      </div>

      <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{integration.description}</p>

      {isError && integration.errorMessage && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-muted px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          <div>
            <p className="text-[12.5px] font-medium text-danger">Connection error</p>
            <p className="text-[12.5px] text-danger/90">{integration.errorMessage}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InfoTile label="Connected account" value={isConnected || isError ? accountLabelFor(integration) : "—"} mono />
        <InfoTile label="Events synced" value={integration.eventsSynced != null ? formatNumber(integration.eventsSynced) : "—"} mono />
        <InfoTile label="Last sync" value={integration.lastSyncAt ? formatRelativeTime(integration.lastSyncAt) : "—"} />
      </div>

      {integration.apiKeyMasked && isConnected && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">API key</p>
          <div className="flex items-center justify-between gap-2 border border-border bg-surface-2 px-3 py-2.5">
            <code className="text-mono truncate text-[12px] text-foreground">{integration.apiKeyMasked}</code>
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="secondary" onClick={copyApiKey}>
                <Copy className="size-3" />
                Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={handleRegenerateKey}>
                <RefreshCcw className="size-3" />
                Regenerate
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Use this key in the <code className="text-mono">Authorization: Bearer</code> header of any request to the Janus API.
          </p>
        </div>
      )}

      {integration.syncDirection && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sync direction</p>
          <p className="text-[12.5px] text-foreground">{syncDirectionMeta[integration.syncDirection]}</p>
          {integration.category === "helpdesk" && (
            <p className="mt-1 text-[12px] text-muted-foreground">
              {integration.syncDirection === "two_way"
                ? "Tickets created or updated in either system stay in sync, and every ticket lands on the same customer timeline as their leads, deals and conversations."
                : "Existing tickets are imported once (or on a schedule) so support history migrates onto the same customer timeline — new tickets from this source aren't written back."}
            </p>
          )}
        </div>
      )}

      {integration.fieldMapping && integration.fieldMapping.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Field mapping</p>
          <div className="flex flex-col gap-1">
            {integration.fieldMapping.map((f) => (
              <div key={f.rawField} className="flex items-center gap-2 border border-border bg-surface-2 px-3 py-1.5 text-[12px]">
                <code className="text-mono text-muted-foreground">{f.rawField}</code>
                <ArrowUpRight className="size-3 shrink-0 text-muted-foreground/60" />
                <span className="text-foreground">{f.mapsTo}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Permissions</p>
          <ul className="flex flex-col gap-2">
            {permissions.map((p) => (
              <li key={p} className="flex items-center gap-2 text-[12.5px] text-foreground">
                <span className={cn("size-1.5 rounded-full", isConnected ? "bg-success" : "bg-muted-foreground/50")} />
                {p}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent events</p>
          {events.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">No sync activity yet — connect this integration to see events here.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {events.map((ev, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="text-foreground">{ev.label}</span>
                  <span className="text-mono shrink-0 text-[11px] text-muted-foreground">{formatDateTime(ev.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function InfoTile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("truncate text-[14px] font-medium text-foreground", mono && "text-mono")}>{value}</span>
    </div>
  );
}
