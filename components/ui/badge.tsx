import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none w-fit",
  {
    variants: {
      variant: {
        neutral: "bg-surface-3 text-muted-foreground border-border",
        accent: "bg-accent-muted text-accent border-accent-border",
        success: "bg-success-muted text-success border-success/30",
        warning: "bg-warning-muted text-warning border-warning/30",
        danger: "bg-danger-muted text-danger border-danger/30",
        info: "bg-info-muted text-info border-info/30",
        outline: "bg-transparent text-foreground border-border",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
