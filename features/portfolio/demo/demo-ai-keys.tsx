"use client";

import * as React from "react";
import {
  AlertCircle, Check, ChevronRight, ExternalLink,
  KeyRound, Loader2, MoreHorizontal, Plug, Plus, RefreshCw, RotateCcw, Search, Settings2,
  Sparkles, ToggleLeft, ToggleRight, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SectionCard } from "@/components/settings/section-ui";
import { CompanyLogo } from "@/components/shared/company-logo";
import { Kpi } from "@/features/portfolio/components/figures";
import { AI_PROVIDERS, getModelsForProvider, getProvider, filterProviders, USE_CASES, type ProviderDef, type ProviderTab, type ModelDef, type UseCaseId } from "@/lib/ai-providers";
import { useAiModelsStore, type ConnectedProvider } from "@/lib/stores/ai-models-store";
import type { CompanySummary } from "@/features/portfolio/demo/group-summary";

const selectClass = "h-9 rounded-md border border-input bg-surface px-3 text-sm text-foreground";
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

type Tab = "providers" | "keys" | "models" | "defaults";
const tabs: { id: Tab; label: string }[] = [
  { id: "providers", label: "Providers" },
  { id: "keys", label: "Keys" },
  { id: "models", label: "Models" },
  { id: "defaults", label: "Defaults & Routing" },
];

export function DemoAiModelsKeys({ list }: { list: CompanySummary[] }) {
  const [tab, setTab] = React.useState<Tab>("providers");
  const [adding, setAdding] = React.useState(false);
  const connections = useAiModelsStore((s) => s.connections);
  const enabledModels = useAiModelsStore((s) => s.enabledModels);
  const totalModels = enabledModels.filter((m) => m.enabled).length;
  const totalSpend = connections.reduce((s, c) => s + c.spentInr, 0);
  const connected = connections.filter((c) => c.status === "connected").length;
  const errors = connections.filter((c) => c.status === "error").length;

  return <>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi label="Connected providers" value={String(connections.length)} detail={connected ? `${connected} active${errors ? `, ${errors} with errors` : ""}` : "Add a provider to start"} />
      <Kpi label="Models available" value={String(totalModels)} detail={totalModels ? "Enabled across providers" : "Connect a provider first"} />
      <Kpi label="This month" value={totalSpend ? inr(totalSpend) : "—"} detail="Estimated AI spend" />
      <Kpi label="Companies" value={String(list.length)} detail="In your portfolio" />
    </div>

    <div role="tablist" className="flex gap-1 border-b border-border">
      {tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
        className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>)}
      <div className="flex-1" />
      <Button size="sm" className="my-1.5" onClick={() => setAdding(true)}><Plus className="size-3.5" />Add provider</Button>
    </div>

    {tab === "providers" && <ProvidersTab list={list} onAdd={() => setAdding(true)} />}
    {tab === "keys" && <KeysTab />}
    {tab === "models" && <ModelsTab />}
    {tab === "defaults" && <DefaultsTab />}

    {adding && <AddProviderDialog list={list} onClose={() => setAdding(false)} />}
  </>;
}

function ProvidersTab({ list, onAdd }: { list: CompanySummary[]; onAdd: () => void }) {
  const connections = useAiModelsStore((s) => s.connections);
  const enabledModels = useAiModelsStore((s) => s.enabledModels);

  if (connections.length === 0) return <EmptyState onAdd={onAdd} />;

  return <>
    <div className="grid gap-4 xl:grid-cols-2">
      {connections.map((conn) => {
        const provider = getProvider(conn.providerId);
        const models = enabledModels.filter((m) => m.connectionId === conn.id && m.enabled);
        return <ProviderCard key={conn.id} conn={conn} provider={provider} modelCount={models.length} list={list} />;
      })}
    </div>
  </>;
}

