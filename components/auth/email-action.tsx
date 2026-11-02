"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, message } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VerifyWaiting } from "@/components/auth/verify-waiting";

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
  // Without a token there is nothing to submit yet: wait for the person to open their email.
  if (!reset && !token) return <VerifyWaiting email={email} />;
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">
        {reset ? "Set a new password" : "Verify your email"}
      </h1>
      {done ? (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-sm">
            {reset
              ? "Password reset. Sign in with your new password."
              : "Your email is verified. Continue to set up your company."}
          </p>
          <Button type="button" onClick={() => router.replace(reset ? "/login" : "/setup")}>{reset ? "Sign in" : "Continue"}</Button>
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
      )}
      <Link href="/login" className="text-sm text-accent">
        Back to sign in
      </Link>
    </div>
  );
}
