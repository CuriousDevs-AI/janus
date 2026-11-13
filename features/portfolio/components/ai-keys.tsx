"use client";

import * as React from "react";
import { ArrowRightLeft, Building2, KeyRound, MoreHorizontal, Pencil, Plug, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { SetupModelDialog } from "@/features/portfolio/components/ai-setup";
import { isFree, providerName } from "@/features/portfolio/lib/ai";
import { inr } from "@/features/portfolio/lib/format";
import { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
import type { AiProvider, PortfolioAiCompany, PortfolioAiKey, PortfolioAsked, PortfolioKey, PortfolioModels } from "@/features/portfolio/types";

type CompanyRow = { company: PortfolioAiCompany; key: PortfolioAiKey };
/** Providers bill in US dollars; spend is shown in rupees at about this rate. */
const USD_INR = 88;
const nameOf = (provider: AiProvider) => providerName[provider] ?? provider;

/**
 * The AI keys in one place. Portfolio keys belong to the account: Janus Intelligence asks with them,
 * and each can be copied into the companies that should use it too. Below, the keys each company
 * keeps, copies included. A key is never shown whole, only its last four characters.
 */
export function AiKeys() {
  const models = usePortfolioApi<PortfolioModels>("/portfolio/intelligence/models");
  const [setup, setSetup] = React.useState<{ provider: AiProvider } | "new" | null>(null);
  const [sharing, setSharing] = React.useState<PortfolioKey | null>(null);
  const [revoking, setRevoking] = React.useState<PortfolioKey | null>(null);
  const [moving, setMoving] = React.useState<CompanyRow | null>(null);
  const [removing, setRemoving] = React.useState<CompanyRow | null>(null);
  const [testing, setTesting] = React.useState<string | null>(null);
  if (models.loading) return <div role="status" aria-label="Loading AI keys" className="h-64 animate-pulse rounded-xl border border-border bg-surface-2" />;
  if (models.error || !models.data) return <div role="alert" className="flex items-center gap-3 text-sm text-danger">{models.error}<Button size="sm" variant="secondary" onClick={models.reload}>Try again</Button></div>;
  const data = models.data;
  const companyRows: CompanyRow[] = data.companies.flatMap((company) => company.keys.map((key) => ({ company, key })));
  const copyOf = (row: CompanyRow) => data.portfolioKeys.some((key) => key.provider === row.key.provider && key.copiedTo.some((item) => item.id === row.company.id));
  async function test(id: string, path: string) {
    setTesting(id);
    try { const answer = await api<PortfolioAsked>(path, { method: "POST" }); toast.success(`${answer.model} answered: “${answer.answer.slice(0, 80)}”`); }
    catch (error) { toast.error(message(error)); }
    setTesting(null);
  }
  const done = () => { setSharing(null); setRevoking(null); setMoving(null); setRemoving(null); setSetup(null); models.reload(); };

  return <>
    <SectionCard title="Portfolio keys" description="Kept by the Portfolio for your account. Janus Intelligence asks with them, and you choose which companies use each one too." action={data.canAddKeys && <Button size="sm" onClick={() => setSetup("new")}><Plus className="size-3.5" />Add a key</Button>}>
      {data.portfolioKeys.length === 0 ? <div className="flex flex-col items-center gap-3 py-8 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent-muted text-accent"><KeyRound className="size-5" aria-hidden /></span>
        <p className="max-w-md text-sm text-muted-foreground">No Portfolio keys yet. Janus rules answer without one. Add a key, free or paid, to ask in your own words and to share it with your companies.</p>
        {data.canAddKeys ? <Button size="sm" onClick={() => setSetup("new")}><Plus className="size-3.5" />Add a key</Button> : <p className="text-xs text-muted-foreground">Only an Owner keeps keys for the Portfolio.</p>}
      </div> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm">
        <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-3">Provider</th><th className="px-3 py-2">Model</th><th className="px-3 py-2">Key</th><th className="px-3 py-2">Used in</th><th className="py-2 pl-3 text-right">Actions</th></tr></thead>
        <tbody>{data.portfolioKeys.map((key) => { const id = `portfolio:${key.provider}`; return <tr key={id} className="border-b border-border align-top last:border-0">
          <td className="whitespace-nowrap py-2.5 pr-3"><span className="font-medium">{nameOf(key.provider)}</span> <Badge variant="neutral">{isFree(data.free, key.provider) ? "Free tier" : "Paid"}</Badge></td>
          <td className="max-w-[260px] break-all px-3 py-2.5 font-mono text-xs">{key.model}</td>
          <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">…{key.keyLastFour}</td>
          <td className="px-3 py-2.5">{key.copiedTo.length ? <span className="flex flex-wrap gap-1">{key.copiedTo.map((item) => <Badge key={item.id} variant="neutral"><Building2 className="mr-1 size-3" />{item.name}</Badge>)}</span> : <span className="text-xs text-muted-foreground">Portfolio only</span>}</td>
          <td className="py-2 pl-3"><div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" disabled={testing === id} onClick={() => void test(id, `/portfolio/ai-keys/${key.provider}/test`)}><Plug className="size-3.5" />{testing === id ? "Testing…" : "Test"}</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="sm" variant="outline" aria-label={`More for the ${nameOf(key.provider)} key`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setSetup({ provider: key.provider })}><Pencil className="size-3.5" />Change model or key</DropdownMenuItem>
                <DropdownMenuItem disabled={data.companies.length === 0} onSelect={() => setSharing(key)}><Building2 className="size-3.5" />Use in companies</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-danger" onSelect={() => setRevoking(key)}><Trash2 className="size-3.5" />Revoke</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div></td>
        </tr>; })}</tbody>
      </table></div>}
    </SectionCard>

    <SectionCard title="Keys inside companies" description="Each company's own keys, copies of a Portfolio key included. A company is billed for a paid model on its key, and uses it in its own AI features.">
      {companyRows.length === 0 ? <p className="text-sm text-muted-foreground">No company keeps a key yet. Use a Portfolio key in companies to give them one.</p>
        : <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm">
          <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-3">Company</th><th className="px-3 py-2">Provider</th><th className="px-3 py-2">Model</th><th className="px-3 py-2">Key</th><th className="py-2 pl-3 text-right">Actions</th></tr></thead>
          <tbody>{companyRows.map((row) => { const id = `${row.company.id}:${row.key.provider}`; const copy = copyOf(row); return <tr key={id} className="border-b border-border last:border-0">
            <td className="py-2.5 pr-3 font-medium">{row.company.name}</td>
            <td className="whitespace-nowrap px-3">{nameOf(row.key.provider)} {copy ? <Badge variant="success">From Portfolio</Badge> : <Badge variant="neutral">Its own</Badge>}</td>
            <td className="max-w-[260px] break-all px-3 font-mono text-xs">{row.key.model}</td>
            <td className="whitespace-nowrap px-3 font-mono text-xs text-muted-foreground">…{row.key.keyLastFour}</td>
            <td className="py-2 pl-3"><div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" disabled={testing === id} onClick={() => void test(id, `/portfolio/companies/${row.company.id}/ai/${row.key.provider}/test`)}><Plug className="size-3.5" />{testing === id ? "Testing…" : "Test"}</Button>
              {!copy && data.companies.length > 1 && <Button size="sm" variant="ghost" onClick={() => setMoving(row)}><ArrowRightLeft className="size-3.5" />Move</Button>}
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRemoving(row)}><Trash2 className="size-3.5" />Remove</Button>
            </div></td>
          </tr>; })}</tbody>
        </table></div>}
    </SectionCard>

    {data.companies.length > 0 && <SectionCard title="AI spend this month" description="What Portfolio questions on paid models cost each company this month, against the cap that stops them. Providers bill in US dollars; rupees here are at about ₹88 to the dollar. A Portfolio key's use is recorded in the company open at the time.">
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.companies.map((company) => { const spent = Number(company.spentUsd), cap = Number(company.capUsd); return <li key={company.id} className="rounded-lg border border-border p-3">
        <p className="flex items-baseline justify-between gap-2 text-sm"><span className="font-medium">{company.name}</span><span className="tabular-nums text-muted-foreground" title={`US$${spent.toFixed(2)} of US$${cap.toFixed(2)}`}>about {inr(spent * USD_INR)} of {inr(cap * USD_INR)}</span></p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className={`h-full rounded-full ${spent >= cap ? "bg-danger" : "bg-accent"}`} style={{ width: `${cap ? Math.min(100, (spent / cap) * 100) : 0}%` }} /></div>
      </li>; })}</ul>
    </SectionCard>}

    {setup && <SetupModelDialog models={data} start={setup === "new" ? undefined : setup} onClose={() => setSetup(null)} onSaved={done} />}
    {sharing && <UseInCompanies portfolioKey={sharing} companies={data.companies} onClose={() => setSharing(null)} onDone={done} />}
    {revoking && <RevokePortfolioKey portfolioKey={revoking} onClose={() => setRevoking(null)} onDone={done} />}
    {moving && <MoveKey row={moving} companies={data.companies} onClose={() => setMoving(null)} onDone={done} />}
    {removing && <RemoveCompanyKey row={removing} onClose={() => setRemoving(null)} onDone={done} />}
  </>;
}