function ProviderCard({ conn, provider, modelCount, list }: { conn: ConnectedProvider; provider: ProviderDef | undefined; modelCount: number; list: CompanySummary[] }) {
  const updateConnection = useAiModelsStore((s) => s.updateConnection);
  const removeConnection = useAiModelsStore((s) => s.removeConnection);
  const [revoking, setRevoking] = React.useState(false);
  const [editScope, setEditScope] = React.useState(false);

  function simulateTest() {
    updateConnection(conn.id, { status: "connected", lastTestedAt: new Date().toISOString(), testLatencyMs: 180 + Math.floor(Math.random() * 300), testError: null });
    toast.success(`${provider?.shortName ?? conn.providerId} responded in ${180 + Math.floor(Math.random() * 300)}ms`);
  }

  return <section className="rounded-xl border border-border bg-surface p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: provider?.color ?? "#6B7280" }}>{(provider?.shortName ?? conn.providerId).slice(0, 2).toUpperCase()}</span>
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">{provider?.name ?? conn.name}
            {provider?.freeTier && <Badge variant="success">Free tier</Badge>}
            <Badge variant={conn.status === "connected" ? "success" : conn.status === "error" ? "danger" : "warning"}>{conn.status === "connected" ? "Connected" : conn.status === "error" ? "Error" : "Not tested"}</Badge>
          </h3>
          <p className="text-xs text-muted-foreground">{conn.name} · ••••{conn.last4}</p>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="sm" variant="ghost"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={simulateTest}><Plug className="size-3.5" />Test connection</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditScope(true)}><Settings2 className="size-3.5" />Edit scope</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-danger" onClick={() => setRevoking(true)}><Trash2 className="size-3.5" />Revoke</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <dl className="mt-4 grid grid-cols-4 gap-3 text-xs">
      <div><dt className="text-muted-foreground">Models</dt><dd className="mt-0.5 font-semibold tabular-nums">{modelCount}</dd></div>
      <div><dt className="text-muted-foreground">Last used</dt><dd className="mt-0.5 font-medium">{conn.lastUsed ? timeAgo(conn.lastUsed) : "Never"}</dd></div>
      <div><dt className="text-muted-foreground">This month</dt><dd className="mt-0.5 font-semibold tabular-nums">{conn.spentInr ? inr(conn.spentInr) : "—"}</dd></div>
      <div><dt className="text-muted-foreground">Latency</dt><dd className="mt-0.5 font-medium">{conn.testLatencyMs ? `${conn.testLatencyMs}ms` : "—"}</dd></div>
    </dl>
    {conn.testError && <p className="mt-2 flex items-center gap-1.5 rounded-md bg-danger-muted px-2.5 py-1.5 text-xs text-danger"><AlertCircle className="size-3.5 shrink-0" />{conn.testError}</p>}
    {conn.companies.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{conn.companies.map((cid) => { const c = list.find((s) => s.company.id === cid); return c ? <Badge key={cid} variant="neutral">{c.company.name}</Badge> : null; })}</div>}
    {conn.companies.length === 0 && <p className="mt-3 text-xs text-muted-foreground">Not shared with any company yet.</p>}

    {revoking && <Dialog open onOpenChange={() => setRevoking(false)}>
      <DialogContent><DialogHeader><DialogTitle>Revoke {conn.name}?</DialogTitle><DialogDescription>This removes the key from the portfolio and all shared companies. Models using this provider will stop working.</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" onClick={() => setRevoking(false)}>Cancel</Button><Button variant="destructive" onClick={() => { removeConnection(conn.id); toast.success(`${conn.name} revoked.`); setRevoking(false); }}>Revoke</Button></DialogFooter></DialogContent>
    </Dialog>}

    {editScope && <EditScopeDialog conn={conn} list={list} onClose={() => setEditScope(false)} />}
  </section>;
}

