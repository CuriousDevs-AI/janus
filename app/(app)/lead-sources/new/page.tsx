"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, FileSpreadsheet, Globe, Key, MessageCircle, Phone, Users, Webhook } from "lucide-react";
import { useSession } from "@/components/auth/session-provider";
import { useApi } from "@/lib/api/use-api";
import type { Preset, Source, SourceKind } from "@/lib/api/types";
import { ConnectionForm } from "@/components/lead-sources/connection-form";
import { SecretValue } from "@/components/lead-sources/secret-value";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const sourceOptions = [
  ["Website Form & Chat Widget", "Add a form to your website and capture enquiries automatically.", Globe, "/lead-sources/new?kind=embed"],
  ["WhatsApp Business", "Connect Meta Cloud API for follow-ups and replies.", MessageCircle, "/lead-sources/whatsapp"],
  ["Custom Webhook", "Receive leads from forms, ads, Zapier, Make or your own tools.", Webhook, "/lead-sources/new?kind=webhook&preset=custom"],
  ["Phone Calls & Missed Calls", "Turn new caller numbers into leads with recordings attached.", Phone, "/lead-sources/new?kind=webhook&preset=exotel&calls=1"],
  ["REST API", "Create leads from your own product with a scoped API key.", Key, "/lead-sources/new?kind=api_key"],
  ["CSV Import", "Import a one-off list of leads with contact matching.", FileSpreadsheet, "/lead-sources/new?kind=csv"],
] as const;
const comingSoon = [
  ["Meta Lead Ads", "Facebook and Instagram Instant Forms in one connection.", Users],
  ["IndiaMART", "Pull enquiries using the seller's CRM API key.", Building2],
] as const;

export default function Page() {
  return <Suspense fallback={<p className="p-6">Loading…</p>}><Setup /></Suspense>;
}

function Setup() {
  const params = useSearchParams();
  const selectedKind = params.get("kind");
  const kind = selectedKind || "webhook";
  const session = useSession();
  const allowed = session.permissions.includes("sources:manage") && Boolean(session.user.email_verified_at);
  const presets = useApi<Preset[]>(allowed ? "/sources/presets" : null);
  const [created, setCreated] = useState<Source | null>(null);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <Link href="/lead-sources" className="text-xs text-muted-foreground">← Lead Sources</Link>
      <h1 className="text-xl font-semibold">{created ? "Connection created" : selectedKind ? "Set up a lead source" : "Add a new lead source"}</h1>
      {!allowed ? (
        <p className="text-sm">A verified owner or admin can configure sources.</p>
      ) : !selectedKind ? (
        <>
          <StepIndicator step={1} />
          <p className="max-w-xl text-sm text-muted-foreground">Choose where new enquiries come from. You can add another source later.</p>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Available sources</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {sourceOptions.map(([name, description, Icon, href]) => (
              <Link key={name} href={href} className="group flex min-h-[124px] gap-3 border border-border bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2"><Icon className="size-5 text-muted-foreground group-hover:text-accent" /></span>
                <span className="flex flex-col gap-1"><span className="text-sm font-medium">{name}</span><span className="text-xs leading-relaxed text-muted-foreground">{description}</span></span>
              </Link>
            ))}
          </div>
          <h2 className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coming soon</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {comingSoon.map(([name, description, Icon]) => (
              <article key={name} className="flex min-h-[124px] flex-col gap-3 border border-border bg-surface p-5 opacity-75">
                <div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center border border-border bg-surface-2"><Icon className="size-4 text-muted-foreground" /></span><h3 className="text-sm font-semibold">{name}</h3><Badge variant="neutral">Coming soon</Badge></div>
                <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
                <Button disabled size="sm" className="self-start">Connect</Button>
              </article>
            ))}
          </div>
        </>
      ) : !["embed", "webhook", "api_key", "csv"].includes(kind) ? (
        <p>Source type unavailable.</p>
      ) : created ? (
        <>
          {created.signingSecret && <SecretValue title="Signing secret" value={created.signingSecret} once />}
          {created.callbackUrl && <SecretValue title="Provider callback URL" value={created.callbackUrl} once />}
          <Button asChild className="self-start"><Link href={`/lead-sources/${created.id}`}>Open connection</Link></Button>
        </>
      ) : presets.data ? (
        <>
          <StepIndicator step={2} />
          <ConnectionForm kind={kind as Exclude<SourceKind, "oauth">} presets={presets.data} callsOnly={params.get("calls") === "1"} initialPreset={presets.data.find((p) => p.value === params.get("preset"))?.value} onSaved={setCreated} />
        </>
      ) : <p role="status">{presets.error || "Loading presets…"}</p>}
    </div>
  );
}

function StepIndicator({ step }: { step: 1 | 2 }) {
  return <div className="flex items-center gap-2 text-xs"><span className={step === 1 ? "flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground" : "text-accent"}>1</span><span className={step === 1 ? "text-accent" : "text-muted-foreground"}>Choose a source</span><span className="h-px w-8 bg-border" /><span className={step === 2 ? "flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground" : "text-muted-foreground"}>2</span><span className={step === 2 ? "text-accent" : "text-muted-foreground"}>Set it up</span></div>;
}
