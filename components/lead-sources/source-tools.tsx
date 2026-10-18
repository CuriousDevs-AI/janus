"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { APIKey, Import, IngestEvent, Source } from "@/lib/api/types";
import { SecretValue } from "./secret-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/utils";

export function SourceTools({
  source,
  onChanged,
}: {
  source: Source;
  onChanged: () => void;
}) {
  const embed = useApi<{ html: string }>(
    source.connectionKind === "embed" ? `/sources/${source.id}/embed` : null,
  );
  const keys = useApi<APIKey[]>(
    source.connectionKind === "api_key" ? `/sources/${source.id}/keys` : null,
  );
  const imports = useApi<Import[]>(
    source.connectionKind === "csv"
      ? `/sources/${source.id}/imports?limit=50`
      : null,
  );
  const reloadImports = imports.reload;
  const importData = imports.data;
  const [secret, setSecret] = useState<Source | null>(null);
  const [newKey, setNewKey] = useState("");
  const [upload, setUpload] = useState<{ file: File; key: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!importData?.some((row) => row.pendingRows > 0)) return;
    const timer = setInterval(() => {
      reloadImports();
      onChanged();
    }, 5000);
    return () => clearInterval(timer);
  }, [importData, reloadImports, onChanged]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(message(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="flex flex-col gap-4 border border-border p-4">
      <h2 className="text-sm font-semibold">Capture setup</h2>
      {source.connectionKind !== "csv" && (
        <SecretValue title="Ingestion URL" value={source.ingestUrl} />
      )}
      {source.connectionKind === "webhook" && (
        <>
          <p className="text-xs text-muted-foreground">
            Save the signing secret and callback URL when creating this
            connection. Rotating the secret immediately invalidates the old one.
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            className="self-start"
            onClick={() => {
              if (
                confirm(
                  "Rotate the signing secret? Update your provider with the new secret before sending more events.",
                )
              )
                void run(async () => {
                  setSecret(
                    await api<Source>(`/sources/${source.id}/rotate-secret`, {
                      method: "POST",
                    }),
                  );
                });
            }}
          >
            Rotate signing secret
          </Button>
          {secret?.signingSecret && (
            <SecretValue
              title="New signing secret"
              value={secret.signingSecret}
              once
            />
          )}
          {secret?.callbackUrl && (
            <SecretValue
              title="New provider callback URL"
              value={secret.callbackUrl}
              once
            />
          )}
        </>
      )}
      {source.connectionKind === "embed" && (
        <>
          {embed.data ? (
            <SecretValue
              title="Website embed snippet"
              value={embed.data.html}
            />
          ) : (
            <p role="status" className="text-sm">
              {embed.error || "Loading embed snippet…"}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Paste this on an allowed website origin. It sends enquiries to
            Janus; it does not add a chat conversation.
          </p>
        </>
      )}
      {source.connectionKind === "api_key" && (
        <>
          <p className="text-xs text-muted-foreground">
            Use Authorization: Bearer &lt;key&gt; and a stable Idempotency-Key
            header. This key can only ingest leads for this connection.
          </p>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const name = new FormData(form).get("name");
              void run(async () => {
                const result = await api<APIKey>(`/sources/${source.id}/keys`, {
                  method: "POST",
                  body: JSON.stringify({ name, scopes: ["leads:ingest"] }),
                });
                setNewKey(result.key || "");
                keys.reload();
                form.reset();
              });
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="api-key-name">Key name</Label>
              <Input
                id="api-key-name"
                name="name"
                required
                maxLength={120}
                placeholder="Website integration"
              />
            </div>
            <Button disabled={busy}>Create API key</Button>
          </form>
          {newKey && <SecretValue title="API key" value={newKey} once />}
          {keys.error && (
            <p role="alert" className="text-sm text-danger">
              {keys.error}
            </p>
          )}
          {keys.data?.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between gap-3 border-t border-border pt-3 text-xs"
            >
              <span>
                {key.name} · {key.prefix}… ·{" "}
                {key.revokedAt ? "Revoked" : "Active"}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !!key.revokedAt}
                onClick={() => {
                  if (confirm(`Revoke ${key.name}?`))
                    void run(async () => {
                      await api(`/sources/${source.id}/keys/${key.id}`, {
                        method: "DELETE",
                      });
                      setNewKey("");
                      keys.reload();
                    });
                }}
              >
                Revoke
              </Button>
            </div>
          ))}
        </>
      )}
      {source.connectionKind === "csv" && (
        <>
          <p className="text-xs text-muted-foreground">
            UTF-8 CSV, up to 5 MB and 1,000 rows. Configure column mapping below
            first. Include a phone or email column.
          </p>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!upload) return;
              void run(async () => {
                const result = await api<Import>(
                  `/sources/${source.id}/imports?fileName=${encodeURIComponent(upload.file.name)}`,
                  {
                    method: "POST",
                    body: upload.file,
                    headers: {
                      "Content-Type": "text/csv",
                      "Idempotency-Key": upload.key,
                    },
                  },
                );
                toast.success(
                  result.duplicate
                    ? "This file was already accepted."
                    : `${result.totalRows} rows accepted for processing.`,
                );
                imports.reload();
                onChanged();
              });
            }}
          >
            <Label htmlFor="csv-file">CSV file</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && file.size > 5 * 1024 * 1024) {
                  toast.error("Upload no more than 5 MB.");
                  setUpload(null);
                  e.target.value = "";
                  return;
                }
                setUpload(file ? { file, key: crypto.randomUUID() } : null);
              }}
            />
            <Button
              className="self-start"
              disabled={busy || !upload || source.status !== "connected"}
            >
              {busy ? "Uploading…" : "Upload CSV"}
            </Button>
          </form>
          {imports.error && (
            <p role="alert" className="text-sm text-danger">
              {imports.error}
            </p>
          )}
          <div className="flex flex-col gap-3">
            {imports.data?.map((row) => (
              <div key={row.id} className="border-t border-border pt-3">
                <p className="text-sm font-medium">{row.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {row.processedRows} processed · {row.failedRows} failed ·{" "}
                  {row.pendingRows} pending · {row.totalRows} total
                </p>
                <ImportRows
                  sourceId={source.id}
                  importId={row.id}
                  pending={row.pendingRows > 0}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
function ImportRows({
  sourceId,
  importId,
  pending,
}: {
  sourceId: string;
  importId: string;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [after, setAfter] = useState("0");
  const rows = useApi<IngestEvent[]>(
    open
      ? `/sources/${sourceId}/imports/${importId}/rows?limit=50&after_id=${after}`
      : null,
  );
  useEffect(() => {
    if (!open || !pending) return;
    const timer = setInterval(rows.reload, 5000);
    return () => clearInterval(timer);
  }, [open, pending, rows.reload]);
  return (
    <div className="mt-2">
      <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide rows" : "View rows"}
      </Button>
      {open && (
        <>
          {rows.error && (
            <p role="alert" className="text-xs text-danger">
              {rows.error}
            </p>
          )}
          {rows.loading && <p className="text-xs">Loading rows…</p>}
          <div className="max-h-64 overflow-auto text-xs">
            {rows.data?.map((row) => (
              <p key={row.id} className="border-t border-border py-2">
                Row {row.rowNumber}: {row.status}
                {row.reason ? ` · ${row.reason.replaceAll("_", " ")}` : ""}
                {row.leadId && (
                  <Link
                    className="ml-2 text-accent"
                    href={`/leads/${row.leadId}`}
                  >
                    Open lead
                  </Link>
                )}
              </p>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAfter("0");
              rows.reload();
            }}
          >
            First page / refresh
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={rows.data?.length !== 50}
            onClick={() => setAfter(rows.data!.at(-1)!.id)}
          >
            Next 50
          </Button>
        </>
      )}
    </div>
  );
}
export function EventList({ events }: { events: IngestEvent[] }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-surface-2 text-muted-foreground">
          <tr>
            {["Received", "Status", "Result", "Lead"].map((label) => (
              <th key={label} className="p-3 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-t border-border">
              <td className="p-3">{formatDateTime(event.receivedAt)}</td>
              <td className="p-3">{event.status}</td>
              <td className="p-3">
                {(
                  event.reason ||
                  event.result ||
                  "Awaiting processing"
                ).replaceAll("_", " ")}
              </td>
              <td className="p-3">
                {event.leadId ? (
                  <Link href={`/leads/${event.leadId}`} className="text-accent">
                    Open lead ↗
                  </Link>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {events.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">
          No events on this page. Send an enquiry or upload a CSV to begin.
        </p>
      )}
    </div>
  );
}
