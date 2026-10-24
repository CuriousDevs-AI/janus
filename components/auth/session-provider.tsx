"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, APIError, message } from "@/lib/api/client";
import type { Me } from "@/lib/api/types";
import { demoMode } from "@/lib/demo-mode";
import { personaPermissions, signOut as demoSignOut, useDemoAccount } from "@/lib/demo-persona";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SessionContext = createContext<Me | null>(null);
const demoSession: Me = {
  user: {
    id: "demo-owner",
    name: "Pankaj Neema",
    email: "pankaj@gmail.com",
    email_verified_at: "2026-10-22T00:00:00.000Z",
    phone: null,
    timezone: "Asia/Kolkata",
    language: "English",
    avatar_url: null,
  },
  tenant: { id: "demo-tenant", name: "Acme Traders Pvt Ltd", role: "Owner", status: "active", timezone: "Asia/Kolkata" },
  role: "Owner",
  permissions: ["*"],
  tenants: [{ id: "demo-tenant", name: "Acme Traders Pvt Ltd", role: "Owner", status: "active", timezone: "Asia/Kolkata" }],
};
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Session unavailable");
  return value;
}
export function useSignOut() {
  const router = useRouter();
  return async () => {
    if (demoMode) { demoSignOut(); router.replace("/login"); return; }
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
  const [session, setSession] = useState<Me | null>(() => demoMode ? demoSession : null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const account = useDemoAccount();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  // Without a backend the preview signs in against the demo accounts. Nobody is signed in until they do.
  useEffect(() => { if (demoMode && ready && !account) router.replace("/login"); }, [ready, account, router]);
  // Permissions, name and role follow whoever is signed in (or the person the Owner is viewing as), so menus and pages narrow the way they would for them.
  const shown = useMemo(() => {
    if (!session) return session;
    if (!demoMode) return session;
    if (!account) return null;
    return { ...session, user: { ...session.user, id: account.crmUserId, name: account.name, email: account.email }, role: account.title, permissions: personaPermissions(account) };
  }, [session, account]);
  useEffect(() => {
    let active = true;
    if (demoMode) {
      return () => {
        active = false;
      };
    }
    api<Me>("/me")
      .then((value) => {
        if (active) {
          setSession(value);
          setError("");
        }
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof APIError && error.status === 401)
          window.location.replace("/login");
        else setError(message(error));
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (!session || !shown)
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
    <SessionContext.Provider value={shown}>
      {children}
    </SessionContext.Provider>
  );
}
