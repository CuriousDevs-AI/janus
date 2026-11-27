"use client";

import { GitMerge, Users, UserRoundPlus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DuplicateDetector } from "@/components/crm/duplicate-detector";

export default function DuplicatesPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Duplicate Detection"
        description="Find and merge duplicate leads and customers to keep your CRM clean."
      />
      <div className="px-6 pb-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-accent-muted">
              <GitMerge className="size-4 text-accent" />
            </div>
            <div>
              <span className="text-xs font-medium">Auto-detect</span>
              <span className="block text-[10px] text-muted-foreground">Finds matching records</span>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-success/10">
              <Users className="size-4 text-success" />
            </div>
            <div>
              <span className="text-xs font-medium">Merge</span>
              <span className="block text-[10px] text-muted-foreground">Keep the best record</span>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-warning-muted">
              <UserRoundPlus className="size-4 text-warning" />
            </div>
            <div>
              <span className="text-xs font-medium">Dismiss</span>
              <span className="block text-[10px] text-muted-foreground">Not a real duplicate</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-2">
        <DuplicateDetector />
      </div>
    </div>
  );
}
