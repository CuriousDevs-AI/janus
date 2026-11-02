"use client";

import * as React from "react";
import { Check, Loader2, Mail, SkipForward, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, message } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
const roles = [
  ["agent", "Agent", "Works on their own leads and records."],
  ["manager", "Manager", "Leads a team: sees and assigns their work, approves leave."],
  ["admin", "Admin", "Runs the company's settings and people, but not billing."],
] as const;
type Role = (typeof roles)[number][0];
type Sent = { email: string; role: Role; status: "sending" | "sent" | "failed"; reason?: string };

/** Splits what was typed or pasted into addresses: commas, semicolons, spaces and new lines all separate. */
function split(text: string) {
  return [...new Set(text.split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

/**
 * The setup wizard's team step: type or paste one or more emails, pick their role, and each gets
 * a real invitation by email. Each address shows whether it went, or why not.
 */
export function InviteTeam({ onSkip, onContinue, saving }: { onSkip: () => void; onContinue: () => void; saving: boolean }) {
  const [draft, setDraft] = React.useState("");
  const [chips, setChips] = React.useState<string[]>([]);
  const [role, setRole] = React.useState<Role>("agent");
  const [sent, setSent] = React.useState<Sent[]>([]);
  const [busy, setBusy] = React.useState(false);

  const invalid = chips.filter((email) => !EMAIL.test(email));
  const already = new Set(sent.filter((item) => item.status !== "failed").map((item) => item.email));

  /** Moves whatever is typed into the list once it ends with a separator, or on Enter. */
  function take(text: string, force = false) {
    const parts = text.split(/[\s,;]+/);
    const rest = force ? "" : parts.pop() ?? "";
    const found = split(parts.join(" ") + (force ? ` ${rest}` : ""));
    if (found.length) setChips((items) => [...new Set([...items, ...found])]);
    setDraft(force ? "" : rest);
  }

  async function send() {
    const list = [...new Set([...chips, ...split(draft)])].filter((email) => !already.has(email));
    if (!list.length || list.some((email) => !EMAIL.test(email))) return;
    setBusy(true);
    setChips([]);
    setDraft("");
    setSent((items) => [...list.map((email): Sent => ({ email, role, status: "sending" })), ...items.filter((item) => !list.includes(item.email))]);
    let ok = 0;
    for (const email of list) {
      try {
        await api("/invitations", { method: "POST", body: JSON.stringify({ email, role }) });
        ok += 1;
        setSent((items) => items.map((item) => item.email === email ? { ...item, status: "sent" } : item));
      } catch (failure) {
        setSent((items) => items.map((item) => item.email === email ? { ...item, status: "failed", reason: message(failure) } : item));
      }
    }
    setBusy(false);
    if (ok) toast.success(`${ok} invitation${ok === 1 ? "" : "s"} sent.`);
    if (ok < list.length) toast.error(`${list.length - ok} could not be sent. See the reason beside each.`);
  }

  const pending = [...chips, ...split(draft)].filter((email) => !already.has(email));
  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-4">
        <UsersRound className="mt-0.5 size-4 text-accent" />
        <div>
          <p className="text-sm font-medium">Invite your teammates</p>
          <p className="mt-1 text-xs text-muted-foreground">Type or paste as many emails as you like, separated by commas, spaces or new lines. Each person gets an email to join. You can change roles and workspaces later from People & Access.</p>
        </div>
      </div>

      <div className="grid gap-2">
        <label htmlFor="invite-emails" className="text-xs text-muted-foreground">Emails</label>
        <div
          className="flex min-h-[72px] flex-wrap content-start gap-1.5 rounded-md border border-input bg-surface-2 p-2 focus-within:border-accent-border focus-within:ring-2 focus-within:ring-ring"
          onClick={() => document.getElementById("invite-emails")?.focus()}
        >
          {chips.map((email) => (
            <span key={email} className={cn("flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs", EMAIL.test(email) ? "border-border bg-surface" : "border-danger/40 bg-danger-muted text-danger")}>
              {email}
              <button type="button" aria-label={`Remove ${email}`} onClick={() => setChips((items) => items.filter((item) => item !== email))} className="text-muted-foreground hover:text-foreground"><X className="size-3" /></button>
            </span>
          ))}
          <textarea
            id="invite-emails"
            rows={1}
            value={draft}
            placeholder={chips.length ? "Add more…" : "priya@company.com, rohan@company.com"}
            className="min-w-[200px] flex-1 resize-none bg-transparent py-0.5 text-[13px] outline-none placeholder:text-muted-foreground/70"
            onChange={(event) => (/[\s,;]/.test(event.target.value) ? take(event.target.value) : setDraft(event.target.value))}
            onPaste={(event) => { event.preventDefault(); take(draft + " " + event.clipboardData.getData("text"), true); }}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); take(draft, true); }
              if (event.key === "Backspace" && !draft && chips.length) setChips((items) => items.slice(0, -1));
            }}
            onBlur={() => draft.trim() && take(draft, true)}
          />
        </div>
        {invalid.length > 0 && <p role="alert" className="text-xs text-danger">{invalid.length === 1 ? `${invalid[0]} is not a valid email.` : `${invalid.length} addresses are not valid emails.`} Remove or fix them to send.</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-[220px_1fr] sm:items-end">
        <label className="grid gap-1 text-xs text-muted-foreground">Role for these people
          <Select value={role} onValueChange={(value) => setRole(value as Role)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{roles.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <p className="text-xs text-muted-foreground sm:pb-2">{roles.find(([value]) => value === role)?.[2]}</p>
      </div>

      <Button className="w-fit" onClick={() => void send()} disabled={busy || pending.length === 0 || invalid.length > 0}>
        {busy ? <><Loader2 className="size-3.5 animate-spin" />Sending…</> : <><Mail className="size-3.5" />{pending.length > 1 ? `Send ${pending.length} invitations` : "Send invitation"}</>}
      </Button>

      {sent.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border" aria-live="polite">
          {sent.map((item) => (
            <li key={item.email} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <Mail className="size-3.5 text-muted-foreground" />
              <span className="min-w-0 truncate">{item.email}</span>
              <span className="text-xs text-muted-foreground">· {roles.find(([value]) => value === item.role)?.[1]}</span>
              <span className="ml-auto flex items-center gap-2">
                {item.status === "sending" && <Badge variant="neutral"><Loader2 className="mr-1 size-3 animate-spin" />Sending</Badge>}
                {item.status === "sent" && <Badge variant="success"><Check className="mr-1 size-3" />Invitation sent</Badge>}
                {item.status === "failed" && <Badge variant="danger">Not sent</Badge>}
              </span>
              {item.reason && <p className="w-full text-xs text-danger">{item.reason}</p>}
            </li>
          ))}
        </ul>
      )}

      {sent.some((item) => item.status === "sent")
        ? <Button variant="secondary" className="w-fit" onClick={onContinue} disabled={saving || busy}>Continue</Button>
        : <Button variant="ghost" className="w-fit" onClick={onSkip} disabled={saving || busy}><SkipForward className="size-3.5" />Skip team invites</Button>}
    </div>
  );
}
