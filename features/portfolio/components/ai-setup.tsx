"use client";

import * as React from "react";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, message } from "@/lib/api/client";
import { freeChoices, paidProviders, type AiChoice } from "@/features/portfolio/lib/ai";
import { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
import type { AiProvider, PortfolioAsked, PortfolioKey, PortfolioModels } from "@/features/portfolio/types";

const select = "h-9 w-full rounded-md border border-input bg-surface-2 px-2 text-sm text-foreground";

/**
 * Sets up a model for the Portfolio in one place: free or paid, the provider, the model and the
 * key. The key belongs to the Portfolio, for the account; AI models & keys copies it into the
 * companies that should use it too. Saving tests it against the provider at once and says plainly
 * what went wrong. `start` opens it on a key already saved, to change its model or key.
 */
export function SetupModelDialog({ models, start, onClose, onSaved }: { models: PortfolioModels; start?: { provider: AiProvider }; onClose: () => void; onSaved: (optionId: string) => void }) {
  const free = freeChoices(models.free);
  const all = [...free, ...paidProviders];
  const startChoice = start ? all.find((item) => item.provider === start.provider) ?? null : null;
  const [kind, setKind] = React.useState<"free" | "paid">(startChoice && !startChoice.free ? "paid" : "free");
  const [choice, setChoice] = React.useState<AiChoice | null>(startChoice);
  const saved = (provider: AiProvider): PortfolioKey | undefined => models.portfolioKeys.find((item) => item.provider === provider);
  const [model, setModel] = React.useState(start ? saved(start.provider)?.model ?? "" : "");
  const [custom, setCustom] = React.useState(false);
  const [key, setKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null);

  const existing = choice ? saved(choice.provider) : undefined;
  // Free models change often: the provider's current list where it publishes one, else the examples.
  const live = usePortfolioApi<string[]>(choice?.free ? `/portfolio/ai-models/${choice.provider}` : null);
  const options = live.data?.length ? live.data : choice?.models ?? [];
  // The model in use: the one typed or picked, or the first offered when that is not in the list.
  const chosenModel = custom || options.includes(model) ? model : options[0] ?? model;
  const pick = (next: AiChoice) => { setChoice(next); const had = saved(next.provider); setModel(had?.model ?? ""); setCustom(false); setKey(""); setResult(null); };

  async function save() {
    if (!choice) return;
    setBusy(true);
    setResult(null);
    try {
      await api(`/portfolio/ai-keys/${choice.provider}`, { method: "PUT", body: JSON.stringify({ model: chosenModel.trim(), apiKey: key.trim() || undefined }) });
    } catch (error) { setResult({ ok: false, text: message(error) }); setBusy(false); return; }
    try {
      const answer = await api<PortfolioAsked>(`/portfolio/ai-keys/${choice.provider}/test`, { method: "POST" });
      setResult({ ok: true, text: `${answer.model} answered: “${answer.answer.slice(0, 120)}”` });
      toast.success(`${choice.name} is ready. Ask with it in Janus Intelligence, or use it in companies from AI models & keys.`);
      onSaved(`portfolio:${choice.provider}`);
    } catch (error) {
      setResult({ ok: false, text: `Saved, but the test did not go through. ${message(error)}` });
    }
    setBusy(false);
  }

  const list = kind === "free" ? free : paidProviders;
  return <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><KeyRound className="size-4 text-accent" aria-hidden />{start ? "Change model or key" : "Set up a model"}</DialogTitle>
        <DialogDescription>Janus sends only the Portfolio&apos;s own figures to the provider you choose, and answers only from them.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted-foreground">The key is kept by the Portfolio, for your account. From AI models &amp; keys you can then copy it into one or more companies, so they use it too.</p>

        {!start && <div role="tablist" aria-label="Free or paid" className="inline-flex w-fit rounded-lg border border-border bg-surface-2 p-0.5">
          {(["free", "paid"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={kind === item} onClick={() => { setKind(item); setChoice(null); setResult(null); }} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${kind === item ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{item === "free" ? "Free models" : "Paid models"}</button>)}
        </div>}

        {!start && <div className="grid gap-2 sm:grid-cols-2">{list.map((item) => {
          const has = saved(item.provider);
          const on = choice?.provider === item.provider && choice.free === item.free;
          return <button key={`${item.provider}-${item.free}`} type="button" onClick={() => pick(item)} className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${on ? "border-accent bg-accent-muted" : "border-border bg-surface hover:bg-surface-2"}`}>
            <span className="flex items-center justify-between gap-2 text-sm font-medium">{item.name}{has ? <Badge variant="success">Set up</Badge> : item.free ? <Badge variant="neutral">Free</Badge> : <Badge variant="neutral">Paid</Badge>}</span>
            <span className="text-xs text-muted-foreground">{item.note}</span>
          </button>;
        })}</div>}

        {choice && <form className="grid gap-3 rounded-lg border border-border bg-surface-2 p-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <p className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">{choice.name}<span className="flex gap-3 text-xs font-normal"><a className="inline-flex items-center gap-1 text-accent hover:underline" href={choice.keyUrl} target="_blank" rel="noreferrer">Get a key<ExternalLink className="size-3" /></a><a className="inline-flex items-center gap-1 text-muted-foreground hover:underline" href={choice.modelsUrl} target="_blank" rel="noreferrer">Current models<ExternalLink className="size-3" /></a></span></p>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">Model
            {custom ? <Input aria-label="Model name" value={model} placeholder="The provider's model name" onChange={(event) => setModel(event.target.value)} />
              : <select className={select} aria-label="Model" value={chosenModel} onChange={(event) => setModel(event.target.value)}>{options.map((item) => <option key={item} value={item}>{item}</option>)}</select>}
            <button type="button" className="w-fit text-[11px] font-normal text-accent hover:underline" onClick={() => setCustom(!custom)}>{custom ? "Pick from the suggested models" : "Use another model name"}</button>
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">API key
            <Input aria-label="API key" type="password" autoComplete="off" value={key} placeholder={existing ? `Saved key …${existing.keyLastFour}. Leave empty to keep it` : `Paste your ${choice.name} key`} onChange={(event) => setKey(event.target.value)} />
            <span className="text-[11px] font-normal">Kept encrypted. Janus shows only its last four characters afterwards.</span>
          </label>
          {result && <p role={result.ok ? "status" : "alert"} className={`flex items-start gap-2 rounded-md px-2.5 py-2 text-xs ${result.ok ? "bg-success-muted text-success" : "bg-danger-muted text-danger"}`}>{result.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /> : <XCircle className="mt-0.5 size-3.5 shrink-0" />}{result.text}</p>}
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{result?.ok ? "Done" : "Cancel"}</Button>
            <Button type="submit" disabled={busy || !chosenModel.trim() || (!key.trim() && !existing)}>{busy ? <><Loader2 className="size-3.5 animate-spin" />Testing…</> : "Save and test"}</Button>
          </DialogFooter>
        </form>}
        {!choice && <p className="text-xs text-muted-foreground">Choose a provider above.</p>}
      </div>
    </DialogContent>
  </Dialog>;
}
