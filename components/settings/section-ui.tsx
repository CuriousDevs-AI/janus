import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-surface p-5", className)}>
      {(title || description) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            {title && <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>}
            {description && <p className="text-[12px] text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function SettingRow({
  label,
  description,
  children,
  className,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 border-b border-border/60 py-3 last:border-0", className)}>
      <div className="flex flex-col gap-0.5 pr-4">
        <p className="text-[13px] text-foreground">{label}</p>
        {description && <p className="text-[11.5px] text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
