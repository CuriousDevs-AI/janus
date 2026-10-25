"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronsUpDown, LayoutGrid, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CompanyLogo } from "@/components/shared/company-logo";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { activeCompanyId, portfolioHome, readCompanies, seedCompanies, subscribeCompanies, switchCompany, type CompanyRecord } from "@/lib/company";


/**
 * Moves between the Portfolio (every company) and any single company, the way you move between
 * accounts in a messaging app. Lives at the foot of the sidebar next to the profile.
 */
export function CompanySwitcher({ inPortfolio, collapsed }: { inPortfolio: boolean; collapsed: boolean }) {
  const router = useRouter();
  const registry = React.useSyncExternalStore(subscribeCompanies, () => JSON.stringify(readCompanies()), () => JSON.stringify(seedCompanies));
  const companies = JSON.parse(registry) as CompanyRecord[];
  const currentId = activeCompanyId();
  const current = companies.find((item) => item.id === currentId);
  const label = inPortfolio ? "Portfolio" : current?.name ?? "Portfolio";
  const caption = inPortfolio ? `${companies.length} ${companies.length === 1 ? "company" : "companies"}` : "Switch company";
  const badge = (text: string, color: string, portfolio = false) => <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white" style={{ background: color }}>{portfolio ? <LayoutGrid className="size-3.5" aria-hidden /> : text}</span>;
  return (
    <div className={cn("border-t border-border py-2", collapsed ? "px-2" : "px-3")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button aria-label="Switch company" className={cn("flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface-2", collapsed && "justify-center")}>
            {inPortfolio || !current ? badge("", "#111827", true) : <CompanyLogo company={current} size={28} />}
            {!collapsed && <><span className="flex min-w-0 flex-1 flex-col leading-tight"><span className="truncate text-[12px] font-medium text-foreground">{label}</span><span className="text-[10px] text-muted-foreground">{caption}</span></span><ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" aria-hidden /></>}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-64">
          <DropdownMenuLabel>Switch company</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => router.push(portfolioHome)} className={cn(inPortfolio && "bg-accent-muted")}>
            {badge("", "#111827", true)}
            <span className="flex min-w-0 flex-1 flex-col"><span className="font-medium">Portfolio</span><span className="text-[11px] text-muted-foreground">All companies together</span></span>
            {inPortfolio && <Check className="size-3.5 text-accent" aria-hidden />}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {companies.length === 0 && <DropdownMenuItem disabled><span className="text-xs text-muted-foreground">No companies yet</span></DropdownMenuItem>}
          {companies.map((item) => {
            const here = !inPortfolio && item.id === currentId;
            return (
              <DropdownMenuItem key={item.id} onSelect={() => switchCompany(item.id)} className={cn(here && "bg-accent-muted")}>
                <CompanyLogo company={item} size={28} />
                <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-medium">{item.name}</span><span className="truncate text-[11px] text-muted-foreground">{item.setupDone ? `${item.city} · ${item.workspaces.length} workspace${item.workspaces.length === 1 ? "" : "s"}` : "Setup unfinished"}</span></span>
                {here && <Check className="size-3.5 text-accent" aria-hidden />}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link href="/setup?new=1"><Plus className="size-3.5" aria-hidden />Add company</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/portfolio?view=companies"><Building2 className="size-3.5" aria-hidden />Manage companies</Link></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
