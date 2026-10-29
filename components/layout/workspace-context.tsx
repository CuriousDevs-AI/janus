"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  getWorkspaceDefinition,
  isWorkspaceId,
  type WorkspaceId,
} from "@/lib/workspace-config";

interface WorkspaceContextValue {
  workspaceId: WorkspaceId;
  workspace: ReturnType<typeof getWorkspaceDefinition>;
  selectWorkspace: (workspaceId: WorkspaceId, href?: string) => void;
}

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null);

function workspaceFromPath(pathname: string): WorkspaceId {
  const moduleMatch = pathname.match(/^\/workspace\/([^/]+)/);
  if (moduleMatch && isWorkspaceId(moduleMatch[1])) return moduleMatch[1];
  if (pathname === "/portfolio" || pathname.startsWith("/portfolio/")) return "portfolio";
  if (pathname === "/team" || pathname.startsWith("/team/")) return "team-chat";
  if (pathname === "/setup") return "business";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "business";
  if (["/ai", "/agents", "/memory", "/evaluations"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return "business";
  return "crm-sales";
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryWorkspace = searchParams.get("workspace");
  const workspaceId = isWorkspaceId(queryWorkspace)
    ? queryWorkspace
    : workspaceFromPath(pathname);

  const selectWorkspace = React.useCallback(
    (nextWorkspaceId: WorkspaceId, href?: string) => {
      const target = href ?? (nextWorkspaceId === "portfolio" ? "/portfolio" : nextWorkspaceId === "business" ? "/settings" : nextWorkspaceId === "crm-sales" ? "/dashboard" : nextWorkspaceId === "team-chat" ? "/team" : `/workspace/${nextWorkspaceId}`);
      const params = new URLSearchParams(target.split("?")[1] ?? "");
      params.set("workspace", nextWorkspaceId);
      const path = target.split("?")[0];
      router.push(`${path}?${params.toString()}`);
    },
    [router],
  );

  const value = React.useMemo(
    () => ({ workspaceId, workspace: getWorkspaceDefinition(workspaceId), selectWorkspace }),
    [selectWorkspace, workspaceId],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = React.useContext(WorkspaceContext);
  if (!value) throw new Error("WorkspaceProvider is missing");
  return value;
}
