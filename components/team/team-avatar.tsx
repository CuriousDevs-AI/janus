"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { generateAvatarSvg } from "@/lib/stores/profile-store";
import { cn, initials } from "@/lib/utils";

const STATUS_DOTS: Record<string, string> = {
  online: "bg-emerald-500",
  busy: "bg-red-500",
  away: "bg-amber-500",
  offline: "bg-gray-400",
};

const SIZE_MAP = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
} as const;

const DOT_SIZE_MAP = {
  xs: "size-2 border",
  sm: "size-2.5 border-[1.5px]",
  md: "size-3 border-2",
  lg: "size-3.5 border-2",
} as const;

interface TeamAvatarProps {
  person: { id: number; name: string; avatarUrl?: string; status?: string };
  size?: "xs" | "sm" | "md" | "lg";
  showStatus?: boolean;
  className?: string;
  onClick?: () => void;
}

export function TeamAvatar({ person, size = "md", showStatus, className, onClick }: TeamAvatarProps) {
  const avatarUrl = person.avatarUrl || generateAvatarSvg(person.name);
  const dot = showStatus && person.status ? STATUS_DOTS[person.status] : null;

  return (
    <span className={cn("relative inline-flex shrink-0", className)} onClick={onClick} role={onClick ? "button" : undefined}>
      <Avatar className={cn(SIZE_MAP[size], onClick && "cursor-pointer")}>
        <AvatarImage src={avatarUrl} alt={person.name} />
        <AvatarFallback>{initials(person.name)}</AvatarFallback>
      </Avatar>
      {dot ? (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-background",
            DOT_SIZE_MAP[size],
            dot,
          )}
          aria-label={person.status}
        />
      ) : null}
    </span>
  );
}
