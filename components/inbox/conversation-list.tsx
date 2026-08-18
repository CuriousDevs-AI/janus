"use client";

import * as React from "react";
import { useAppStore } from "@/lib/stores/app-store";
import { getCompanyById } from "@/lib/mock-data";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { ChannelIcon } from "@/components/shared/channel-badge";
import { AIIndicator } from "@/components/shared/ai-indicator";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { formatRelativeTime, cn } from "@/lib/utils";
import { Inbox as InboxIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "sales", label: "Sales" },
  { key: "support", label: "Support" },
  { key: "ai", label: "AI" },
  { key: "human", label: "Human" },
] as const;

export function ConversationList({ selectedId, onSelect }: { selectedId: string | undefined; onSelect: (id: string) => void }) {
  const conversations = useAppStore((s) => s.conversations);
  const customers = useAppStore((s) => s.customers);
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]["key"]>("all");
  const [query, setQuery] = React.useState("");

  const rows = conversations
    .map((c) => ({ conversation: c, customer: customers.find((cu) => cu.id === c.customerId) }))
    .filter((r) => r.customer)
    .filter((r) => {
      if (filter === "unread") return r.conversation.unreadCount > 0;
      if (filter === "sales") return r.conversation.category === "sales";
      if (filter === "support") return r.conversation.category === "support";
      if (filter === "ai") return r.conversation.aiActive;
      if (filter === "human") return !r.conversation.aiActive;
      return true;
    })
    .filter((r) => {
      if (!query) return true;
      const company = getCompanyById(r.customer!.companyId)?.name ?? "";
      return r.customer!.name.toLowerCase().includes(query.toLowerCase()) || company.toLowerCase().includes(query.toLowerCase());
    })
    .sort((a, b) => (a.conversation.lastMessageAt < b.conversation.lastMessageAt ? 1 : -1));

  return (
    <div className="flex h-full w-full flex-col border-r border-border bg-surface md:w-[320px]">
      <div className="flex flex-col gap-2.5 border-b border-border px-3 py-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search conversations…" />
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList className="h-auto gap-0 border-b-0">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.key} value={f.key} className="h-7 px-2 text-[11.5px]">
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 && (
          <EmptyState icon={InboxIcon} title="No active conversations" description="Nothing matches this filter." className="border-none" />
        )}
        {rows.map(({ conversation, customer }) => {
          const company = getCompanyById(customer!.companyId);
          const active = conversation.id === selectedId;
          return (
            <button
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
              className={cn(
                "flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-3 text-left transition-colors",
                active ? "bg-accent-muted" : "hover:bg-surface-2"
              )}
            >
              <CustomerAvatar name={customer!.name} color={customer!.avatarColor} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[13px] font-medium text-foreground">{customer!.name}</span>
                  <span className="shrink-0 text-[10.5px] text-muted-foreground">{formatRelativeTime(conversation.lastMessageAt)}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ChannelIcon channel={conversation.channel} className="size-3" />
                  <span className="truncate">{company?.name}</span>
                </div>
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{conversation.lastMessagePreview}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  {conversation.aiActive && <AIIndicator />}
                  {conversation.priority === "urgent" && <span className="rounded bg-danger-muted px-1 py-0.5 text-[9px] font-medium uppercase text-danger">Urgent</span>}
                  {conversation.priority === "high" && <span className="rounded bg-warning-muted px-1 py-0.5 text-[9px] font-medium uppercase text-warning">High</span>}
                </div>
              </div>
              {conversation.unreadCount > 0 && (
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground">
                  {conversation.unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
