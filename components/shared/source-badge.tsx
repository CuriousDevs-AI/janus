"use client";

import { sourceMeta } from "@/lib/lead-sources";
import { cn } from "@/lib/utils";

export function SourceBadge({ source, className }: { source: string; className?: string }) {
  const { label, icon: Icon, color, bg } = sourceMeta(source);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium", bg, color, className)}>
      <Icon className="size-3" />
      {label}
    </span>
  );
}
