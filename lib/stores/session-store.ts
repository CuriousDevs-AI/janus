"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { userScoped } from "@/lib/stores/user-scoped";

export interface SessionRecord {
  id: string;
  userId: string;
  userAgent: string;
  ip: string;
  location: string;
  signedInAt: string;
  lastActiveAt: string;
  status: "active" | "revoked" | "expired";
  current: boolean;
}

interface SessionState {
  sessions: SessionRecord[];
  currentSessionId: string | null;
  ensureSession: (userId: string) => void;
  touchSession: () => void;
  revokeSession: (id: string) => void;
  revokeAllOthers: () => void;
}

let counter = 0;
function sid(): string {
  return `sess-${Date.now()}-${++counter}-${Math.random().toString(36).slice(2, 8)}`;
}

function guessLocation(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const map: Record<string, string> = {
      "Asia/Kolkata": "India",
      "Asia/Calcutta": "India",
      "America/New_York": "New York, US",
      "America/Los_Angeles": "Los Angeles, US",
      "Europe/London": "London, UK",
    };
    return map[tz] ?? tz.replace(/_/g, " ").split("/").pop() ?? "Unknown";
  } catch {
    return "Unknown";
  }
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,
      ensureSession: (userId: string) => {
        const state = get();
        if (state.currentSessionId) {
          const existing = state.sessions.find(
            (s) => s.id === state.currentSessionId && s.status === "active",
          );
          if (existing) {
            set({
              sessions: state.sessions.map((s) =>
                s.id === state.currentSessionId
                  ? { ...s, lastActiveAt: new Date().toISOString(), current: true }
                  : { ...s, current: false },
              ),
            });
            return;
          }
        }
        const id = sid();
        const now = new Date().toISOString();
        const session: SessionRecord = {
          id,
          userId,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
          ip: "127.0.0.1",
          location: guessLocation(),
          signedInAt: now,
          lastActiveAt: now,
          status: "active",
          current: true,
        };
        set({
          currentSessionId: id,
          sessions: [
            session,
            ...state.sessions.map((s) => ({ ...s, current: false })),
          ].slice(0, 20),
        });
      },
      touchSession: () => {
        const { currentSessionId, sessions } = get();
        if (!currentSessionId) return;
        set({
          sessions: sessions.map((s) =>
            s.id === currentSessionId
              ? { ...s, lastActiveAt: new Date().toISOString() }
              : s,
          ),
        });
      },
      revokeSession: (id: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, status: "revoked" as const, current: false } : s,
          ),
        }));
      },
      revokeAllOthers: () => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.current ? s : { ...s, status: "revoked" as const },
          ),
        }));
      },
    }),
    {
      name: userScoped("janus.sessions.v1"),
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function browserName(agent: string): string {
  if (/Edg\//.test(agent)) return "Edge";
  if (/OPR\//.test(agent)) return "Opera";
  if (/Firefox\//.test(agent)) return "Firefox";
  if (/Chrome\//.test(agent)) return "Chrome";
  if (/Safari\//.test(agent)) return "Safari";
  if (/python|httpx|curl/i.test(agent)) return "API client";
  return "Browser";
}

export function osName(agent: string): string {
  if (/iPhone/.test(agent)) return "iPhone";
  if (/iPad/.test(agent)) return "iPad";
  if (/Android/.test(agent)) return "Android";
  if (/Mac OS X|Macintosh/.test(agent)) return "macOS";
  if (/Windows/.test(agent)) return "Windows";
  if (/Linux/.test(agent)) return "Linux";
  return "Unknown";
}

export function deviceLabel(agent: string): string {
  const b = browserName(agent);
  const o = osName(agent);
  return o !== "Unknown" ? `${b} on ${o}` : b;
}

export function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 2) return "Active now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function isPhone(agent: string): boolean {
  return /iPhone|Android|Mobile/.test(agent);
}
