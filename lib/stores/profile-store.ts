"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { userScoped } from "@/lib/stores/user-scoped";

export type UserStatus = "online" | "busy" | "away" | "offline";

const AVATAR_GRADIENTS: [string, string][] = [
  ["#2563eb", "#7c3aed"],
  ["#059669", "#0891b2"],
  ["#d97706", "#ea580c"],
  ["#7c3aed", "#db2777"],
  ["#db2777", "#e11d48"],
  ["#0891b2", "#2563eb"],
  ["#4f46e5", "#7c3aed"],
  ["#0d9488", "#059669"],
  ["#ea580c", "#d97706"],
  ["#6366f1", "#8b5cf6"],
];

function hashName(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function avatarColorFor(name: string): string {
  return AVATAR_GRADIENTS[hashName(name) % AVATAR_GRADIENTS.length][0];
}

function initialsFor(name: string): string {
  return name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "U";
}

export function generateAvatarSvg(name: string): string {
  const h = hashName(name);
  const [c1, c2] = AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
  const angle = (h % 360);
  const ini = initialsFor(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate(${angle} 64 64)"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="128" height="128" rx="64" fill="url(#g)"/><text x="64" y="64" dy=".35em" text-anchor="middle" fill="#fff" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="48" font-weight="600">${ini}</text></svg>`;
  if (typeof btoa === "function") return `data:image/svg+xml;base64,${btoa(svg)}`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

interface UserProfile {
  avatarUrl: string | null;
  bio: string;
  displayName: string;
  title: string;
  status: UserStatus;
  customStatus: string;
  statusEmoji: string;
  /** ISO timestamp when the custom status should auto-clear, or null for no expiry. */
  statusClearAt: string | null;
  updatedAt: string;
}

interface ProfileState extends UserProfile {
  setAvatar: (url: string | null) => void;
  setBio: (bio: string) => void;
  setTitle: (title: string) => void;
  setDisplayName: (name: string) => void;
  setStatus: (status: UserStatus) => void;
  setCustomStatus: (text: string) => void;
  setStatusEmoji: (emoji: string) => void;
  setStatusClearAt: (at: string | null) => void;
  clearCustomStatus: () => void;
}

function stamp(): string {
  return new Date().toISOString();
}

function syncToServer(fields: Record<string, string | null>) {
  fetch("/api/v1/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  }).catch(() => {});
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      avatarUrl: null,
      bio: "",
      displayName: "",
      title: "",
      status: "online",
      customStatus: "",
      statusEmoji: "",
      statusClearAt: null,
      updatedAt: "",
      setAvatar: (url) => set({ avatarUrl: url, updatedAt: stamp() }),
      setBio: (bio) => { set({ bio, updatedAt: stamp() }); syncToServer({ bio: bio || null }); },
      setTitle: (title) => { set({ title, updatedAt: stamp() }); syncToServer({ title: title || null }); },
      setDisplayName: (name) => { set({ displayName: name, updatedAt: stamp() }); if (name) syncToServer({ name }); },
      setStatus: (status) => set({ status, updatedAt: stamp() }),
      setCustomStatus: (text) => { set({ customStatus: text, updatedAt: stamp() }); syncToServer({ status_text: text || null }); },
      setStatusEmoji: (emoji) => set({ statusEmoji: emoji, updatedAt: stamp() }),
      setStatusClearAt: (at) => set({ statusClearAt: at, updatedAt: stamp() }),
      clearCustomStatus: () => { set({ customStatus: "", statusEmoji: "", statusClearAt: null, updatedAt: stamp() }); syncToServer({ status_text: null }); },
    }),
    {
      name: userScoped("janus.user-profile.v1"),
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function hydrateProfileFromServer(user: { name?: string; bio?: string | null; title?: string | null; status_text?: string | null }) {
  const state = useProfileStore.getState();
  if (!state.updatedAt) {
    useProfileStore.setState({
      displayName: user.name ?? "",
      bio: user.bio ?? "",
      title: user.title ?? "",
      customStatus: user.status_text ?? "",
    });
  }
}

export function useMyStatus() {
  const status = useProfileStore((s) => s.status);
  const customStatus = useProfileStore((s) => s.customStatus);
  const statusEmoji = useProfileStore((s) => s.statusEmoji);
  return { status, customStatus, statusEmoji };
}

export function useUserAvatar(name: string): { avatarUrl: string; initials: string; color: string } {
  const storeAvatar = useProfileStore((s) => s.avatarUrl);
  const storeName = useProfileStore((s) => s.displayName);
  const displayName = storeName || name;
  const ini = initialsFor(displayName);
  return {
    avatarUrl: storeAvatar || generateAvatarSvg(displayName),
    initials: ini,
    color: avatarColorFor(displayName),
  };
}
