"use client";
import { usePathname } from "next/navigation";
import { Menu, Search, LogOut } from "lucide-react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useSession, useSignOut } from "@/components/auth/session-provider";
import { navSections } from "@/lib/nav-config";
import { Button } from "@/components/ui/button";
export function Topbar() {
  const pathname = usePathname();
  const session = useSession();
  const signOut = useSignOut();
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const setMobile = useUIStore((s) => s.setMobileNavOpen);
  const title =
    navSections
      .flatMap((s) => s.items)
      .find(
        (item) =>
          pathname === item.href || pathname.startsWith(item.href + "/"),
      )?.label || "Janus";
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation"
          onClick={() => setMobile(true)}
        >
          <Menu className="size-4" />
        </Button>
        <span className="text-sm font-medium">{title}</span>
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
