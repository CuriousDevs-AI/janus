"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, RefreshCw, Phone, Mail, Building2 } from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import type { Contact, CrmTag } from "@/lib/api/types";
import { useSession } from "@/components/auth/session-provider";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ContactRow extends Contact {
  tags?: CrmTag[];
  lastActivityAt?: string | null;
  leadCount?: number;
}

export default function ContactsPage() {
  const router = useRouter();
  useSession();
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [afterId, setAfterId] = useState("0");

  const tagParam = tagFilter !== "all" ? `&tag_id=${tagFilter}` : "";
  const searchParam = query.trim() ? `&search=${encodeURIComponent(query.trim())}` : "";
  const contacts = useApi<ContactRow[]>(
    `/contacts?limit=50&after_id=${afterId}${searchParam}${tagParam}`,
  );
  const tags = useApi<CrmTag[]>("/tags");

  const rows = contacts.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Contacts"
        description={`${rows.length} contacts on this page`}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => contacts.reload()}>
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 px-6 pb-4">
        <SearchInput
          value={query}
          onChange={(v) => { setQuery(v); setAfterId("0"); }}
          placeholder="Search by name, phone, email..."
          className="max-w-xs"
        />
        <Select value={tagFilter} onValueChange={(v) => { setTagFilter(v); setAfterId("0"); }}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="Filter by tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            {(tags.data ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {contacts.error && (
        <p role="alert" className="mx-6 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          Could not load contacts: {contacts.error}
        </p>
      )}

      <div className="flex-1 overflow-auto px-6">
        {!contacts.loading && rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No contacts found"
            description="Contacts are created when leads are captured. Try a different search or filter."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Leads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-surface-2"
                  onClick={() => router.push(`/customers/${c.id}`)}
                >
                  <TableCell className="font-medium">{c.name || "—"}</TableCell>
                  <TableCell>
                    {c.phone ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Phone className="size-3 text-muted-foreground" />
                        {c.phone}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {c.email ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Mail className="size-3 text-muted-foreground" />
                        {c.email}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {c.company ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Building2 className="size-3 text-muted-foreground" />
                        {c.company}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(c.tags ?? []).map((t) => (
                        <Badge key={t.id} variant="neutral" className="text-[10px]" style={{ borderColor: t.color }}>
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{c.leadCount ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
        <Button
          size="sm"
          variant="ghost"
          disabled={afterId === "0"}
          onClick={() => setAfterId("0")}
        >
          First page
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={rows.length < 50}
          onClick={() => rows.length > 0 && setAfterId(rows[rows.length - 1].id)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
