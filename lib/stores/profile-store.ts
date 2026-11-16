"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type UserStatus = "online" | "busy" | "away" | "offline";

const AVATAR_COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2"];

export function avatarColorFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

interface UserProfile {
  avatarUrl: string | null;
  bio: string;
  displayName: string;
  title: string;
  status: UserStatus;
  customStatus: string;
  statusEmoji: string;
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
}

function stamp(): string {
  return new Date().toISOString();
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
      updatedAt: "",
      setAvatar: (url) => set({ avatarUrl: url, updatedAt: stamp() }),
      setBio: (bio) => set({ bio, updatedAt: stamp() }),
      setTitle: (title) => set({ title, updatedAt: stamp() }),
      setDisplayName: (name) => set({ displayName: name, updatedAt: stamp() }),
      setStatus: (status) => set({ status, updatedAt: stamp() }),
      setCustomStatus: (text) => set({ customStatus: text, updatedAt: stamp() }),
      setStatusEmoji: (emoji) => set({ statusEmoji: emoji, updatedAt: stamp() }),
    }),
    {
      name: "janus.user-profile.v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function useMyStatus() {
  const status = useProfileStore((s) => s.status);
  const customStatus = useProfileStore((s) => s.customStatus);
  const statusEmoji = useProfileStore((s) => s.statusEmoji);
  return { status, customStatus, statusEmoji };
}

export function useUserAvatar(name: string): { avatarUrl: string | null; initials: string; color: string } {
  const storeAvatar = useProfileStore((s) => s.avatarUrl);
  const storeName = useProfileStore((s) => s.displayName);
  const displayName = storeName || name;
  const ini = displayName
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";
  return {
    avatarUrl: storeAvatar,
    initials: ini,
    color: avatarColorFor(displayName),
  };
}
