"use client";
import { cn } from "@/lib/utils";

/** A page's title, what it is for, and its main actions. The top bar names only the area. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("page-header flex flex-wrap items-end justify-between gap-4 px-6 pb-4 pt-6", className)}>
      <div className="min-w-0 flex-1 basis-60">
        <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.015em] text-foreground sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-[13px] leading-5 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="page-header-actions flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
