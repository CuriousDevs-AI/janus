"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Circle,
} from "lucide-react";
import { navSections } from "@/lib/nav-config";
import { useUIStore } from "@/lib/stores/ui-store";
import { useSignOut, useSession } from "@/components/auth/session-provider";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function SidebarNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const session = useSession();
  const signOut = useSignOut();
  const currentUser = {
    ...session.user,
    role: session.role,
    avatarColor: "#2563eb",
  };
  const tenant = session.tenant;

  return (
    <>
      {/* Workspace selector */}
      <div
        className={cn(
          "border-b border-border py-2",
          collapsed ? "px-2" : "px-3",
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2 transition-colors",
                collapsed && "justify-center px-0",
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded bg-surface-3 text-[10px] font-semibold text-foreground">
                {tenant.name[0]}
              </span>
              {!collapsed && (
                <>
                  <span className="flex-1 truncate text-[12px] font-medium text-foreground">
                    {tenant.name}
                  </span>
                  <ChevronsUpDown className="size-3 text-muted-foreground" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Workspace</DropdownMenuLabel>
            <DropdownMenuItem className="flex items-center justify-between">
              {tenant.name}
              <Circle className="size-2 fill-accent text-accent" />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>+ Create workspace</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {navSections.map((section) => (
          <div
            key={section.title}
            className={cn("mb-4", collapsed ? "px-2" : "px-3")}
          >
            {!collapsed && (
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.title}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                const link = (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                      collapsed && "justify-center px-0 py-2",
                      active
                        ? "bg-accent-muted text-foreground"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-3.5 shrink-0",
                        active && "text-accent",
                      )}
                    />
                    {!collapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </Link>
                );
                return (
                  <li key={item.href}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className={cn(
          "flex items-center gap-2 border-t border-border py-3",
          collapsed ? "justify-center px-2" : "px-3",
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex flex-1 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2 transition-colors",
                collapsed && "flex-none",
              )}
            >
              <CustomerAvatar
                name={currentUser.name}
                color={currentUser.avatarColor}
                size="sm"
              />
              {!collapsed && (
                <span className="flex flex-1 flex-col items-start leading-none">
                  <span className="text-[12px] font-medium text-foreground">
                    {currentUser.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {session.role}
                  </span>
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>{currentUser.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings?tab=billing">Billing</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed);

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "hidden md:flex h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-150",
          collapsed ? "w-[68px]" : "w-[258px]",
        )}
      >
        <div
          className={cn(
            "flex h-14 items-center border-b border-border",
            collapsed ? "justify-center px-0" : "px-4",
          )}
        >
          <Link
            href="/leads"
            className="flex items-center gap-2 overflow-hidden"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-foreground text-[12px] font-bold text-background">
              C
            </span>
            {!collapsed && (
              <span className="flex flex-col leading-none">
                <span className="text-[13px] font-semibold text-foreground">
                  Curious<span className="text-accent">Devs</span>
                </span>
                <span className="text-[10px] text-muted-foreground">Janus</span>
              </span>
            )}
          </Link>
        </div>

        <SidebarNav collapsed={collapsed} />

        {collapsed ? (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="flex items-center justify-center gap-2 border-t border-border py-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            aria-label="Expand sidebar"
          >
            <ChevronsRight className="size-3.5" />
          </button>
        ) : (
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="flex items-center justify-center gap-2 border-t border-border py-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            aria-label="Collapse sidebar"
          >
            <ChevronsLeft className="size-3.5" />
          </button>
        )}
      </aside>
    </TooltipProvider>
  );
}
