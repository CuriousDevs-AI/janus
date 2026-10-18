"use client";

import { api, message } from "@/lib/api/client";
import { toast } from "sonner";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-10 items-center justify-center rounded-full border border-accent-border bg-accent-muted">
          <MailCheck className="size-4.5 text-accent" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-[18px] font-semibold text-foreground">
            Check your email
          </h1>
          <p className="text-[13px] text-muted-foreground">
            If an account exists, we sent a reset link to{" "}
            <span className="text-foreground">{email || "your email"}</span>.
          </p>
        </div>
        <Button variant="secondary" asChild className="mt-2">
          <Link href="/login">
            <ArrowLeft className="size-3.5" />
            Back to sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          Reset your password
        </h1>
        <p className="text-[13px] text-muted-foreground">
          Enter your work email and we&apos;ll send you a reset link.
        </p>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/auth/forgot-password", {
              method: "POST",
              body: JSON.stringify({ email }),
            });
            setSent(true);
          } catch (error) {
            toast.error(message(error));
          } finally {
            setBusy(false);
          }
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          Send reset link
        </Button>
      </form>
      <Link
        href="/login"
        className="flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to sign in
      </Link>
    </div>
  );
}
