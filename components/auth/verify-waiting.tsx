"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { api, APIError, message } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

/** Seconds before another verification email may be asked for; the server enforces the same gap. */
export const RESEND_GAP = 30;
const sentKey = (email: string) => `janus.verify-sent:${email.toLowerCase()}`;

/** Remembers when a verification email last went to this address, so the wait survives a reload. */
export function rememberVerificationSent(email: string) {
  try { window.localStorage.setItem(sentKey(email), String(Date.now())); } catch { /* private mode */ }
}
function secondsLeft(email: string) {
  try {
    const sent = Number(window.localStorage.getItem(sentKey(email)) ?? 0);
    return Math.max(0, RESEND_GAP - Math.floor((Date.now() - sent) / 1000));
  } catch { return 0; }
}

type Notice = { tone: "info" | "success" | "warning" | "danger"; text: string } | null;
const toneClass = {
  info: "border-border bg-surface-2 text-muted-foreground",
  success: "border-success/30 bg-success-muted text-foreground",
  warning: "border-warning/30 bg-warning-muted text-foreground",
  danger: "border-danger/30 bg-danger-muted text-foreground",
} as const;

/**
 * Waiting for the person to open the link in their email. It checks by itself every few seconds,
 * and when they come back to the tab, and moves on as soon as the email is verified. Another email
 * can be asked for 30 seconds after the last one.
 */
export function VerifyWaiting({ email }: { email: string }) {
  const router = useRouter();
  const [wait, setWait] = React.useState(() => (email ? secondsLeft(email) : 0));
  const [sending, setSending] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [verified, setVerified] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice>(null);
  const signedIn = React.useRef(true);

  // The countdown to the next resend, one tick a second.
  React.useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  const check = React.useCallback(async (byHand: boolean) => {
    if (byHand) setChecking(true);
    try {
      const me = await api<{ user: { email_verified_at: string | null } }>("/me");
      signedIn.current = true;
      if (me.user.email_verified_at) {
        setVerified(true);
        setNotice({ tone: "success", text: "Your email is verified. Taking you to setup…" });
        window.setTimeout(() => router.replace("/setup"), 1200);
        return;
      }
      if (byHand) setNotice({ tone: "warning", text: "Not verified yet. Open the link in the email we sent, then come back here." });
    } catch (reason) {
      if (reason instanceof APIError && reason.status === 401) {
        signedIn.current = false;
        if (byHand) setNotice({ tone: "warning", text: "Sign in first. Once the link in your email is opened, signing in takes you straight on." });
      } else if (byHand) setNotice({ tone: "danger", text: message(reason) });
    } finally {
      if (byHand) setChecking(false);
    }
  }, [router]);

  // Checks by itself every five seconds while the page is open, and as soon as the tab is back in view.
  React.useEffect(() => {
    if (verified) return;
    const tick = () => { if (document.visibilityState === "visible" && signedIn.current) void check(false); };
    const timer = window.setInterval(tick, 5000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [check, verified]);

  async function resend() {
    if (!email || wait > 0 || sending) return;
    setSending(true);
    setNotice(null);
    try {
      await api("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });
      rememberVerificationSent(email);
      setWait(RESEND_GAP);
      const at = new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
      setNotice({ tone: "success", text: `A new link is on its way to ${email} (sent ${at}). It can take a minute.` });
      toast.success("Verification email sent.");
    } catch (reason) {
      if (reason instanceof APIError && reason.code === "resend_too_soon") {
        const seconds = Number(/(\d+) seconds/.exec(reason.message)?.[1] ?? RESEND_GAP);
        setWait(seconds);
        setNotice({ tone: "info", text: "An email went out moments ago. Give it a minute to arrive." });
      } else {
        setNotice({ tone: reason instanceof APIError && reason.status === 429 ? "warning" : "danger", text: message(reason) });
      }
    } finally {
      setSending(false);
    }
  }

  const clock = `0:${String(wait).padStart(2, "0")}`;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className={`flex size-12 items-center justify-center rounded-full ${verified ? "bg-success-muted text-success" : "bg-accent-muted text-accent"}`}>
          {verified ? <CheckCircle2 className="size-6" aria-hidden /> : <Mail className="size-6" aria-hidden />}
        </span>
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{verified ? "Email verified" : "Check your inbox"}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {email ? <>We sent a verification link to <strong className="text-foreground">{email}</strong>.</> : "We sent a verification link to your email."} Open it to finish creating your account.
          </p>
        </div>
      </div>

      {!verified && (
        <p className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Waiting for you to open the link. This page moves on by itself.
        </p>
      )}

      {/* Kept the same height whether or not there is a message, so the buttons do not jump. */}
      <div className="min-h-[44px]" aria-live="polite">
        {notice && <p className={`rounded-md border px-3 py-2.5 text-[12px] leading-5 ${toneClass[notice.tone]}`}>{notice.text}</p>}
      </div>

      {!verified && (
        <div className="flex flex-col gap-2">
          <Button type="button" className="w-full" onClick={() => void check(true)} disabled={checking}>
            {checking ? <><Loader2 className="size-3.5 animate-spin" aria-hidden />Checking…</> : "I’ve verified my email"}
          </Button>
          <Button type="button" variant="secondary" className="w-full tabular-nums" onClick={() => void resend()} disabled={!email || sending || wait > 0}>
            {sending ? <><Loader2 className="size-3.5 animate-spin" aria-hidden />Sending…</> : wait > 0 ? `Resend email in ${clock}` : "Resend verification email"}
          </Button>
        </div>
      )}

      {!verified && (
        <div className="rounded-md border border-border bg-surface-2 px-3 py-2.5 text-[12px] leading-5 text-muted-foreground">
          <p className="font-medium text-foreground">Not in your inbox?</p>
          <p>Look in Spam or Promotions, and search your mail for “Janus”. The link works for 24 hours.</p>
        </div>
      )}

      <div className="flex items-center justify-between text-[12px]">
        <Link href="/login" className="text-accent hover:underline">Back to sign in</Link>
        <Link href="/signup" className="text-muted-foreground hover:text-foreground hover:underline">Wrong email? Sign up again</Link>
      </div>
    </div>
  );
}
