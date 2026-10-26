"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getNavSectionsForWorkspace } from "@/lib/nav-config";
import { getWorkspaceDefinition, isWorkspaceId } from "@/lib/workspace-config";
import { useWorkspace } from "@/components/layout/workspace-context";
import { useSession } from "@/components/auth/session-provider";
import { HrPeopleWorkspace } from "@/components/hr-people/workspace";

const workspacePermissions: Record<string, string> = {
  "hr-people": "hr:self",
  "finance-accounting": "billing:manage",
  "projects-delivery": "settings:manage",
  "customer-support": "leads:read_team",
  "operations-inventory": "settings:manage",
  "it-infrastructure": "settings:manage",
};

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  return (
    <React.Suspense fallback={<div className="min-h-full bg-background" />}>
      <WorkspacePageInner params={params} />
    </React.Suspense>
  );
}

function WorkspacePageInner({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId: routeWorkspaceId } = use(params);
  const { workspace } = useWorkspace();
  const session = useSession();
  const searchParams = useSearchParams();

  if (!isWorkspaceId(routeWorkspaceId) || routeWorkspaceId === "business" || routeWorkspaceId === "crm-sales") {
    return <p className="p-6 text-sm text-muted-foreground">This workspace is not available.</p>;
  }

  const requiredPermission = workspacePermissions[routeWorkspaceId];
  if (requiredPermission && !session.permissions.includes("*") && !session.permissions.includes(requiredPermission) && !(routeWorkspaceId === "hr-people" && session.permissions.includes("members:manage"))) {
    return <p className="p-6 text-sm text-muted-foreground">You do not have permission to open this workspace.</p>;
  }

  if (routeWorkspaceId === "hr-people") {
    return <HrPeopleWorkspace />;
  }

  const selectedWorkspace = getWorkspaceDefinition(routeWorkspaceId);
  const sections = getNavSectionsForWorkspace(routeWorkspaceId);
  const features = sections.flatMap((section) => section.items).filter((item) => !item.href.includes("/settings"));
  const view = searchParams.get("view");
  const activeFeature = features.find((feature) => {
    const featureView = new URLSearchParams(feature.href.split("?")[1] ?? "").get("view");
    return view ? featureView === view : feature.href.split("?")[0] === `/workspace/${routeWorkspaceId}`;
  });
  const activeTitle = activeFeature?.label ?? `${selectedWorkspace.name} Overview`;

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col">
      <PageHeader
        title={activeTitle}
        description={`${selectedWorkspace.description} This workspace stays scoped to its own records, actions and permissions.`}
        actions={<Badge variant="neutral">Workspace preview</Badge>}
      />
      <div className="grid gap-4 px-6 pb-10 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{activeTitle}</CardTitle>
            <CardDescription>
              {selectedWorkspace.status === "planned" ? "This area is not available yet." : `This view is ready for connected ${selectedWorkspace.name} records and management actions.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {selectedWorkspace.status === "planned" ? (
              <div className="flex flex-col gap-3 rounded-md border border-dashed border-border bg-surface-2 p-4">
                <Badge variant="neutral" className="w-fit">Coming soon</Badge>
                <p className="text-sm text-muted-foreground">
                  {selectedWorkspace.name} is being built. Its screens will appear here once they are ready. Nothing is shown as live until then.
                </p>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Planned areas</p>
                <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                  {features.map((feature) => (
                    <li key={feature.label} className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-border" aria-hidden />
                      {feature.label}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  {["Records", "Actions", "Reports"].map((label) => (
                    <div key={label} className="rounded-md border border-border bg-surface-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
                        <Badge variant="neutral">Awaiting data</Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Connect this workspace to enable {label.toLowerCase()}.</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {features.map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <Link
                        key={feature.label}
                        href={feature.href}
                        className="group flex items-center gap-3 rounded-md border border-border px-3 py-3 transition-colors hover:border-accent-border hover:bg-accent-muted"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground group-hover:text-accent">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{feature.label}</span>
                          <span className="block text-xs text-muted-foreground">Open workspace view</span>
                        </span>
                        <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-accent" />
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Access context</CardTitle>
            <CardDescription>Workspace access follows the active business membership.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-start gap-3 rounded-md bg-surface-2 p-3">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-accent" />
              <p className="text-muted-foreground">
                You are viewing this module from <span className="font-medium text-foreground">{workspace.name}</span>.
                Permission-aware data loading will use the current business membership when this module is connected.
              </p>
            </div>
            <Link href="/settings?tab=team&workspace=business" className="text-sm text-accent hover:underline">
              Manage members and roles →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
