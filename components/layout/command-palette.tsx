"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/lib/stores/ui-store";
import { navSections } from "@/lib/nav-config";
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
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!useUIStore.getState().commandPaletteOpen);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [setOpen]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0">
        <DialogTitle className="sr-only">Go to a workspace page</DialogTitle>
        <Command>
          <CommandInput placeholder="Find a page…" />
          <CommandList>
            <CommandEmpty>No pages match.</CommandEmpty>
            <CommandGroup heading="Workspace">
              {navSections
                .flatMap((s) => s.items)
                .map((item) => (
                  <CommandItem
                    key={item.href}
                    onSelect={() => {
                      setOpen(false);
                      router.push(item.href);
                    }}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                    {!["/leads", "/lead-sources", "/inbox", "/deals"].includes(
                      item.href,
                    ) && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        Not connected yet
                      </span>
                    )}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
