"use client";
import * as React from "react";
import { Clock, LogOut, Menu, Search, Shield, User, Bell } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useUIStore } from "@/lib/stores/ui-store";
import { useSession, useSignOut } from "@/components/auth/session-provider";
import { useWorkspace } from "@/components/layout/workspace-context";
import { Button } from "@/components/ui/button";
import { CallPill } from "@/components/team/voice-stage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { roleLabel } from "@/lib/access";
import { cn, initials } from "@/lib/utils";
import { useProfileStore, useMyStatus, type UserStatus } from "@/lib/stores/profile-store";
import { STATUS_PRESETS } from "@/lib/hooks/use-auto-status";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const statusConfig: Record<UserStatus, { label: string; dot: string }> = {
  online: { label: "Online", dot: "bg-emerald-500" },
  busy: { label: "Busy", dot: "bg-red-500" },
  away: { label: "Away", dot: "bg-amber-500" },
  offline: { label: "Offline", dot: "bg-gray-400" },
};

const STATUS_EMOJIS = [
  "\u{1F60A}", "\u{1F3E0}", "✈️", "\u{1F912}", "\u{1F4BB}", "\u{1F389}", "\u{1F4DE}", "\u{1F37D}️",
  "\u{1F3C3}", "\u{1F4DA}", "☕", "\u{1F4A4}", "\u{1F3A7}", "\u{1F9D8}", "\u{1F680}", "\u{1F4AC}",
];

export function Topbar() {
  const { workspace, workspaceId } = useWorkspace();
  const inPortfolio = workspaceId === "portfolio";
  const session = useSession();
  const signOut = useSignOut();
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const setMobile = useUIStore((s) => s.setMobileNavOpen);
  const pathname = usePathname();
  const onTeam = pathname === "/team";

  const avatarUrl = useProfileStore((s) => s.avatarUrl);
  const displayName = useProfileStore((s) => s.displayName) || session.user.name;
  const profileTitle = useProfileStore((s) => s.title);
  const { status, customStatus, statusEmoji } = useMyStatus();
  const setStatus = useProfileStore((s) => s.setStatus);

  const dot = statusConfig[status].dot;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation"
          onClick={() => setMobile(true)}
        >
          <Menu className="size-4" />
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <span className="max-w-[50vw] truncate text-sm font-medium sm:max-w-[280px]">{workspace.name}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {onTeam || inPortfolio ? null : <CallPill />}
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Search className="size-3.5" />
          <span className="hidden sm:inline">Go to… ⌘K</span>
        </Button>

        {/* Profile dropdown — the only profile menu in the app */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-2"
              aria-label="Profile menu"
            >
              <span className="relative">
                <Avatar className="size-7">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                  <AvatarFallback style={{ backgroundColor: "#2563eb" }}>{initials(displayName)}</AvatarFallback>
                </Avatar>
                <span
                  className={cn("absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background", dot)}
                  aria-label={statusConfig[status].label}
                />
              </span>
              <span className="hidden flex-col items-start leading-none sm:flex">
                <span className="text-xs font-medium text-foreground">{displayName}</span>
                {customStatus ? (
                  <span className="max-w-[120px] truncate text-[10px] text-muted-foreground">
                    {statusEmoji ? `${statusEmoji} ` : ""}{customStatus}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">{statusConfig[status].label}</span>
                )}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            {/* Profile header */}
            <div className="flex items-center gap-3 px-3 py-3">
              <span className="relative shrink-0">
                <Avatar className="size-10">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                  <AvatarFallback style={{ backgroundColor: "#2563eb" }} className="text-sm">{initials(displayName)}</AvatarFallback>
                </Avatar>
                <span className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background", dot)} />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
                {profileTitle ? <span className="truncate text-[11px] text-muted-foreground">{profileTitle}</span> : null}
                <span className="truncate text-xs text-muted-foreground">{session.user.email}</span>
                <span className="text-[10px] text-muted-foreground">{roleLabel(session.role)}</span>
              </div>
            </div>
            <DropdownMenuSeparator />

            {/* Status selector */}
            <div className="flex gap-1 px-3 py-1.5">
              {(Object.entries(statusConfig) as [UserStatus, typeof statusConfig.online][]).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatus(key)}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[10px] transition-colors",
                    status === key
                      ? "bg-accent-muted text-foreground"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  <span className={cn("size-2.5 rounded-full", cfg.dot)} />
                  {cfg.label}
                </button>
              ))}
            </div>
            {/* Custom status */}
            <StatusInput />
            <DropdownMenuSeparator />

            {/* Navigation links */}
            <DropdownMenuItem asChild>
              <Link href={`/account?tab=profile&workspace=${workspaceId}`} className="flex items-center gap-2">
                <User className="size-3.5" />
                My account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/account?tab=security&workspace=${workspaceId}`} className="flex items-center gap-2">
                <Shield className="size-3.5" />
                Security & sessions
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/account?tab=notifications&workspace=${workspaceId}`} className="flex items-center gap-2">
                <Bell className="size-3.5" />
                Notifications
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void signOut()}
              className="flex items-center gap-2 text-danger focus:text-danger"
            >
              <LogOut className="size-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

