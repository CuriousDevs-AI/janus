"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "!bg-surface !border !border-border-strong !text-foreground !rounded-md !shadow-[0_18px_48px_rgba(10,20,36,0.12)] !text-[13px]",
          title: "!text-foreground !font-medium",
          description: "!text-muted-foreground",
          actionButton: "!bg-accent !text-accent-foreground",
          cancelButton: "!bg-surface-3 !text-foreground",
          icon: "!text-accent",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
