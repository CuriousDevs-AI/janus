"use client";

import * as React from "react";
import { toast } from "sonner";
import { Building2, Loader2, Mail } from "lucide-react";
import { SectionCard, FieldRow } from "@/components/settings/section-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/components/auth/session-provider";
import { api, message } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { roleLabel } from "@/lib/access";

/**
 * Your own profile: the name and phone your team sees on what you create, approve or assign, the
 * email you sign in with, and every company you belong to with your role in it.
 */
export function ProfileCard() {
  const session = useSession();
  const [name, setName] = React.useState(session.user.name);
  const [phone, setPhone] = React.useState(session.user.phone ?? "");
  const [saving, setSaving] = React.useState(false);
  const [changingEmail, setChangingEmail] = React.useState(false);
  const dirty = name.trim() !== session.user.name || (phone.trim() || null) !== (session.user.phone ?? null);
  const phoneProblem = phone.trim() && !/^\+?[0-9 ()-]{7,32}$/.test(phone.trim()) ? "Use digits, like +91 98765 43210." : "";
  const initials = name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "U";

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty || phoneProblem || !name.trim()) return;
    setSaving(true);
    try {
      if (!demoMode) await api("/me", { method: "PATCH", body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null }) });
      toast.success("Profile saved.");
      // The name shows across the app from the session, which is read when the page loads.
      if (!demoMode) window.setTimeout(() => window.location.reload(), 600);
    } catch (error) { toast.error(message(error)); } finally { setSaving(false); }
  }

  return <div className="flex flex-col gap-4">
    <SectionCard title="Profile" description="What your team sees on what you create, approve or assign.">
      <form onSubmit={save} className="flex flex-col gap-5">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-muted text-sm font-semibold text-accent">{initials}</span>
          <div className="min-w-0"><p className="text-sm font-medium">{name || "Your profile"}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{session.user.email}</p></div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldRow label="Full name"><Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} autoComplete="name" /></FieldRow>
          <FieldRow label="Phone"><Input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" autoComplete="tel" placeholder="+91 98765 43210" />{phoneProblem && <span role="alert" className="text-[11px] text-danger">{phoneProblem}</span>}</FieldRow>
        </div>
        <div className="flex justify-end"><Button type="submit" disabled={!dirty || saving || Boolean(phoneProblem) || !name.trim()}>{saving && <Loader2 className="size-3.5 animate-spin" />}Save profile</Button></div>
      </form>
    </SectionCard>

    <SectionCard title="Sign-in email" description="Where invitations, password resets and your Monday summary go.">
      <div className="flex flex-wrap items-center gap-3">
        <Mail className="size-4 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm">{session.user.email}</span>
        <Button size="sm" variant="secondary" onClick={() => setChangingEmail(true)}>Change email</Button>
      </div>
    </SectionCard>

    <SectionCard title="Your companies" description="Each company you can sign in to, and your role there. Switch between them from the company menu.">
      <ul className="divide-y divide-border">{session.tenants.map((tenant) => <li key={tenant.id} className="flex items-center gap-3 py-2.5 text-sm">
        <Building2 className="size-4 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{tenant.name}</span>
        {String(tenant.id) === String(session.tenant.id) && <Badge variant="success">Open now</Badge>}
        <Badge variant="neutral">{roleLabel(String(tenant.role).toLowerCase())}</Badge>
      </li>)}</ul>
      <p className="mt-3 text-[11px] text-muted-foreground">Janus shows dates and times in India time.</p>
    </SectionCard>
    {changingEmail && <EmailDialog current={session.user.email} onClose={() => setChangingEmail(false)} />}
  </div>;
}

function EmailDialog({ current, onClose }: { current: string; onClose: () => void }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim()) && email.trim().toLowerCase() !== current.toLowerCase();
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || !password) return;
    setSaving(true);
    try {
      if (!demoMode) await api("/me/change-email", { method: "POST", body: JSON.stringify({ new_email: email.trim(), password }) });
      toast.success(demoMode ? "In the preview nothing is changed." : `We emailed a link to ${email.trim()}. Your sign-in email changes when you open it.`);
      onClose();
    } catch (error) { toast.error(message(error)); setSaving(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent className="max-w-md">
    <form onSubmit={send}>
      <DialogHeader><DialogTitle>Change your sign-in email</DialogTitle><DialogDescription>We send a link to the new address. Until you open it, you keep signing in with {current}.</DialogDescription></DialogHeader>
      <div className="my-4 grid gap-3">
        <FieldRow label="New email"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoFocus /></FieldRow>
        <FieldRow label="Your password"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /><span className="text-[11px] text-muted-foreground">To confirm it is you.</span></FieldRow>
      </div>
      <DialogFooter><Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={!valid || !password || saving}>{saving && <Loader2 className="size-3.5 animate-spin" />}Send link</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
