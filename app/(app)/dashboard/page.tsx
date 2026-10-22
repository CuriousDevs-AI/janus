"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useSession } from "@/components/auth/session-provider";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api/use-api";
import type { Deal, Lead, Source } from "@/lib/api/types";
import { formatCurrencyINR, formatDateTime, formatRelativeTime } from "@/lib/utils";

function sourceLabel(source: string) {
  return source.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function DashboardPage() {
  const session = useSession();
  const leads = useApi<Lead[]>("/leads?limit=100&after_id=0");
  const deals = useApi<Deal[]>("/deals?limit=100&after_id=0");
  const canViewSources =
    session.permissions.includes("sources:manage") &&
    Boolean(session.user.email_verified_at);
  const sources = useApi<Source[]>(
    canViewSources ? "/sources?limit=50&after_id=0" : null,
  );

  const leadRows = leads.data ?? [];
  const dealRows = deals.data ?? [];
  const openDeals = dealRows.filter((deal) => !["won", "lost"].includes(deal.stage));
  const openValue = openDeals.reduce((sum, deal) => sum + Number(deal.amount), 0);
  const connectedSources = (sources.data ?? []).filter(
    (source) => source.status === "connected",
  );
  const refresh = () => {
    leads.reload();
    deals.reload();
    sources.reload();
  };
  const loading = leads.loading || deals.loading || sources.loading;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-6 py-6">
      <PageHeader
        title="CRM Overview"
        description={`Live CRM & Sales workspace for ${session.tenant.name}.`}
        actions={
          <Button size="sm" variant="secondary" onClick={refresh} disabled={loading}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        }
      />

      {(leads.error || deals.error || sources.error) && (
        <p role="alert" className="text-sm text-danger">
          {leads.error || deals.error || sources.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Leads captured" value={loading ? "…" : String(leadRows.length)} />
        <MetricCard label="Open deals" value={loading ? "…" : String(openDeals.length)} />
        <MetricCard label="Open pipeline" value={loading ? "…" : formatCurrencyINR(openValue)} />
        <MetricCard label="Connected sources" value={canViewSources && !sources.loading ? String(connectedSources.length) : "—"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-[13px] font-semibold">Recent leads</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">Newest enquiries from connected sources.</p>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/leads">View all</Link>
            </Button>
          </div>
          {loading && <p className="px-4 py-5 text-sm text-muted-foreground">Loading live data…</p>}
          {!loading && leadRows.length === 0 && (
            <div className="px-4 py-8 text-sm text-muted-foreground">
              No leads yet. Connect a source to capture the first enquiry.
            </div>
          )}
          {!loading && leadRows.length > 0 && (
            <div className="divide-y divide-border">
              {leadRows.slice(0, 6).map((lead) => (
                <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">Lead #{lead.id}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{sourceLabel(lead.source)} · {lead.stage}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(lead.lastActivityAt)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-[13px] font-semibold">Pipeline snapshot</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">Open deals and expected close dates.</p>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/deals">View deals</Link>
            </Button>
          </div>
          {!loading && openDeals.length === 0 && (
            <div className="px-4 py-8 text-sm text-muted-foreground">No open deals yet.</div>
          )}
          {!loading && openDeals.length > 0 && (
            <div className="divide-y divide-border">
              {openDeals.slice(0, 6).map((deal) => (
                <Link key={deal.id} href={`/deals/${deal.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{deal.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{deal.customerName} · {deal.stage}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">{formatCurrencyINR(Number(deal.amount))}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{deal.expectedCloseAt ? formatDateTime(deal.expectedCloseAt) : "No close date"}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
