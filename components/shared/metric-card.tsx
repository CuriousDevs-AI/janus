import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  delta,
  trend,
  skeleton,
  className,
}: {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
  skeleton?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-[76px] flex-col justify-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-3.5", className)}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-2">
        {skeleton ? (
          <span className="inline-block h-6 w-20 animate-pulse rounded bg-surface-2" />
        ) : (
          <span className="text-mono text-[22px] font-semibold leading-none text-foreground transition-opacity duration-150">{value}</span>
        )}
        {!skeleton && delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[11px] font-medium transition-opacity duration-150",
              trend === "up" ? "text-success" : trend === "down" ? "text-danger" : "text-muted-foreground"
            )}
          >
            {trend === "up" ? <ArrowUpRight className="size-3" /> : trend === "down" ? <ArrowDownRight className="size-3" /> : null}
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}
