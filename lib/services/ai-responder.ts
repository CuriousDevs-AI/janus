import type { Conversation } from "@/lib/types";

const SALES_REPLIES = [
  "Thanks for the details — based on your team size and requirements, I'd recommend the Enterprise plan. I can send the full pricing breakdown right now if that's useful.",
  "Great question. Enterprise includes SSO, audit logs and a dedicated CSM with a 1-hour SLA. Want me to schedule a technical walkthrough with our team?",
  "I've noted that down and flagged it for your account owner. In the meantime, is there anything specific blocking you from moving forward?",
];

const SUPPORT_REPLIES = [
  "Thanks for flagging this — I'm checking your account and recent logs now. I'll have an update for you in a moment.",
  "I've found a likely cause and applied a fix on our side. Could you try again and let me know if the issue persists?",
  "I understand the urgency here. I'm escalating this to a specialist on our team so we can get this resolved quickly.",
];

export function generateAIReply(conversation: Conversation): { content: string; confidence: number; knowledgeUsed?: string[] } {
  const pool = conversation.category === "support" ? SUPPORT_REPLIES : SALES_REPLIES;
  const content = pool[Math.floor((Date.now() / 1000) % pool.length)];
  return {
    content,
    confidence: conversation.category === "support" ? 0.74 : 0.88,
    knowledgeUsed: conversation.category === "support" ? ["Authentication Guide"] : ["Pricing 2026", "Enterprise FAQ"],
  };
}

const DRAFT_VARIANTS = [
  "Happy to help — based on what you've shared, here's what I'd suggest as next steps. Let me know if you'd like to jump on a quick call to walk through it together.",
  "Thanks for the context. I've put together a short summary of options that should address this directly — sharing it now.",
  "Understood. I'll take care of this and follow up with confirmation once it's done — should just take a few minutes.",
];

export function generateDraft(index: number): string {
  return DRAFT_VARIANTS[index % DRAFT_VARIANTS.length];
}
