"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, APIError, message } from "@/lib/api/client";
import type { Me } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { setStorePermissions } from "@/lib/stores/workspace-storage";
import { rememberTenant, watchTenant } from "@/lib/live-company";
import { scopeApiCache } from "@/lib/api/use-api";

const SessionContext = createContext<Me | null>(null);
/** Fired to re-read the session, e.g. after a plan change archives or restores a company. */
export const sessionChanged = "janus-session-changed";
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Session unavailable");
  return value;
}
/** Read once per page load: the session to paint with until /me answers. */
let firstPaint: Me | null | undefined;
/** This tab's last session, so a reload paints the app at once while /me checks it again. */
const SESSION_KEY = "janus.session.v1";
function readSessionCache(): Me | null {
  try { const text = sessionStorage.getItem(SESSION_KEY); return text ? (JSON.parse(text) as Me) : null; } catch { return null; }
}
function writeSessionCache(value: Me | null) {
  if (!value) firstPaint = null;
  try { if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)); else sessionStorage.removeItem(SESSION_KEY); } catch { /* storage blocked: no instant paint */ }
}
function cachedSession() {
  if (firstPaint === undefined) {
    firstPaint = readSessionCache();
    if (firstPaint) scopeApiCache(`${firstPaint.tenant.id}:${firstPaint.user.id}`);
  }
  return firstPaint;
}
const noSubscribe = () => () => {};
export function useSignOut() {
  const router = useRouter();
  return async () => {
    writeSessionCache(null);
    scopeApiCache(null);
    try {
      await api("/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch (error) {
      if (error instanceof APIError && [401, 403].includes(error.status)) {
        router.replace("/login");
        router.refresh();
      } else toast.error(message(error));
    }
  };
}
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [fetched, setSession] = useState<Me | null>(null);
  const remembered = useSyncExternalStore(noSubscribe, cachedSession, () => null);
  const session = fetched ?? remembered;
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api<Me>("/me")
      .then((value) => {
        if (active) {
          scopeApiCache(`${value.tenant.id}:${value.user.id}`);
          writeSessionCache(value);
          setSession(value);
          rememberTenant(value.tenant.id);
          setStorePermissions(value.permissions);
          setError("");
        }
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof APIError && error.status === 401) {
          writeSessionCache(null);
          scopeApiCache(null);
          window.location.replace("/login");
        }
        else setError(message(error));
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    const again = () => setAttempt((value) => value + 1);
    window.addEventListener(sessionChanged, again);
    return () => window.removeEventListener(sessionChanged, again);
  }, []);
  const tenantId = session?.tenant.id ?? null;
  useEffect(() => (tenantId ? watchTenant(tenantId) : undefined), [tenantId]);
  if (!session)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 text-sm">
        <p role="status">{error || "Opening your workspace…"}</p>
        {error && (
          <>
            <Button onClick={() => setAttempt((v) => v + 1)}>Try again</Button>
            <Link href="/login" className="text-accent">
              Back to sign in
            </Link>
          </>
        )}
      </div>
    );
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}