function EditScopeDialog({ conn, list, onClose }: { conn: ConnectedProvider; list: CompanySummary[]; onClose: () => void }) {
  const updateConnection = useAiModelsStore((s) => s.updateConnection);
  const [chosen, setChosen] = React.useState<string[]>(conn.companies);
  return <Dialog open onOpenChange={() => onClose()}>
    <DialogContent><DialogHeader><DialogTitle>Share {conn.name} with companies</DialogTitle><DialogDescription>Companies you select can use this key for their AI features.</DialogDescription></DialogHeader>
    <fieldset className="grid gap-2">{list.map((s) => <label key={s.company.id} className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm">
      <input type="checkbox" checked={chosen.includes(s.company.id)} onChange={() => setChosen(chosen.includes(s.company.id) ? chosen.filter((id) => id !== s.company.id) : [...chosen, s.company.id])} />
      <CompanyLogo company={s.company} size={20} className="rounded" /><span className="font-medium">{s.company.name}</span>
    </label>)}</fieldset>
    <div className="flex items-center gap-2"><Button size="sm" variant="ghost" onClick={() => setChosen(list.map((s) => s.company.id))}>All</Button><Button size="sm" variant="ghost" onClick={() => setChosen([])}>None</Button></div>
    <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => { updateConnection(conn.id, { companies: chosen }); toast.success(`Key shared with ${chosen.length} ${chosen.length === 1 ? "company" : "companies"}.`); onClose(); }}>Save</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const suggestions = AI_PROVIDERS.filter((p) => ["google-ai", "groq", "openai", "anthropic"].includes(p.id));
  return <SectionCard title="Get started with AI" description="Connect a provider to use AI features across your portfolio.">
    <div className="flex flex-col items-center gap-5 py-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-muted text-accent"><Sparkles className="size-7" /></span>
      <div className="max-w-md">
        <h3 className="text-base font-semibold">No AI providers connected</h3>
        <p className="mt-2 text-sm text-muted-foreground">Start with a free provider like Gemini or Groq for no-cost AI, or add OpenAI or Anthropic for the most capable models.</p>
      </div>
      <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
        {suggestions.map((p) => <button key={p.id} onClick={onAdd} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3 text-left text-sm transition-colors hover:bg-surface-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: p.color }}>{p.shortName.slice(0, 2).toUpperCase()}</span>
          <div><span className="font-medium">{p.shortName}</span>{p.freeTier && <Badge variant="success" className="ml-2">Free tier</Badge>}</div>
        </button>)}
      </div>
      <Button onClick={onAdd}><Plus className="size-3.5" />Add a provider</Button>
    </div>
  </SectionCard>;
}

