"use client";

import { api } from "@/lib/api/client";
import { forgetStoreCopies, hasUnsavedStores } from "@/lib/stores/workspace-storage";

/**
 * Moving a real account between its companies. The server issues a new session for the other company
 * (/me/switch-tenant), and the browser forgets what it kept for the old one before the page reloads.
 * The preview's companies live in lib/company.ts instead.
 */
const TENANT_KEY = "janus.live-tenant";

/** Records the company this browser's session is in. A different one than last time means the
 * session moved elsewhere (another tab, a new sign-in), so the copies kept for the old one are dropped
 * before any store loads. With none recorded, whose copies they are is unknown, so they go too. */
export function rememberTenant(id: string) {
  try {
    const before = window.localStorage.getItem(TENANT_KEY);
    if (before === id) return;
    forgetStoreCopies();
    window.localStorage.setItem(TENANT_KEY, id);
  } catch {
    /* private mode: nothing is kept between loads, so there is nothing to drop */
  }
}

/** Another tab moved the session (the cookie is shared), so this tab reloads into the new company. */
export function watchTenant(current: string) {
  const listener = (event: StorageEvent) => {
    if (event.key === TENANT_KEY && event.newValue && event.newValue !== current) window.location.reload();
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

export class UnsavedChangesError extends Error {
  constructor() {
    super("Some changes here are still being saved. Try again in a moment.");
  }
}

/** Opens another company. Refused while this one still has edits waiting to be saved. */
export async function switchTenant(id: string, to: string, name?: string) {
  if (hasUnsavedStores()) throw new UnsavedChangesError();
  // The page reloads into the other company; say so over it instead of leaving a blank screen.
  const cover = showOpening(name);
  try {
    await api("/me/switch-tenant", { method: "POST", body: JSON.stringify({ tenant_id: Number(id) }) });
  } catch (error) {
    cover.remove();
    throw error;
  }
  forgetStoreCopies();
  try {
    window.localStorage.setItem(TENANT_KEY, id);
  } catch {
    /* private mode */
  }
  window.location.assign(to);
}

/** A cover saying which company is opening, left in place until the next page replaces it. */
function showOpening(name?: string) {
  const cover = document.createElement("div");
  cover.setAttribute("role", "status");
  cover.style.cssText = "position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--background) 82%, transparent);backdrop-filter:blur(2px);font-size:14px;color:var(--foreground)";
  cover.textContent = name ? `Opening ${name}…` : "Opening the company…";
  document.body.appendChild(cover);
  return cover;
}
