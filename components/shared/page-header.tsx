import { cn } from "@/lib/utils";

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
    <header className={cn("page-header flex min-h-[104px] flex-wrap items-center justify-between gap-4 px-6 py-6", className)}>
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.015em] text-foreground sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-[13px] leading-5 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="page-header-actions flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
