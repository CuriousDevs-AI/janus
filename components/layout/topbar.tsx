"use client";
import { Menu, Search, LogOut } from "lucide-react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useSession, useSignOut } from "@/components/auth/session-provider";
import { usePageTitle } from "@/components/layout/use-page-title";
import { useWorkspace } from "@/components/layout/workspace-context";
import { Button } from "@/components/ui/button";
export function Topbar() {
  const { workspace } = useWorkspace();
  const session = useSession();
  const signOut = useSignOut();
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const setMobile = useUIStore((s) => s.setMobileNavOpen);
  const title = usePageTitle();
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation"
          onClick={() => setMobile(true)}
        >
          <Menu className="size-4" />
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <span className="max-w-[min(38vw,280px)] truncate text-sm font-medium">{title}</span>
          <span className="hidden border border-accent-border bg-accent-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent sm:inline-flex">
            <span className="max-w-[180px] truncate">{workspace.name}</span>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Search className="size-3.5" />
          <span className="hidden sm:inline">Go to… ⌘K</span>
        </Button>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {session.user.name}
        </span>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Sign out"
          onClick={() => void signOut()}
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  );
}
