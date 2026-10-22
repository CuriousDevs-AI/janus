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
      className={cn("janus-tab-strip inline-flex h-9 max-w-full items-center gap-1 overflow-x-auto", className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex h-9 items-center rounded-sm px-3 text-[13px] font-medium text-muted-foreground transition-colors",
        "hover:bg-surface-2 hover:text-foreground data-[state=active]:bg-surface-2 data-[state=active]:text-foreground",
        "focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  // Keep panels mounted so local form/table state survives tab switches. Do
  // not animate the panel itself: height-changing animations made the page
  // jump when switching between panels with different content lengths.
  return (
    <TabsPrimitive.Content
      forceMount
      className={cn("outline-none data-[state=inactive]:hidden", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