function KeysTab() {
  const connections = useAiModelsStore((s) => s.connections);
  const removeConnection = useAiModelsStore((s) => s.removeConnection);
  const rotateKey = useAiModelsStore((s) => s.rotateKey);
  const [search, setSearch] = React.useState("");
  const [revoking, setRevoking] = React.useState<string | null>(null);
  const [rotating, setRotating] = React.useState<string | null>(null);
  const [rotateForm, setRotateForm] = React.useState("");

  const filtered = connections.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const p = getProvider(c.providerId);
    return c.name.toLowerCase().includes(q) || (p?.name.toLowerCase().includes(q) ?? false) || c.providerId.includes(q);
  });

  if (connections.length === 0) return <SectionCard title="Keys" description="No keys yet. Add a provider to create your first key."><p className="text-sm text-muted-foreground">Connect a provider from the Providers tab to manage keys here.</p></SectionCard>;

  return <SectionCard title={`${connections.length} ${connections.length === 1 ? "key" : "keys"}`} description="API keys belong to your account. Share each with the companies that need it.">
    <div className="mb-4 flex items-center gap-2">
      <div className="relative flex-1"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input className="pl-8" placeholder="Search keys…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm">
      <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
        <tr><th className="py-2 pr-3">Name</th><th className="px-3 py-2">Provider</th><th className="px-3 py-2">Scope</th><th className="px-3 py-2">Created</th><th className="px-3 py-2">Last used</th><th className="px-3 py-2">Monthly limit</th><th className="px-3 py-2">Status</th><th className="py-2 pl-3 text-right">Actions</th></tr>
      </thead>
      <tbody>{filtered.map((conn) => {
        const p = getProvider(conn.providerId);
        return <tr key={conn.id} className="border-b border-border last:border-0">
          <td className="py-2.5 pr-3"><div className="flex items-center gap-2"><KeyRound className="size-3.5 text-muted-foreground" /><span className="font-medium">{conn.name}</span></div><p className="mt-0.5 text-xs text-muted-foreground">••••{conn.last4}</p></td>
          <td className="px-3 py-2.5"><Badge variant="neutral" style={{ borderColor: p?.color }}>{p?.shortName ?? conn.providerId}</Badge></td>
          <td className="px-3 py-2.5 text-xs">{conn.companies.length ? `${conn.companies.length} ${conn.companies.length === 1 ? "company" : "companies"}` : "Portfolio only"}</td>
          <td className="px-3 py-2.5 text-xs text-muted-foreground">{new Date(conn.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
          <td className="px-3 py-2.5 text-xs text-muted-foreground">{conn.lastUsed ? timeAgo(conn.lastUsed) : "Never"}</td>
          <td className="px-3 py-2.5 text-xs tabular-nums">{inr(conn.capInr)}/mo</td>
          <td className="px-3 py-2.5"><Badge variant={conn.status === "connected" ? "success" : conn.status === "error" ? "danger" : "warning"}>{conn.status === "connected" ? "Connected" : conn.status === "error" ? "Error" : "Untested"}</Badge></td>
          <td className="py-2 pl-3"><div className="flex justify-end gap-1">
            <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="ghost"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setRotating(conn.id); setRotateForm(""); }}><RotateCcw className="size-3.5" />Rotate key</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-danger" onClick={() => setRevoking(conn.id)}><Trash2 className="size-3.5" />Revoke</DropdownMenuItem>
              </DropdownMenuContent></DropdownMenu>
          </div></td>
        </tr>;
      })}</tbody>
    </table></div>

    {revoking && (() => { const conn = connections.find((c) => c.id === revoking); if (!conn) return null; return <Dialog open onOpenChange={() => setRevoking(null)}>
      <DialogContent><DialogHeader><DialogTitle>Revoke {conn.name}?</DialogTitle><DialogDescription>Janus deletes this key. AI features using it will stop. To stop it working at the provider, revoke it there too.</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" onClick={() => setRevoking(null)}>Cancel</Button><Button variant="destructive" onClick={() => { removeConnection(conn.id); toast.success(`${conn.name} revoked.`); setRevoking(null); }}>Revoke</Button></DialogFooter></DialogContent></Dialog>; })()}

    {rotating && (() => { const conn = connections.find((c) => c.id === rotating); if (!conn) return null; return <Dialog open onOpenChange={() => setRotating(null)}>
      <DialogContent><DialogHeader><DialogTitle>Rotate {conn.name}</DialogTitle><DialogDescription>Paste the new key. The old key is replaced and cannot be recovered.</DialogDescription></DialogHeader>
      <Input type="password" placeholder="Paste the new API key" value={rotateForm} onChange={(e) => setRotateForm(e.target.value)} />
      <DialogFooter><Button variant="outline" onClick={() => setRotating(null)}>Cancel</Button><Button disabled={rotateForm.trim().length < 8} onClick={() => { rotateKey(conn.id, rotateForm.trim().slice(-4)); toast.success(`${conn.name} rotated. Test the connection to verify.`); setRotating(null); }}>Rotate</Button></DialogFooter></DialogContent></Dialog>; })()}
  </SectionCard>;
}

function ModelsTab() {
  const connections = useAiModelsStore((s) => s.connections);
  const enabledModels = useAiModelsStore((s) => s.enabledModels);
  const setModelEnabled = useAiModelsStore((s) => s.setModelEnabled);
  const bulkEnableModels = useAiModelsStore((s) => s.bulkEnableModels);
  const updateConnection = useAiModelsStore((s) => s.updateConnection);
  const [search, setSearch] = React.useState("");
  const [capFilter, setCapFilter] = React.useState<string>("all");

  const allModels: (ModelDef & { connectionId: string; connectionName: string; providerColor: string; enabled: boolean })[] = [];
  for (const conn of connections) {
    const providerModels = getModelsForProvider(conn.providerId);
    const provider = getProvider(conn.providerId);
    for (const model of providerModels) {
      const em = enabledModels.find((m) => m.connectionId === conn.id && m.modelId === model.id);
      allModels.push({ ...model, connectionId: conn.id, connectionName: conn.name, providerColor: provider?.color ?? "#6B7280", enabled: em?.enabled ?? false });
    }
  }

  const q = search.toLowerCase();
  const filtered = allModels.filter((m) => {
    if (q && !m.name.toLowerCase().includes(q) && !m.providerId.includes(q) && !m.id.toLowerCase().includes(q)) return false;
    if (capFilter === "chat" && !m.capabilities.includes("chat")) return false;
    if (capFilter === "vision" && !m.capabilities.includes("vision")) return false;
    if (capFilter === "tools" && !m.capabilities.includes("tools")) return false;
    if (capFilter === "embeddings" && !m.capabilities.includes("embeddings")) return false;
    if (capFilter === "free" && !m.freeTier) return false;
    return true;
  });

  function syncModels(conn: ConnectedProvider) {
    const models = getModelsForProvider(conn.providerId);
    bulkEnableModels(conn.id, models.map((m) => ({ modelId: m.id, providerId: m.providerId })));
    updateConnection(conn.id, { modelsSyncedAt: new Date().toISOString() });
    toast.success(`${models.length} models synced from ${getProvider(conn.providerId)?.shortName ?? conn.providerId}`);
  }

  if (connections.length === 0) return <SectionCard title="Models" description="Connect a provider first."><p className="text-sm text-muted-foreground">Models appear here after you add a provider and sync its model list.</p></SectionCard>;

  return <>
    <div className="mb-1 flex flex-wrap items-center gap-2">
      {connections.map((conn) => {
        const p = getProvider(conn.providerId);
        return <Button key={conn.id} size="sm" variant="outline" onClick={() => syncModels(conn)}>
          <RefreshCw className="size-3.5" />Sync {p?.shortName ?? conn.providerId}
          {conn.modelsSyncedAt && <span className="ml-1 text-[10px] text-muted-foreground">· {timeAgo(conn.modelsSyncedAt)}</span>}
        </Button>;
      })}
    </div>
    <SectionCard title={`${filtered.length} models`} description="Enable models for your portfolio. Admins choose which models each company can use.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input className="pl-8" placeholder="Search models…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select aria-label="Filter by capability" className={selectClass} value={capFilter} onChange={(e) => setCapFilter(e.target.value)}>
          <option value="all">All capabilities</option>
          <option value="chat">Chat</option>
          <option value="vision">Vision</option>
          <option value="tools">Tools / Function calling</option>
          <option value="embeddings">Embeddings</option>
          <option value="free">Free tier only</option>
        </select>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
        <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr><th className="py-2 pr-3">Model</th><th className="px-3 py-2">Provider</th><th className="px-3 py-2">Capabilities</th><th className="px-3 py-2">Context</th><th className="px-3 py-2">Price / 1M tokens</th><th className="py-2 pl-3 text-right">Enabled</th></tr>
        </thead>
        <tbody>{filtered.map((m) => <tr key={`${m.connectionId}:${m.id}`} className="border-b border-border last:border-0">
          <td className="py-2.5 pr-3"><span className="font-medium">{m.name}</span>{m.freeTier && <Badge variant="success" className="ml-2">Free</Badge>}<p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{m.id}</p></td>
          <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: m.providerColor }} />{getProvider(m.providerId)?.shortName ?? m.providerId}</span></td>
          <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{m.capabilities.map((c) => <Badge key={c} variant="neutral" className="text-[10px]">{c}</Badge>)}</div></td>
          <td className="px-3 py-2.5 tabular-nums text-xs">{formatContext(m.contextWindow)}</td>
          <td className="px-3 py-2.5 text-xs tabular-nums">{m.inputPricePer1M === 0 && m.freeTier ? "Free" : m.inputPricePer1M !== null ? `$${m.inputPricePer1M} in / $${m.outputPricePer1M ?? "—"} out` : "—"}</td>
          <td className="py-2 pl-3 text-right">
            <button onClick={() => setModelEnabled(m.connectionId, m.id, m.providerId, !m.enabled)} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${m.enabled ? "bg-success/10 text-success" : "bg-surface-2 text-muted-foreground"}`}>
              {m.enabled ? <ToggleRight className="size-4" /> : <ToggleLeft className="size-4" />}{m.enabled ? "On" : "Off"}
            </button>
          </td>
        </tr>)}</tbody>
      </table></div>
    </SectionCard>
  </>;
}

function DefaultsTab() {
  const connections = useAiModelsStore((s) => s.connections);
  const enabledModels = useAiModelsStore((s) => s.enabledModels);
  const defaults = useAiModelsStore((s) => s.defaults);
  const setDefault = useAiModelsStore((s) => s.setDefault);
  const budgetAlert = useAiModelsStore((s) => s.budgetAlertInr);
  const setBudgetAlert = useAiModelsStore((s) => s.setBudgetAlert);

  const enabledList = enabledModels.filter((m) => m.enabled);
  const options: { connectionId: string; modelId: string; label: string }[] = [];
  for (const em of enabledList) {
    const conn = connections.find((c) => c.id === em.connectionId);
    const p = getProvider(em.providerId);
    const models = getModelsForProvider(em.providerId);
    const model = models.find((m) => m.id === em.modelId);
    if (conn && model) options.push({ connectionId: conn.id, modelId: model.id, label: `${model.name} (${p?.shortName ?? em.providerId})` });
  }

  const getRoute = (useCaseId: UseCaseId) => defaults.find((d) => d.useCaseId === useCaseId) ?? { useCaseId, defaultConnectionId: null, defaultModelId: null, fallbackConnectionId: null, fallbackModelId: null };

  if (connections.length === 0) return <SectionCard title="Defaults & Routing" description="Connect a provider first."><p className="text-sm text-muted-foreground">Default models can be set once you have at least one connected provider with enabled models.</p></SectionCard>;

  return <>
    <SectionCard title="Default model per use case" description="Choose which model handles each type of AI task. The fallback kicks in if the default fails or hits a rate limit.">
      <div className="grid gap-4">
        {USE_CASES.map((uc) => {
          const route = getRoute(uc.id);
          const selectKey = (key: string) => {
            if (!key) return { connectionId: null, modelId: null };
            const [connectionId, modelId] = key.split("::");
            return { connectionId, modelId };
          };
          const toKey = (connectionId: string | null, modelId: string | null) => connectionId && modelId ? `${connectionId}::${modelId}` : "";
          return <div key={uc.id} className="grid gap-2 rounded-lg border border-border bg-surface-2 p-4">
            <div><p className="text-sm font-medium">{uc.label}</p><p className="text-xs text-muted-foreground">{uc.description}</p></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs text-muted-foreground">Default model
                <select className={selectClass} value={toKey(route.defaultConnectionId, route.defaultModelId)} onChange={(e) => {
                  const { connectionId, modelId } = selectKey(e.target.value);
                  setDefault({ ...route, defaultConnectionId: connectionId, defaultModelId: modelId });
                }}>
                  <option value="">Not set</option>
                  {options.map((o) => <option key={`${o.connectionId}::${o.modelId}`} value={`${o.connectionId}::${o.modelId}`}>{o.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">Fallback model
                <select className={selectClass} value={toKey(route.fallbackConnectionId, route.fallbackModelId)} onChange={(e) => {
                  const { connectionId, modelId } = selectKey(e.target.value);
                  setDefault({ ...route, fallbackConnectionId: connectionId, fallbackModelId: modelId });
                }}>
                  <option value="">None (no fallback)</option>
                  {options.map((o) => <option key={`${o.connectionId}::${o.modelId}`} value={`${o.connectionId}::${o.modelId}`}>{o.label}</option>)}
                </select>
              </label>
            </div>
          </div>;
        })}
      </div>
    </SectionCard>
    <SectionCard title="Monthly budget alert" description="Get alerted when AI spend across all companies reaches this amount.">
      <div className="flex items-center gap-3">
        <label className="grid gap-1 text-xs text-muted-foreground">Alert at (₹)<Input type="number" className="w-40" value={budgetAlert} onChange={(e) => setBudgetAlert(Number(e.target.value) || 0)} /></label>
        <Button size="sm" variant="secondary" onClick={() => toast.success(`Budget alert set at ${inr(budgetAlert)}/month.`)}>Save</Button>
      </div>
    </SectionCard>
  </>;
}

function AddProviderDialog({ list, onClose }: { list: CompanySummary[]; onClose: () => void }) {
  const addConnection = useAiModelsStore((s) => s.addConnection);
  const bulkEnableModels = useAiModelsStore((s) => s.bulkEnableModels);
  const [step, setStep] = React.useState<"pick" | "configure">("pick");
  const [tab, setTab] = React.useState<ProviderTab>("all");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<ProviderDef | null>(null);
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [name, setName] = React.useState("");
  const [cap, setCap] = React.useState("5000");
  const [shareAll, setShareAll] = React.useState(true);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ ok: boolean; latency: number; error?: string } | null>(null);

  const providers = filterProviders(tab, search);
  const providerTabs: { id: ProviderTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "free", label: "Free tier" },
    { id: "paid", label: "Paid" },
    { id: "cloud", label: "Cloud platforms" },
  ];

  function selectProvider(p: ProviderDef) {
    setSelected(p);
    setName(p.shortName + " key");
    setForm({});
    setTestResult(null);
    setStep("configure");
  }

  function simulateTest() {
    setTesting(true);
    setTestResult(null);
    const hasKey = selected?.authFields.some((f) => f.type === "password" && form[f.key]?.trim());
    setTimeout(() => {
      setTesting(false);
      if (!hasKey) {
        setTestResult({ ok: false, latency: 0, error: "API key is required." });
      } else if (form[selected!.authFields[0].key]?.trim().length < 8) {
        setTestResult({ ok: false, latency: 0, error: "Invalid key — check the key and try again." });
      } else {
        const latency = 150 + Math.floor(Math.random() * 350);
        setTestResult({ ok: true, latency });
      }
    }, 1200);
  }

  function save() {
    if (!selected) return;
    const keyField = selected.authFields.find((f) => f.type === "password");
    const keyVal = keyField ? (form[keyField.key] ?? "").trim() : "";
    const connId = addConnection({
      providerId: selected.id,
      name: name.trim() || `${selected.shortName} key`,
      last4: keyVal.slice(-4) || "????",
      status: testResult?.ok ? "connected" : "untested",
      companies: shareAll ? list.map((s) => s.company.id) : [],
      capInr: Number(cap) || 5000,
      spentInr: 0,
      createdAt: new Date().toISOString(),
      lastUsed: null,
      lastTestedAt: testResult?.ok ? new Date().toISOString() : null,
      testLatencyMs: testResult?.latency ?? null,
      testError: testResult?.error ?? null,
      modelsSyncedAt: new Date().toISOString(),
    });
    const models = getModelsForProvider(selected.id);
    if (models.length > 0) {
      bulkEnableModels(connId, models.map((m) => ({ modelId: m.id, providerId: m.providerId })));
    }
    toast.success(`${selected.shortName} connected with ${models.length} models.`);
    onClose();
  }

  const keyProvided = selected?.authFields.some((f) => f.type === "password" && (form[f.key] ?? "").trim().length >= 8) ?? false;

  return <Dialog open onOpenChange={() => onClose()}>
    <DialogContent className="max-w-2xl">
      {step === "pick" ? <>
        <DialogHeader><DialogTitle>Add an AI provider</DialogTitle><DialogDescription>Choose a provider to connect. Free-tier providers let you try AI features at no cost.</DialogDescription></DialogHeader>
        <div className="flex gap-1 border-b border-border">
          {providerTabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={`border-b-2 px-3 py-2 text-xs font-medium ${tab === t.id ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>)}
        </div>
        <div className="relative"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input className="pl-8" placeholder="Search providers…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="max-h-[400px] overflow-y-auto">
          <div className="grid gap-1.5">
            {providers.map((p) => <button key={p.id} onClick={() => selectProvider(p)} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: p.color }}>{p.shortName.slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <span className="flex items-center gap-2"><span className="font-medium">{p.name}</span>{p.freeTier && <Badge variant="success">Free tier</Badge>}{p.openaiCompatible && <Badge variant="neutral" className="text-[10px]">OpenAI-compatible</Badge>}</span>
                <div className="mt-0.5 flex flex-wrap gap-1">{p.supports.map((c) => <span key={c} className="text-[10px] text-muted-foreground">{c}</span>)}</div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>)}
            {providers.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No providers match your search.</p>}
          </div>
        </div>
      </> : <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <button onClick={() => setStep("pick")} className="text-muted-foreground hover:text-foreground">← </button>
            <span className="flex size-6 items-center justify-center rounded text-xs font-bold text-white" style={{ background: selected?.color }}>{(selected?.shortName ?? "").slice(0, 2).toUpperCase()}</span>
            {selected?.name}
          </DialogTitle>
          <DialogDescription>{selected?.freeTier ? "Free tier — no charge for API calls within limits." : "Paid provider — billed by the provider to your account."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-xs text-muted-foreground">Connection name<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production key" /></label>
          {selected?.authFields.map((field) => <label key={field.key} className="grid gap-1.5 text-xs text-muted-foreground">{field.label}
            <Input type={field.type ?? "text"} placeholder={field.placeholder} value={form[field.key] ?? ""} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} />
          </label>)}
          <label className="grid gap-1.5 text-xs text-muted-foreground">Monthly cap (₹)<Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shareAll} onChange={() => setShareAll(!shareAll)} />Share with all companies</label>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" disabled={testing || !keyProvided} onClick={simulateTest}>
            {testing ? <><Loader2 className="size-3.5 animate-spin" />Testing…</> : <><Plug className="size-3.5" />Test connection</>}
          </Button>
          {testResult && (testResult.ok
            ? <span className="flex items-center gap-1.5 text-sm text-success"><Check className="size-4" />Connected · {testResult.latency}ms</span>
            : <span className="flex items-center gap-1.5 text-sm text-danger"><AlertCircle className="size-4" />{testResult.error}</span>)}
        </div>

        {selected?.docsUrl && <div className="flex flex-wrap gap-3 text-xs">
          {selected.docsUrl && <a href={selected.docsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-accent hover:underline"><ExternalLink className="size-3" />Docs</a>}
          {selected.keyUrl && <a href={selected.keyUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-accent hover:underline"><ExternalLink className="size-3" />Get API key</a>}
          {selected.pricingUrl && <a href={selected.pricingUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-accent hover:underline"><ExternalLink className="size-3" />Pricing</a>}
        </div>}

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("pick")}>Back</Button>
          <Button disabled={!keyProvided} onClick={save}>{testResult?.ok ? "Save" : "Save without testing"}</Button>
        </DialogFooter>
      </>}
    </DialogContent>
  </Dialog>;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatContext(tokens: number): string {
  if (tokens >= 1048576) return `${(tokens / 1048576).toFixed(1)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}
