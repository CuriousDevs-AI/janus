"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronDown, Copy } from "lucide-react";
import { channelMeta } from "@/lib/status-meta";
import { leadSourceConnections } from "@/lib/mock-data";
import { SectionCard } from "@/components/settings/section-ui";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { demoMode } from "@/lib/demo-mode";
import { useApi } from "@/lib/api/use-api";
import type { ChannelType } from "@/lib/types";

const channels: ChannelType[] = ["website_chat", "email", "whatsapp"];

// Website and WhatsApp also capture leads — reuse their connection config
// (webhook URLs, embed snippet, business account) instead of duplicating it.
const sourceByChannel: Partial<Record<ChannelType, (typeof leadSourceConnections)[number]>> = {
  website_chat: leadSourceConnections.find((s) => s.source === "website"),
  whatsapp: leadSourceConnections.find((s) => s.source === "whatsapp"),
};

function copy(value: string, label: string) {
  navigator.clipboard?.writeText(value).catch(() => {});
  toast.success(`${label} copied to clipboard`);
}

export function ChannelsSection() {
  // A real account shows its real connections; the sample channels below belong to the preview.
  return demoMode ? <DemoChannelsSection /> : <LiveChannelsSection />;
}

interface WhatsAppConnection { displayPhone: string | null; verifiedName: string | null; status: string; callbackUrl?: string | null }
interface SourceRow { id: string; source: string; name: string; status: string }

/** The company's actual channels: WhatsApp from its connection, websites and forms from Lead Sources. */
function LiveChannelsSection() {
  const whatsapp = useApi<WhatsAppConnection>("/whatsapp/connection");
  const sources = useApi<SourceRow[]>("/sources?limit=50&after_id=0");
  const websites = (sources.data ?? []).filter((item) => item.source === "website" && item.status === "connected");
  const live = whatsapp.data?.status === "connected";
  return (
    <SectionCard title="Channels" description="Where customer messages arrive. Each channel is set up and managed from its own page.">
      <div className="flex flex-col">
        <ChannelRow
          channel="whatsapp"
          state={whatsapp.loading && !whatsapp.data ? "Checking…" : live ? "Connected" : "Not connected"}
          good={live}
          detail={live ? [whatsapp.data?.verifiedName, whatsapp.data?.displayPhone].filter(Boolean).join(" · ") : "Connect a WhatsApp Business number to receive and answer messages here."}
          href="/lead-sources/whatsapp"
          action={live ? "Manage WhatsApp" : "Connect WhatsApp"}
        >
          {live && whatsapp.data?.callbackUrl ? (
            <div className="mt-2 flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">Callback URL set in your WhatsApp Cloud API app; incoming messages arrive here.</span>
              <div className="flex items-center justify-between gap-2 border border-border bg-surface px-2.5 py-2">
                <code className="text-mono truncate text-[11px] text-foreground">{whatsapp.data.callbackUrl}</code>
                <button onClick={() => copy(whatsapp.data!.callbackUrl!, "Callback URL")} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Copy callback URL">
                  <Copy className="size-3.5" />
                </button>
              </div>
            </div>
          ) : null}
        </ChannelRow>
        <ChannelRow
          channel="website_chat"
          state={sources.loading && !sources.data ? "Checking…" : websites.length ? `${websites.length} connected` : "Not connected"}
          good={websites.length > 0}
          detail={websites.length ? websites.map((item) => item.name).join(", ") : "Add a website form or chat as a lead source to receive enquiries from your site."}
          href="/lead-sources"
          action={websites.length ? "Manage lead sources" : "Add a website source"}
        />
        <ChannelRow
          channel="email"
          state="Not available yet"
          good={false}
          detail="Customer email is not received in Janus yet. Team notifications and announcements are still sent by email."
        />
      </div>
    </SectionCard>
  );
}

