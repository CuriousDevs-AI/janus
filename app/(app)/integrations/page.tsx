"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Plug, Radio, ArrowRight } from "lucide-react";
import { integrations as seedIntegrations } from "@/lib/mock-data";
import type { Integration } from "@/lib/types";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { demoMode } from "@/lib/demo-mode";
import { formatRelativeTime, formatNumber, cn } from "@/lib/utils";
import {
  integrationCategoryMeta,
  IntegrationStatusBadge,
  accountLabelFor,
} from "@/components/integrations/integration-meta";

export default function IntegrationsPage() {
  const router = useRouter();
  const [items, setItems] = React.useState<Integration[]>(seedIntegrations);

  const connected = items.filter((i) => i.status === "connected");
  const errored = items.filter((i) => i.status === "error");
  const available = items.filter((i) => i.status === "available");

  function goTo(id: string) {
    router.push(`/integrations/${id}`);
  }

  function handleConnect(integration: Integration, e: React.MouseEvent) {
    e.stopPropagation();
    setItems((prev) =>
      prev.map((i) =>
        i.id === integration.id
          ? {
              ...i,
              status: "connected",
              connectedAccount: accountLabelFor(i),
              lastSyncAt: new Date().toISOString(),
              eventsSynced: i.eventsSynced ?? 0,
              errorMessage: undefined,
            }
          : i
      )
    );
    toast.success(`Connected to ${integration.name}`, { description: "Initial sync will start shortly." });
  }

  function handleReconnect(integration: Integration, e: React.MouseEvent) {
    e.stopPropagation();
    setItems((prev) =>
      prev.map((i) =>
        i.id === integration.id
          ? { ...i, status: "connected", errorMessage: undefined, lastSyncAt: new Date().toISOString() }
          : i
      )
    );
    toast.success(`Reconnected to ${integration.name}`, { description: "The connection issue has been resolved." });
  }

  function handleDisconnect(integration: Integration, e: React.MouseEvent) {
    e.stopPropagation();
    setItems((prev) =>
      prev.map((i) =>
        i.id === integration.id
          ? { ...i, status: "available", connectedAccount: undefined, lastSyncAt: undefined, eventsSynced: undefined, errorMessage: undefined }
          : i
      )
    );
    toast.success(`Disconnected from ${integration.name}`);
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <PageHeader
        title="Integrations"
        description={`${connected.length} connected · ${items.length} total · other business tools, not customer channels`}
      />

      <div className="flex flex-col gap-6 px-6 pb-6">
        <Link
          href="/lead-sources"
          className="group flex items-center justify-between gap-3 border border-accent-border bg-accent-muted px-4 py-3 transition-colors hover:border-accent"
        >
          <div className="flex items-center gap-3">
            <Radio className="size-4 shrink-0 text-accent" />
            <p className="text-[12.5px] text-foreground">
              Looking for Website Forms, WhatsApp, Phone Calls or Custom Webhooks? Manage them under <span className="font-medium">Lead Sources</span>.
            </p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-accent transition-transform group-hover:translate-x-0.5" />
        </Link>

        {errored.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-danger">
              <AlertTriangle className="size-3.5" />
              Needs attention
            </h2>
            <div className="flex flex-col gap-2">
              {errored.map((integration) => {
                const CategoryIcon = integrationCategoryMeta[integration.category].icon;
                return (
                  <div
                    key={integration.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => goTo(integration.id)}
                    className="flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-muted px-4 py-3 transition-colors hover:border-danger/50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <CategoryIcon className="size-4 shrink-0 text-danger" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-foreground">{integration.name}</span>
                          <IntegrationStatusBadge status={integration.status} />
                        </div>
                        <p className="truncate text-[12px] text-danger">{integration.errorMessage}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={(e) => handleReconnect(integration, e)}>
                      Reconnect
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Connected ({connected.length})
          </h2>
          {connected.length === 0 ? (
            <EmptyState icon={Plug} title="No integrations connected" description="Connect one below to start syncing data." />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {connected.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  onOpen={() => goTo(integration.id)}
                  actions={
                    <>
                      <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); goTo(integration.id); }}>
                        Configure
                      </Button>
                      <Button size="sm" variant="ghost" onClick={(e) => handleDisconnect(integration, e)}>
                        Disconnect
                      </Button>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Available ({available.length})
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {available.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onOpen={() => goTo(integration.id)}
                actions={
                  <Button size="sm" onClick={(e) => handleConnect(integration, e)}>
                    Connect
                  </Button>
                }
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function IntegrationCard({
  integration,
  onOpen,
  actions,
}: {
  integration: Integration;
  onOpen: () => void;
  actions: React.ReactNode;
}) {
  const categoryMeta = integrationCategoryMeta[integration.category];
  const CategoryIcon = categoryMeta.icon;
  const isConnected = integration.status === "connected";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className={cn(
        "group flex cursor-pointer flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2">
            <CategoryIcon className="size-4 text-muted-foreground" />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold text-foreground group-hover:text-accent">{integration.name}</p>
            <p className="text-[11px] text-muted-foreground">{categoryMeta.label}</p>
          </div>
        </div>
        <IntegrationStatusBadge status={integration.status} />
      </div>

      <p className="line-clamp-2 text-[12px] text-muted-foreground">{integration.description}</p>

      {isConnected && (
        <div className="flex flex-col gap-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-[11.5px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Account</span>
            <span className="text-mono truncate text-foreground">{accountLabelFor(integration)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Last sync</span>
            <span className="text-foreground">{integration.lastSyncAt ? formatRelativeTime(integration.lastSyncAt) : "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Events synced</span>
            <span className="text-mono text-foreground">{integration.eventsSynced != null ? formatNumber(integration.eventsSynced) : "—"}</span>
          </div>
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 pt-1">{actions}</div>
    </div>
  );
}
