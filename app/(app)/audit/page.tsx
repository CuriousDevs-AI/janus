"use client";

import * as React from "react";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { auditEvents, getCustomerById } from "@/lib/mock-data";
import type { ActivityActor, AuditEvent } from "@/lib/types";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { AIIndicator, ActorIcon } from "@/components/shared/ai-indicator";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import { demoMode } from "@/lib/demo-mode";

type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const resultToneMeta: Record<AuditEvent["result"], { label: string; tone: BadgeTone }> = {
  success: { label: "Success", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  denied: { label: "Denied", tone: "warning" },
};

function actorLabel(actor: ActivityActor): string {
  switch (actor.type) {
    case "ai":
      return actor.agentName;
    case "human":
      return actor.userName;
    case "system":
      return "System";
    case "customer":
      return "Customer";
  }
}

export default function AuditLogPage() {
  const [query, setQuery] = React.useState("");
  const [resultFilter, setResultFilter] = React.useState<"all" | AuditEvent["result"]>("all");

  const rows = auditEvents
    .filter((a) => resultFilter === "all" || a.result === resultFilter)
    .filter((a) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        a.action.toLowerCase().includes(q) ||
        a.objectLabel.toLowerCase().includes(q) ||
        actorLabel(a.actor).toLowerCase().includes(q)
      );
    })
    .sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col">
      <PageHeader title="Audit Logs" description={`${rows.length} of ${auditEvents.length} events`} />

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 pb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search action, object or actor…" className="w-72" />
        <Select value={resultFilter} onValueChange={(v) => setResultFilter(v as typeof resultFilter)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Result" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All results</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-6">
          <EmptyState icon={ScrollText} title="No matching events" description="Try a different search term or result filter." />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Object</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((event) => {
              const customer = getCustomerById(event.customerId);
              const resultMeta = resultToneMeta[event.result];
              return (
                <TableRow key={event.id}>
                  <TableCell className="text-mono text-[12px] text-muted-foreground">{formatDateTime(event.at)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {event.actor.type === "ai" ? (
                        <AIIndicator label={event.actor.agentName} />
                      ) : (
                        <>
                          <ActorIcon actorType={event.actor.type} />
                          <span className="text-[12.5px] text-foreground">{actorLabel(event.actor)}</span>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="text-mono text-[12.5px] text-foreground">{event.action}</span>
                      {event.approvalRequired && (
                        <Badge variant="outline" className="text-[10px]">
                          approval
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {customer ? (
                      <Link href={`/customers/${customer.id}`} className="text-[12.5px] text-muted-foreground hover:text-accent">
                        {customer.name}
                      </Link>
                    ) : (
                      <span className="text-[12.5px] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="max-w-52 truncate text-[12.5px] text-foreground">{event.objectLabel}</span>
                      <Badge variant="neutral" className="shrink-0">
                        {event.objectKind}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={resultMeta.tone}>{resultMeta.label}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
