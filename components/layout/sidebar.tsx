"use client";

import * as React from "react";
import { activeCompany, activeCompanyId, portfolioHome, scoped } from "@/lib/company";
import { CompanyLogo } from "@/components/shared/company-logo";
import { readPortfolioLogo } from "@/features/portfolio";
import { LiveCompanySwitcher } from "@/components/layout/company-switcher";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChevronsUpDown,
  Circle,
  Inbox,
  LockKeyhole,
  Plus,
} from "lucide-react";
import {
  appendWorkspace,
  getNavSectionsForWorkspace,
  type NavItem,
} from "@/lib/nav-config";
import { useSession } from "@/components/auth/session-provider";
import { useWorkspace } from "@/components/layout/workspace-context";
import { cn } from "@/lib/utils";
import { OPERATIONAL_WORKSPACES, workspaceDefinitions } from "@/lib/workspace-config";
import { useApi } from "@/lib/api/use-api";
import { useTeamChatStore } from "@/lib/stores/team-chat-store";
import { managesBusiness, mayOpenWorkspace, PORTFOLIO_ROLES } from "@/lib/access";
import { TeamChatSidebarList } from "@/components/team/chat-list";
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

/** Team Chat serves the whole company, so it sits in every switcher that lists workspaces. */
const teamChatEntry = { id: "team-chat", name: "Team Chat", description: "Channels, direct messages, voice and screen sharing." };
function withTeamChat<T extends { id: string; name: string; description: string }>(list: T[]): Array<T | typeof teamChatEntry> {
  return list.length && !list.some((item) => item.id === "team-chat") ? [...list, teamChatEntry] : list;
}

function CuriousDevsLogo() {
  return <svg viewBox="4 4 92 92" width="26" height="26" fill="currentColor" role="presentation" aria-hidden="true" className="shrink-0 text-accent transition-all duration-500 group-hover:[transform:rotate(90deg)]"><g transform="translate(50 50) rotate(45)"><path d="M-44.5-20.5V20.5H10.1V13.4H-37.4V-13.4H-24.15V-20.5Z" /><path d="M-44.5-20.5V20.5H10.1V13.4H-37.4V-13.4H-24.15V-20.5Z" transform="rotate(90)" /><path d="M-44.5-20.5V20.5H10.1V13.4H-37.4V-13.4H-24.15V-20.5Z" transform="rotate(180)" /><path d="M-44.5-20.5V20.5H10.1V13.4H-37.4V-13.4H-24.15V-20.5Z" transform="rotate(270)" /></g></svg>;
}

