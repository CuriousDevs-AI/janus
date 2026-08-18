import { ShieldCheck } from "lucide-react";
import { SectionCard } from "@/components/settings/section-ui";
import { roleMeta, roleOrder } from "@/components/settings/role-meta";
import { Badge } from "@/components/ui/badge";

export function RolesSection() {
  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Roles & permissions"
        description="Illustrative capability summary for each role. Contact an owner to change access."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {roleOrder.map((role) => {
            const meta = roleMeta[role];
            return (
              <div key={role} className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                    <ShieldCheck className="size-3.5 text-muted-foreground" />
                    {meta.label}
                  </span>
                  <Badge variant={meta.tone}>{meta.label}</Badge>
                </div>
                <p className="text-[11.5px] text-muted-foreground">{meta.summary}</p>
                <ul className="flex flex-col gap-1">
                  {meta.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-1.5 text-[12px] text-foreground">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
