"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { channelMeta } from "@/lib/status-meta";
import { SectionCard } from "@/components/settings/section-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api/use-api";
import type { ChannelType } from "@/lib/types";

function copy(value: string, label: string) {
  navigator.clipboard?.writeText(value).catch(() => {});
  toast.success(`${label} copied to clipboard`);
}

export function ChannelsSection() {
  return <LiveChannelsSection />;
}

interface WhatsAppConnection { displayPhone: string | null; verifiedName: string | null; status: string; callbackUrl?: string | null }
interface SourceRow { id: string; source: string; name: string; status: string }

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
