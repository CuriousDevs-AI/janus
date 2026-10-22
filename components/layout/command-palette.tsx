"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/lib/stores/ui-store";
import { appendWorkspace, getNavSectionsForWorkspace } from "@/lib/nav-config";
import { useWorkspace } from "@/components/layout/workspace-context";
import { useSession } from "@/components/auth/session-provider";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

export function CommandPalette() {
  const router = useRouter();
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const { workspaceId, workspace } = useWorkspace();
  const session = useSession();
  const navSections = getNavSectionsForWorkspace(workspaceId)
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.requiredPermission || session.permissions.includes("*") || session.permissions.includes(item.requiredPermission),
      ),
    }))
    .filter((section) => section.items.length > 0);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(!useUIStore.getState().commandPaletteOpen);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [setOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0">
        <DialogTitle className="sr-only">Go to a {workspace.name} page</DialogTitle>
        <Command>
          <CommandInput placeholder="Find a page…" />
          <CommandList>
            <CommandEmpty>No pages match.</CommandEmpty>
            {navSections.map((section) => (
              <CommandGroup key={section.title} heading={section.title}>
                {section.items.map((item) => (
                  <CommandItem
                    key={item.href}
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
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
