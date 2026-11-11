"use client";

import * as React from "react";
import { Check, FileText, Plug, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
import { useRoles } from "@/features/portfolio/lib/companies";
import type { AiProvider, PortfolioAsked, PortfolioCompany, PortfolioKnowledgeItem, PortfolioModels } from "@/features/portfolio/types";

/** What Janus knows about each company beyond its records: facts the owner approved, facts Janus
 * suggested that wait for approval, and documents kept in passages. */
export function KnowledgeCard({ list }: { list: PortfolioCompany[] }) {
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

  const all = items.data ?? [];
  const suggested = all.filter((item) => item.status === "suggested");
  const facts = all.filter((item) => item.kind === "fact" && item.status === "approved");
  const documents = Object.values(all.filter((item) => item.kind === "document").reduce<Record<string, PortfolioKnowledgeItem[]>>((groups, item) => { (groups[item.document ?? item.id] ??= []).push(item); return groups; }, {}));
  const ownsCompany = (id: string) => owned.some((item) => item.id === id);

  return <SectionCard title="What Janus knows" description="Facts and documents Janus uses beside your records, per company. Everyone who sees a company's Portfolio can see its knowledge. Janus never remembers anything on its own: what it suggests waits for the owner.">
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
  </SectionCard>;
}

/** Paid models, below the free ones. */
const paid: { name: string; provider: AiProvider; model: string; keyUrl: string }[] = [
  { name: "OpenAI", provider: "openai", model: "gpt-4o-mini", keyUrl: "https://platform.openai.com/api-keys" },
  { name: "Anthropic Claude", provider: "anthropic", model: "claude-haiku-5-5", keyUrl: "https://console.anthropic.com/settings/keys" },
];
const providerName: Record<AiProvider, string> = { openai: "OpenAI", anthropic: "Anthropic", gemini: "Google Gemini", openai_compatible: "Custom (OpenAI-compatible)", openrouter: "OpenRouter", groq: "Groq", cerebras: "Cerebras", mistral: "Mistral", sambanova: "SambaNova", github: "GitHub Models", nvidia: "NVIDIA", huggingface: "Hugging Face" };
type Choice = { provider: AiProvider; name: string; model: string; models: string[]; keyUrl: string; limits: string };

/** Sets up a model for a company, with that company's key; it then shows in "Answer with". Free
 * providers come first, each with its free models and where to get a key. */
export function ModelSetup({ models, onChange }: { models: PortfolioModels; onChange: () => void }) {
  const [companyId, setCompanyId] = React.useState(models.companies[0]?.id ?? "");
  const [choice, setChoice] = React.useState<Choice | null>(null);
  const [key, setKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  if (models.companies.length === 0) return null;
  const company = models.companies.find((item) => item.id === companyId) ?? models.companies[0];
  const has = (provider: AiProvider) => company.keys.find((item) => item.provider === provider);

  const save = async () => {
    if (!choice) return;
    setBusy(true);
    try {
      await api(`/portfolio/companies/${company.id}/ai/${choice.provider}`, { method: "PUT", body: JSON.stringify({ model: choice.model.trim(), apiKey: key || undefined }) });
      setKey(""); setChoice(null); onChange(); toast.success(`${choice.name} saved for ${company.name}. Pick it under Answer with.`);
    } catch (error) { toast.error(message(error)); } finally { setBusy(false); }
  };
  const test = async (id: string, provider: AiProvider) => {
    try { const result = await api<PortfolioAsked>(`/portfolio/companies/${id}/ai/${provider}/test`, { method: "POST" }); toast.success(`${result.model} answered: ${result.answer.slice(0, 80)}`); }
    catch (error) { toast.error(message(error)); }
  };
  const remove = async (id: string, provider: AiProvider) => {
    try { await api(`/portfolio/companies/${id}/ai/${provider}`, { method: "DELETE" }); onChange(); }
    catch (error) { toast.error(message(error)); }
  };
  const pick = (next: Choice) => { setChoice(next); setKey(""); };

  return <>
    <SectionCard title="Free models" description="These providers give a free API key. Each sets and changes its own limits and models: the models shown are examples, so check the provider's current list, or type another name. Pick one, paste the key, and use Test to check it. Your figures go only to the provider you pick." action={<Select value={company.id} onValueChange={setCompanyId}><SelectTrigger className="w-[200px]" aria-label="Company whose key it is"><SelectValue /></SelectTrigger><SelectContent>{models.companies.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>}>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{models.free.map((item) => { const saved = has(item.provider as AiProvider); return <li key={item.id} className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3 text-sm">
        <p className="flex items-center justify-between gap-2"><span className="font-medium">{item.name}</span>{saved ? <Badge variant="success">Set up</Badge> : <Badge variant="neutral">Free</Badge>}</p>
        <p className="text-xs text-muted-foreground">{item.limits}</p>
        <ul className="flex flex-wrap gap-1">{item.models.map((model) => <li key={model}><button type="button" className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${choice?.provider === item.provider && choice.model === model ? "border-accent bg-accent-muted" : "border-border hover:bg-surface"}`} onClick={() => pick({ provider: item.provider as AiProvider, name: item.name, model, models: item.models, keyUrl: item.keyUrl, limits: item.limits })}>{model}</button></li>)}</ul>
        {saved ? <p className="mt-auto flex flex-wrap items-center gap-1 text-xs text-muted-foreground">Using {saved.model} · key …{saved.keyLastFour}<Button size="sm" variant="ghost" onClick={() => test(company.id, saved.provider)}><Plug className="mr-1 size-3.5" />Test</Button><Button size="sm" variant="ghost" aria-label={`Remove ${item.name}`} onClick={() => remove(company.id, saved.provider)}><Trash2 className="size-3.5" /></Button></p>
          : <span className="mt-auto flex flex-wrap gap-3 text-xs"><a className="text-accent underline" href={item.keyUrl} target="_blank" rel="noreferrer">Get a free key</a><a className="text-muted-foreground underline" href={item.modelsUrl} target="_blank" rel="noreferrer">See current free models</a></span>}
      </li>; })}</ul>
      {choice && <form className="mt-4 grid gap-2 rounded-md border border-accent-border bg-accent-muted/40 p-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <p className="text-sm sm:col-span-3"><span className="font-medium">{choice.name}</span> for {company.name}. {choice.limits} <a className="text-accent underline" href={choice.keyUrl} target="_blank" rel="noreferrer">Get a key</a></p>
        <label className="grid gap-1 text-xs text-muted-foreground">Model<Input aria-label="Model name" value={choice.model} onChange={(event) => setChoice({ ...choice, model: event.target.value })} /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">API key<Input aria-label="API key" type="password" autoComplete="off" placeholder={has(choice.provider) ? "Leave empty to keep the saved key" : `Paste your ${choice.name} key`} value={key} onChange={(event) => setKey(event.target.value)} /></label>
        <span className="flex items-end gap-2"><Button type="submit" size="sm" disabled={busy || !choice.model.trim() || (!key && !has(choice.provider))}>Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setChoice(null)}>Cancel</Button></span>
      </form>}
    </SectionCard>
    <SectionCard title="Paid models and spend" description="A paid model is billed to the company whose key it is, and shows in its AI usage. Each company's Portfolio questions stop at the monthly cap.">
      <ul className="flex flex-col gap-3">{models.companies.map((item) => <li key={item.id} className="flex flex-col gap-1.5 text-sm">
        <p className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-medium">{item.name}</span><span className="text-xs tabular-nums text-muted-foreground">${Number(item.spentUsd).toFixed(2)} of ${Number(item.capUsd).toFixed(2)} this month on Portfolio questions</span></p>
        {item.keys.filter((saved) => !models.free.some((free) => free.provider === saved.provider)).map((saved) => <div key={saved.provider} className="flex flex-wrap items-center justify-between gap-2 border border-border px-3 py-2"><span>{saved.model} <span className="text-xs text-muted-foreground">· {providerName[saved.provider]}{saved.baseUrl ? ` · ${saved.baseUrl}` : ""} · key …{saved.keyLastFour}</span>{!saved.enabled && <Badge variant="outline" className="ml-2">Off</Badge>}</span><span className="flex gap-1"><Button size="sm" variant="outline" onClick={() => test(item.id, saved.provider)}><Plug className="mr-1 size-4" />Test</Button><Button size="sm" variant="ghost" aria-label={`Remove ${saved.model}`} onClick={() => remove(item.id, saved.provider)}><Trash2 className="size-4" /></Button></span></div>)}
      </li>)}</ul>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">{paid.map((item) => <Button key={item.provider} size="sm" variant="outline" onClick={() => pick({ provider: item.provider, name: item.name, model: item.model, models: [item.model], keyUrl: item.keyUrl, limits: "Paid by use." })}>Add {item.name}</Button>)}</div>
    </SectionCard>
  </>;
}
