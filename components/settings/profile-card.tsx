"use client";

import * as React from "react";
import { toast } from "sonner";
import { Building2, Camera, Loader2, Mail, Trash2, X } from "lucide-react";
import { SectionCard, FieldRow } from "@/components/settings/section-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sessionChanged, useSession } from "@/components/auth/session-provider";
import { api, message } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { roleLabel } from "@/lib/access";
import { cn } from "@/lib/utils";
import { useProfileStore, type UserStatus, avatarColorFor } from "@/lib/stores/profile-store";

const STATUS_OPTIONS: { value: UserStatus; label: string; dot: string }[] = [
  { value: "online", label: "Online", dot: "bg-emerald-500" },
  { value: "busy", label: "Busy", dot: "bg-red-500" },
  { value: "away", label: "Away", dot: "bg-amber-500" },
  { value: "offline", label: "Offline", dot: "bg-gray-400" },
];

const STATUS_EMOJI_PICKER = [
  "\u{1F60A}", "\u{1F3E0}", "✈️", "\u{1F912}", "\u{1F4BB}", "\u{1F389}", "\u{1F4DE}", "\u{1F37D}️",
  "\u{1F3C3}", "\u{1F4DA}", "☕", "\u{1F4A4}", "\u{1F3A7}", "\u{1F9D8}", "\u{1F680}", "\u{1F4AC}",
];

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const max = 128;
        let w = img.width;
        let h = img.height;
        if (w > max || h > max) {
          const ratio = Math.min(max / w, max / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas not supported")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("Invalid image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function ProfileCard() {
  const session = useSession();
  const [name, setName] = React.useState(session.user.name);
  const [phone, setPhone] = React.useState(session.user.phone ?? "");
  const [saving, setSaving] = React.useState(false);
  const [changingEmail, setChangingEmail] = React.useState(false);

  const avatarUrl = useProfileStore((s) => s.avatarUrl);
  const bio = useProfileStore((s) => s.bio);
  const profileTitle = useProfileStore((s) => s.title);
  const displayName = useProfileStore((s) => s.displayName);
  const status = useProfileStore((s) => s.status);
  const customStatus = useProfileStore((s) => s.customStatus);
  const statusEmoji = useProfileStore((s) => s.statusEmoji);
  const setAvatar = useProfileStore((s) => s.setAvatar);
  const setBio = useProfileStore((s) => s.setBio);
  const setProfileTitle = useProfileStore((s) => s.setTitle);
  const setDisplayName = useProfileStore((s) => s.setDisplayName);
  const setStatus = useProfileStore((s) => s.setStatus);
  const setCustomStatus = useProfileStore((s) => s.setCustomStatus);
  const setStatusEmoji = useProfileStore((s) => s.setStatusEmoji);

  const [localBio, setLocalBio] = React.useState(bio);
  const [localTitle, setLocalTitle] = React.useState(profileTitle);
  const [localDisplayName, setLocalDisplayName] = React.useState(displayName || session.user.name);
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const dirty = name.trim() !== session.user.name || (phone.trim() || null) !== (session.user.phone ?? null);
  const phoneProblem = phone.trim() && !/^\+?[0-9 ()-]{7,32}$/.test(phone.trim()) ? "Use digits, like +91 98765 43210." : "";
  const ini = (displayName || name).trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "U";
  const color = avatarColorFor(displayName || name);

  const profileDirty =
    localBio !== bio ||
    localTitle !== profileTitle ||
    localDisplayName !== (displayName || session.user.name);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty || phoneProblem || !name.trim()) return;
    setSaving(true);
    try {
      if (!demoMode) await api("/me", { method: "PATCH", body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null }) });
      toast.success("Profile saved.");
      if (!demoMode) window.dispatchEvent(new Event(sessionChanged));
    } catch (error) { toast.error(message(error)); } finally { setSaving(false); }
  }

  function saveProfile() {
    setDisplayName(localDisplayName.trim());
    setProfileTitle(localTitle.trim());
    setBio(localBio.trim());
    toast.success("Profile updated.");
  }

  async function handleAvatarUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_SIZE) { toast.error("Image must be under 2 MB."); return; }
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file."); return; }
    try {
      const dataUrl = await resizeImage(file);
      setAvatar(dataUrl);
      toast.success("Photo updated.");
    } catch { toast.error("Could not process image."); }
    if (fileRef.current) fileRef.current.value = "";
  }

  const statusDot = STATUS_OPTIONS.find((o) => o.value === status)?.dot ?? "bg-gray-400";

  return <div className="flex flex-col gap-4">
    {/* Avatar + identity */}
    <SectionCard title="Profile photo" description="Your photo shows in team chat, mentions, and the header.">
      <div className="flex items-center gap-5">
        <div className="group relative">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Your avatar" className="size-20 rounded-full object-cover ring-2 ring-border" />
          ) : (
            <span className="flex size-20 items-center justify-center rounded-full text-xl font-semibold text-white ring-2 ring-border" style={{ backgroundColor: color }}>{ini}</span>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Upload photo"
          >
            <Camera className="size-5 text-white" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        </div>
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>Upload photo</Button>
          {avatarUrl && (
            <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => { setAvatar(null); toast.success("Photo removed."); }}>
              <Trash2 className="size-3" />
              Remove
            </Button>
          )}
          <p className="text-[11px] text-muted-foreground">JPG, PNG or GIF. Max 2 MB.</p>
        </div>
      </div>
    </SectionCard>

    {/* Display name, title, bio */}
    <SectionCard title="About you" description="How you appear across Janus: in chat, mentions, and the sidebar.">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldRow label="Display name">
            <Input value={localDisplayName} maxLength={80} onChange={(e) => setLocalDisplayName(e.target.value)} placeholder="How others see you" />
          </FieldRow>
          <FieldRow label="Title / Role">
            <Input value={localTitle} maxLength={80} onChange={(e) => setLocalTitle(e.target.value)} placeholder="e.g. Sales Manager" />
          </FieldRow>
        </div>
        <FieldRow label="Bio">
          <Textarea
            value={localBio}
            maxLength={200}
            onChange={(e) => setLocalBio(e.target.value)}
            placeholder="A few words about you..."
            className="min-h-[72px]"
          />
          <span className="text-[10px] text-muted-foreground">{localBio.length}/200</span>
        </FieldRow>
        <FieldRow label="Timezone">
          <span className="text-sm text-muted-foreground">{session.user.timezone}</span>
        </FieldRow>
        {profileDirty && (
          <div className="flex justify-end">
            <Button size="sm" onClick={saveProfile}>Save profile info</Button>
          </div>
        )}
      </div>
    </SectionCard>

    {/* Status */}
    <SectionCard title="Status" description="Your availability across team chat and the app.">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatus(opt.value)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1.5 rounded-lg px-2 py-2.5 text-xs transition-colors",
                status === opt.value
                  ? "bg-accent-muted text-foreground ring-1 ring-accent/30"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <span className={cn("size-3 rounded-full", opt.dot)} />
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEmojiPicker((v) => !v)}
              className="flex size-9 items-center justify-center rounded-md border border-border bg-surface-2 text-sm hover:bg-surface-2/80"
              aria-label="Pick emoji"
            >
              {statusEmoji || <span className="text-muted-foreground">+</span>}
            </button>
            {showEmojiPicker && (
              <div className="absolute left-0 top-10 z-10 grid grid-cols-8 gap-0.5 rounded-lg border border-border bg-surface p-2 shadow-lg">
                {STATUS_EMOJI_PICKER.map((e) => (
                  <button key={e} type="button" onClick={() => { setStatusEmoji(e); setShowEmojiPicker(false); }} className="flex size-8 items-center justify-center rounded hover:bg-surface-2 text-base">{e}</button>
                ))}
                {statusEmoji && (
                  <button type="button" onClick={() => { setStatusEmoji(""); setShowEmojiPicker(false); }} className="col-span-8 mt-1 flex items-center justify-center gap-1 rounded py-1 text-xs text-muted-foreground hover:bg-surface-2">
                    <X className="size-3" /> Clear
                  </button>
                )}
              </div>
            )}
          </div>
          <Input
            value={customStatus}
            onChange={(e) => setCustomStatus(e.target.value)}
            maxLength={80}
            placeholder="What's on your mind?"
            className="flex-1"
          />
          {(customStatus || statusEmoji) && (
            <Button size="sm" variant="ghost" onClick={() => { setCustomStatus(""); setStatusEmoji(""); }}>Clear</Button>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
          <span className={cn("size-2.5 shrink-0 rounded-full", statusDot)} />
          <span className="text-xs text-foreground">
            {statusEmoji && <span className="mr-1">{statusEmoji}</span>}
            {customStatus || STATUS_OPTIONS.find((o) => o.value === status)?.label}
          </span>
        </div>
      </div>
    </SectionCard>

    {/* Account details (name, phone) */}
    <SectionCard title="Account details" description="Your name and phone on record. Changes here update your sign-in details.">
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldRow label="Full name"><Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoComplete="name" /></FieldRow>
          <FieldRow label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" placeholder="+91 98765 43210" />{phoneProblem && <span role="alert" className="text-[11px] text-danger">{phoneProblem}</span>}</FieldRow>
        </div>
        <div className="flex justify-end"><Button type="submit" disabled={!dirty || saving || Boolean(phoneProblem) || !name.trim()}>{saving && <Loader2 className="size-3.5 animate-spin" />}Save</Button></div>
      </form>
    </SectionCard>

    {/* Email */}
    <SectionCard title="Sign-in email" description="Where invitations, password resets and your Monday summary go.">
      <div className="flex flex-wrap items-center gap-3">
        <Mail className="size-4 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm">{session.user.email}</span>
        <Button size="sm" variant="secondary" onClick={() => setChangingEmail(true)}>Change email</Button>
      </div>
    </SectionCard>

    {/* Companies */}
    <SectionCard title="Your companies" description="Each company you can sign in to, and your role there.">
      <ul className="divide-y divide-border">{session.tenants.map((tenant) => <li key={tenant.id} className="flex items-center gap-3 py-2.5 text-sm">
        <Building2 className="size-4 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{tenant.name}</span>
        {String(tenant.id) === String(session.tenant.id) && <Badge variant="success">Open now</Badge>}
        <Badge variant="neutral">{roleLabel(String(tenant.role).toLowerCase())}</Badge>
      </li>)}</ul>
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
        <FieldRow label="New email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus /></FieldRow>
        <FieldRow label="Your password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /><span className="text-[11px] text-muted-foreground">To confirm it is you.</span></FieldRow>
      </div>
      <DialogFooter><Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={!valid || !password || saving}>{saving && <Loader2 className="size-3.5 animate-spin" />}Send link</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
