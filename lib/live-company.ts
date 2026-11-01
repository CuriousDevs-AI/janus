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
 * before any store loads. */
export function rememberTenant(id: string) {
  try {
    const before = window.localStorage.getItem(TENANT_KEY);
    if (before !== null && before !== id) forgetStoreCopies();
    if (before !== id) window.localStorage.setItem(TENANT_KEY, id);
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
export async function switchTenant(id: string, to: string) {
  if (hasUnsavedStores()) throw new UnsavedChangesError();
  await api("/me/switch-tenant", { method: "POST", body: JSON.stringify({ tenant_id: Number(id) }) });
  forgetStoreCopies();
  try {
    window.localStorage.setItem(TENANT_KEY, id);
  } catch {
    /* private mode */
  }
  window.location.assign(to);
}
