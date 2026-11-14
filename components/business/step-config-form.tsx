"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApi } from "@/lib/api/use-api";

type Channel = { id: string; kind: string; name: string | null; joined: boolean };
type Project = { external_key: string; name: string; status: string };

/** The fields each trigger gives its steps, as {{record.field}}, with their names in words. */
const recordFields: Record<string, { record: string; fields: [string, string][] }> = {
  lead_created: { record: "lead", fields: [["name", "Name"], ["company", "Company"], ["requirement", "What they want"], ["source", "Where they came from"], ["stage", "Stage"]] },
  ticket_created: { record: "ticket", fields: [["number", "Ticket number"], ["subject", "Subject"], ["priority", "Priority"], ["status", "Status"]] },
  spend_requested: { record: "spend", fields: [["number", "Request number"], ["amount", "Amount"], ["purpose", "Purpose"], ["requested_by", "Raised by"], ["budget_line", "Budget line"]] },
  credit_note_raised: { record: "credit_note", fields: [["kind", "Credit note or write-off"], ["number", "Number"], ["amount", "Amount"], ["reason", "Reason"], ["invoice", "Invoice"], ["customer", "Customer"]] },
};
const select = "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm";

/** Text with the record's fields shown as [Lead's name] instead of {{lead.name}}. */
export function readable(text: string) {
  return text.replace(/\{\{\s*([a-z_]+)\.([a-z_]+)\s*\}\}/g, (_, record: string, field: string) => `[${record.replaceAll("_", " ")}'s ${field.replaceAll("_", " ")}]`);
}

function FieldChips({ trigger, editing, onInsert }: { trigger: string; editing: boolean; onInsert: (token: string) => void }) {
  const given = recordFields[trigger];
  const chips: [string, string][] = [...(given ? given.fields.map(([field, label]): [string, string] => [`{{${given.record}.${field}}}`, label]) : []), ["{{workflow.name}}", "Workflow name"]];
  return <div className="flex flex-wrap gap-1">{chips.map(([token, label]) => <button key={token} type="button" disabled={!editing} onClick={() => onInsert(token)} className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] hover:border-accent-border hover:text-accent disabled:opacity-50">+ {label}</button>)}</div>;
}

/**
 * Setting up a step in words: where a post goes and what it says, or which project a task goes to,
 * its title and when it is due. Only the steps Janus carries out have a form.
 */
export function StepConfigForm({ action, config, trigger, editing, onChange }: { action: string; config: Record<string, unknown>; trigger: string; editing: boolean; onChange: (config: Record<string, unknown>) => void }) {
  const channels = useApi<Channel[]>(action === "send_notification" ? "/team/channels" : null);
  const projects = useApi<Project[]>(action === "create_task" ? "/project-records" : null);
  const text = React.useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });
  const insert = (key: string, token: string) => {
    const current = String(config[key] ?? "");
    const at = text.current?.selectionStart ?? current.length;
    set(key, current.slice(0, at) + token + current.slice(at));
  };

  if (action === "send_notification") {
    const joined = (channels.data ?? []).filter((item) => item.kind === "channel" && item.joined && item.name);
    const chosen = String(config.channel ?? "");
    return <div className="grid gap-4">
      <div><Label htmlFor="step-channel">Post in</Label>
        <select id="step-channel" disabled={!editing} className={`${select} mt-1`} value={chosen} onChange={(event) => set("channel", event.target.value)}>
          <option value="">Choose a channel</option>
          {chosen && !joined.some((item) => item.name === chosen) && <option value={chosen}>#{chosen} (you are not in it)</option>}
          {joined.map((item) => <option key={item.id} value={item.name!}>#{item.name}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-muted-foreground">{channels.loading ? "Loading your channels…" : joined.length ? "Posted as the person who switched the workflow on, in a channel they have joined." : "You have not joined a Team Chat channel yet. Join one in Team Chat first."}</p>
      </div>
      <div><Label htmlFor="step-message">Message</Label>
        <Textarea id="step-message" ref={(node) => { text.current = node; }} disabled={!editing} value={String(config.message ?? "")} maxLength={2000} onChange={(event) => set("message", event.target.value)} className="mt-1 min-h-24 text-sm" placeholder="New lead: [lead's name] wants [lead's what they want]. Who is calling?" />
        <div className="mt-1.5"><FieldChips trigger={trigger} editing={editing} onInsert={(token) => insert("message", token)} /></div>
        {String(config.message ?? "").includes("{{") && <p className="mt-1.5 text-[11px] text-muted-foreground">Reads: {readable(String(config.message))}</p>}
      </div>
    </div>;
  }

  if (action === "create_task") {
    const open = (projects.data ?? []).filter((item) => !["completed", "cancelled", "closed", "archived"].includes(item.status));
    const chosen = String(config.project ?? "");
    return <div className="grid gap-4">
      <div><Label htmlFor="step-project">Add the task to</Label>
        <select id="step-project" disabled={!editing} className={`${select} mt-1`} value={chosen} onChange={(event) => set("project", event.target.value)}>
          <option value="">Choose a project</option>
          {chosen && !open.some((item) => item.external_key === chosen) && <option value={chosen}>{chosen} (closed or not found)</option>}
          {open.map((item) => <option key={item.external_key} value={item.external_key}>{item.name}</option>)}
        </select>
        {!projects.loading && !open.length && <p className="mt-1 text-[11px] text-muted-foreground">There is no open project. Create one in Projects &amp; Delivery, for example &quot;Sales follow-ups&quot;.</p>}
      </div>
      <div><Label htmlFor="step-title">Task</Label>
        <Input id="step-title" ref={(node) => { text.current = node; }} disabled={!editing} value={String(config.title ?? "")} maxLength={200} onChange={(event) => set("title", event.target.value)} className="mt-1" placeholder="Call [lead's name] about their enquiry" />
        <div className="mt-1.5"><FieldChips trigger={trigger} editing={editing} onInsert={(token) => insert("title", token)} /></div>
      </div>
      <div><Label htmlFor="step-due">Due</Label>
        <select id="step-due" disabled={!editing} className={`${select} mt-1`} value={String(config.dueInDays ?? 1)} onChange={(event) => set("dueInDays", Number(event.target.value))}>
          {[0, 1, 2, 3, 5, 7, 14].map((days) => <option key={days} value={days}>{days === 0 ? "The same day" : days === 1 ? "The next day" : `In ${days} days`}</option>)}
        </select>
      </div>
    </div>;
  }

  if (["approval", "request_approval", "require_approval"].includes(action)) {
    return <p className="text-sm text-muted-foreground">The run waits here until someone who approves workflows approves it on the Workflows page. Nothing after this step happens before then.</p>;
  }

  return <p className="text-sm text-muted-foreground">Janus does not carry out this step yet, so a workflow with it is refused rather than run. Use a Team Chat post or a project task instead.</p>;
}
