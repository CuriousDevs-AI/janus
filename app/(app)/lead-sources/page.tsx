"use client";
import Link from "next/link";
import { useState } from "react";
import { FileSpreadsheet, Globe, Key, MessageCircle, Phone, Plus, Settings2, Webhook } from "lucide-react";
import { useSession } from "@/components/auth/session-provider";
import { useApi } from "@/lib/api/use-api";
import type { Source } from "@/lib/api/types";
import { demoSourceRows } from "@/lib/api/demo-data";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
export default function LeadSourcesPage() {
  const session = useSession();
  const allowed =
    session.permissions.includes("sources:manage") &&
    Boolean(session.user.email_verified_at);
  const [after, setAfter] = useState("0");
  const sources = useApi<Source[]>(
    allowed ? `/sources?limit=50&after_id=${after}` : null,
  );
  const usingDemo = !allowed || Boolean(sources.error);
  const sourceRows = sources.data ?? (usingDemo ? demoSourceRows : []);
  const enabledSources = sourceRows.filter((source) => source.status === "connected");
  const availableSources = sourceRows.filter((source) => source.status === "available");
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <PageHeader
        title="Lead Sources"
        description="Connect the places your enquiries already come from."
        actions={
          <div className="flex items-center gap-2">
            
            {allowed ? (
              <Button asChild>
                <Link href="/lead-sources/new">
                  <Plus />
                  Add a new lead source
                </Link>
              </Button>
            ) : (
              <Button disabled>
                <Plus />
                Add a new lead source
              </Button>
            )}
          </div>
        }
      />
      <div className="flex flex-col gap-6 px-6 pb-6">
        {!session.permissions.includes("sources:manage") && (
          <p className="text-sm text-muted-foreground">
            Ask an owner or admin to configure lead sources.
          </p>
        )}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Enabled sources ({enabledSources.length})
          </h2>
          
          {allowed && sources.loading && (
            <p role="status" className="text-sm">
              Loading connections…
            </p>
          )}
          {enabledSources.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {after === "0"
                ? "No enabled sources yet. Add your first lead source to begin."
                : "No more connections."}
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {enabledSources.map((source) => (
              <article key={source.id} className="flex min-h-[168px] flex-col gap-4 border border-border bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2">
                      {source.source === "website" ? <Globe className="size-5 text-accent" /> : source.source === "whatsapp" ? <MessageCircle className="size-5 text-accent" /> : source.source === "phone_call" ? <Phone className="size-5 text-accent" /> : source.source === "api" ? <Key className="size-5 text-accent" /> : source.source === "csv_import" ? <FileSpreadsheet className="size-5 text-accent" /> : <Webhook className="size-5 text-accent" />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{source.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{source.connectionKind === "oauth" ? "WhatsApp Cloud API" : source.preset}</p>
                    </div>
                  </div>
                  <Link href={source.connectionKind === "oauth" ? "/lead-sources/whatsapp" : `/lead-sources/${source.id}`} aria-label={`Edit ${source.name}`} title="Edit source" className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                    <Settings2 className="size-4" />
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-border/70 pt-3">
                  <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Leads captured</p><p className="mt-1 text-xl font-semibold">{source.capturedLeads}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Last received</p><p className="mt-1 text-sm font-medium">{source.lastEventAt ? formatDateTime(source.lastEventAt) : "No activity yet"}</p></div>
                </div>
                <Link href={source.connectionKind === "oauth" ? "/lead-sources/whatsapp" : `/lead-sources/${source.id}`} className="mt-auto text-xs font-medium text-accent hover:underline">View source details →</Link>
              </article>
            ))}
          </div>
          {allowed && (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAfter("0");
                  sources.reload();
                }}
              >
                Refresh / first page
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={sources.data?.length !== 50}
                onClick={() => setAfter(sources.data!.at(-1)!.id)}
              >
                Next page
              </Button>
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Available sources ({availableSources.length})
            </h2>
            <p className="text-xs text-muted-foreground">Connect when you are ready to capture more enquiries.</p>
          </div>
          {availableSources.length === 0 ? (
            <p className="text-sm text-muted-foreground">All currently supported sources are connected.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {availableSources.map((source) => (
                <article key={source.id} className="flex min-h-[150px] flex-col gap-3 border border-border bg-surface p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2">
                        {source.source === "api" ? <Key className="size-5 text-accent" /> : source.source === "csv_import" ? <FileSpreadsheet className="size-5 text-accent" /> : <Webhook className="size-5 text-accent" />}
                      </span>
                      <p className="text-sm font-semibold">{source.name}</p>
                    </div>
                    <Badge variant="neutral">Available</Badge>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{source.description}</p>
                  <Button size="sm" variant="secondary" className="mt-auto w-fit" disabled={!allowed}>
                    Configure source
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
