"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrDocumentStore, type CompanyPolicy } from "@/lib/stores/hr-document-store";
import { useHrEngageStore } from "@/lib/stores/hr-engage-store";
import { blocksFromText } from "@/lib/hr-document-content";
import { DocumentReader } from "@/components/hr-people/document-reader";
import { HrField, hrInputClass, hrToday } from "@/components/hr-people/operations-ui";

export const policyCategories = ["Policy acknowledgement", "Leave policy", "Expense policy", "Security policy", "Code of conduct", "Health and safety", "IT and devices", "Other"];
const outline = (title: string) => `# ${title || "Policy title"}\n\n## Purpose\nSay why this policy exists and who it covers.\n\n## What this means for you\n- The first thing people must do.\n- The second thing people must do.\n- What is not allowed.\n\n## Who to ask\nSay who to contact with questions, for example HR.`;

/** Write a new policy or edit an existing one. A new version asks everyone to acknowledge again. */
export function PolicyEditor({ policy, actorId, onClose }: { policy?: CompanyPolicy; actorId: string; onClose: () => void }) {
  const employees = useHrPeopleStore((state) => state.employees);
  const { policies, savePolicy, record } = useHrDocumentStore();
  const [title, setTitle] = React.useState(policy?.name ?? "");
  const [category, setCategory] = React.useState(policy?.category ?? policyCategories[0]);
  const [body, setBody] = React.useState(policy?.body ?? "");
  const [mode, setMode] = React.useState<"version" | "fix">("version");
  const [tab, setTab] = React.useState<"write" | "preview">("write");
  const actor = employees.find((item) => item.id === actorId)?.name ?? "HR";
  const clash = policies.find((item) => item.id !== policy?.id && item.status !== "archived" && item.name.trim().toLowerCase() === title.trim().toLowerCase());
  const error = title.trim().length < 3 ? "Give the policy a title." : clash ? `There is already a policy called ${clash.name}.` : body.trim().length < 40 ? "Write the policy text (at least 40 characters)." : "";
  const blocks = React.useMemo(() => blocksFromText(body, title || "Policy"), [body, title]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (error) return;
    const today = hrToday();
    const base: CompanyPolicy = policy ?? { id: `policy-${crypto.randomUUID().slice(0, 8)}`, employeeId: "company", employeeName: "Company library", name: title.trim(), category, visibility: "employee", version: 1, status: "current", signatureStatus: "draft", issuedAt: today, expiresAt: null, ownerName: actor, acknowledgedAt: null, body: "" };
    const bump = policy && mode === "version";
    const next: CompanyPolicy = { ...base, name: title.trim(), category, body: body.trim(), version: bump ? base.version + 1 : base.version, issuedAt: !policy || bump ? today : base.issuedAt, ownerName: actor };
    savePolicy(next);
    record(next.id, { actor, event: !policy ? "Policy published" : bump ? `Published as version ${next.version}` : "Wording corrected", version: next.version, detail: !policy ? undefined : bump ? "Everyone must acknowledge again" : "Version unchanged" });
    if (!policy || bump) useHrEngageStore.getState().addItem({ id: `eng-${crypto.randomUUID()}`, kind: "announcement", authorId: actorId, createdAt: new Date().toISOString(), group: "all", title: !policy ? `New policy: ${next.name}` : `Policy updated: ${next.name} (v${next.version})`, text: !policy ? "A new company policy has been published. Please read it and acknowledge it in Document Center." : "This policy has changed. Please read the new version and acknowledge it again in Document Center." });
    toast.success(!policy ? "Policy published. Everyone is asked to acknowledge it." : bump ? `Version ${next.version} published. Everyone must acknowledge it again.` : "Wording updated.");
    onClose();
  }

  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="flex max-h-[94dvh] w-[calc(100%-1rem)] max-w-5xl flex-col gap-4 overflow-y-auto rounded-none">
    <DialogHeader><DialogTitle>{policy ? `Edit ${policy.name}` : "Write a policy"}</DialogTitle><DialogDescription>Write it like a short document. Employees read it formatted and acknowledge it.</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_240px]"><HrField label="Title"><Input required maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-none" /></HrField><HrField label="Category"><select className={hrInputClass} value={category} onChange={(event) => setCategory(event.target.value)}>{policyCategories.map((item) => <option key={item}>{item}</option>)}</select></HrField></div>
      <div role="tablist" aria-label="Editor" className="flex gap-1 border-b border-border lg:hidden">{(["write", "preview"] as const).map((item) => <button key={item} type="button" id={`pol-tab-${item}`} role="tab" aria-selected={tab === item} aria-controls="pol-panel" onClick={() => setTab(item)} className={`px-4 py-2 text-sm ${tab === item ? "border-b-2 border-accent font-medium" : "text-muted-foreground"}`}>{item === "write" ? "Write" : "Preview"}</button>)}</div>
      <div id="pol-panel" className="grid gap-4 lg:grid-cols-2">
        <div className={tab === "write" ? "space-y-2" : "hidden space-y-2 lg:block"}><HrField label="Policy text"><Textarea required rows={16} maxLength={8000} value={body} onChange={(event) => setBody(event.target.value)} className="min-h-72 rounded-none font-mono text-xs" placeholder="# Title&#10;## Section&#10;Write the rule here." /></HrField>
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Formatting: <code># title</code>, <code>## heading</code>, <code>- bullet</code>, <code>1. numbered</code>, <code>**bold**</code>.</p>{!body.trim() && <Button type="button" size="sm" variant="outline" onClick={() => setBody(outline(title.trim()))}>Insert an outline</Button>}</div></div>
        <div className={tab === "preview" ? "" : "hidden lg:block"} aria-label="Preview"><p className="mb-1 text-xs font-medium text-muted-foreground">What employees will read</p><DocumentReader source={{ kind: "blocks", blocks, text: body }} height="max-h-[52vh]" /></div>
      </div>
      {policy && <fieldset className="space-y-2 border border-border p-3 text-sm"><legend className="px-1 text-xs font-medium">How should this change go out?</legend>
        <label className="flex items-start gap-2"><input type="radio" name="mode" className="mt-1" checked={mode === "version"} onChange={() => setMode("version")} /><span><strong>Publish as version {policy.version + 1}.</strong> Everyone is asked to read and acknowledge it again.</span></label>
        <label className="flex items-start gap-2"><input type="radio" name="mode" className="mt-1" checked={mode === "fix"} onChange={() => setMode("fix")} /><span><strong>Fix wording only.</strong> Keeps version {policy.version}. Existing acknowledgements stay.</span></label></fieldset>}
      {error && (title !== "" || body !== "") && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={Boolean(error)}>{policy ? (mode === "version" ? `Publish version ${policy.version + 1}` : "Save wording") : "Publish policy"}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
