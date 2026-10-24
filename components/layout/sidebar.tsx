"use client";

import * as React from "react";
import { activeCompany, activeCompanyId, portfolioHome, scoped } from "@/lib/company";
import { CompanyLogo } from "@/components/shared/company-logo";
import { CompanySwitcher } from "@/components/layout/company-switcher";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChevronsUpDown,
  Circle,
  Plus,
} from "lucide-react";
import {
  appendWorkspace,
  getNavSectionsForWorkspace,
  type NavItem,
} from "@/lib/nav-config";
import { useSignOut, useSession } from "@/components/auth/session-provider";
import { useWorkspace } from "@/components/layout/workspace-context";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { cn } from "@/lib/utils";
import { useDemoAccount } from "@/lib/demo-persona";
import { workspaceDefinitions } from "@/lib/workspace-config";
import { useApi } from "@/lib/api/use-api";
import { demoMode } from "@/lib/demo-mode";
import type { HrDemoRole } from "@/lib/types";
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
  const searchParams = useSearchParams();
  const session = useSession();
  const { workspaceId, workspace } = useWorkspace();
  const signOut = useSignOut();
  const currentUser = {
    ...session.user,
    role: session.role,
    avatarColor: "#2563eb",
  };
  const tenant = session.tenant;
  const workspacesApi = useApi<Array<{ id: string; type: string; name: string; description: string; status: string }>>("/workspaces");
  const setupApi = useApi<{ completedSteps: string[] }>("/business/setup");
  const [activationOverride, setActivationOverride] = React.useState<boolean | null>(null);
  const account = useDemoAccount();
  const hrDemoRole: HrDemoRole = account?.hrRole ?? "owner";
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
  const catalogHasActiveWorkspace = workspaceDefinitions.some((item) => item.id === "crm-sales" && item.status === "active");
  const apiHasActiveWorkspace = Boolean(workspacesApi.data?.some((item) => item.status === "active"));
  // CRM & Sales is provisioned with every business, so a stale setup value
  // must not hide an already-active CRM workspace.
  const hasActiveWorkspace = catalogHasActiveWorkspace || activationOverride === true || (activationOverride === null && setupWorkspaceChosen && apiHasActiveWorkspace);
  const effectiveWorkspaceId = hasActiveWorkspace ? workspaceId : "business";
  const navSections = getNavSectionsForWorkspace(effectiveWorkspaceId);
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => (!item.requiredPermission || session.permissions.includes("*") || session.permissions.includes(item.requiredPermission)) &&
          (workspaceId !== "hr-people" || !demoMode || hrNavVisible(item.label, hrDemoRole)),
      ),
    }))
    .filter((section) => section.items.length > 0);

  function isActive(item: NavItem) {
    const [itemPath, itemQuery] = item.href.split("?");
    if (pathname !== itemPath && !pathname.startsWith(`${itemPath}/`)) return false;
    const params = new URLSearchParams(itemQuery ?? "");
    for (const [key, value] of params.entries()) {
      if (key === "workspace") continue;
      if (searchParams.get(key) !== value) return false;
    }
    for (const [key] of searchParams.entries()) {
      if (key !== "workspace" && !params.has(key)) return false;
    }
    return true;
  }

  const ownerView = !demoMode || hrDemoRole === "owner";
  const accessibleWorkspaces = React.useMemo(() => {
    const catalogue: Record<string, { id: string; name: string; description: string }> = { "crm-sales": { id: "crm-sales", name: "CRM & Sales", description: "Leads, deals, conversations and customers." }, "hr-people": { id: "hr-people", name: "HR & People", description: "Your work, time off, pay and documents." } };
    const switchedOn = demoMode ? activeCompany().workspaces : ["crm-sales", "hr-people"];
    // Only the Owner moves between workspaces. Everyone else works inside HR & People.
    if (demoMode && ownerView) return switchedOn.map((id) => catalogue[id]).filter(Boolean);
    if (!ownerView) return [...(account && account.crm !== "none" && switchedOn.includes("crm-sales") ? [catalogue["crm-sales"]] : []), catalogue["hr-people"]];
    const fromApi = workspacesApi.data?.filter((item) => item.status === "active").map((item) => ({
      id: item.type.replaceAll("_", "-"),
      name: item.name,
      description: item.description,
    }));
    if (hasActiveWorkspace && fromApi?.length) {
      if (!demoMode || fromApi.some((item) => item.id === "hr-people")) return fromApi;
      return [...fromApi, { id: "hr-people", name: "HR & People", description: "Employees, attendance, leave and payroll." }];
    }
    if (hasActiveWorkspace) return [
      { id: "crm-sales", name: "CRM & Sales", description: "Leads, deals, conversations and customer operations." },
      ...(demoMode ? [{ id: "hr-people", name: "HR & People", description: "Employees, attendance, leave and payroll." }] : []),
    ];
    return [];
  }, [hasActiveWorkspace, workspacesApi.data, ownerView, account]);

  function workspaceHref(id: string) {
    if (id === "crm-sales") return "/dashboard?workspace=crm-sales";
    if (id === "business") return "/settings?tab=workspace&view=overview&workspace=business";
    return `/workspace/${id}?workspace=${id}`;
  }

  return (
    <>
      {/* Top of the sidebar. In a company it is the company itself; in the Portfolio it is the Janus brand. */}
      {workspaceId === "portfolio" && <div className="flex h-14 items-center border-b border-border px-4">
        <Link href={portfolioHome} className="flex items-center gap-2 overflow-hidden">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-foreground text-[12px] font-bold text-background">C</span>
          <span className="flex flex-col leading-none"><span className="text-[13px] font-semibold text-foreground">Curious<span className="text-accent">Devs</span></span><span className="text-[10px] text-muted-foreground">Janus</span></span>
        </Link>
      </div>}
      <div
        className={cn(
          "border-b border-border",
          workspaceId === "portfolio" ? "py-2" : "flex h-14 items-center",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {workspaceId === "portfolio" ? <div className={cn("flex items-center gap-2 px-2 py-1.5", collapsed && "justify-center px-0")}><span className="flex size-5 shrink-0 items-center justify-center rounded bg-foreground text-[10px] font-semibold text-background">P</span>{!collapsed && <span className="flex min-w-0 flex-col leading-tight"><span className="truncate text-[12px] font-medium text-foreground">Portfolio</span><span className="text-[10px] text-muted-foreground">All your companies</span></span>}</div> : <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2 transition-colors",
                collapsed && "justify-center px-0",
              )}
            >
              <CompanyLogo company={{ id: activeCompanyId(), name: tenant.name, logo: activeCompany().logo }} size={32} />
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

            <DropdownMenuLabel>{ownerView ? "Created workspaces" : "Your workspace"}</DropdownMenuLabel>
            {accessibleWorkspaces.length ? accessibleWorkspaces.map((item) => <DropdownMenuItem key={item.id} asChild className={cn(workspaceId === item.id && "bg-accent-muted")}>
              <Link href={workspaceHref(item.id)} className="flex items-center justify-between">
                <span className="flex min-w-0 flex-col gap-0.5"><span className="font-medium">{item.name}</span><span className="truncate text-[11px] text-muted-foreground">{item.description}</span></span>
                {workspaceId === item.id && <Circle className="size-2 shrink-0 fill-accent text-accent" />}
              </Link>
            </DropdownMenuItem>) : <DropdownMenuItem disabled><span className="text-xs text-muted-foreground">No active workspace yet</span></DropdownMenuItem>}
            {ownerView && <><DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings?tab=workspace&view=workspaces&create=1&workspace=business">
                <Plus className="size-3.5" />
                Create workspace
              </Link>
            </DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
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

      {ownerView && demoMode && <CompanySwitcher inPortfolio={workspaceId === "portfolio"} collapsed={collapsed} />}

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

function hrNavVisible(label: string, role: HrDemoRole) {
  if (role === "owner" || role === "hr_manager") return true;
  // Everyone is also an employee, so every preview gets the personal pages.
  const mySelfService = ["Home", "Engage", "My profile", "My onboarding", "Document Center", "My documents", "Ask about policy", "Payslips", "Reimbursements", "Leave Apply", "Leave Balances", "Leave Calendar", "Holiday Calendar", "My requests", "Attendance Info", "Regularization & Permission"];
  // A manager works with their own team: leave, attendance, approvals, promotions and reviews.
  if (role === "reporting_manager") return mySelfService.includes(label) || ["My Team", "Pending Approvals", "Leave Management", "Attendance", "Promotions & changes", "Performance & Reviews", "Expenses & Reimbursements"].includes(label);
  // Finance handles money only: no leave, attendance or employee records.
  if (role === "payroll_admin") return (mySelfService.includes(label) && label !== "Leave Calendar") || ["Payroll", "Expenses & Reimbursements", "HR Compliance"].includes(label);
  return mySelfService.includes(label);
}

export function Sidebar() {
  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "hidden w-[258px] shrink-0 flex-col border-r border-border bg-surface md:flex",
        )}
      >
        <SidebarNav />
      </aside>
    </TooltipProvider>
  );
}
