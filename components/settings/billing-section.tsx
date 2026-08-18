import { Check } from "lucide-react";
import { tenant, costSummary } from "@/lib/mock-data";
import { SectionCard } from "@/components/settings/section-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrencyINR } from "@/lib/utils";
import { cn } from "@/lib/utils";

const plans = [
  {
    id: "starter",
    name: "Starter",
    price: "₹15,000/mo",
    blurb: "For small teams getting started with AI-assisted operations.",
    features: ["1 AI agent", "Up to 2,000 conversations/mo", "Email & website chat", "Community support"],
  },
  {
    id: "growth",
    name: "Growth",
    price: "₹45,000/mo",
    blurb: "For growing teams that need AI across the full customer lifecycle.",
    features: ["Up to 5 AI agents", "Up to 15,000 conversations/mo", "All channels incl. WhatsApp", "Priority support"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    blurb: "For organizations with advanced governance and scale needs.",
    features: ["Unlimited AI agents", "Unlimited conversations", "SSO, audit exports & SLAs", "Dedicated success manager"],
  },
] as const;

export function BillingSection() {
  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Current plan" description="Your workspace is on the following plan.">
        <div className="flex items-center gap-3">
          <Badge variant="accent" className="text-[12px] capitalize">
            {tenant.plan}
          </Badge>
          <span className="text-[12px] text-muted-foreground capitalize">{tenant.environment} environment</span>
        </div>
      </SectionCard>

      <SectionCard title="Plans" description="Compare available plans.">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.id === tenant.plan;
            return (
              <div
                key={plan.id}
                className={cn(
                  "flex flex-col gap-3 rounded-lg border p-4",
                  isCurrent ? "border-accent-border bg-accent-muted" : "border-border bg-surface-2"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-foreground">{plan.name}</span>
                  {isCurrent && <Badge variant="accent">Current</Badge>}
                </div>
                <span className="text-mono text-[18px] font-semibold text-foreground">{plan.price}</span>
                <p className="text-[11.5px] text-muted-foreground">{plan.blurb}</p>
                <ul className="flex flex-col gap-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[12px] text-foreground">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-accent" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button variant={isCurrent ? "secondary" : "outline"} size="sm" disabled={isCurrent} className="mt-1">
                  {isCurrent ? "Current plan" : plan.id === "enterprise" ? "Contact sales" : "Switch plan"}
                </Button>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="This billing period" description="Usage-based cost breakdown for the current month.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <CostStat label="Total" value={formatCurrencyINR(costSummary.totalThisMonth)} highlight />
          <CostStat label="LLM" value={formatCurrencyINR(costSummary.llm)} />
          <CostStat label="Embeddings" value={formatCurrencyINR(costSummary.embeddings)} />
          <CostStat label="WhatsApp" value={formatCurrencyINR(costSummary.whatsapp)} />
          <CostStat label="Email" value={formatCurrencyINR(costSummary.email)} />
          <CostStat label="Voice" value={formatCurrencyINR(costSummary.voice)} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-3">
          <CostStat label="Cost per lead" value={`₹${costSummary.costPerLead}`} />
          <CostStat label="Cost per conversation" value={`₹${costSummary.costPerConversation}`} />
          <CostStat label="Cost per resolved ticket" value={`₹${costSummary.costPerResolvedTicket}`} />
        </div>
      </SectionCard>
    </div>
  );
}

function CostStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("text-mono text-[15px] font-semibold", highlight ? "text-accent" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}
