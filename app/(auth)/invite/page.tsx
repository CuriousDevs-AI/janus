"use client";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading invitation…</p>}>
      <Invite />
    </Suspense>
  );
}
function Invite() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const invitation = useApi<{ tenant: string; role: string; inviter: string }>(
    token ? `/invitations/${encodeURIComponent(token)}` : null,
  );
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">Join your team</h1>
      {!invitation.data ? (
        <p role="status">
          {invitation.error ||
            (token
              ? "Loading invitation…"
              : "Open the invitation link from your email.")}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {invitation.data.inviter} invited you to {invitation.data.tenant} as{" "}
            {invitation.data.role}.
          </p>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const values = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                await api(`/invitations/${encodeURIComponent(token!)}/accept`, {
                  method: "POST",
                  body: JSON.stringify(
                    existing
                      ? {}
                      : {
                          name: values.get("name"),
                          password: values.get("password"),
                        },
                  ),
                });
                router.replace("/leads");
                router.refresh();
              } catch (error) {
                setError(message(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={existing}
                onChange={(e) => setExisting(e.target.checked)}
              />
              I already have a Janus account
            </label>
            {existing ? (
              <p className="text-sm">
                Sign in with the invited email in another tab, then accept here.{" "}
                <Link className="text-accent" href="/login" target="_blank">
                  Sign in
                </Link>
              </p>
            ) : (
              <>
                <Label htmlFor="invite-name">Name</Label>
                <Input id="invite-name" name="name" required maxLength={120} />
                <Label htmlFor="invite-password">Password</Label>
                <Input
                  id="invite-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                />
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <Button disabled={busy}>Accept invitation</Button>
          </form>
        </>
      )}
    </div>
  );
}
