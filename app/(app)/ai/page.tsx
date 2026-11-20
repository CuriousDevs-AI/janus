"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkspace } from "@/components/layout/workspace-context";
import { JanusIntelligence } from "@/components/business/janus-intelligence";
import { DepartmentIntelligence } from "@/components/business/department-chat";

export default function AskYourBusinessPage() {
  return (
    <React.Suspense fallback={null}>
      <AskYourBusinessPageInner />
    </React.Suspense>
  );
}

function AskYourBusinessPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { workspaceId, workspace } = useWorkspace();
  const portfolio = workspaceId === "portfolio";
  // The Portfolio's assistant answers across every company, on the Portfolio's own page.
  React.useEffect(() => { if (portfolio) router.replace("/portfolio?view=intelligence"); }, [portfolio, router]);

  if (portfolio) return <p className="px-6 py-8 text-sm text-muted-foreground" role="status">Opening the Portfolio&apos;s AI Assistant…</p>;
  if (workspaceId === "business") return <JanusIntelligence requested={searchParams.get("view")} />;
  return <DepartmentIntelligence workspaceId={workspaceId} workspaceName={workspace.name} />;
}
