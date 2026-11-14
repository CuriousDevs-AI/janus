"use client";

import * as React from "react";
import { Check, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
import { useRoles } from "@/features/portfolio/lib/companies";
import type { PortfolioCompany, PortfolioKnowledgeItem } from "@/features/portfolio/types";

/** What Janus knows about each company beyond its records: facts the owner approved, facts Janus
 * suggested that wait for approval, and documents kept in passages. */
/** `bare` drops the card's own heading, for a page that already names it. */
export function KnowledgeCard({ list, bare = false }: { list: PortfolioCompany[]; bare?: boolean }) {
  const roles = useRoles();
  const owned = list.filter((item) => roles.owns(item));
  const items = usePortfolioApi<PortfolioKnowledgeItem[]>("/portfolio/knowledge");
  const [companyId, setCompanyId] = React.useState(owned[0]?.id ?? "");
  const [kind, setKind] = React.useState<"fact" | "document">("fact");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const add = async () => {
    setSaving(true);
    try {
      await api("/portfolio/knowledge", { method: "POST", body: JSON.stringify({ companyId, kind, title: title.trim() || (kind === "fact" ? "Fact" : "Document"), body }) });
      setTitle(""); setBody(""); items.reload();
      toast.success(kind === "fact" ? "Janus will use this fact in answers." : "Document added. Janus finds the parts that answer a question.");
    } catch (error) { toast.error(message(error)); } finally { setSaving(false); }
  };
  const decide = async (item: PortfolioKnowledgeItem, approve: boolean) => {
    try {
      await api(`/portfolio/companies/${item.companyId}/knowledge/${item.id}${approve ? "/approve" : ""}`, { method: approve ? "PUT" : "DELETE" });
      items.reload();
    } catch (error) { toast.error(message(error)); }
  };

  // Only the companies on this page: one company's Business Management shows only its own.
  const all = (items.data ?? []).filter((item) => list.some((company) => company.id === item.companyId));
  const suggested = all.filter((item) => item.status === "suggested");
  const facts = all.filter((item) => item.kind === "fact" && item.status === "approved");
  const documents = Object.values(all.filter((item) => item.kind === "document").reduce<Record<string, PortfolioKnowledgeItem[]>>((groups, item) => { (groups[item.document ?? item.id] ??= []).push(item); return groups; }, {}));
  const ownsCompany = (id: string) => owned.some((item) => item.id === id);

  const content = <>
    <div className="flex flex-col gap-4">
      {items.error && <p className="text-sm text-danger">{items.error}</p>}
      {suggested.length > 0 && <div className="flex flex-col gap-2 border border-warning/40 bg-surface-2 p-3">
        <p className="text-sm font-medium">Waiting for your approval</p>
        {suggested.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span><span className="text-muted-foreground">{item.company}: </span>{item.body}</span>{ownsCompany(item.companyId) && <span className="flex gap-1"><Button size="sm" variant="outline" onClick={() => decide(item, true)}><Check className="mr-1 size-4" />Remember</Button><Button size="sm" variant="ghost" onClick={() => decide(item, false)}>Discard</Button></span>}</div>)}
      </div>}
      {facts.length === 0 && documents.length === 0 && !items.loading && <p className="text-sm text-muted-foreground">Nothing yet. Add what is not in your records, such as &quot;Kavita Stores pays on the 20th&quot; or your refund policy.</p>}
      {facts.length > 0 && <ul className="divide-y divide-border border-y border-border">{facts.map((item) => <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span><span className="text-muted-foreground">{item.company}: </span>{item.body}</span>{ownsCompany(item.companyId) && <Button size="sm" variant="ghost" aria-label={`Remove fact: ${item.body}`} onClick={() => decide(item, false)}><Trash2 className="size-4" /></Button>}</li>)}</ul>}
      {documents.length > 0 && <ul className="flex flex-col gap-2">{documents.map((parts) => <li key={parts[0].document ?? parts[0].id} className="flex items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2"><FileText className="size-4 text-muted-foreground" aria-hidden />{parts[0].title}<span className="text-xs text-muted-foreground">{parts[0].company} · {parts.length} passage{parts.length === 1 ? "" : "s"}</span></span>{ownsCompany(parts[0].companyId) && <Button size="sm" variant="ghost" aria-label={`Remove document ${parts[0].title}`} onClick={() => decide(parts[0], false)}><Trash2 className="size-4" /></Button>}</li>)}</ul>}
      {owned.length > 0 ? <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex flex-wrap gap-2">
          <Select value={companyId} onValueChange={setCompanyId}><SelectTrigger className="w-[200px]" aria-label="Company"><SelectValue /></SelectTrigger><SelectContent>{owned.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
          <Select value={kind} onValueChange={(value) => setKind(value as "fact" | "document")}><SelectTrigger className="w-[160px]" aria-label="Kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fact">A fact</SelectItem><SelectItem value="document">A document</SelectItem></SelectContent></Select>
          {kind === "document" && <Input className="max-w-xs" aria-label="Document title" placeholder="Title, such as Refund policy" value={title} onChange={(event) => setTitle(event.target.value)} />}
        </div>
        {kind === "fact" ? <Input aria-label="Fact" placeholder="Kavita Stores pays on the 20th" value={body} onChange={(event) => setBody(event.target.value)} /> : <Textarea aria-label="Document text" rows={5} placeholder="Paste the text of a policy, contract or note" value={body} onChange={(event) => setBody(event.target.value)} />}
        <Button className="self-start" size="sm" onClick={add} disabled={saving || body.trim().length < 2 || !companyId}>{kind === "fact" ? "Add fact" : "Add document"}</Button>
      </div> : <p className="text-xs text-muted-foreground">Only a company&apos;s Owner adds to what Janus knows about it.</p>}
    </div>
  </>;
  return bare
    ? <section className="rounded-lg border border-border bg-surface p-4">{content}</section>
    : <SectionCard title="What Janus knows" description="Facts and documents Janus uses beside your records, per company. Everyone who can see a company's figures can see what Janus knows about it. Janus never remembers anything on its own: what it suggests waits for the owner.">{content}</SectionCard>;
}
