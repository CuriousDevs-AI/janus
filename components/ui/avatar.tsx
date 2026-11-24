"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      className={cn("relative flex size-7 shrink-0 overflow-hidden rounded-full", className)}
      {...props}
    />
  );
}

function AvatarImage({ className, src, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  if (typeof src === "string" && src.startsWith("data:image/svg+xml")) {
    return <img src={src} className={cn("aspect-square size-full", className)} alt={props.alt ?? ""} />;
  }
  return <AvatarPrimitive.Image className={cn("aspect-square size-full", className)} src={src} {...props} />;
}

function AvatarFallback({ className, style, ...props }: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn("flex size-full items-center justify-center rounded-full text-[11px] font-medium text-white", className)}
      style={{ backgroundColor: "var(--accent, #2563eb)", ...style }}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
