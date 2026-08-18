"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Bell, Sparkles, Command, Menu } from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { navSections } from "@/lib/nav-config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelativeTime } from "@/lib/utils";
import { getCustomerById, currentUser } from "@/lib/mock-data";

const allNavItems = navSections.flatMap((s) => s.items);

function useBreadcrumb() {
  const pathname = usePathname();
  const match = allNavItems.find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
  const segments = pathname.split("/").filter(Boolean);
  const isDetail = segments.length > 1;
  let detailLabel: string | undefined;
  if (isDetail) {
    const id = segments[1];
    const customer = getCustomerById(id);
    detailLabel = customer?.name ?? id;
  }
  return { section: match?.label ?? "Janus", detailLabel };
}

export function Topbar() {
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setMobileNavOpen = useAppStore((s) => s.setMobileNavOpen);
  const notifications = useAppStore((s) => s.notifications);
  const markNotificationRead = useAppStore((s) => s.markNotificationRead);
  const markAllNotificationsRead = useAppStore((s) => s.markAllNotificationsRead);
  const { section, detailLabel } = useBreadcrumb();
  const unread = notifications.filter((n) => !n.read);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={() => setMobileNavOpen(true)}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground md:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-4" />
        </button>
        <nav className="flex min-w-0 items-center gap-1.5 text-[13px]">
          <span className="text-muted-foreground">Janus</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="font-medium text-foreground">{section}</span>
          {detailLabel && (
            <>
              <span className="text-muted-foreground/50">/</span>
              <span className="truncate text-muted-foreground">{detailLabel}</span>
            </>
          )}
        </nav>
        <Badge variant="warning" className="ml-1 hidden sm:inline-flex">
          DEMO
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="hidden items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-muted-foreground hover:border-border-strong hover:text-foreground sm:flex"
        >
          <Search className="size-3.5" />
          <span>Search everything…</span>
          <span className="ml-4 flex items-center gap-0.5 rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground/70">
            <Command className="size-2.5" />K
          </span>
        </button>
        <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setCommandPaletteOpen(true)} aria-label="Search">
          <Search className="size-4" />
        </Button>

        <Button variant="secondary" size="sm" asChild>
          <Link href="/ai">
            <Sparkles className="size-3.5 text-accent" />
            Ask AI
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground" aria-label="Notifications">
              <Bell className="size-4" />
              {unread.length > 0 && (
                <span className="absolute right-1 top-1 flex size-3.5 items-center justify-center rounded-full bg-accent text-[9px] font-semibold text-accent-foreground">
                  {unread.length > 9 ? "9+" : unread.length}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="flex items-center justify-between px-2 py-1">
              <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
              <button onClick={markAllNotificationsRead} className="text-[11px] text-accent hover:underline">
                Mark all read
              </button>
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-96 overflow-y-auto">
              {notifications.slice(0, 8).map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  className="flex flex-col items-start gap-0.5 whitespace-normal py-2"
                  onSelect={() => markNotificationRead(n.id)}
                  asChild
                >
                  <Link href={n.href ?? "/notifications"}>
                    <div className="flex w-full items-center gap-1.5">
                      {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
                      <span className={`text-[12.5px] ${n.read ? "text-muted-foreground" : "font-medium text-foreground"}`}>{n.title}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{n.description}</span>
                    <span className="text-[10px] text-muted-foreground/70">{formatRelativeTime(n.createdAt)}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="justify-center text-accent">
              <Link href="/notifications">View all notifications</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 flex size-7 items-center justify-center rounded-full bg-surface-3 text-[11px] font-medium text-foreground hover:ring-2 hover:ring-border-strong" aria-label="Account menu">
              {currentUser.name[0]}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{currentUser.name}</DropdownMenuLabel>
            <DropdownMenuItem disabled className="text-muted-foreground">
              {currentUser.email}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/usage">Usage & cost</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/login">Sign out</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
