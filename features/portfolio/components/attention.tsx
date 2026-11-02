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
/** Notifications are the attention lines; which ones were read is remembered in this browser only. */
export function Notifications({ list }: { list: PortfolioCompany[] }) {
  const [filter, setFilter] = React.useState("all");
  const [read, setRead] = React.useState<string[]>(() => { try { return JSON.parse(window.localStorage.getItem(readKey) ?? "[]"); } catch { return []; } });
  const shown = list.filter((item) => filter === "all" || item.id === filter);
  const items = attentionOf(shown);
  const mark = (keys: string[]) => { const next = [...new Set([...read, ...keys])]; setRead(next); try { window.localStorage.setItem(readKey, JSON.stringify(next)); } catch { /* private mode */ } };
  const unread = items.filter((item) => !read.includes(item.key));
  return <SectionCard title={`${unread.length} unread`} description="From every company, most urgent first. Each opens where it is dealt with." action={<Button size="sm" variant="secondary" disabled={unread.length === 0} onClick={() => mark(items.map((item) => item.key))}><Check className="mr-1 size-4" />Mark all read</Button>}>
    <div role="group" aria-label="Filter by company" className="mb-4 flex flex-wrap gap-2"><Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All companies</Button>{list.map((item) => <Button key={item.id} size="sm" variant={filter === item.id ? "default" : "outline"} onClick={() => setFilter(item.id)}>{item.name}</Button>)}</div>
    <AttentionList list={shown} read={read} onOpen={(key) => mark([key])} />
    {items.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{items.length - unread.length} of {items.length} marked read in this browser.</p>}
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
