"use client";
import { Menu, Search, LogOut } from "lucide-react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useSession, useSignOut } from "@/components/auth/session-provider";
import { usePageTitle } from "@/components/layout/use-page-title";
import { useWorkspace } from "@/components/layout/workspace-context";
import { Button } from "@/components/ui/button";
import { demoMode } from "@/lib/demo-mode";
import { demoAccounts } from "@/lib/demo-accounts";
import { useDemoAccount, useLoginAccount, viewAs } from "@/lib/demo-persona";
import { toast } from "sonner";
export function Topbar() {
  const { workspace } = useWorkspace();
  const session = useSession();
  const signOut = useSignOut();
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const setMobile = useUIStore((s) => s.setMobileNavOpen);
  const title = usePageTitle();
  const account = useDemoAccount();
  const login = useLoginAccount();
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
        {demoMode && login?.hrRole === "owner" && <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="hidden sm:inline">View as</span><select aria-label="View as" title="See the app the way another person sees it" value={account?.id ?? ""} onChange={(event) => { viewAs(event.target.value); const next = demoAccounts.find((item) => item.id === event.target.value); toast.success(next?.id === "owner" ? "Back to your own view" : `Viewing as ${next?.name}`); }} className="h-8 max-w-[150px] border border-border bg-surface px-2 text-xs text-foreground">{demoAccounts.map((item) => <option key={item.id} value={item.id}>{item.id === "owner" ? "Myself (Owner)" : `${item.name} · ${item.title}`}</option>)}</select></label>}
        <span className="hidden text-xs text-muted-foreground lg:inline">
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
