"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  UserRoundPlus,
  Handshake,
  MessageSquare,
  LifeBuoy,
  Workflow,
  Sparkles,
  Inbox,
  BarChart3,
  Building2,
  Database,
  Radio,
} from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { customers, deals, tickets, knowledgeDocuments, leadSourceConnections, getCompanyById } from "@/lib/mock-data";
import { getConversationsForCustomer } from "@/lib/mock-data";
import { leadSourceMeta } from "@/lib/status-meta";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { CustomerAvatar } from "@/components/shared/customer-avatar";

export function CommandPalette() {
  const open = useAppStore((s) => s.commandPaletteOpen);
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const router = useRouter();

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useAppStore.getState().commandPaletteOpen);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] animate-fade-in" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[16%] z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-border-strong bg-surface shadow-2xl animate-slide-in">
          <DialogPrimitive.Title className="sr-only">Command Palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search customers, leads, deals, conversations, tickets and knowledge, or run a quick action.</DialogPrimitive.Description>
          <Command shouldFilter>
            <CommandInput placeholder="Search customers, leads, deals, tickets, knowledge…" autoFocus />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>

              <CommandGroup heading="Quick Actions">
                <CommandItem onSelect={() => go("/leads?new=1")}>
                  <UserRoundPlus className="size-3.5 text-muted-foreground" /> Create lead
                  <CommandShortcut>Leads</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => go("/deals?new=1")}>
                  <Handshake className="size-3.5 text-muted-foreground" /> Create deal
                  <CommandShortcut>Deals</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => go("/inbox")}>
                  <MessageSquare className="size-3.5 text-muted-foreground" /> Send a message
                  <CommandShortcut>Inbox</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => go("/tickets?new=1")}>
                  <LifeBuoy className="size-3.5 text-muted-foreground" /> Create ticket
                  <CommandShortcut>Support</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => go("/automations?new=1")}>
                  <Workflow className="size-3.5 text-muted-foreground" /> Create automation
                  <CommandShortcut>Automations</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => go("/lead-sources")}>
                  <Radio className="size-3.5 text-muted-foreground" /> Connect a lead source
                  <CommandShortcut>Lead Sources</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => go("/ai")}>
                  <Sparkles className="size-3.5 text-accent" /> Open AI Assistant
                </CommandItem>
                <CommandItem onSelect={() => go("/inbox")}>
                  <Inbox className="size-3.5 text-muted-foreground" /> Open Inbox
                </CommandItem>
                <CommandItem onSelect={() => go("/analytics")}>
                  <BarChart3 className="size-3.5 text-muted-foreground" /> Open Analytics
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Customers">
                {customers.slice(0, 8).map((c) => {
                  const company = getCompanyById(c.companyId);
                  const convs = getConversationsForCustomer(c.id);
                  return (
                    <CommandItem key={c.id} value={`${c.name} ${company?.name ?? ""}`} onSelect={() => go(`/customers/${c.id}`)}>
                      <CustomerAvatar name={c.name} color={c.avatarColor} size="sm" />
                      <span className="flex flex-col leading-tight">
                        <span>{c.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {company?.name}
                          {convs[0] ? ` · Last conversation: ${convs[0].channel.replace("_", " ")}` : ""}
                        </span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Deals">
                {deals.map((d) => {
                  const c = customers.find((cu) => cu.id === d.customerId);
                  return (
                    <CommandItem key={d.id} value={`${d.name} ${c?.name ?? ""}`} onSelect={() => go(`/deals/${d.id}`)}>
                      <Handshake className="size-3.5 text-muted-foreground" />
                      <span className="flex flex-col leading-tight">
                        <span>{d.name}</span>
                        <span className="text-[11px] text-muted-foreground">{c?.name}</span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Tickets">
                {tickets.slice(0, 6).map((t) => {
                  const c = customers.find((cu) => cu.id === t.customerId);
                  return (
                    <CommandItem key={t.id} value={`${t.subject} ${t.number} ${c?.name ?? ""}`} onSelect={() => go(`/tickets/${t.id}`)}>
                      <LifeBuoy className="size-3.5 text-muted-foreground" />
                      <span className="flex flex-col leading-tight">
                        <span>
                          {t.number} — {t.subject}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{c?.name}</span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Knowledge">
                {knowledgeDocuments.map((k) => (
                  <CommandItem key={k.id} value={k.title} onSelect={() => go(`/knowledge/${k.id}`)}>
                    <Database className="size-3.5 text-muted-foreground" />
                    {k.title}
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Lead Sources">
                {leadSourceConnections.map((s) => {
                  const meta = leadSourceMeta[s.source];
                  return (
                    <CommandItem key={s.id} value={s.name} onSelect={() => go(`/lead-sources/${s.id}`)}>
                      <meta.icon className="size-3.5 text-muted-foreground" />
                      {s.name}
                    </CommandItem>
                  );
                })}
              </CommandGroup>

              <CommandSeparator />
              <CommandGroup heading="Companies">
                {customers.slice(0, 4).map((c) => (
                  <CommandItem key={`co-${c.id}`} value={getCompanyById(c.companyId)?.name} onSelect={() => go(`/customers/${c.id}`)}>
                    <Building2 className="size-3.5 text-muted-foreground" />
                    {getCompanyById(c.companyId)?.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
