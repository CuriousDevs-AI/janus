"use client";

import { useEffect, useRef, useCallback } from "react";
import { useProfileStore, type UserStatus } from "@/lib/stores/profile-store";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

/**
 * Watches for browser idle and sets the user's status to "away" after 5 minutes
 * of no mouse/keyboard/touch activity. Restores the previous status on activity.
 * Skips if the user manually set "busy" or "offline" (those are intentional).
 */
export function useAutoAway() {
  const status = useProfileStore((s) => s.status);
  const setStatus = useProfileStore((s) => s.setStatus);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusBeforeAway = useRef<UserStatus | null>(null);
  const manuallyAway = useRef(false);

  const goAway = useCallback(() => {
    const current = useProfileStore.getState().status;
    if (current === "busy" || current === "offline" || current === "away") return;
    statusBeforeAway.current = current;
    manuallyAway.current = false;
    setStatus("away");
  }, [setStatus]);

  const goBack = useCallback(() => {
    const current = useProfileStore.getState().status;
    if (current !== "away" || manuallyAway.current) return;
    if (statusBeforeAway.current && statusBeforeAway.current !== "away") {
      setStatus(statusBeforeAway.current);
      statusBeforeAway.current = null;
    }
  }, [setStatus]);

  const resetTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    goBack();
    timer.current = setTimeout(goAway, IDLE_TIMEOUT_MS);
  }, [goAway, goBack]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, resetTimer, { passive: true });
    timer.current = setTimeout(goAway, IDLE_TIMEOUT_MS);

    const handleVisibility = () => {
      if (document.hidden) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(goAway, IDLE_TIMEOUT_MS);
      } else {
        resetTimer();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, resetTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [resetTimer, goAway]);

  useEffect(() => {
    if (status === "away" && statusBeforeAway.current === null) {
      manuallyAway.current = true;
    }
  }, [status]);
}

/**
 * When the user is in a voice call, auto-set custom status to "On a call" with 📞.
 * Restores the previous custom status when the call ends.
 */
export function useCallStatus(inCall: boolean, callName?: string | null) {
  const setCustomStatus = useProfileStore((s) => s.setCustomStatus);
  const setStatusEmoji = useProfileStore((s) => s.setStatusEmoji);
  const prev = useRef<{ text: string; emoji: string } | null>(null);

  useEffect(() => {
    if (inCall) {
      const current = useProfileStore.getState();
      if (current.customStatus !== "On a call") {
        prev.current = { text: current.customStatus, emoji: current.statusEmoji };
      }
      setCustomStatus(callName ? `On a call · ${callName}` : "On a call");
      setStatusEmoji("\u{1F4DE}");
    } else if (prev.current) {
      setCustomStatus(prev.current.text);
      setStatusEmoji(prev.current.emoji);
      prev.current = null;
    }
  }, [inCall, callName, setCustomStatus, setStatusEmoji]);
}

export interface StatusPreset {
  emoji: string;
  text: string;
  clearAfterMinutes: number | null;
}

export const STATUS_PRESETS: StatusPreset[] = [
  { emoji: "\u{1F4C5}", text: "In a meeting", clearAfterMinutes: 60 },
  { emoji: "\u{1F37D}️", text: "On lunch", clearAfterMinutes: 60 },
  { emoji: "\u{1F68C}", text: "Commuting", clearAfterMinutes: 45 },
  { emoji: "\u{1F3E0}", text: "Working from home", clearAfterMinutes: null },
  { emoji: "\u{1F912}", text: "Out sick", clearAfterMinutes: null },
  { emoji: "\u{2708}️", text: "Travelling", clearAfterMinutes: null },
  { emoji: "\u{1F4A4}", text: "Away for the day", clearAfterMinutes: null },
  { emoji: "\u{1F3A7}", text: "Focus time", clearAfterMinutes: 120 },
];

/**
 * Manages status expiry — clears the custom status and emoji after the chosen duration.
 * Pass `clearAt` as an ISO timestamp; when it passes, status is cleared.
 */
export function useStatusExpiry(clearAt: string | null, onClear: () => void) {
  useEffect(() => {
    if (!clearAt) return;
    const ms = Date.parse(clearAt) - Date.now();
    if (ms <= 0) { onClear(); return; }
    const timer = setTimeout(onClear, ms);
    return () => clearTimeout(timer);
  }, [clearAt, onClear]);
}
