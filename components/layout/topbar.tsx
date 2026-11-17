"use client";
import * as React from "react";
import { LogOut, Menu, Search, User } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserStatus = "online" | "busy" | "away" | "offline";
const PROFILE_KEY = "janus.user-profile.v1";

export const statusConfig: Record<UserStatus, { label: string; dot: string }> = {
  online: { label: "Online", dot: "bg-emerald-500" },
  busy: { label: "Busy", dot: "bg-red-500" },
  away: { label: "Away", dot: "bg-amber-500" },
  offline: { label: "Offline", dot: "bg-gray-400" },
};

interface ProfileSnapshot {
  avatarUrl: string | null;
  bio: string;
  title: string;
  status: UserStatus;
  customStatus: string;
  statusEmoji: string;
}

function readProfile(): ProfileSnapshot {
  const fallback: ProfileSnapshot = { avatarUrl: null, bio: "", title: "", status: "online", customStatus: "", statusEmoji: "" };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const state = parsed?.state ?? parsed;
    return {
      avatarUrl: state.avatarUrl ?? null,
      bio: state.bio ?? "",
      title: state.title ?? "",
      status: state.status && state.status in statusConfig ? state.status : "online",
      customStatus: state.customStatus ?? "",
      statusEmoji: state.statusEmoji ?? "",
    };
  } catch { return fallback; }
}

export function Topbar() {
  const { workspace, workspaceId } = useWorkspace();
  const inPortfolio = workspaceId === "portfolio";
  const session = useSession();
  const signOut = useSignOut();
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const setMobile = useUIStore((s) => s.setMobileNavOpen);
  const pathname = usePathname();
  const onTeam = pathname === "/team";

  const [profile, setProfile] = React.useState<ProfileSnapshot>(readProfile);

  const refreshProfile = React.useCallback(() => setProfile(readProfile()), []);
  React.useEffect(() => {
    window.addEventListener("storage", refreshProfile);
    window.addEventListener("janus-profile-changed", refreshProfile);
    return () => {
      window.removeEventListener("storage", refreshProfile);
      window.removeEventListener("janus-profile-changed", refreshProfile);
    };
  }, [refreshProfile]);

  function setStatus(s: UserStatus) {
    updateProfileField("status", s);
  }
  function setCustomStatus(text: string) {
    updateProfileField("customStatus", text);
  }
  function setStatusEmoji(e: string) {
    updateProfileField("statusEmoji", e);
  }

  function updateProfileField<K extends keyof ProfileSnapshot>(key: K, value: ProfileSnapshot[K]) {
    setProfile((prev) => {
      const next = { ...prev, [key]: value };
      try {
        const raw = window.localStorage.getItem(PROFILE_KEY);
        const existing = raw ? JSON.parse(raw) : {};
        const state = existing?.state ?? existing;
        window.localStorage.setItem(PROFILE_KEY, JSON.stringify({ state: { ...state, [key]: value } }));
        window.dispatchEvent(new Event("janus-profile-changed"));
      } catch { /* private mode */ }
      return next;
    });
  }

  const { status, customStatus, avatarUrl } = profile;
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


        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-2"
              aria-label="Profile menu"
            >
              <span className="relative">
                <Avatar className="size-7">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt={session.user.name} /> : null}
                  <AvatarFallback style={{ backgroundColor: "#2563eb" }}>{initials(session.user.name)}</AvatarFallback>
                </Avatar>
                <span
                  className={cn("absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background", dot)}
                  aria-label={statusConfig[status].label}
                />
              </span>
              <span className="hidden flex-col items-start leading-none sm:flex">
                <span className="text-xs font-medium text-foreground">{session.user.name}</span>
                {customStatus ? (
                  <span className="max-w-[120px] truncate text-[10px] text-muted-foreground">{customStatus}</span>
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
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt={session.user.name} /> : null}
                  <AvatarFallback style={{ backgroundColor: "#2563eb" }} className="text-sm">{initials(session.user.name)}</AvatarFallback>
                </Avatar>
                <span className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background", dot)} />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{session.user.name}</span>
                {profile.title ? <span className="truncate text-[11px] text-muted-foreground">{profile.title}</span> : null}
                <span className="truncate text-xs text-muted-foreground">{session.user.email}</span>
                <span className="text-[10px] text-muted-foreground">{roleLabel(session.role)}</span>
              </div>
            </div>
            {profile.bio ? (
              <div className="px-3 pb-2">
                <p className="text-xs text-muted-foreground leading-relaxed">{profile.bio}</p>
              </div>
            ) : null}
            <DropdownMenuSeparator />

            {/* Status selector */}
            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Status
            </DropdownMenuLabel>
            <div className="flex gap-1 px-3 pb-2">
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
            <div className="px-3 pb-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const emojis = ["\u{1F60A}", "\u{1F3E0}", "✈️", "\u{1F912}", "\u{1F4BB}", "\u{1F389}", "\u{1F4DE}", "\u{1F37D}️", "\u{1F3C3}", "\u{1F4DA}", "☕", "\u{1F4A4}", "\u{1F3A7}", "\u{1F9D8}", "\u{1F680}", "\u{1F4AC}"];
                    const current = profile.statusEmoji;
                    const idx = current ? emojis.indexOf(current) : -1;
                    setStatusEmoji(emojis[(idx + 1) % emojis.length]);
                  }}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-sm hover:bg-surface-2/80"
                  aria-label="Pick status emoji"
                >
                  {profile.statusEmoji || <span className="text-muted-foreground text-xs">+</span>}
                </button>
                <input
                  type="text"
                  placeholder="What's on your mind?"
                  value={customStatus}
                  onChange={(e) => setCustomStatus(e.target.value)}
                  maxLength={80}
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                />
                {(customStatus || profile.statusEmoji) && (
                  <button type="button" onClick={() => { setCustomStatus(""); setStatusEmoji(""); }} className="text-[10px] text-muted-foreground hover:text-foreground" aria-label="Clear status">✕</button>
                )}
              </div>
            </div>
            {/* Emoji picker grid */}
            <div className="grid grid-cols-[repeat(8,2rem)] gap-0.5 px-3 pb-2">
              {["\u{1F60A}", "\u{1F3E0}", "✈️", "\u{1F912}", "\u{1F4BB}", "\u{1F389}", "\u{1F4DE}", "\u{1F37D}️", "\u{1F3C3}", "\u{1F4DA}", "☕", "\u{1F4A4}", "\u{1F3A7}", "\u{1F9D8}", "\u{1F680}", "\u{1F4AC}"].map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setStatusEmoji(profile.statusEmoji === e ? "" : e)}
                  className={cn(
                    "flex size-8 items-center justify-center rounded text-base transition-colors",
                    profile.statusEmoji === e ? "bg-accent-muted ring-1 ring-accent/30" : "hover:bg-surface-2",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
            <DropdownMenuSeparator />

            {/* Navigation links */}
            <DropdownMenuItem asChild>
              <Link href={`/account?tab=profile&workspace=${workspaceId}`} className="flex items-center gap-2">
                <User className="size-3.5" />
                My Profile
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
