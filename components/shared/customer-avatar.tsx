import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

export function CustomerAvatar({
  name,
  color,
  size = "default",
  className,
}: {
  name: string;
  color: string;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const dims = size === "sm" ? "size-6 text-[10px]" : size === "lg" ? "size-11 text-sm" : "size-7 text-[11px]";
  return (
    <Avatar className={cn(dims, className)}>
      <AvatarFallback style={{ backgroundColor: color }}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
