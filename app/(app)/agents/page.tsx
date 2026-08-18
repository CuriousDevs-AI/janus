"use client";

import Link from "next/link";
import { useAppStore } from "@/lib/stores/app-store";
import { PageHeader } from "@/components/shared/page-header";
import { ChannelIcon } from "@/components/shared/channel-badge";
import { AgentTypeBadge, AgentStatusBadge } from "@/components/agents/agent-meta";
import { formatNumber, cn } from "@/lib/utils";

export default function AgentsPage() {
  const agents = useAppStore((s) => s.agents);
  const totalConversations = agents.reduce((sum, a) => sum + a.conversationsHandled, 0);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <PageHeader
        title="Agents"
        description={`${agents.length} agents · ${formatNumber(totalConversations)} conversations handled`}
      />

      <div className="grid grid-cols-1 gap-4 px-6 pb-6 lg:grid-cols-2">
        {agents.map((agent) => (
          <Link
            key={agent.id}
            href={`/agents/${agent.id}`}
            className="group flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[15px] font-semibold text-foreground group-hover:text-accent">{agent.name}</h2>
                  <AgentTypeBadge type={agent.type} />
                  <AgentStatusBadge status={agent.status} />
                </div>
                <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{agent.purpose}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <span className="text-mono text-foreground">{agent.model}</span>
              <span>·</span>
              <span className="text-mono">{agent.version}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-md border border-border bg-surface-2 px-3 py-2.5">
              <Stat
                label="Success"
                value={`${agent.successRate}%`}
                tone={agent.successRate >= 85 ? "text-success" : agent.successRate >= 70 ? "text-warning" : "text-danger"}
              />
              <Stat label="Conversations" value={formatNumber(agent.conversationsHandled)} />
              <Stat
                label="Escalation"
                value={`${agent.escalationRate}%`}
                tone={agent.escalationRate <= 10 ? "text-success" : agent.escalationRate <= 20 ? "text-warning" : "text-danger"}
              />
            </div>

            <div className="flex items-center justify-between text-[12px] text-muted-foreground">
              <div className="flex items-center gap-3">
                <span>{agent.tools.length} tools</span>
                <span>{agent.knowledgeDocIds.length} knowledge docs</span>
              </div>
              <div className="flex items-center gap-2">
                {agent.channels.map((c) => (
                  <ChannelIcon key={c} channel={c} className="text-muted-foreground" />
                ))}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("text-mono text-[13px] font-medium text-foreground", tone)}>{value}</span>
    </div>
  );
}
