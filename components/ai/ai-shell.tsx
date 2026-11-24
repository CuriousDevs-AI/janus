"use client";

import * as React from "react";
import { useSession } from "@/components/auth/session-provider";
import { useWorkspace } from "@/components/layout/workspace-context";
import { getNavSectionsForWorkspace, type NavItem } from "@/lib/nav-config";
import { cn } from "@/lib/utils";

/** The AI pages every workspace has, in the order the sidebar lists them. */
export type AiPage = "assistant" | "agents" | "workflows" | "dashboard" | "usage" | "keys";
const pageOf: Record<string, AiPage> = { "Janus Intelligence": "assistant", "AI Assistant": "assistant", "AI Agents": "agents", Workflows: "workflows", "AI Dashboard": "dashboard", "AI Usage & Cost": "usage", "AI Models & Keys": "keys" };

/**
 * One frame for every AI page in every workspace: which workspace it is for, the page's title and
 * purpose, its actions, and a row linking the workspace's other AI pages. The Portfolio, Business
 * Management and each department look and move the same way.
 */
export function AiPageShell({ page, title, description, actions, children, className }: {
  page: AiPage;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const { workspaceId, workspace } = useWorkspace();
  const { permissions } = useSession();
  const allowed = (permission?: string) => !permission || permissions.includes("*") || permissions.includes(permission);
  const aiSection = getNavSectionsForWorkspace(workspaceId).find((s) => s.title === "AI");
  const items: NavItem[] = (aiSection?.items ?? []).filter((item) => allowed(item.requiredPermission) || pageOf[item.label] === page);
  const current = items.find((item) => pageOf[item.label] === page);
  const Icon = current?.icon;

  return <div className={cn("mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-7", className)}>
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">{Icon && <Icon className="size-3.5" aria-hidden />}{workspace.name} · AI</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
    {children}
  </div>;
}

/**
 * What an AI page says when it has no figures for the company open now: still reading, a role that
 * leaves the figures out, or a read that came back without them (with a way to try again).
 */
export function AiNoCompany({ loading, onRetry }: { loading: boolean; onRetry: () => void }) {
  const { permissions, role } = useSession();
  if (loading) return <p className="text-sm text-muted-foreground" role="status">Reading your records…</p>;
  const sees = permissions.includes("*") || role === "owner" || role === "admin";
  return <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
    {sees ? "Janus could not read this company's figures just now." : "Your role does not include this company's figures, so Janus has nothing to answer from. Ask the Owner for access."}
    {sees && <button type="button" onClick={onRetry} className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-surface-2">Try again</button>}
  </div>;
}
