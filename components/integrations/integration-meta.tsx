import type { ComponentType } from "react";
import type { VariantProps } from "class-variance-authority";
import { MessageCircle, Building2, CalendarClock, ShoppingBag, LayoutGrid, LifeBuoy, Code2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { badgeVariants } from "@/components/ui/badge";
import type { Integration } from "@/lib/types";

type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export const integrationCategoryMeta: Record<Integration["category"], { label: string; icon: ComponentType<{ className?: string }> }> = {
  communication: { label: "Communication", icon: MessageCircle },
  crm: { label: "CRM", icon: Building2 },
  calendar: { label: "Calendar", icon: CalendarClock },
  commerce: { label: "Commerce", icon: ShoppingBag },
  productivity: { label: "Productivity", icon: LayoutGrid },
  helpdesk: { label: "Helpdesk", icon: LifeBuoy },
  developer: { label: "Developer", icon: Code2 },
};

export const syncDirectionMeta: Record<NonNullable<Integration["syncDirection"]>, string> = {
  import: "One-time / scheduled import",
  two_way: "Two-way sync",
};

export const integrationStatusMeta: Record<Integration["status"], { label: string; tone: BadgeTone }> = {
  connected: { label: "Connected", tone: "success" },
  available: { label: "Available", tone: "neutral" },
  error: { label: "Needs attention", tone: "danger" },
};

export function IntegrationStatusBadge({ status, className }: { status: Integration["status"]; className?: string }) {
  const meta = integrationStatusMeta[status];
  return (
    <Badge variant={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

export function IntegrationCategoryBadge({ category, className }: { category: Integration["category"]; className?: string }) {
  const meta = integrationCategoryMeta[category];
  return (
    <Badge variant="outline" className={className}>
      {meta.label}
    </Badge>
  );
}

/**
 * A short, illustrative set of OAuth-style scopes per integration category.
 * These are for display only — no real credentials are ever shown, only the
 * already-masked `connectedAccount` label from the integration record.
 */
export const integrationPermissions: Record<Integration["category"], string[]> = {
  communication: ["Send messages", "Read message history", "Manage contact list"],
  crm: ["Read contacts & companies", "Read & write deals", "Read pipeline stages"],
  calendar: ["Read calendar events", "Create & update events", "Check free/busy availability"],
  commerce: ["Read orders", "Read customers", "Read payment & refund history"],
  productivity: ["Post messages to channels", "Read channel list", "Manage webhooks"],
  helpdesk: ["Read tickets", "Create & update tickets", "Read customer/agent mapping"],
  developer: ["Read leads, customers, deals & tickets", "Create & update records", "Manage webhooks"],
};

/**
 * Plausible masked account labels used only when the prototype "connects" an
 * integration that has never been connected before (no seeded connectedAccount).
 */
export const mockAccountLabel: Record<string, string> = {
  "int-hubspot": "curiousdevs.hubspot.com",
  "int-salesforce": "curiousdevs.my.salesforce.com",
  "int-shopify": "curiousdevs.myshopify.com",
  "int-razorpay": "rzp_live_••••4821", "int-tally": "TallyPrime-GGN-01",
  "int-zendesk": "curiousdevs.zendesk.com",
  "int-freshdesk": "curiousdevs.freshdesk.com",
  "int-intercom": "curiousdevs (workspace)",
  "int-jira-service-desk": "curiousdevs.atlassian.net",
  "int-rest-api": "Platform API",
};

export function accountLabelFor(integration: Integration): string {
  return integration.connectedAccount ?? mockAccountLabel[integration.id] ?? "Connected account";
}