function UseInCompanies({ portfolioKey, companies, onClose, onDone }: { portfolioKey: PortfolioKey; companies: PortfolioAiCompany[]; onClose: () => void; onDone: () => void }) {
  const [chosen, setChosen] = React.useState<string[]>(portfolioKey.copiedTo.map((item) => item.id));
  const [busy, setBusy] = React.useState(false);
  const name = nameOf(portfolioKey.provider);
  const own = (company: PortfolioAiCompany) => !portfolioKey.copiedTo.some((item) => item.id === company.id) && company.keys.find((item) => item.provider === portfolioKey.provider);
  async function save() {
    setBusy(true);
    try { await api(`/portfolio/ai-keys/${portfolioKey.provider}/companies`, { method: "PUT", body: JSON.stringify({ companies: chosen }) }); toast.success(chosen.length ? `${name} key in use in ${chosen.length} ${chosen.length === 1 ? "company" : "companies"}.` : `${name} key is now the Portfolio's only.`); onDone(); }
    catch (error) { toast.error(message(error)); setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => !open && !busy && onClose()}><DialogContent><DialogHeader><DialogTitle>Use the {name} key in companies</DialogTitle><DialogDescription>Each company you tick gets a copy, kept encrypted as its own key, for its own AI features; a paid model is then billed to it. Untick to take the copy back. A change to the Portfolio key reaches every copy.</DialogDescription></DialogHeader>
    <fieldset className="grid gap-2">{companies.map((company) => { const theirs = own(company); return <label key={company.id} className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2 text-sm">
      <input type="checkbox" className="mt-0.5" checked={chosen.includes(company.id)} disabled={busy} onChange={() => setChosen(chosen.includes(company.id) ? chosen.filter((item) => item !== company.id) : [...chosen, company.id])} />
      <span><span className="font-medium">{company.name}</span>{theirs && <span className="block text-xs text-warning">Has its own {name} key (…{theirs.keyLastFour}); ticking replaces it.</span>}</span>
    </label>; })}</fieldset>
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function RevokePortfolioKey({ portfolioKey, onClose, onDone }: { portfolioKey: PortfolioKey; onClose: () => void; onDone: () => void }) {
  const [fromCompanies, setFromCompanies] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const name = nameOf(portfolioKey.provider);
  async function revoke() {
    setBusy(true);
    try { await api(`/portfolio/ai-keys/${portfolioKey.provider}/revoke`, { method: "POST", body: JSON.stringify({ fromCompanies }) }); toast.success(`${name} key revoked.`); onDone(); }
    catch (error) { toast.error(message(error)); setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => !open && !busy && onClose()}><DialogContent><DialogHeader><DialogTitle>Revoke the {name} key?</DialogTitle><DialogDescription>Janus deletes the Portfolio&apos;s copy of key …{portfolioKey.keyLastFour}. Questions already asked stay in the history. To stop the key working anywhere else, revoke it at {name} too.</DialogDescription></DialogHeader>
    {portfolioKey.copiedTo.length > 0 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={fromCompanies} onChange={() => setFromCompanies(!fromCompanies)} />Also remove it from {portfolioKey.copiedTo.map((item) => item.name).join(", ")}</label>}
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Keep it</Button><Button variant="destructive" disabled={busy} onClick={() => void revoke()}>{busy ? "Revoking…" : "Revoke key"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function MoveKey({ row, companies, onClose, onDone }: { row: CompanyRow; companies: PortfolioAiCompany[]; onClose: () => void; onDone: () => void }) {
  const others = companies.filter((item) => item.id !== row.company.id);
  const [to, setTo] = React.useState(others[0]?.id ?? "");
  const [busy, setBusy] = React.useState(false);
  const target = others.find((item) => item.id === to);
  const clash = target?.keys.find((item) => item.provider === row.key.provider);
  const name = nameOf(row.key.provider);
  async function move() {
    setBusy(true);
    try { await api(`/portfolio/companies/${row.company.id}/ai/${row.key.provider}/move`, { method: "POST", body: JSON.stringify({ to, replace: Boolean(clash) }) }); toast.success(`The ${name} key now belongs to ${target?.name}.`); onDone(); }
    catch (error) { toast.error(message(error)); setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => !open && !busy && onClose()}><DialogContent><DialogHeader><DialogTitle>Move {row.company.name}&apos;s {name} key</DialogTitle><DialogDescription>It leaves {row.company.name} and is kept by the company you choose, which is then billed for it. The key itself does not change.</DialogDescription></DialogHeader>
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">Move to
      <select className="h-9 rounded-md border border-input bg-surface-2 px-2 text-sm text-foreground" value={to} onChange={(event) => setTo(event.target.value)}>{others.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    </label>
    {clash && <p role="alert" className="rounded-md bg-warning-muted px-2.5 py-2 text-xs text-warning">{target?.name} already has a {name} key (…{clash.keyLastFour}). Moving replaces it.</p>}
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || !to} onClick={() => void move()}>{busy ? "Moving…" : clash ? "Replace and move" : "Move key"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function RemoveCompanyKey({ row, onClose, onDone }: { row: CompanyRow; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const name = nameOf(row.key.provider);
  async function remove() {
    setBusy(true);
    try { await api(`/portfolio/companies/${row.company.id}/ai/${row.key.provider}`, { method: "DELETE" }); toast.success(`${name} key removed from ${row.company.name}.`); onDone(); }
    catch (error) { toast.error(message(error)); setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => !open && !busy && onClose()}><DialogContent><DialogHeader><DialogTitle>Remove {row.company.name}&apos;s {name} key?</DialogTitle><DialogDescription>{row.company.name} stops using key …{row.key.keyLastFour} for its own AI features, and Janus deletes its copy. A Portfolio key stays with the Portfolio.</DialogDescription></DialogHeader>
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Keep it</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}>{busy ? "Removing…" : "Remove key"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
