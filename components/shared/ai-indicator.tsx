import { Sparkles, Bot, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export function AIIndicator({ label = "AI", className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-accent-border bg-accent-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent",
        className
      )}
    >
      <Sparkles className="size-3" />
      {label}
    </span>
  );
}

export function ActorIcon({ actorType, className }: { actorType: "ai" | "human" | "system" | "customer"; className?: string }) {
  if (actorType === "ai") return <Bot className={cn("size-3.5 text-accent", className)} />;
  if (actorType === "human") return <UserRound className={cn("size-3.5 text-info", className)} />;
  return <span className={cn("size-1.5 rounded-full bg-muted-foreground", className)} />;
}

export function AIConfidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = pct >= 80 ? "text-success" : pct >= 55 ? "text-warning" : "text-danger";
  return (
    <span className={cn("text-mono text-[11px] font-medium", tone)}>{pct}% confidence</span>
  );
}
