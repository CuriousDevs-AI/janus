"use client";
import Link from "next/link";
import { can } from "@/lib/permissions";
import { useCallback, useState } from "react";
import {
  ArrowRight, ArrowUpRight, Bell, BellOff, Check, Clock, Lock,
  MessageSquare, Plus, RefreshCw, Send, Settings2, Sparkles, Zap,
} from "lucide-react";
import { useSession } from "@/components/auth/session-provider";
import { useApi } from "@/lib/api/use-api";
import type { Source } from "@/lib/api/types";
import { sourceKindLabel, sourceOptions, comingSoonSources } from "@/lib/lead-source-options";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, cn } from "@/lib/utils";
import { sourceMeta } from "@/lib/lead-sources";

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function writeFlag(key: string, on: boolean) {
  try { if (on) localStorage.setItem(key, "1"); else localStorage.removeItem(key); } catch {}
}

function UpcomingChannelCard({ name, description, Icon, userId }: { name: string; description: string; Icon: React.ComponentType<{ className?: string }>; userId: string }) {
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  const notifyKey = `janus:notify:${userId}:${slug}`;
  const requestKey = `janus:requested:${userId}:${slug}`;

  const [notifyMe, setNotifyMe] = useState(() => readFlag(notifyKey));
  const [showChat, setShowChat] = useState(false);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(() => readFlag(requestKey));

  const toggleNotify = useCallback(() => {
    const next = !notifyMe;
    setNotifyMe(next);
    writeFlag(notifyKey, next);
  }, [notifyMe, notifyKey]);

  const submitRequest = useCallback(() => {
    setSent(true);
    writeFlag(requestKey, true);
  }, [requestKey]);

  return (
    <div className="group relative flex flex-col gap-3 rounded-md border border-dashed border-border/70 bg-surface-2/20 p-4 transition-colors hover:border-border hover:bg-surface-2/40">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{name}</span>
            <Badge variant="neutral" className="text-[10px]">Coming soon</Badge>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleNotify}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
            notifyMe
              ? "bg-accent/10 text-accent"
              : "bg-surface-2 text-muted-foreground hover:bg-surface-2/80 hover:text-foreground",
          )}
        >
          {notifyMe ? <><BellOff className="size-3" /> Subscribed</> : <><Bell className="size-3" /> Notify me</>}
        </button>
        {sent ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1.5 text-[11px] font-medium text-success">
            <Check className="size-3" /> Requested
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setShowChat(!showChat)}
            className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-2/80 hover:text-foreground"
          >
            <MessageSquare className="size-3" /> {showChat ? "Close" : "Request this"}
          </button>
        )}
      </div>

      {showChat && !sent && (
        <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-surface p-3">
          <p className="text-[11px] text-muted-foreground">Tell us what you need from {name} — we prioritise based on requests</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder={`e.g. "Need ${name} to auto-import enquiries daily"`}
              className="flex-1 rounded-md border border-border/50 bg-surface-2/50 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none"
              onKeyDown={(e) => { if (e.key === "Enter" && msg.trim()) submitRequest(); }}
            />
            <button
              type="button"
              disabled={!msg.trim()}
              onClick={submitRequest}
              className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-white transition-opacity disabled:opacity-40"
            >
              <Send className="size-3" /> Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeadSourcesPage() {
  const session = useSession();
  const allowed = can(session, "sources:manage") && Boolean(session.user.email_verified_at);
  const [after, setAfter] = useState("0");
  const sources = useApi<Source[]>(allowed ? `/sources?limit=50&after_id=${after}` : null);
  const sourceRows = sources.data ?? [];
  const unverified = can(session, "sources:manage") && !session.user.email_verified_at;

  const connected = sourceRows.filter((s) => s.status === "connected");
  const paused = sourceRows.filter((s) => s.status !== "connected");
  const totalLeads = sourceRows.reduce((s, r) => s + (r.capturedLeads ?? 0), 0);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col">
      <PageHeader
        title="Lead Sources"
        description="Where your enquiries come from. Connect a source to start capturing leads automatically."
        actions={
          allowed ? (
            <Button size="sm" asChild>
              <Link href="/lead-sources/new"><Plus className="size-3.5" /> Add source</Link>
            </Button>
          ) : (
            <Button size="sm" variant="secondary" disabled><Lock className="size-3" /> Add source</Button>
          )
        }
      />

      {!can(session, "sources:manage") && (
        <p className="px-6 pb-4 text-sm text-muted-foreground">Ask an owner or admin to configure lead sources.</p>
      )}
      {unverified && (
        <p role="status" className="mx-6 mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
          Verify your email to set up lead sources. Use the link in the email Janus sent you, or send it again from the banner at the top.
        </p>
      )}
      {sources.error && (
        <p role="alert" className="mx-6 mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          Could not load sources: {sources.error}. Refresh to try again.
        </p>
      )}

      <div className="flex flex-col gap-8 px-6 pb-24">
        {/* ── Summary strip ── */}
        {sourceRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/50 pb-4 text-sm">
            <span><strong className="text-foreground">{connected.length}</strong> <span className="text-muted-foreground">active</span></span>
            {paused.length > 0 && <span><strong className="text-foreground">{paused.length}</strong> <span className="text-muted-foreground">paused</span></span>}
            <span><strong className="text-foreground tabular-nums">{totalLeads.toLocaleString("en-IN")}</strong> <span className="text-muted-foreground">total leads captured</span></span>
          </div>
        )}

        {/* ── Active sources ── */}
        {(connected.length > 0 || sources.loading) && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active sources</h2>

            {sources.loading && <p className="text-sm text-muted-foreground">Loading...</p>}

            <div className="grid gap-3 sm:grid-cols-2">
              {connected.map((source) => {
                const m = sourceMeta(source.source);
                const Icon = m.icon;
                const href = source.connectionKind === "oauth" ? "/lead-sources/whatsapp" : `/lead-sources/${source.id}`;
                return (
                  <Link
                    key={source.id}
                    href={href}
                    className="group flex items-center gap-3 rounded-md p-3 transition-colors hover:bg-surface-2/50"
                  >
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", m.bg, m.color)}>
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium group-hover:text-accent">{source.name}</span>
                        <span className="size-1.5 shrink-0 rounded-full bg-success" title="Connected" />
                      </div>
                      <p className="text-[11px] text-muted-foreground">{sourceKindLabel(source)}</p>
                    </div>
                    <div className="hidden shrink-0 items-center gap-5 sm:flex">
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums">{source.capturedLeads}</p>
                        <p className="text-[10px] text-muted-foreground">leads</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{source.lastEventAt ? formatDateTime(source.lastEventAt) : "—"}</p>
                        <p className="text-[10px] text-muted-foreground">last lead</p>
                      </div>
                    </div>
                    <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-accent" />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Paused sources ── */}
        {paused.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Paused</h2>
            <div className="divide-y divide-border/40">
              {paused.map((source) => {
                const m = sourceMeta(source.source);
                const Icon = m.icon;
                const href = source.connectionKind === "oauth" ? "/lead-sources/whatsapp" : `/lead-sources/${source.id}`;
                return (
                  <div key={source.id} className="group flex items-center gap-3 py-2.5 opacity-60 hover:opacity-90 transition-opacity">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground">
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={href} className="text-sm font-medium hover:text-accent">{source.name}</Link>
                    </div>
                    <Badge variant="neutral" className="text-[10px]">Paused</Badge>
                    <span className="text-xs tabular-nums text-muted-foreground">{source.capturedLeads}</span>
                    <Link href={href} className="rounded p-1 text-muted-foreground/40 hover:text-foreground">
                      <Settings2 className="size-3.5" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Pagination */}
        {allowed && sourceRows.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <button type="button" onClick={() => { setAfter("0"); sources.reload(); }} className="inline-flex items-center gap-1 hover:text-foreground">
              <RefreshCw className="size-3" /> Refresh
            </button>
            {sourceRows.length === 50 && (
              <button type="button" onClick={() => setAfter(sourceRows.at(-1)!.id)} className="inline-flex items-center gap-1 hover:text-foreground">
                Next page <ArrowRight className="size-3" />
              </button>
            )}
          </div>
        )}

        {/* ── Empty state ── */}
        {sourceRows.length === 0 && !sources.loading && !sources.error && allowed && (
          <div className="flex flex-col items-center gap-2 py-16">
            <span className="flex size-12 items-center justify-center rounded-md bg-accent/10 text-accent">
              <Zap className="size-5" />
            </span>
            <p className="text-sm font-medium">No sources connected yet</p>
            <p className="max-w-xs text-center text-xs text-muted-foreground">Connect your first lead source below — website forms, WhatsApp, phone calls, or APIs — and start capturing enquiries automatically.</p>
            <Button size="sm" asChild className="mt-2">
              <Link href="/lead-sources/new"><Plus className="size-3.5" /> Add your first source</Link>
            </Button>
          </div>
        )}

        {/* ── Available channels ── */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="size-3.5 text-accent" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Available channels</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sourceOptions.map(([name, description, Icon, href]) =>
              allowed ? (
                <Link
                  key={name}
                  href={href}
                  className="group flex items-start gap-3 rounded-md border border-transparent p-3 transition-all hover:border-accent/30 hover:bg-accent/5"
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground transition-colors group-hover:bg-accent/10 group-hover:text-accent">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium group-hover:text-accent">{name}</span>
                      <ArrowRight className="size-3 text-transparent transition-colors group-hover:text-accent" />
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
                  </div>
                </Link>
              ) : (
                <div key={name} className="flex items-start gap-3 p-3 opacity-40" aria-disabled="true">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-muted-foreground">{name}</span>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
                  </div>
                  <Lock className="mt-1 size-3 shrink-0 text-muted-foreground" />
                </div>
              ),
            )}
          </div>
        </section>

        {/* ── Upcoming channels ── */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Clock className="size-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming channels</h2>
            <span className="text-[10px] text-muted-foreground">Vote to help us prioritise</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {comingSoonSources.map(([name, description, Icon]) => (
              <UpcomingChannelCard key={name} name={name} description={description} Icon={Icon} userId={session.user.id} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
