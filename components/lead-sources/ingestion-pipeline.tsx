import { ChevronRight, Radio, Webhook, FileJson, Wand2, Fingerprint, UserRound, History } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "source", label: "Source", icon: Radio },
  { key: "connector", label: "Connector / Webhook", icon: Webhook },
  { key: "raw", label: "Raw Event", icon: FileJson },
  { key: "normalize", label: "Normalize", icon: Wand2 },
  { key: "dedup", label: "Identity / Dedup", icon: Fingerprint },
  { key: "profile", label: "Profile", icon: UserRound },
  { key: "timeline", label: "Timeline", icon: History },
] as const;

export function IngestionPipeline({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-stretch gap-0.5 overflow-x-auto", className)}>
      {STEPS.map((step, i) => (
        <div key={step.key} className="flex items-center gap-0.5">
          <div className="flex min-w-[108px] flex-col items-center gap-1.5 border border-border bg-surface-2 px-2.5 py-2.5 text-center">
            <step.icon className="size-3.5 text-accent" />
            <span className="text-[10px] font-medium leading-tight text-muted-foreground">{step.label}</span>
          </div>
          {i < STEPS.length - 1 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />}
        </div>
      ))}
    </div>
  );
}
