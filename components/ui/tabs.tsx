"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn("flex flex-col", className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex h-9 items-center gap-1 border-b border-border", className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex h-9 items-center border-b-2 border-transparent px-3 text-[13px] font-medium text-muted-foreground transition-colors",
        "hover:text-foreground data-[state=active]:border-accent data-[state=active]:text-foreground",
        "focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  // forceMount + data-state styling (instead of Radix's default unmount-when-inactive)
  // keeps every tab panel alive once visited, so local component state — a
  // pending approval just marked "approved," a proposal just marked "sent,"
  // a row selection — survives switching tabs and back instead of silently
  // resetting to its initial value.
  return (
    <TabsPrimitive.Content
      forceMount
      className={cn("outline-none data-[state=active]:animate-fade-in data-[state=inactive]:hidden", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
