"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, BellRing, CalendarClock, Loader2, Mail, Siren } from "lucide-react";
import { SectionCard } from "@/components/settings/section-ui";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { demoMode } from "@/lib/demo-mode";
import { enablePush } from "@/lib/push";

type Digest = { enabled: boolean; eligible: boolean; nextDueAt: string | null; lastSentAt: string | null };
type Alerts = { enabled: boolean };
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function Row({ icon: Icon, title, text, children }: { icon: React.ComponentType<{ className?: string }>; title: string; text: React.ReactNode; children?: React.ReactNode }) {
  return <div className="flex flex-wrap items-start gap-3 py-4 first:pt-0 last:pb-0">
    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent"><Icon className="size-4" /></span>
    <div className="min-w-[200px] flex-1"><p className="text-sm font-medium">{title}</p><div className="mt-0.5 text-xs leading-5 text-muted-foreground">{text}</div></div>
    {children}
  </div>;
}

/**
 * What Janus actually sends you, each with its own switch: the Monday summary, the alert when a
 * company turns red, and notifications in this browser. Every switch is saved for you on the server.
 */
export function NotificationsSection() {
  const digest = useApi<Digest>(demoMode ? null : "/portfolio/digest");
  const alerts = useApi<Alerts>(demoMode ? null : "/portfolio/alerts");
  const [demo, setDemo] = React.useState({ digest: true, alerts: true });
  const [saving, setSaving] = React.useState<string | null>(null);

  async function save(kind: "digest" | "alerts", enabled: boolean) {
    if (demoMode) { setDemo((current) => ({ ...current, [kind]: enabled })); return; }
    setSaving(kind);
    try {
      await api(`/portfolio/${kind}`, { method: "PUT", body: JSON.stringify({ enabled }) });
      (kind === "digest" ? digest : alerts).reload();
      toast.success(enabled ? "Switched on." : "Switched off.");
    } catch (error) { toast.error(message(error)); } finally { setSaving(null); }
  }

  const digestOn = demoMode ? demo.digest : Boolean(digest.data?.enabled);
  const eligible = demoMode || digest.data?.eligible !== false;
  const alertsOn = demoMode ? demo.alerts : Boolean(alerts.data?.enabled);

  return <div className="flex flex-col gap-4">
    <SectionCard title="Emails and alerts" description="What Janus sends you. Each switch is yours alone and works on every device.">
      {(digest.loading || alerts.loading) ? <p className="text-sm text-muted-foreground">Loading your settings…</p> : <div className="divide-y divide-border">
        <Row icon={Mail} title="Monday summary" text={eligible ? <>An email at 9 every Monday morning with last week&apos;s leads, deals won, sales and collections, what customers owe, cash in the bank and filings due.{digestOn && digest.data?.nextDueAt ? ` Next: ${when(digest.data.nextDueAt)}.` : ""}{digest.data?.lastSentAt ? ` Last sent ${when(digest.data.lastSentAt)}.` : ""}</> : "Your role does not include the company's figures, so there is nothing to summarise for you."}>
          {saving === "digest" ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <Switch aria-label="Monday summary email" checked={digestOn && eligible} disabled={!eligible || digest.error !== undefined} onCheckedChange={(value) => void save("digest", value)} />}
        </Row>
        <Row icon={Siren} title="When a company needs you" text="An email, and a notification in every browser you allowed below, the moment a company you see turns red: customer money long overdue, a loss, cash running short, supplier bills late or a filing missed. Once per problem, not every day.">
          {saving === "alerts" ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <Switch aria-label="Alert when a company needs you" checked={alertsOn} disabled={alerts.error !== undefined} onCheckedChange={(value) => void save("alerts", value)} />}
        </Row>
        <Row icon={CalendarClock} title="Scheduled reports" text="Reports someone in your business set to email you daily, weekly or monthly. Change them where they are set up.">
          <Button size="sm" variant="outline" asChild><Link href="/analytics?workspace=business&tab=scheduled">Business Reports<ArrowRight className="size-3.5" /></Link></Button>
        </Row>
      </div>}
      {(digest.error || alerts.error) && <p className="mt-3 text-xs text-danger">{digest.error ?? alerts.error}</p>}
    </SectionCard>
    <BrowserCard />
    <SectionCard title="Always sent" description="Emails about your own account, which cannot be switched off.">
      <ul className="grid gap-1 text-sm text-muted-foreground">
        <li>• Links to confirm your email, reset your password or confirm a new sign-in email</li>
        <li>• Invitations to join a business</li>
        <li>• Team announcements addressed to you</li>
      </ul>
    </SectionCard>
  </div>;
}

/** Notifications in this browser: asked for here, so the browser's own permission prompt makes sense. */
function BrowserCard() {
  // Read from the browser after it renders; the server cannot know it.
  const seen = React.useSyncExternalStore(() => () => {}, () => "Notification" in window && "serviceWorker" in navigator && "PushManager" in window ? Notification.permission : "unsupported", () => "unsupported" as const);
  const [answered, setPermission] = React.useState<NotificationPermission | null>(null);
  const permission = answered ?? seen;
  const [busy, setBusy] = React.useState(false);
  async function turnOn() {
    setBusy(true);
    try {
      const answer = await Notification.requestPermission();
      setPermission(answer);
      if (answer !== "granted") { toast.message("The browser was not allowed to show notifications."); return; }
      if (demoMode) { toast.success("In the preview nothing is sent."); return; }
      const ok = await enablePush();
      if (ok) toast.success("This browser will show Janus notifications, even with Janus closed.");
      else toast.error("This server cannot send browser notifications yet. Emails still arrive.");
    } catch (error) { toast.error(message(error)); } finally { setBusy(false); }
  }
  return <SectionCard title="This browser" description="Red alerts and team announcements can also appear as notifications on this computer or phone.">
    <Row icon={BellRing} title={permission === "granted" ? "Notifications are on in this browser" : permission === "denied" ? "This browser blocks Janus notifications" : permission === "unsupported" ? "This browser cannot show notifications" : "Notifications are off in this browser"}
      text={permission === "denied" ? "Allow notifications for this site in the browser's settings (the lock icon beside the address), then reload." : permission === "unsupported" ? "Use Chrome, Edge, Firefox or Safari, or add Janus to the home screen on a phone." : permission === "granted" ? "To stop them, turn notifications off for this site in the browser's settings." : "Each browser and phone is asked separately."}>
      {permission === "default" && <Button size="sm" disabled={busy} onClick={() => void turnOn()}>{busy && <Loader2 className="size-3.5 animate-spin" />}Turn on here</Button>}
    </Row>
  </SectionCard>;
}
