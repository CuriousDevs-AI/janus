import { channelMeta } from "@/lib/status-meta";
import type { ChannelType } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ChannelBadge({ channel, className, iconOnly = false }: { channel: ChannelType; className?: string; iconOnly?: boolean }) {
  const meta = channelMeta[channel];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Icon className="size-3.5" />
      {!iconOnly && meta.label}
    </span>
  );
}

export function ChannelIcon({ channel, className }: { channel: ChannelType; className?: string }) {
  const Icon = channelMeta[channel].icon;
  return <Icon className={cn("size-3.5", className)} />;
}
