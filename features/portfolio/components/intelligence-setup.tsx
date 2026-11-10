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
import { useApi } from "@/lib/api/use-api";
import { useRoles } from "@/features/portfolio/lib/companies";
import type { AiProvider, PortfolioAsked, PortfolioCompany, PortfolioKnowledgeItem, PortfolioModels } from "@/features/portfolio/types";

/** What Janus knows about each company beyond its records: facts the owner approved, facts Janus
 * suggested that wait for approval, and documents kept in passages. */
export function KnowledgeCard({ list }: { list: PortfolioCompany[] }) {
  const roles = useRoles();
  const owned = list.filter((item) => roles.owns(item));
  const items = useApi<PortfolioKnowledgeItem[]>("/portfolio/knowledge");
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

type Preset = { name: string; provider: AiProvider; model: string; baseUrl?: string; free: string; keyHint: string };

/** Ready settings for common models. Free ones first; a custom address must be allowed by whoever
 * runs Janus (JANUS_AI_ALLOWED_BASE_URLS). */
const presets: Preset[] = [
  { name: "Ollama on your server", provider: "openai_compatible", model: "llama3.1:8b", baseUrl: "http://localhost:11434/v1", free: "Free, open source, runs on your machine. Also qwen2.5:7b or mistral.", keyHint: "Any text, such as ollama-local" },
  { name: "Gemini Flash", provider: "gemini", model: "gemini-2.5-flash", free: "Free tier with daily limits.", keyHint: "Key from Google AI Studio" },
  { name: "Groq", provider: "openai_compatible", model: "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai/v1", free: "Free tier, open models (Llama, Qwen).", keyHint: "Key from console.groq.com" },
  { name: "OpenRouter free models", provider: "openai_compatible", model: "meta-llama/llama-3.3-70b-instruct:free", baseUrl: "https://openrouter.ai/api/v1", free: "Models marked :free cost nothing.", keyHint: "Key from openrouter.ai" },
  { name: "OpenAI", provider: "openai", model: "gpt-4o-mini", free: "Paid.", keyHint: "Key from platform.openai.com" },
  { name: "Anthropic Claude", provider: "anthropic", model: "claude-haiku-5-5", free: "Paid.", keyHint: "Key from console.anthropic.com" },
];
const providerName: Record<AiProvider, string> = { openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini", openai_compatible: "Custom (OpenAI-compatible)" };

/** Sets up a model for a company, with that company's key; it then shows in "Answer with". */
export function ModelSetup({ models, onChange }: { models: PortfolioModels; onChange: () => void }) {
  const [companyId, setCompanyId] = React.useState(models.companies[0]?.id ?? "");
  const [preset, setPreset] = React.useState<Preset>(presets[0]);
  const [model, setModel] = React.useState(presets[0].model);
  const [baseUrl, setBaseUrl] = React.useState(presets[0].baseUrl ?? "");
  const [key, setKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  if (models.companies.length === 0) return null;

  const pick = (name: string) => { const found = presets.find((item) => item.name === name)!; setPreset(found); setModel(found.model); setBaseUrl(found.baseUrl ?? ""); };
  const save = async () => {
    setBusy(true);
    try {
      await api(`/portfolio/companies/${companyId}/ai/${preset.provider}`, { method: "PUT", body: JSON.stringify({ model: model.trim(), apiKey: key || undefined, baseUrl: preset.provider === "openai_compatible" ? baseUrl.trim() : undefined }) });
      setKey(""); onChange(); toast.success("Model saved. Pick it under Answer with.");
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

  return <SectionCard title="Models" description="A model answers with one company's key, and its cost shows in that company's AI usage. Each company's Portfolio questions stop at the monthly cap below. Your figures go only to the model you pick.">
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">{models.companies.map((company) => <li key={company.id} className="flex flex-col gap-1.5 text-sm">
        <p className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-medium">{company.name}</span><span className="text-xs tabular-nums text-muted-foreground">${Number(company.spentUsd).toFixed(2)} of ${Number(company.capUsd).toFixed(2)} this month on Portfolio questions</span></p>
        {company.keys.length === 0 ? <p className="text-xs text-muted-foreground">No model set up.</p> : company.keys.map((item) => <div key={item.provider} className="flex flex-wrap items-center justify-between gap-2 border border-border px-3 py-2"><span>{item.model} <span className="text-xs text-muted-foreground">· {providerName[item.provider]}{item.baseUrl ? ` · ${item.baseUrl}` : ""} · key …{item.keyLastFour}</span>{!item.enabled && <Badge variant="outline" className="ml-2">Off</Badge>}</span><span className="flex gap-1"><Button size="sm" variant="outline" onClick={() => test(company.id, item.provider)}><Plug className="mr-1 size-4" />Test</Button><Button size="sm" variant="ghost" aria-label={`Remove ${item.model}`} onClick={() => remove(company.id, item.provider)}><Trash2 className="size-4" /></Button></span></div>)}
      </li>)}</ul>
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <p className="text-sm font-medium">Add a model</p>
        <div className="flex flex-wrap gap-2">
          <Select value={companyId} onValueChange={setCompanyId}><SelectTrigger className="w-[200px]" aria-label="Company whose key pays"><SelectValue /></SelectTrigger><SelectContent>{models.companies.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
          <Select value={preset.name} onValueChange={pick}><SelectTrigger className="w-[240px]" aria-label="Model"><SelectValue /></SelectTrigger><SelectContent>{presets.map((item) => <SelectItem key={item.name} value={item.name}>{item.name}</SelectItem>)}</SelectContent></Select>
        </div>
        <p className="text-xs text-muted-foreground">{preset.free}{preset.provider === "openai_compatible" ? " Whoever runs Janus must allow this address first (JANUS_AI_ALLOWED_BASE_URLS)." : ""}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input aria-label="Model name" value={model} onChange={(event) => setModel(event.target.value)} />
          {preset.provider === "openai_compatible" && <Input aria-label="Address" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />}
          <Input aria-label="API key" type="password" autoComplete="off" placeholder={preset.keyHint} value={key} onChange={(event) => setKey(event.target.value)} />
        </div>
        <Button className="self-start" size="sm" onClick={save} disabled={busy || !companyId || !model.trim()}>Save model</Button>
      </div>
    </div>
  </SectionCard>;
}
