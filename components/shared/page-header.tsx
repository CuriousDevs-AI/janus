"use client";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/components/layout/use-page-title";

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
  // The top bar already names the current section, so repeat the title only when
  // it says something different (for example a record name on a detail page).
  const topbarTitle = usePageTitle();
  const repeated = typeof title === "string" && title.trim().toLowerCase() === topbarTitle.trim().toLowerCase();
  const empty = repeated && !description && !actions;
  return (
    <header className={cn("page-header flex flex-wrap items-center justify-between gap-4 px-6", repeated ? "pb-4 pt-5" : "min-h-[104px] py-6", empty && "sr-only", className)}>
      <div className="min-w-0 flex-1 basis-60">
        <h1 className={cn("text-[22px] font-semibold leading-7 tracking-[-0.015em] text-foreground sm:text-2xl", repeated && "sr-only")}>{title}</h1>
        {description && <p className={cn("max-w-3xl text-[13px] leading-5 text-muted-foreground", !repeated && "mt-1")}>{description}</p>}
      </div>
      {actions && <div className="page-header-actions flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
