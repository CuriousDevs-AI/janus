"use client";

import * as React from "react";
import { toast } from "sonner";
import { KeyRound, Laptop, Loader2, LogOut, Smartphone } from "lucide-react";
import { demoMode } from "@/lib/demo-mode";
import { SectionCard, FieldRow } from "@/components/settings/section-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { useSession } from "@/components/auth/session-provider";
import { useSessionStore, deviceLabel, timeAgo, isPhone, type SessionRecord } from "@/lib/stores/session-store";
import { useAuditLog } from "@/lib/stores/audit-log-store";

type Device = { id: string; device: string; ip: string; last_used_at: string; created_at: string; current: boolean };

const fmtSignedIn = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) + ", " + new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  } catch { return iso; }
};

export function SecuritySection() {
  const session = useSession();
  const ensureSession = useSessionStore((s) => s.ensureSession);
  const touchSession = useSessionStore((s) => s.touchSession);
  const revokeSession = useSessionStore((s) => s.revokeSession);
  const revokeAllOthers = useSessionStore((s) => s.revokeAllOthers);
  const sessions = useSessionStore((s) => s.sessions);
  const appendLog = useAuditLog((s) => s.append);

  React.useEffect(() => {
    if (demoMode) ensureSession(session.user.id);
  }, [session.user.id, ensureSession]);

  React.useEffect(() => {
    if (!demoMode) return;
    const interval = setInterval(() => touchSession(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [touchSession]);

  const live = useApi<Device[]>(demoMode ? null : "/auth/sessions");
  const activeSessions = demoMode ? sessions.filter((s) => s.status === "active") : (live.data ?? []);
  const others = demoMode
    ? activeSessions.filter((s) => !s.current)
    : activeSessions.filter((s: Device | SessionRecord) => !(s as Device).current);

  const [busy, setBusy] = React.useState<string | null>(null);

  async function signOutSessions(ids: string[]) {
    setBusy(ids.length > 1 ? "others" : ids[0]);
    try {
      if (demoMode) {
        const actor = { name: session.user.name, email: session.user.email, role: session.role };
        if (ids.length > 1) {
          revokeAllOthers();
          appendLog({ action: "session.revoked", actor, companyId: null, companyName: null, target: `${ids.length} other sessions`, detail: null, before: null, after: null });
        } else {
          for (const id of ids) {
            revokeSession(id);
            appendLog({ action: "session.revoked", actor, companyId: null, companyName: null, target: id, detail: null, before: null, after: null });
          }
        }
      } else {
        for (const id of ids) await api(`/auth/sessions/${id}`, { method: "DELETE" });
        live.reload();
      }
      toast.success(ids.length > 1 ? `Signed out of ${ids.length} other devices.` : "That device is signed out.");
    } catch (error) { toast.error(message(error)); } finally { setBusy(null); }
  }

  return <div className="flex flex-col gap-4">
    <PasswordCard />
    <SectionCard title="Where you are signed in" description="Every browser and phone signed in as you, most recently used first. Sign out any you do not recognise, then change your password." action={others.length > 0 ? <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => { if (window.confirm(`Sign out of ${others.length} other ${others.length === 1 ? "device" : "devices"}? This one stays signed in.`)) void signOutSessions(others.map((item) => item.id)); }}>{busy === "others" ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}Sign out all others</Button> : undefined}>
      {!demoMode && live.loading ? <p className="text-sm text-muted-foreground">Loading your devices…</p>
        : !demoMode && live.error ? <p className="text-sm text-danger">{live.error}</p>
        : demoMode ? <DemoSessionList sessions={activeSessions as SessionRecord[]} busy={busy} onSignOut={(id) => void signOutSessions([id])} />
        : <LiveSessionList devices={activeSessions as Device[]} busy={busy} onSignOut={(id) => void signOutSessions([id])} />}
      <p className="mt-3 text-[11px] text-muted-foreground">Two-step sign-in is not available in Janus yet. A strong password you use nowhere else is the best protection for now.</p>
    </SectionCard>
    {demoMode && sessions.some((s) => s.status === "revoked") && <SectionCard title="Recent sign-ins" description="Sessions you signed out of.">
      <ul className="divide-y divide-border">{sessions.filter((s) => s.status === "revoked").slice(0, 5).map((s) => <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground">{isPhone(s.userAgent) ? <Smartphone className="size-4" /> : <Laptop className="size-4" />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">{deviceLabel(s.userAgent)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{s.location} · IP {s.ip} · Signed in {fmtSignedIn(s.signedInAt)} · Signed out</p>
        </div>
      </li>)}</ul>
    </SectionCard>}
  </div>;
}

function DemoSessionList({ sessions, busy, onSignOut }: { sessions: SessionRecord[]; busy: string | null; onSignOut: (id: string) => void }) {
  const sorted = [...sessions].sort((a, b) => Number(b.current) - Number(a.current) || b.lastActiveAt.localeCompare(a.lastActiveAt));
  return <ul className="divide-y divide-border">{sorted.map((s) => {
    const Icon = isPhone(s.userAgent) ? Smartphone : Laptop;
    return <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground"><Icon className="size-4" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{deviceLabel(s.userAgent)}{s.current && <Badge variant="success">This device</Badge>}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{s.current ? "Active now" : `Last active ${timeAgo(s.lastActiveAt)}`} · {s.location} · IP {s.ip} · Signed in {fmtSignedIn(s.signedInAt)}</p>
      </div>
      {!s.current && <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => onSignOut(s.id)}>{busy === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}Sign out</Button>}
    </li>;
  })}</ul>;
}

function LiveSessionList({ devices, busy, onSignOut }: { devices: Device[]; busy: string | null; onSignOut: (id: string) => void }) {
  const sorted = [...devices].sort((a, b) => Number(b.current) - Number(a.current) || b.last_used_at.localeCompare(a.last_used_at));
  return <ul className="divide-y divide-border">{sorted.map((item) => {
    const Icon = isPhone(item.device) ? Smartphone : Laptop;
    return <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground"><Icon className="size-4" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{deviceLabel(item.device)}{item.current && <Badge variant="success">This device</Badge>}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{item.current ? "Active now" : `Last used ${timeAgo(item.last_used_at)}`} · IP {item.ip} · Signed in {fmtSignedIn(item.created_at)}</p>
      </div>
      {!item.current && <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => onSignOut(item.id)}>{busy === item.id ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}Sign out</Button>}
    </li>;
  })}</ul>;
}

function PasswordCard() {
  const session = useSession();
  const appendLog = useAuditLog((s) => s.append);
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const problem = next && next.length < 8 ? "Use at least 8 characters." : again && next !== again ? "The two new passwords do not match." : next && next === current ? "Choose a password different from the current one." : "";
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (problem || !current || !next || !again) return;
    setSaving(true);
    try {
      if (!demoMode) await api("/me/change-password", { method: "POST", body: JSON.stringify({ current_password: current, new_password: next }) });
      appendLog({ action: "password.changed", actor: { name: session.user.name, email: session.user.email, role: session.role }, companyId: null, companyName: null, target: session.user.email, detail: null, before: null, after: null });
      setCurrent(""); setNext(""); setAgain("");
      toast.success(demoMode ? "Password changed (preview — nothing is stored)." : "Password changed. Every other device was signed out.");
    } catch (error) { toast.error(message(error)); } finally { setSaving(false); }
  }
  return <SectionCard title="Password" description="Changing it signs you out everywhere else, so anyone using your old password is shut out.">
    <form onSubmit={save} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <FieldRow label="Current password"><Input type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} /></FieldRow>
        <FieldRow label="New password"><Input type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} /></FieldRow>
        <FieldRow label="New password again"><Input type="password" autoComplete="new-password" value={again} onChange={(event) => setAgain(event.target.value)} /></FieldRow>
      </div>
      {problem ? <p role="alert" className="text-xs text-danger">{problem}</p> : <p className="text-[11px] text-muted-foreground">8 to 128 characters. Common passwords are refused.</p>}
      <div className="flex justify-end"><Button type="submit" disabled={saving || Boolean(problem) || !current || !next || !again}>{saving ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}Change password</Button></div>
    </form>
  </SectionCard>;
}
