"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api, message } from "@/lib/api/client";
import { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
import { enablePush } from "@/lib/push";
import { SectionCard } from "@/components/settings/section-ui";
import { attentionOf, openIn, useRoles } from "@/features/portfolio/lib/companies";
import { severityName, severityTone } from "@/features/portfolio/lib/format";
import { defaultThresholds, usePreferences, type Thresholds } from "@/features/portfolio/lib/preferences";
import { categoryOf, NotificationDetail, type NoticeItem } from "@/features/portfolio/components/notification-detail";
import type { PortfolioCompany } from "@/features/portfolio/types";

export function AttentionList({ list, limit, onOpen, read = [] }: { list: PortfolioCompany[]; limit?: number; onOpen?: (key: string) => void; read?: string[] }) {
  const items = attentionOf(list);
  const [shown, setShown] = React.useState<NoticeItem | null>(null);
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing needs you in any company.</p>;
  return <><ul className="flex flex-col divide-y divide-border">{items.slice(0, limit ?? items.length).map((item) => <li key={item.key} className={`flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0 ${read.includes(item.key) ? "opacity-60" : ""}`}>
    <Badge variant={severityTone[item.severity]}>{severityName[item.severity]}</Badge>
    <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{item.company.name}</span> · {item.text}</span>
    <Button size="sm" variant="secondary" onClick={() => { onOpen?.(item.key); setShown(item); }}>Open</Button>
  </li>)}</ul>
    {shown && <NotificationDetail item={shown} read={read.includes(shown.key)} onClose={() => setShown(null)} />}
  </>;
}

/** Notifications say what is wrong right now, from every company; each opens where it is dealt with.
 * Which ones were read is kept on the server, so every browser agrees. To act, use the Work inbox. */
export function Notifications({ list }: { list: PortfolioCompany[] }) {
  const [company, setCompany] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const [severity, setSeverity] = React.useState("all");
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const preferences = usePreferences();
  const read = preferences.value.read;
  const all = attentionOf(list).map((item) => ({ ...item, category: categoryOf(item.text, item.to) }));
  const items = all.filter((item) => (company === "all" || item.company.id === company) && (category === "all" || item.category === category) && (severity === "all" || item.severity === severity) && (!unreadOnly || !read.includes(item.key)));
  const mark = (keys: string[]) => { void preferences.save({ ...preferences.value, read: [...new Set([...read, ...keys])] }); };
  const unread = all.filter((item) => !read.includes(item.key));
  const categories = [...new Set(all.map((item) => item.category))].sort();
  const [shown, setShown] = React.useState<NoticeItem | null>(null);
  const select = "h-8 rounded-md border border-input bg-surface-2 px-2 text-[13px]";
  return <SectionCard title={`${unread.length} unread`} description="What is wrong right now in each company, most urgent first. To get it done, use the Work inbox." action={<Button size="sm" variant="secondary" disabled={unread.length === 0} onClick={() => mark(all.map((item) => item.key))}><Check className="mr-1 size-4" />Mark all read</Button>}>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <select aria-label="Company" className={select} value={company} onChange={(event) => setCompany(event.target.value)}><option value="all">All companies</option>{list.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select aria-label="Kind" className={select} value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Every kind</option>{categories.map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Urgency" className={select} value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">Any urgency</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unreadOnly} onChange={() => setUnreadOnly(!unreadOnly)} />Unread only</label>
    </div>
    {items.length === 0 ? <p className="text-sm text-muted-foreground">{all.length ? "Nothing matches these filters." : "Nothing is wrong in any company."}</p> : <ul className="flex flex-col divide-y divide-border">{items.map((item) => <li key={item.key} className={`flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0 ${read.includes(item.key) ? "opacity-60" : ""}`}>
      <Badge variant={severityTone[item.severity]}>{severityName[item.severity]}</Badge>
      <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{item.company.name}</span> · {item.text} <span className="text-xs text-muted-foreground">· {item.category}</span></span>
      {!read.includes(item.key) && <Button size="sm" variant="ghost" onClick={() => mark([item.key])}>Mark read</Button>}
      <Button size="sm" variant="secondary" onClick={() => { mark([item.key]); setShown(item); }}>Open</Button>
    </li>)}</ul>}
    {all.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{all.length - unread.length} of {all.length} marked read.</p>}
    {shown && <NotificationDetail item={shown} read={read.includes(shown.key)} onMarkRead={() => mark([shown.key])} onClose={() => setShown(null)} />}
  </SectionCard>;
}

type BrowserPush = "unsupported" | "default" | "granted" | "denied" | "on";

/** Notifications on this browser for red alerts: asks the browser once, then saves it. */
function BrowserAlerts() {
  // Rendered only once the setting has loaded in the browser, so reading the permission here is safe.
  const [state, setState] = React.useState<BrowserPush>(() => ("Notification" in window && "PushManager" in window ? Notification.permission : "unsupported"));
  React.useEffect(() => {
    // Already allowed: save this browser again quietly, so the server knows it.
    if (state === "granted") void enablePush().then((on) => setState(on ? "on" : "granted")).catch(() => undefined);
  }, [state]);
  if (state === "unsupported") return null;
  if (state === "on") return <span className="block text-xs text-success">This browser shows them too.</span>;
  if (state === "denied") return <span className="block text-xs text-muted-foreground">This browser blocks notifications from Janus; allow them in its site settings to get red alerts here.</span>;
  return <Button size="sm" variant="outline" className="mt-1" onClick={() => void Notification.requestPermission().then(async (answer) => {
    if (answer !== "granted") { setState(answer); return; }
    const on = await enablePush().catch(() => false);
    setState(on ? "on" : "granted");
    if (on) toast.success("Red alerts will show on this browser too.");
    else toast.error("Notifications are not set up on this server yet.");
  })}>Show them on this browser too</Button>;
}

/** An email, and a notification on browsers that allowed it, as soon as a company turns red,
 * besides Monday's email. Owners have it on unless they turn it off. */
function AlertsSwitch() {
  const setting = usePortfolioApi<{ enabled: boolean }>("/portfolio/alerts");
  const [enabled, setEnabled] = React.useState<boolean | null>(null);
  const on = enabled ?? setting.data?.enabled ?? false;
  const toggle = async (next: boolean) => {
    setEnabled(next);
    try { await api("/portfolio/alerts", { method: "PUT", body: JSON.stringify({ enabled: next }) }); toast.success(next ? "You will be told when a company turns red." : "Red alerts are off."); }
    catch (error) { setEnabled(!next); toast.error(message(error)); }
  };
  return <div><label className="flex items-start gap-3 text-sm"><Switch checked={on} disabled={setting.loading} onCheckedChange={(value) => void toggle(value)} aria-label="Email me when a company turns red" /><span><span className="font-medium">Tell me when a company turns red</span><span className="block text-xs text-muted-foreground">By email, and on browsers where you allow notifications. Checked about once an hour with these thresholds; a company that stays red is told once. Owners have this on unless they turn it off.</span></span></label>{on && <div className="ml-12 mt-1"><BrowserAlerts /></div>}</div>;
}

/** When a company turns red for this person: overdue money, approvals waiting and late bills. */
export function ThresholdsCard() {
  const preferences = usePreferences();
  const [draft, setDraft] = React.useState<Thresholds | null>(null);
  const value = draft ?? preferences.value.thresholds;
  const set = (patch: Partial<Thresholds>) => setDraft({ ...value, ...patch });
  const number = (text: string, max: number) => Math.min(max, Math.max(0, Math.round(Number(text) || 0)));
  const field = "h-8 w-28 rounded-md border border-input bg-surface-2 px-2 text-[13px] tabular-nums";
  const save = async () => { if (await preferences.save({ ...preferences.value, thresholds: value })) { toast.success("Saved. Health is worked out again with your thresholds."); window.location.reload(); } };
  return <SectionCard title="When is a company red?" description="Your own thresholds. They change health on every Portfolio page and in your emails, for you only.">
    <div className="mb-4"><AlertsSwitch /></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm">Money owed is red once some of it is late by
        <select aria-label="Overdue is red after" className={field} value={value.overdueRedAfterDays} onChange={(event) => set({ overdueRedAfterDays: Number(event.target.value) as 30 | 60 })}><option value={30}>30 days</option><option value={60}>60 days</option></select></label>
      <label className="flex flex-col gap-1 text-sm">Ignore overdue amounts under (₹)
        <input aria-label="Ignore overdue under" type="number" min={0} className={field} value={value.overdueMinimum} onChange={(event) => set({ overdueMinimum: number(event.target.value, 1e10) })} /></label>
      <label className="flex flex-col gap-1 text-sm">Approvals waiting are red above
        <input aria-label="Approvals red above" type="number" min={0} className={field} value={value.approvalsRedAbove} onChange={(event) => set({ approvalsRedAbove: number(event.target.value, 1000) })} /></label>
      <label className="flex flex-col gap-1 text-sm">Late supplier bills are red at this share of the week&apos;s bills (%)
        <input aria-label="Late bills red at percent" type="number" min={0} max={100} className={field} value={value.lateBillsRedShare} onChange={(event) => set({ lateBillsRedShare: number(event.target.value, 100) })} /></label>
    </div>
    <div className="mt-4 flex gap-2"><Button size="sm" onClick={save} disabled={!draft}>Save thresholds</Button><Button size="sm" variant="ghost" onClick={() => setDraft(defaultThresholds)}>Use the defaults</Button></div>
  </SectionCard>;
}

export function ApprovalsCard({ list }: { list: PortfolioCompany[] }) {
  const { owns } = useRoles();
  const waiting = list.filter((item) => item.approvals.length > 0);
  const total = waiting.reduce((sum, item) => sum + item.approvals.reduce((count, entry) => count + entry.count, 0), 0);
  return <SectionCard title={`Waiting for a decision${total ? ` (${total})` : ""}`} description="Approvals in each company. Open one to decide it there.">
    {waiting.length === 0 ? <p className="text-sm text-muted-foreground">No approvals are waiting in any company.</p> : <ul className="flex flex-col gap-3">{waiting.map((item) => <li key={item.id}><p className="text-sm font-medium">{item.name}</p><ul className="mt-1 flex flex-wrap gap-2">{item.approvals.map((entry) => <li key={entry.kind}>{owns(item) ? <Button size="sm" variant="outline" onClick={() => openIn(item, entry.to)}>{entry.count} {(entry.count === 1 ? entry.one : entry.label).toLowerCase()}</Button> : <Badge variant="neutral">{entry.count} {(entry.count === 1 ? entry.one : entry.label).toLowerCase()}</Badge>}</li>)}</ul></li>)}</ul>}
  </SectionCard>;
}