const CLEAR_AFTER_OPTIONS = [
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "4 hours", minutes: 240 },
  { label: "Today", minutes: null as number | null },
  { label: "Don't clear", minutes: -1 },
] as const;

function formatClearAt(iso: string): string | null {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `Clears in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Clears in ${hrs}h`;
  return `Clears ${new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

function StatusInput() {
  const customStatus = useProfileStore((s) => s.customStatus);
  const statusEmoji = useProfileStore((s) => s.statusEmoji);
  const statusClearAt = useProfileStore((s) => s.statusClearAt);
  const setCustomStatus = useProfileStore((s) => s.setCustomStatus);
  const setStatusEmoji = useProfileStore((s) => s.setStatusEmoji);
  const setStatusClearAt = useProfileStore((s) => s.setStatusClearAt);
  const clearCustomStatus = useProfileStore((s) => s.clearCustomStatus);
  const [showPresets, setShowPresets] = React.useState(!customStatus);

  const [, tick] = React.useReducer((c: number) => c + 1, 0);
  React.useEffect(() => {
    if (!statusClearAt) return;
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [statusClearAt]);
  const clearAtLabel = statusClearAt ? formatClearAt(statusClearAt) : null;

  const applyPreset = React.useCallback((preset: typeof STATUS_PRESETS[number]) => {
    setStatusEmoji(preset.emoji);
    setCustomStatus(preset.text);
    if (preset.clearAfterMinutes) {
      setStatusClearAt(new Date(Date.now() + preset.clearAfterMinutes * 60000).toISOString());
    } else {
      setStatusClearAt(null);
    }
    setShowPresets(false);
  }, [setStatusEmoji, setCustomStatus, setStatusClearAt]);

  const setClearAfter = React.useCallback((minutes: number | null) => {
    if (minutes === -1) { setStatusClearAt(null); return; }
    if (minutes === null) {
      const eod = new Date();
      eod.setHours(23, 59, 59, 999);
      setStatusClearAt(eod.toISOString());
      return;
    }
    setStatusClearAt(new Date(Date.now() + minutes * 60000).toISOString());
  }, [setStatusClearAt]);

  return <div className="px-3 py-1.5">
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => {
          const idx = statusEmoji ? STATUS_EMOJIS.indexOf(statusEmoji) : -1;
          setStatusEmoji(STATUS_EMOJIS[(idx + 1) % STATUS_EMOJIS.length]);
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-sm hover:bg-surface-2/80"
        aria-label="Pick status emoji"
      >
        {statusEmoji || <span className="text-muted-foreground text-xs">+</span>}
      </button>
      <input
        type="text"
        placeholder="What's on your mind?"
        value={customStatus}
        onChange={(e) => { setCustomStatus(e.target.value); setShowPresets(false); }}
        onFocus={() => { if (!customStatus) setShowPresets(true); }}
        maxLength={80}
        className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {(customStatus || statusEmoji) && (
        <button type="button" onClick={clearCustomStatus} className="text-[10px] text-muted-foreground hover:text-foreground" aria-label="Clear status">✕</button>
      )}
    </div>
    {/* Clear-after indicator and picker */}
    {customStatus && <div className="mt-1.5 flex items-center gap-1.5">
      <Clock className="size-3 text-muted-foreground" />
      <div className="flex flex-wrap gap-1">{CLEAR_AFTER_OPTIONS.map((opt) => (
        <button key={opt.label} type="button" onClick={() => setClearAfter(opt.minutes)} className={cn(
          "rounded-full px-2 py-0.5 text-[10px] transition-colors",
          statusClearAt && opt.minutes !== -1 ? "text-muted-foreground hover:bg-surface-2" : !statusClearAt && opt.minutes === -1 ? "bg-accent-muted text-foreground" : "text-muted-foreground hover:bg-surface-2",
        )}>{opt.label}</button>
      ))}</div>
      {clearAtLabel && <span className="text-[10px] text-accent">{clearAtLabel}</span>}
    </div>}
    {/* Quick presets */}
    {showPresets && !customStatus && <div className="mt-1.5 flex flex-col gap-0.5">
      {STATUS_PRESETS.map((preset) => (
        <button key={preset.text} type="button" onClick={() => applyPreset(preset)} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground">
          <span className="text-sm">{preset.emoji}</span>
          <span>{preset.text}</span>
          {preset.clearAfterMinutes && <span className="text-[10px] text-muted-foreground/60">{preset.clearAfterMinutes >= 60 ? `${preset.clearAfterMinutes / 60}h` : `${preset.clearAfterMinutes}m`}</span>}
        </button>
      ))}
    </div>}
    {/* Emoji picker grid */}
    {!showPresets && <div className="mt-1.5 grid grid-cols-[repeat(8,2rem)] gap-0.5">
      {STATUS_EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => setStatusEmoji(statusEmoji === e ? "" : e)}
          className={cn(
            "flex size-8 items-center justify-center rounded text-base transition-colors",
            statusEmoji === e ? "bg-accent-muted ring-1 ring-accent/30" : "hover:bg-surface-2",
          )}
        >
          {e}
        </button>
      ))}
    </div>}
  </div>;
}
