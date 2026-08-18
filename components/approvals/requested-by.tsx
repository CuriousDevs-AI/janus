import { getAgentById, getUserById } from "@/lib/mock-data";
import { AIIndicator, ActorIcon } from "@/components/shared/ai-indicator";
import type { Approval } from "@/lib/types";

/**
 * Resolves an approval's requester to a display element — an AI agent name
 * with an AI indicator, or a human user's name — depending on requestedByType.
 */
export function RequestedBy({ approval }: { approval: Approval }) {
  if (approval.requestedByType === "ai") {
    const agent = getAgentById(approval.requestedById);
    return <AIIndicator label={agent?.name ?? "AI Agent"} />;
  }

  const user = getUserById(approval.requestedById);
  return (
    <span className="inline-flex items-center gap-1.5 text-foreground">
      <ActorIcon actorType="human" />
      {user?.name ?? "Unknown"}
    </span>
  );
}
