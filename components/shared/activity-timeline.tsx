import Link from "next/link";
import type { Activity } from "@/lib/types";
import { ActorIcon } from "@/components/shared/ai-indicator";
import { formatRelativeTime, formatTime, formatDate, cn } from "@/lib/utils";
import { getCustomerById } from "@/lib/mock-data";

const relatedHref: Record<NonNullable<Activity["relatedKind"]>, (id: string) => string> = {
  lead: (id) => `/leads/${id}`,
  deal: (id) => `/deals/${id}`,
  ticket: (id) => `/tickets/${id}`,
  conversation: () => `/inbox`,
  approval: (id) => `/approvals/${id}`,
};

function actorTone(actor: Activity["actor"]) {
  if (actor.type === "ai") return "border-accent-border bg-accent-muted";
  if (actor.type === "human") return "border-info/30 bg-info-muted";
  return "border-border bg-surface-2";
}

export function ActivityTimeline({
  activities,
  showCustomer = false,
  groupByDay = false,
}: {
  activities: Activity[];
  showCustomer?: boolean;
  groupByDay?: boolean;
}) {
  if (activities.length === 0) {
    return <p className="px-1 py-6 text-center text-[12px] text-muted-foreground">No activity yet.</p>;
  }

  const days = activities.map((a) => formatDate(a.createdAt));

  return (
    <ol className="flex flex-col">
      {activities.map((a, i) => {
        const day = days[i];
        const showDayHeading = groupByDay && day !== days[i - 1];
        const customer = showCustomer ? getCustomerById(a.customerId) : undefined;
        const href = a.relatedKind && a.relatedId ? relatedHref[a.relatedKind](a.relatedId) : undefined;

        return (
          <li key={a.id}>
            {showDayHeading && (
              <p className="sticky top-0 z-[1] -mx-1 mb-1 mt-3 bg-surface px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 first:mt-0">
                {day}
              </p>
            )}
            <div className="group relative flex gap-3 pb-4 pl-1">
              {i !== activities.length - 1 && <span className="absolute left-[13px] top-6 h-full w-px bg-border" />}
              <span className={cn("z-[1] mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border", actorTone(a.actor))}>
                <ActorIcon actorType={a.actor.type} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className="text-[13px] text-foreground">
                    {href ? (
                      <Link href={href} className="hover:text-accent hover:underline">
                        {a.title}
                      </Link>
                    ) : (
                      a.title
                    )}
                  </p>
                  <span className="text-[11px] text-muted-foreground/80">{formatTime(a.createdAt)}</span>
                  {showCustomer && customer && (
                    <Link href={`/customers/${customer.id}`} className="text-[11px] text-muted-foreground hover:text-accent">
                      {customer.name}
                    </Link>
                  )}
                </div>
                {a.description && <p className="mt-0.5 text-[12px] text-muted-foreground">{a.description}</p>}
                <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                  {a.actor.type === "ai" ? a.actor.agentName : a.actor.type === "human" ? a.actor.userName : a.actor.type === "customer" ? "Customer" : "System"}
                  {" · "}
                  {formatRelativeTime(a.createdAt)}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
