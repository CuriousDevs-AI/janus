import { useAppStore } from "@/lib/stores/app-store";
import { AIIndicator, ActorIcon } from "@/components/shared/ai-indicator";
import type { Approval } from "@/lib/types";

export function RequestedBy({ approval }: { approval: Approval }) {
  const agents = useAppStore((s) => s.agents);
  if (approval.requestedByType === "ai") {
    const agent = agents.find((a) => a.id === approval.requestedById);
    return <AIIndicator label={agent?.name ?? "AI Agent"} />;
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-foreground">
      <ActorIcon actorType="human" />
      {approval.requestedById ?? "Unknown"}
    </span>
  );
}
