"use client";

import * as React from "react";
import { Plus, Workflow } from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AutomationCard } from "@/components/automations/automation-card";
import { CreateAutomationDialog } from "@/components/automations/create-automation-dialog";
import type { Automation } from "@/lib/types";

type StatusFilter = "all" | Automation["status"];

export default function AutomationsPage() {
  const automations = useAppStore((s) => s.automations);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [createOpen, setCreateOpen] = React.useState(false);

  const filtered = automations.filter((a) => {
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const activeCount = automations.filter((a) => a.status === "active").length;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Automations"
        description={`${automations.length} automations · ${activeCount} active`}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            New Automation
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 pb-4">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="disabled">Disabled</TabsTrigger>
            <TabsTrigger value="draft">Draft</TabsTrigger>
          </TabsList>
        </Tabs>
        <SearchInput value={query} onChange={setQuery} placeholder="Search automations…" className="w-72" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title="No automations found"
            description="Try a different search term or status filter."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((automation) => (
              <AutomationCard key={automation.id} automation={automation} />
            ))}
          </div>
        )}
      </div>

      <CreateAutomationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
