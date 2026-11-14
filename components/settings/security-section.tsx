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

/** One signed-in browser or phone (GET /auth/sessions). `device` is what the browser called itself. */
type Device = { id: string; device: string; ip: string; last_used_at: string; created_at: string; current: boolean };

const demoDevices: Device[] = [
  { id: "1", device: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0", ip: "103.21.58.4", last_used_at: new Date().toISOString(), created_at: "2026-11-01T09:00:00+05:30", current: true },
  { id: "2", device: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1", ip: "49.36.12.90", last_used_at: "2026-11-12T19:40:00+05:30", created_at: "2026-10-20T10:00:00+05:30", current: false },
];

/** "Chrome on Mac" from a browser's own description of itself. */
export function deviceName(agent: string) {
  const browser = /Edg\//.test(agent) ? "Edge" : /OPR\//.test(agent) ? "Opera" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : /python|httpx|curl/i.test(agent) ? "An app or script" : "A browser";
  const system = /iPhone/.test(agent) ? "iPhone" : /iPad/.test(agent) ? "iPad" : /Android/.test(agent) ? "Android" : /Mac OS X|Macintosh/.test(agent) ? "Mac" : /Windows/.test(agent) ? "Windows" : /Linux/.test(agent) ? "Linux" : "";
  return system ? `${browser} on ${system}` : browser;
}
const phone = (agent: string) => /iPhone|Android|Mobile/.test(agent);
const when = (iso: string) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 2) return "active now";
  if (minutes < 60) return `${minutes} minutes ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} hours ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

/**
 * Your own sign-in: change the password, and see every browser and phone signed in as you, so one
 * left signed in on a shared computer or a lost phone can be signed out from here.
 */
export function SecuritySection() {
  const live = useApi<Device[]>(demoMode ? null : "/auth/sessions");
  const [demoList, setDemoList] = React.useState(demoDevices);
  const devices = demoMode ? demoList : live.data ?? [];
  const others = devices.filter((item) => !item.current);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function signOut(ids: string[]) {
    setBusy(ids.length > 1 ? "others" : ids[0]);
    try {
      if (demoMode) setDemoList((current) => current.filter((item) => !ids.includes(item.id)));
      else { for (const id of ids) await api(`/auth/sessions/${id}`, { method: "DELETE" }); live.reload(); }
      toast.success(ids.length > 1 ? `Signed out of ${ids.length} other devices.` : "That device is signed out.");
    } catch (error) { toast.error(message(error)); } finally { setBusy(null); }
  }

  return <div className="flex flex-col gap-4">
    <PasswordCard />
    <SectionCard title="Where you are signed in" description="Every browser and phone signed in as you, most recently used first. Sign out any you do not recognise, then change your password." action={others.length > 0 ? <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => { if (window.confirm(`Sign out of ${others.length} other ${others.length === 1 ? "device" : "devices"}? This one stays signed in.`)) void signOut(others.map((item) => item.id)); }}>{busy === "others" ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}Sign out all others</Button> : undefined}>
      {live.loading ? <p className="text-sm text-muted-foreground">Loading your devices…</p>
        : live.error ? <p className="text-sm text-danger">{live.error}</p>
        : <ul className="divide-y divide-border">{[...devices].sort((a, b) => Number(b.current) - Number(a.current) || b.last_used_at.localeCompare(a.last_used_at)).map((item) => {
          const Icon = phone(item.device) ? Smartphone : Laptop;
          return <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground"><Icon className="size-4" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{deviceName(item.device)}{item.current && <Badge variant="success">This device</Badge>}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.current ? "Active now" : `Last used ${when(item.last_used_at)}`} · IP {item.ip} · signed in {new Date(item.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
            </div>
            {!item.current && <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void signOut([item.id])}>{busy === item.id ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}Sign out</Button>}
          </li>;
        })}</ul>}
      <p className="mt-3 text-[11px] text-muted-foreground">Two-step sign-in is not available in Janus yet. A strong password you use nowhere else is the best protection for now.</p>
    </SectionCard>
  </div>;
}

function PasswordCard() {
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
      setCurrent(""); setNext(""); setAgain("");
      toast.success(demoMode ? "In the preview nothing is changed." : "Password changed. Every other device was signed out.");
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