export function SidebarNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const session = useSession();
  const { workspaceId, workspace } = useWorkspace();
  const tenant = session.tenant;
  const workspacesApi = useApi<Array<{ id: string; type: string; name: string; description: string; status: string }>>("/workspaces");
  const setupApi = useApi<{ completedSteps: string[]; setupCompleted: boolean }>("/business/setup");
  const allStepIds = ["business_details", "workspaces", "members", "team_chat", "data_connections"];
  const setupComplete = setupApi.data ? (setupApi.data.setupCompleted || allStepIds.every((s) => setupApi.data!.completedSteps.includes(s))) : true;
  React.useEffect(() => {
    const refresh = () => { setupApi.reload(); workspacesApi.reload(); };
    window.addEventListener("janus:setup-changed", refresh);
    return () => window.removeEventListener("janus:setup-changed", refresh);
  }, [setupApi.reload, workspacesApi.reload]);
  const [activationOverride, setActivationOverride] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    const key = scoped("janus.setup.active-workspace");
    const read = () => {
      const stored = window.localStorage.getItem(key);
      setActivationOverride(stored === null ? null : stored !== "none");
    };
    read();
    window.addEventListener("janus:workspace-activation", read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener("janus:workspace-activation", read); window.removeEventListener("storage", read); };
  }, []);
  const setupWorkspaceChosen = setupApi.data?.completedSteps?.includes("workspaces") ?? false;
  const catalogHasActiveWorkspace = setupComplete && workspaceDefinitions.some((item) => item.id === "crm-sales" && item.status === "active");
  const apiHasActiveWorkspace = Boolean(workspacesApi.data?.some((item) => item.status === "active"));
  // Only trust the catalog after setup is done; before that, rely on the API and activation override.
  const hasActiveWorkspace = catalogHasActiveWorkspace || activationOverride === true || (activationOverride === null && setupWorkspaceChosen && apiHasActiveWorkspace);
  // A workspace that is switched off for this company shows the business menu instead; its records are kept.
  const switchedOff = OPERATIONAL_WORKSPACES.includes(workspaceId) && !activeCompany().workspaces.includes(workspaceId);
  const effectiveWorkspaceId = hasActiveWorkspace && !switchedOff ? workspaceId : "business";
  const rawNavSections = getNavSectionsForWorkspace(effectiveWorkspaceId);
  const sidebarPrefs = React.useMemo(() => {
    try { const raw = window.localStorage.getItem(scoped("janus.sidebar.prefs")); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  }, []);
  const wsPrefs = sidebarPrefs[effectiveWorkspaceId] ?? {};
  const hiddenItems: string[] = wsPrefs.hidden ?? [];
  const collapsedSections: string[] = wsPrefs.collapsed ?? [];
  const sectionOrder: string[] | undefined = wsPrefs.sectionOrder;
  const orderedNav = React.useMemo(() => {
    if (!sectionOrder) return rawNavSections;
    const byTitle = new Map(rawNavSections.map((s) => [s.title, s]));
    const ordered = sectionOrder.map((t) => byTitle.get(t)).filter((s): s is typeof rawNavSections[number] => Boolean(s));
    const rest = rawNavSections.filter((s) => !sectionOrder.includes(s.title));
    return [...ordered, ...rest];
  }, [rawNavSections, sectionOrder]);
  const visibleSections = orderedNav
    .map((section) => {
      const isCollapsed = collapsedSections.includes(section.title);
      return {
        ...section,
        items: section.items.filter(
          (item) => !item.demoOnly && (item.essential || (!isCollapsed && !hiddenItems.includes(item.href))) && (!item.requiredPermission || session.permissions.includes("*") || session.permissions.includes(item.requiredPermission)),
        ),
      };
    })
    .filter((section) => section.items.length > 0);

  function isActive(item: NavItem) {
    const [itemPath, itemQuery] = item.href.split("?");
    if (pathname !== itemPath && !pathname.startsWith(`${itemPath}/`)) return false;
    const params = new URLSearchParams(itemQuery ?? "");
    // Filters on a page (its period, a chosen company) keep the page's link highlighted.
    const ignored = new Set(["workspace", "period", "company", "preview", "add"]);
    for (const [key, value] of params.entries()) {
      if (ignored.has(key)) continue;
      if (searchParams.get(key) !== value) return false;
    }
    for (const [key] of searchParams.entries()) {
      if (!ignored.has(key) && !params.has(key)) return false;
    }
    return true;
  }

  const ownerView = managesBusiness(session.permissions);
  const canCreateWorkspace = session.permissions.includes("*") || session.permissions.includes("workspaces:manage");
  const hasTeamChatList = useTeamChatStore((state) => state.actions !== null);
  const accessibleWorkspaces = React.useMemo(() => withTeamChat((() => {
    const businessEntry = { id: "business", name: "Business Management", description: "Overview, people, workspaces, reports and settings." };
    const fromApi = workspacesApi.data?.filter((item) => item.status === "active").map((item) => ({
      id: item.type.replaceAll("_", "-"),
      name: item.name,
      description: item.description,
    }));
    if (hasActiveWorkspace && fromApi?.length) {
      return [businessEntry, ...fromApi.filter((item) => item.id !== "business")];
    }
    if (hasActiveWorkspace) return [
      businessEntry,
      { id: "crm-sales", name: "CRM & Sales", description: "Leads, deals, conversations and customer operations." },
    ];
    return [];
  })()).filter((item) => mayOpenWorkspace(item.id, session.permissions)), [hasActiveWorkspace, workspacesApi.data, ownerView, session.permissions]);

  const teamChatList = !collapsed && workspaceId === "team-chat" && pathname === "/team" && hasTeamChatList;

  function workspaceHref(id: string) {
    if (id === "crm-sales") return "/dashboard?workspace=crm-sales";
    if (id === "business") return "/settings?tab=workspace&view=overview&workspace=business";
    if (id === "team-chat") return "/team?workspace=team-chat";
    return `/workspace/${id}?workspace=${id}`;
  }

  return (
    <>
      {/* Top of the sidebar: the company in a company, the Portfolio in the Portfolio, laid out the same. */}
      <div
        className={cn(
          "flex h-14 items-center border-b border-border",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {workspaceId === "portfolio" ? <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn("group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-2", collapsed && "justify-center px-0")}>
              <CuriousDevsLogo />
              {!collapsed && <>
                <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
                  <span className="max-w-full truncate text-[14px] font-bold tracking-tight text-foreground">Janus</span>
                  <span className="text-[10px] text-muted-foreground">by Curious<span className="font-medium text-accent">Devs</span></span>
                </span>
                <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" />
              </>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            <DropdownMenuItem asChild className="bg-accent-muted">
              <Link href={portfolioHome} className="flex items-center justify-between">
                <span className="flex min-w-0 flex-col gap-0.5"><span className="font-medium">Portfolio</span><span className="truncate text-[11px] text-muted-foreground">Overview, analytics and finance</span></span>
                <Circle className="size-2 shrink-0 fill-accent text-accent" />
              </Link>
            </DropdownMenuItem>
            {accessibleWorkspaces.map((item) => <DropdownMenuItem key={item.id} asChild>
              <Link href={workspaceHref(item.id)} className="flex items-center justify-between">
                <span className="flex min-w-0 flex-col gap-0.5"><span className="font-medium">{item.name}</span><span className="truncate text-[11px] text-muted-foreground">{item.description}</span></span>
              </Link>
            </DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu> : <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2 transition-colors",
                collapsed && "justify-center px-0",
              )}
            >
              <CompanyLogo company={{ id: activeCompanyId(), name: tenant.name, logo: activeCompany().logo || readPortfolioLogo(tenant.id) }} size={32} />
              {!collapsed && (
                <>
                  <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
                    <span className="max-w-full truncate text-[13px] font-semibold text-foreground">
                      {tenant.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                    {workspaceId === "business" ? "Business Management" : hasActiveWorkspace ? workspace.name : "No active workspace"}
                    </span>
                  </span>
                  <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">

            <DropdownMenuLabel>{ownerView ? "Created workspaces" : "Your workspaces"}</DropdownMenuLabel>
            {!setupComplete && <DropdownMenuItem asChild><Link href="/portfolio?view=companies" className="flex items-center gap-2 text-xs text-accent"><LockKeyhole className="size-3" />Complete setup to unlock workspaces</Link></DropdownMenuItem>}
            {accessibleWorkspaces.length ? accessibleWorkspaces.map((item) => <DropdownMenuItem key={item.id} asChild disabled={!setupComplete} className={cn(workspaceId === item.id && "bg-accent-muted")}>
              {setupComplete ? <Link href={workspaceHref(item.id)} className="flex items-center justify-between">
                <span className="flex min-w-0 flex-col gap-0.5"><span className="font-medium">{item.name}</span><span className="truncate text-[11px] text-muted-foreground">{item.description}</span></span>
                {workspaceId === item.id && <Circle className="size-2 shrink-0 fill-accent text-accent" />}
              </Link> : <span className="flex items-center justify-between opacity-50">
                <span className="flex min-w-0 flex-col gap-0.5"><span className="font-medium">{item.name}</span><span className="truncate text-[11px] text-muted-foreground">{item.description}</span></span>
                <LockKeyhole className="size-3 shrink-0 text-muted-foreground" />
              </span>}
            </DropdownMenuItem>) : <DropdownMenuItem disabled><span className="text-xs text-muted-foreground">No active workspace yet</span></DropdownMenuItem>}
            {canCreateWorkspace && setupComplete && <><DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings?tab=workspace&view=workspaces&create=1&workspace=business">
                <Plus className="size-3.5" />
                Create workspace
              </Link>
            </DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>

      {/* Nav. In Team Chat the chats themselves take the menu's place, as in WhatsApp. */}
      {teamChatList ? <TeamChatSidebarList onNavigate={onNavigate} /> : <nav className="flex-1 overflow-y-auto py-3">
        {workspaceId === "portfolio" && !collapsed && <div className="mb-4 rounded-lg mx-3 bg-accent/8 px-3.5 py-2.5"><p className="text-[13px] font-medium text-foreground">Hi, {session.user.name?.split(" ")[0] ?? "there"} <span className="text-[18px] leading-none">👋</span></p><p className="mt-0.5 text-[11px] text-muted-foreground">Your portfolio at a glance</p></div>}
        {/* Work Inbox: the one cross-workspace page, always at the top of every sidebar. */}
        {workspaceId !== "portfolio" && <div className={cn("mb-4", collapsed ? "px-2" : "px-3")}>
          <ul className="flex flex-col gap-0.5">
            <li>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={`/work?workspace=${workspaceId}`}
                      onClick={onNavigate}
                      aria-current={pathname === "/work" ? "page" : undefined}
                      className={cn(
                        "group flex items-center justify-center gap-2.5 rounded-md px-0 py-2 text-[13px] transition-colors",
                        pathname === "/work"
                          ? "bg-accent-muted text-foreground"
                          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                      )}
                    >
                      <Inbox className={cn("size-3.5 shrink-0", pathname === "/work" && "text-accent")} />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">Work Inbox</TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  href={`/work?workspace=${workspaceId}`}
                  onClick={onNavigate}
                  aria-current={pathname === "/work" ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                    pathname === "/work"
                      ? "bg-accent-muted text-foreground"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  <Inbox className={cn("size-3.5 shrink-0", pathname === "/work" && "text-accent")} />
                  <span className="truncate">Work Inbox</span>
                </Link>
              )}
            </li>
          </ul>
        </div>}
        {visibleSections.map((section) => (
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
                const active = isActive(item);
                const Icon = item.icon;
                const link = (
                  <Link
                    href={appendWorkspace(item.href, workspaceId)}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
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
                  <li key={`${item.href}:${item.label}`}>
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
      </nav>}

      {/* A real account sees the switcher once it can go somewhere: a second company, or a Portfolio. Hide it until setup is done. */}
      {setupComplete && (session.tenants.length > 1 || session.tenants.some((item) => PORTFOLIO_ROLES.includes(item.role))) && <LiveCompanySwitcher inPortfolio={workspaceId === "portfolio"} collapsed={collapsed} />}

    </>
  );
}

export function Sidebar() {
  const { workspaceId } = useWorkspace();
  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-border bg-surface md:flex",
          workspaceId === "team-chat" ? "w-[320px]" : "w-[258px]",
        )}
      >
        <SidebarNav />
      </aside>
    </TooltipProvider>
  );
}