function ChannelRow({ channel, state, good, detail, href, action, children }: { channel: ChannelType; state: string; good: boolean; detail: string; href?: string; action?: string; children?: React.ReactNode }) {
  const Icon = channelMeta[channel].icon;
  return (
    <div className="border-b border-border/60 py-3.5 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center border border-border bg-surface-2">
            <Icon className="size-3.5 text-muted-foreground" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] font-medium text-foreground">{channelMeta[channel].label}</span>
            <span className="text-[12px] text-muted-foreground">{detail}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={good ? "success" : "neutral"}>{state}</Badge>
          {href && action ? (
            <Button size="sm" variant="secondary" asChild>
              <Link href={href}>{action}</Link>
            </Button>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function DemoChannelsSection() {
  const [connected, setConnected] = React.useState<Record<ChannelType, boolean>>({
    website_chat: true,
    email: true,
    whatsapp: true,
    call: false,
    meeting: false,
    internal_note: false,
  });
  const [allowed, setAllowed] = React.useState<Record<ChannelType, boolean>>({
    website_chat: true,
    email: true,
    whatsapp: true,
    call: false,
    meeting: false,
    internal_note: false,
  });
  const [preferred, setPreferred] = React.useState<ChannelType>("email");
  const [expanded, setExpanded] = React.useState<ChannelType | null>("whatsapp");

  function setPreferredChannel(channel: ChannelType) {
    setPreferred(channel);
    toast.success(`${channelMeta[channel].label} set as preferred channel`);
  }

  return (
    <SectionCard title="Channels" description="Connect and manage where incoming messages arrive and outgoing messages send from.">
      <div className="flex flex-col">
        {channels.map((channel) => {
          const Icon = channelMeta[channel].icon;
          const isConnected = connected[channel];
          const source = sourceByChannel[channel];
          const isExpanded = expanded === channel;
          return (
            <div key={channel} className="border-b border-border/60 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-4 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center border border-border bg-surface-2">
                    <Icon className="size-3.5 text-muted-foreground" />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-medium text-foreground">{channelMeta[channel].label}</span>
                    <Badge variant={isConnected ? "success" : "neutral"} className="w-fit">
                      {isConnected ? "Connected" : "Not connected"}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <button
                    type="button"
                    onClick={() => setPreferredChannel(channel)}
                    className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    <span
                      className={`flex size-3.5 items-center justify-center rounded-full border ${
                        preferred === channel ? "border-accent" : "border-border"
                      }`}
                    >
                      {preferred === channel && <span className="size-1.5 rounded-full bg-accent" />}
                    </span>
                    Preferred
                  </button>

                  <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    Allowed
                    <Switch
                      checked={allowed[channel]}
                      onCheckedChange={(v) => setAllowed((prev) => ({ ...prev, [channel]: v }))}
                    />
                  </label>

                  <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    Connected
                    <Switch
                      checked={isConnected}
                      onCheckedChange={(v) => {
                        setConnected((prev) => ({ ...prev, [channel]: v }));
                        toast.success(`${channelMeta[channel].label} ${v ? "connected" : "disconnected"}`);
                      }}
                    />
                  </label>

                  {source && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpanded(isExpanded ? null : channel)}
                      aria-label={isExpanded ? "Hide connection details" : "Show connection details"}
                    >
                      <ChevronDown className={cn("size-3.5 transition-transform", isExpanded && "rotate-180")} />
                      {isExpanded ? "Hide details" : "Connection details"}
                    </Button>
                  )}
                </div>
              </div>

              {isExpanded && source && isConnected && (
                <div className="mb-4 flex flex-col gap-2 border border-border bg-surface-2 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    How incoming &amp; outgoing messages are wired up
                  </p>

                  {source.connectedAccount && (
                    <DetailRow label={channel === "whatsapp" ? "Business number" : "Account"} value={source.connectedAccount} />
                  )}

                  {source.embedSnippet && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        Embed on your site — messages sent here arrive directly in Inbox, and agent/AI replies send back through the widget.
                      </span>
                      <div className="flex items-center justify-between gap-2 border border-border bg-surface px-2.5 py-2">
                        <code className="text-mono truncate text-[11px] text-foreground">{source.embedSnippet}</code>
                        <button onClick={() => copy(source.embedSnippet!, "Embed snippet")} className="shrink-0 text-muted-foreground hover:text-foreground">
                          <Copy className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {source.webhookUrl && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        Configured as the callback URL in your WhatsApp Cloud API app — this is where incoming messages land. Outgoing replies send back through the same API using the number above.
                      </span>
                      <div className="flex items-center justify-between gap-2 border border-border bg-surface px-2.5 py-2">
                        <code className="text-mono truncate text-[11px] text-foreground">{source.webhookUrl}</code>
                        <button onClick={() => copy(source.webhookUrl!, "Webhook URL")} className="shrink-0 text-muted-foreground hover:text-foreground">
                          <Copy className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  <Button size="sm" variant="secondary" className="mt-1 w-fit" asChild>
                    <Link href={`/lead-sources/${source.id}`}>View full connection &amp; recent events</Link>
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-mono text-foreground">{value}</span>
    </div>
  );
}
