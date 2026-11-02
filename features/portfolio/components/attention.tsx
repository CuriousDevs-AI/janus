"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-ui";
import { attentionOf, openIn, useRoles } from "@/features/portfolio/lib/companies";
import { severityName, severityTone } from "@/features/portfolio/lib/format";
import type { PortfolioCompany } from "@/features/portfolio/types";

export function AttentionList({ list, limit, onOpen, read = [] }: { list: PortfolioCompany[]; limit?: number; onOpen?: (key: string) => void; read?: string[] }) {
  const { owns } = useRoles();
  const items = attentionOf(list);
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing needs you in any company.</p>;
  return <ul className="flex flex-col divide-y divide-border">{items.slice(0, limit ?? items.length).map((item) => <li key={item.key} className={`flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0 ${read.includes(item.key) ? "opacity-60" : ""}`}>
    <Badge variant={severityTone[item.severity]}>{severityName[item.severity]}</Badge>
    <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{item.company.name}</span> · {item.text}</span>
    {(owns(item.company) || item.to.startsWith("/portfolio")) && <Button size="sm" variant="secondary" onClick={() => { onOpen?.(item.key); if (item.to.startsWith("/portfolio")) window.location.assign(item.to); else openIn(item.company, item.to); }}>Open</Button>}
  </li>)}</ul>;
}

const readKey = "janus.portfolio-live-read";

/** What a notification is about, from where it opens. */
function categoryOf(text: string, to: string) {
  if (/approval/.test(text)) return "Approvals";
  if (to.includes("compliance")) return "Compliance";
  if (to.includes("finance")) return "Money";
  if (to.includes("projects")) return "Delivery";
  if (to.includes("tickets")) return "Support";
  if (to.includes("operations")) return "Stock";
  return "Other";
}

/** Notifications say what is wrong right now, from every company; each opens where it is dealt with.
 * Which ones were read is remembered in this browser only. To act, use the Work inbox. */
export function Notifications({ list }: { list: PortfolioCompany[] }) {
  const [company, setCompany] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const [severity, setSeverity] = React.useState("all");
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [read, setRead] = React.useState<string[]>(() => { try { return JSON.parse(window.localStorage.getItem(readKey) ?? "[]"); } catch { return []; } });
  const all = attentionOf(list).map((item) => ({ ...item, category: categoryOf(item.text, item.to) }));
  const items = all.filter((item) => (company === "all" || item.company.id === company) && (category === "all" || item.category === category) && (severity === "all" || item.severity === severity) && (!unreadOnly || !read.includes(item.key)));
  const mark = (keys: string[]) => { const next = [...new Set([...read, ...keys])]; setRead(next); try { window.localStorage.setItem(readKey, JSON.stringify(next)); } catch { /* private mode */ } };
  const unread = all.filter((item) => !read.includes(item.key));
  const categories = [...new Set(all.map((item) => item.category))].sort();
  const { owns } = useRoles();
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
      {(owns(item.company) || item.to.startsWith("/portfolio")) && <Button size="sm" variant="secondary" onClick={() => { mark([item.key]); if (item.to.startsWith("/portfolio")) window.location.assign(item.to); else openIn(item.company, item.to); }}>Open</Button>}
    </li>)}</ul>}
    {all.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{all.length - unread.length} of {all.length} marked read in this browser.</p>}
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
