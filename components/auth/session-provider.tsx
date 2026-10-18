"use client";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, APIError, message } from "@/lib/api/client";
import type { Me } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SessionContext = createContext<Me | null>(null);
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Session unavailable");
  return value;
}
export function useSignOut() {
  const router = useRouter();
  return async () => {
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
  const [session, setSession] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
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
