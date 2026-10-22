"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, Search, LogOut } from "lucide-react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useSession, useSignOut } from "@/components/auth/session-provider";
import { getNavSectionsForWorkspace } from "@/lib/nav-config";
import { useWorkspace } from "@/components/layout/workspace-context";
import { Button } from "@/components/ui/button";
export function Topbar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspaceId, workspace } = useWorkspace();
  const session = useSession();
  const signOut = useSignOut();
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const setMobile = useUIStore((s) => s.setMobileNavOpen);
  const title =
    getNavSectionsForWorkspace(workspaceId)
      .flatMap((s) => s.items)
      .find(
        (item) => {
          const [itemPath, itemQuery] = item.href.split("?");
          if (pathname !== itemPath && !pathname.startsWith(`${itemPath}/`)) return false;
          const itemParams = new URLSearchParams(itemQuery ?? "");
          for (const [key, value] of itemParams.entries()) {
            if (searchParams.get(key) !== value) return false;
          }
          for (const [key] of searchParams.entries()) {
            if (key !== "workspace" && !itemParams.has(key)) return false;
          }
          return true;
        },
      )?.label || "Janus";
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
