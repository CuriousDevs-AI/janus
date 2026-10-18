"use client";
import { use } from "react";
import Link from "next/link";
import { useApi } from "@/lib/api/use-api";
import type { Contact } from "@/lib/api/types";
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const contact = useApi<Contact>(`/contacts/${encodeURIComponent(id)}`);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <Link href="/leads" className="text-xs text-muted-foreground">
        ← Leads
      </Link>
      {contact.data ? (
        <>
          <h1 className="text-xl font-semibold">
            {contact.data.name || contact.data.phone || contact.data.email}
          </h1>
          <dl className="grid gap-4 border border-border p-4 sm:grid-cols-2">
            {[
              ["Company", contact.data.company],
              ["Phone", contact.data.phone],
              ["Email", contact.data.email],
              ["Customer ID", contact.data.id],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-all text-sm">{value || "—"}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            Matching enquiries share this customer record. Conversations and the
            activity timeline will follow when connected.
          </p>
        </>
      ) : (
        <p role="status">{contact.error || "Loading customer…"}</p>
      )}
    </div>
  );
}
