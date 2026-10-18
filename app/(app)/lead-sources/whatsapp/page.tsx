"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useApi } from "@/lib/api/use-api";
import { api, message } from "@/lib/api/client";
import type { WhatsAppConnection } from "@/lib/api/types";
import { useSession } from "@/components/auth/session-provider";
import { SecretValue } from "@/components/lead-sources/secret-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export default function WhatsAppSetup() {
  const session = useSession();
  const allowed =
    session.permissions.includes("sources:manage") &&
    !!session.user.email_verified_at;
  const connection = useApi<WhatsAppConnection | null>(
    allowed ? "/whatsapp/connection" : null,
  );
  const [saved, setSaved] = useState<WhatsAppConnection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = connection.data || saved;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <Link href="/lead-sources" className="text-xs text-muted-foreground">
        ← Lead Sources
      </Link>
      <div>
        <h1 className="text-xl font-semibold">WhatsApp Business</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect your registered business number directly to Meta Cloud API.
        </p>
      </div>
      {!allowed ? (
        <p>A verified owner or admin can configure WhatsApp.</p>
      ) : (
        <>
          {connection.error && (
            <p role="alert" className="text-sm text-danger">
              {connection.error}
            </p>
          )}
          {connection.loading && <p role="status">Loading connection…</p>}
          {current && (
            <section className="flex flex-col gap-3 border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">
                    {current.verifiedName || "Business number"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {current.displayPhone}
                  </p>
                </div>
                <Badge
                  variant={
                    current.status === "connected" ? "success" : "neutral"
                  }
                >
                  {current.status === "connected"
                    ? "Connected"
                    : "Verify callback in Meta"}
                </Badge>
              </div>
              <SecretValue
                title="Meta callback URL"
                value={current.callbackUrl}
              />
              {saved?.verifyToken && (
                <SecretValue
                  title="Verify token"
                  value={saved.verifyToken}
                  once
                />
              )}
              <p className="text-xs text-muted-foreground">
                In your Meta app, add this callback URL and verify token,
                subscribe to the messages field, and subscribe the app to this
                WhatsApp Business Account. Saving credentials below creates a
                new verify token and pauses sending until Meta verifies it.
              </p>
              <p className="text-xs">
                {current.webhookVerifiedAt
                  ? `Callback verified ${formatDateTime(current.webhookVerifiedAt)}`
                  : "Callback not verified yet."}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={connection.reload}
                >
                  Refresh connection
                </Button>
                <Button size="sm" asChild>
                  <Link href="/inbox">Open inbox</Link>
                </Button>
              </div>
            </section>
          )}
          <section className="flex flex-col gap-4 border border-border p-4">
            <h2 className="text-sm font-semibold">
              {current ? "Update credentials" : "Connect your number"}
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Use a system user access token with WhatsApp messaging and
              management permissions. Credentials are encrypted on the server.
              One business number per workspace for this first version.
            </p>
            <form
              key={current?.id || "new"}
              className="flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const data = new FormData(form);
                setBusy(true);
                setError("");
                try {
                  const result = await api<WhatsAppConnection>(
                    "/whatsapp/connection",
                    {
                      method: "PUT",
                      body: JSON.stringify(Object.fromEntries(data)),
                    },
                  );
                  setSaved(result);
                  form.reset();
                  connection.reload();
                  toast.success(
                    "Credentials checked. Verify the callback in Meta to finish.",
                  );
                } catch (e) {
                  setError(message(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="waba">WhatsApp Business Account ID</Label>
                  <Input
                    id="waba"
                    name="wabaId"
                    inputMode="numeric"
                    pattern="[0-9]{5,40}"
                    required
                    defaultValue={current?.wabaId}
                    readOnly={!!current}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phone-id">Phone number ID</Label>
                  <Input
                    id="phone-id"
                    name="phoneNumberId"
                    inputMode="numeric"
                    pattern="[0-9]{5,40}"
                    required
                    defaultValue={current?.phoneNumberId}
                    readOnly={!!current}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="access-token">System user access token</Label>
                <Input
                  id="access-token"
                  name="accessToken"
                  type="password"
                  autoComplete="off"
                  required
                  minLength={20}
                  maxLength={4096}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="app-secret">Meta app secret</Label>
                <Input
                  id="app-secret"
                  name="appSecret"
                  type="password"
                  autoComplete="off"
                  required
                  minLength={16}
                  maxLength={256}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              <Button
                className="self-start"
                disabled={busy || connection.loading}
              >
                {busy ? "Checking with Meta…" : "Check credentials & save"}
              </Button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
