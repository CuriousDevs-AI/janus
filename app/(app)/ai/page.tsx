"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
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
  const { workspaceId, workspace } = useWorkspace();
  const departmentChat = workspaceId !== "business" && workspaceId !== "crm-sales";
  const crmAssistant = workspaceId === "crm-sales";
  const requestedIntelligenceView = searchParams.get("view");

  if (workspaceId === "business") {
    return <JanusIntelligence requested={requestedIntelligenceView} />;
  }

  if (departmentChat || crmAssistant) {
    return <DepartmentIntelligence workspaceId={workspaceId} workspaceName={workspace.name} />;
  }

  return <DepartmentIntelligence workspaceId={workspaceId} workspaceName={workspace.name} />;
}
