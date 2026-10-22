"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, message } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EmailAction({ reset = false }: { reset?: boolean }) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Form reset={reset} />
    </Suspense>
  );
}
function Form({ reset }: { reset: boolean }) {
  const token = useSearchParams().get("token");
  const email = useSearchParams().get("email") ?? "";
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  async function checkVerification() {
    setChecking(true); setNotice("");
    try {
      const me = await api<{ user: { email_verified_at: string | null } }>("/me");
      if (!me.user.email_verified_at) { setNotice("Your email is still unverified. Open the latest email link, then try again."); return; }
      router.replace("/setup");
    } catch (reason) { setNotice(message(reason)); } finally { setChecking(false); }
  }
  async function resend() {
    setBusy(true); setNotice("");
    try { const result = await api<{ message: string }>("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) }); setNotice(result.message); }
    catch (reason) { setNotice(message(reason)); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">
        {reset ? "Set a new password" : "Verify your email"}
      </h1>
      {done ? (
        <p role="status">
          {reset
            ? "Password reset. Sign in with your new password."
            : "Your email is verified. You can now connect lead sources."}
        </p>
      ) : (!reset && !token ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-warning/30 bg-warning-muted p-4 text-sm"><p className="font-medium">Check your inbox before continuing</p><p className="mt-1 text-xs leading-5 text-muted-foreground">We sent a verification link to <strong>{email || "your email address"}</strong>. Verification unlocks lead-source connections and the business setup wizard.</p></div>
          {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
          <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void checkVerification()} disabled={checking}>{checking ? "Checking…" : "I’ve verified my email"}</Button><Button type="button" variant="secondary" onClick={() => void resend()} disabled={busy || !email}>{busy ? "Sending…" : "Resend verification email"}</Button></div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(reset ? "/auth/reset-password" : "/auth/verify-email", {
                method: "POST",
                body: JSON.stringify({
                  token,
                  ...(reset ? { new_password: password } : {}),
                }),
              });
              setDone(true);
            } catch (error) {
              setError(message(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {reset && (
            <>
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </>
          )}
          {(!token || error) && (
            <p role="alert" className="text-sm text-danger">
              {error ||
                "This link is missing its token. Open the link from your email."}
            </p>
          )}
          <Button disabled={busy || !token}>
            {busy ? "Working…" : reset ? "Reset password" : "Verify email"}
          </Button>
        </form>
      ))}
      <Link href="/login" className="text-sm text-accent">
        Back to sign in
      </Link>
    </div>
  );
}
