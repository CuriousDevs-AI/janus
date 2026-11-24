"use client";

import * as React from "react";
import { useEffect, useCallback } from "react";
import { Building2, FileSpreadsheet, Inbox, Keyboard, LayoutGrid, Plus, UserPlus, Zap } from "lucide-react";
import { businessHome, portfolioHome } from "@/lib/company";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/lib/stores/ui-store";
import { appendWorkspace, getNavSectionsForWorkspace } from "@/lib/nav-config";
import { useWorkspace } from "@/components/layout/workspace-context";
import { useSession } from "@/components/auth/session-provider";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { message } from "@/lib/api/client";
import { switchTenant } from "@/lib/live-company";
import { PORTFOLIO_ROLES } from "@/lib/access";
import { can } from "@/lib/permissions";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";

function isInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function CommandPalette() {
  const router = useRouter();
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const { workspaceId, workspace } = useWorkspace();
  const session = useSession();
  const canWriteLeads = can(session, "leads:write");
  const navSections = getNavSectionsForWorkspace(workspaceId)
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.demoOnly && (!item.requiredPermission || session.permissions.includes("*") || session.permissions.includes(item.requiredPermission)),
      ),
    }))
    .filter((section) => section.items.length > 0);

  const go = useCallback((href: string) => { setOpen(false); router.push(href); }, [setOpen, router]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(!useUIStore.getState().commandPaletteOpen);
        return;
      }
      if (isInputFocused()) return;
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (event.key === "?" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [setOpen]);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0">
          <DialogTitle className="sr-only">Go to a {workspace.name} page</DialogTitle>
          <Command>
            <CommandInput placeholder="Type a command or search…" />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              {canWriteLeads && <CommandGroup heading="Quick actions">
                <CommandItem onSelect={() => { setOpen(false); window.dispatchEvent(new CustomEvent("janus:add-lead")); }}>
                  <Plus className="size-4" />Add new lead<CommandShortcut>N</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => { setOpen(false); window.dispatchEvent(new CustomEvent("janus:import-leads")); }}>
                  <FileSpreadsheet className="size-4" />Import CSV
                </CommandItem>
              </CommandGroup>}
              <CommandGroup heading="Quick access">
                <CommandItem onSelect={() => go("/work")}>
                  <Inbox className="size-4" />Work Inbox
                </CommandItem>
                <CommandItem onSelect={() => go("/leads")}>
                  <UserPlus className="size-4" />Leads
                </CommandItem>
                <CommandItem onSelect={() => go("/deals")}>
                  <Zap className="size-4" />Deals
                </CommandItem>
                <CommandItem onSelect={() => go("/dashboard")}>
                  <LayoutGrid className="size-4" />Dashboard
                </CommandItem>
              </CommandGroup>
              {session.tenants.length > 0 && <CommandGroup heading="Switch company">
                {workspaceId !== "portfolio" && session.tenants.some((item) => PORTFOLIO_ROLES.includes(item.role)) && <CommandItem onSelect={() => { setOpen(false); router.push(portfolioHome); }}><LayoutGrid className="size-4" />Portfolio · all companies</CommandItem>}
                {session.tenants.filter((item) => item.status === "active" && item.id !== session.tenant.id).map((item) => <CommandItem key={item.id} onSelect={() => { setOpen(false); switchTenant(item.id, businessHome, item.name).catch((error) => toast.error(message(error))); }}><Building2 className="size-4" />{item.name}</CommandItem>)}
              </CommandGroup>}
              {navSections.map((section) => (
                <CommandGroup key={section.title} heading={section.title}>
                  {section.items.map((item) => (
                    <CommandItem
                      key={`${item.href}:${item.label}`}
                      onSelect={() => {
                        setOpen(false);
                        router.push(appendWorkspace(item.href, workspaceId));
                      }}
                    >
                      <item.icon className="size-4" />
                      {item.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              <CommandGroup heading="Help">
                <CommandItem onSelect={() => { setOpen(false); setShortcutsOpen(true); }}>
                  <Keyboard className="size-4" />Keyboard shortcuts<CommandShortcut>?</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}

const shortcuts = [
  { keys: ["⌘", "K"], description: "Open command palette" },
  { keys: ["/"], description: "Open command palette" },
  { keys: ["?"], description: "Show keyboard shortcuts" },
  { keys: ["N"], description: "Add new lead (on Leads page)" },
] as const;

function KeyboardShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="flex items-center gap-2 text-sm font-semibold"><Keyboard className="size-4" /> Keyboard shortcuts</DialogTitle>
        <div className="mt-2 space-y-1">
          {shortcuts.map(({ keys, description }) => (
            <div key={description} className="flex items-center justify-between py-1.5">
              <span className="text-[13px] text-muted-foreground">{description}</span>
              <span className="flex items-center gap-1">
                {keys.map((k) => (
                  <kbd key={k} className="inline-flex min-w-[24px] items-center justify-center rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{k}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
